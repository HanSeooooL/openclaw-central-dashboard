import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Bearer token 검증
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // token → SHA-256 해시로 고객사 조회
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("token_hash", tokenHash)
      .single();

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }

    const clientId = client.id;
    const body = await req.json();
    const { fullStatus, systemInfo, totalCostUsd = 0 } = body;

    if (!fullStatus) {
      return new Response(JSON.stringify({ error: "fullStatus required" }), { status: 400, headers: corsHeaders });
    }

    // sessions cap — Edge Function 페이로드/jsonb 폭증 방어
    const SESSIONS_CAP = 100;
    if (Array.isArray(fullStatus.sessions) && fullStatus.sessions.length > SESSIONS_CAP) {
      fullStatus.sessions_truncated = true;
      fullStatus.sessions_original_count = fullStatus.sessions.length;
      fullStatus.sessions = fullStatus.sessions.slice(0, SESSIONS_CAP);
    }

    // 최신 스냅샷 조회 (알림 비교용)
    const { data: prevSnaps } = await supabase
      .from("snapshots")
      .select("ts, gateway_online, tasks_failed, full_status")
      .eq("client_id", clientId)
      .order("ts", { ascending: false })
      .limit(1);

    const prevSnap = prevSnaps?.[0] ?? null;
    const prevTsMs = prevSnap?.ts ? new Date(prevSnap.ts).getTime() : 0;

    // 세션 총 토큰 계산
    const sessions = Array.isArray(fullStatus.sessions) ? fullStatus.sessions : [];
    const totalTokens = sessions.reduce((s: number, sess: { total_tokens: number }) => s + (sess.total_tokens ?? 0), 0);

    // snapshot INSERT
    const { error: insertError } = await supabase
      .from("snapshots")
      .insert({
        client_id: clientId,
        gateway_online: fullStatus.gateway_online ?? false,
        gateway_latency_ms: fullStatus.gateway_latency_ms ?? null,
        session_count: fullStatus.session_count ?? 0,
        total_tokens: totalTokens,
        total_cost_usd: totalCostUsd,
        tasks_running: fullStatus.tasks?.running ?? 0,
        tasks_failed: fullStatus.tasks?.failed ?? 0,
        full_status: fullStatus,
        system_info: systemInfo ?? null,
      });

    if (insertError) throw insertError;

    // Reporter liveness — 성공 수신 시각 기록 (게이트웨이 상태와 무관)
    await supabase
      .from("clients")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", clientId);

    // 알림 메타데이터 빌더 — 해당 스냅샷 시점의 장애 원인 컨텍스트를 붙임
    const buildMeta = (extra: Record<string, unknown> = {}) => ({
      debug_status_error: fullStatus.debug_status_error ?? null,
      debug_health_error: fullStatus.debug_health_error ?? null,
      debug_gateway_error: fullStatus.debug_gateway_error ?? null,
      gateway_latency_ms: fullStatus.gateway_latency_ms ?? null,
      gateway_uptime: fullStatus.gateway_uptime ?? null,
      cpu_usage: systemInfo?.cpu_usage ?? null,
      memory_percent: systemInfo?.memory_percent ?? null,
      disk_percent: systemInfo?.disk_percent ?? null,
      ...extra,
    });

    // 알림 생성 (상태 전환 감지)
    const alerts: { client_id: string; type: string; message: string; metadata: Record<string, unknown> }[] = [];
    const now = Date.now();

    // 게이트웨이 오프라인 전환
    if (prevSnap?.gateway_online === true && fullStatus.gateway_online === false) {
      alerts.push({
        client_id: clientId,
        type: "gateway_offline",
        message: "게이트웨이 연결이 끊어졌습니다.",
        metadata: buildMeta(),
      });
    }

    // 최초 스냅샷이 offline이면 "처음부터 오프라인" 알림 1회
    if (!prevSnap && fullStatus.gateway_online === false) {
      alerts.push({
        client_id: clientId,
        type: "gateway_offline_first",
        message: "최초 등록 시점에 게이트웨이가 오프라인 상태입니다.",
        metadata: buildMeta(),
      });
    }

    // 태스크 실패 증가
    // 주의: 게이트웨이 재시작 등으로 카운터가 감소하면 delta가 음수가 되어 알림이 생성되지 않음 (의도)
    if (prevSnap && fullStatus.tasks?.failed > (prevSnap.tasks_failed ?? 0)) {
      const delta = fullStatus.tasks.failed - (prevSnap.tasks_failed ?? 0);
      // 이번 스냅샷의 failed_tasks 중 이전 스냅샷 이후에 종료된 것만 추려 알림에 붙임
      const recentFailed = Array.isArray(fullStatus.failed_tasks)
        ? fullStatus.failed_tasks.filter(
            (t: { ended_at?: number | null }) =>
              typeof t.ended_at === "number" && t.ended_at > prevTsMs
          )
        : [];
      // recentFailed 가 비어있으면 (과거 실패 태스크가 계속 남아있는 경우) 전체 failed_tasks 에서 label 추출
      const labelSource = recentFailed.length > 0
        ? recentFailed
        : (Array.isArray(fullStatus.failed_tasks) ? fullStatus.failed_tasks : []);
      const firstLabels = labelSource
        .map((t: { label?: string | null }) => t.label)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      const msgHead = `태스크 ${delta}개 실패 (누적 ${fullStatus.tasks.failed}개)`;
      const message = firstLabels ? `${msgHead} — ${firstLabels}` : msgHead;
      alerts.push({
        client_id: clientId,
        type: "task_failed",
        message,
        metadata: buildMeta({
          tasks_failed_delta: delta,
          tasks_failed_total: fullStatus.tasks.failed,
          failed_tasks: recentFailed.length > 0 ? recentFailed : fullStatus.failed_tasks ?? null,
        }),
      });
    }

    // 채널 오프라인 전환
    const prevChannels = (prevSnap?.full_status as { channels?: { name: string; status: string }[] } | null)?.channels ?? [];
    const currChannels = (fullStatus.channels ?? []) as { name: string; status: string }[];
    for (const currCh of currChannels) {
      const prevCh = prevChannels.find((c) => c.name === currCh.name);
      if (prevCh?.status === "online" && currCh.status !== "online") {
        alerts.push({
          client_id: clientId,
          type: "channel_down",
          message: `${currCh.name} 채널이 오프라인 상태입니다.`,
          metadata: buildMeta({ channel_name: currCh.name, channel_status: currCh.status }),
        });
      }
    }

    // dedup: 최근 N분 내 동일 type 알림이 있으면 후보에서 제거
    let inserted = 0;
    if (alerts.length > 0) {
      const dedupWindowMin = Number(Deno.env.get("ALERT_DEDUP_WINDOW_MIN") ?? "10");
      const since = new Date(Date.now() - dedupWindowMin * 60_000).toISOString();
      const types = [...new Set(alerts.map((a) => a.type))];

      const { data: recent } = await supabase
        .from("alerts")
        .select("type")
        .eq("client_id", clientId)
        .in("type", types)
        .gte("ts", since);

      const recentTypes = new Set((recent ?? []).map((r: { type: string }) => r.type));
      const fresh = alerts.filter((a) => !recentTypes.has(a.type));

      if (fresh.length > 0) {
        const { error: alertError } = await supabase.from("alerts").insert(fresh);
        if (alertError) {
          console.error("[ingest] alerts insert failed", alertError, JSON.stringify(fresh));
        } else {
          inserted = fresh.length;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, alerts: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
