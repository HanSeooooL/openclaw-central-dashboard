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
      .select("gateway_online, tasks_failed, full_status")
      .eq("client_id", clientId)
      .order("ts", { ascending: false })
      .limit(1);

    const prevSnap = prevSnaps?.[0] ?? null;

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

    // 알림 생성 (상태 전환 감지)
    const alerts: { client_id: string; type: string; message: string }[] = [];
    const now = Date.now();

    // 게이트웨이 오프라인 전환
    if (prevSnap?.gateway_online === true && fullStatus.gateway_online === false) {
      alerts.push({
        client_id: clientId,
        type: "gateway_offline",
        message: "게이트웨이 연결이 끊어졌습니다.",
      });
    }

    // 최초 스냅샷이 offline이면 "처음부터 오프라인" 알림 1회
    if (!prevSnap && fullStatus.gateway_online === false) {
      alerts.push({
        client_id: clientId,
        type: "gateway_offline_first",
        message: "최초 등록 시점에 게이트웨이가 오프라인 상태입니다.",
      });
    }

    // 태스크 실패 증가
    // 주의: 게이트웨이 재시작 등으로 카운터가 감소하면 delta가 음수가 되어 알림이 생성되지 않음 (의도)
    if (prevSnap && fullStatus.tasks?.failed > (prevSnap.tasks_failed ?? 0)) {
      const delta = fullStatus.tasks.failed - (prevSnap.tasks_failed ?? 0);
      alerts.push({
        client_id: clientId,
        type: "task_failed",
        message: `태스크 ${delta}개 실패 (누적 ${fullStatus.tasks.failed}개)`,
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
        });
      }
    }

    if (alerts.length > 0) {
      await supabase.from("alerts").insert(alerts);
    }

    return new Response(JSON.stringify({ ok: true, alerts: alerts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
