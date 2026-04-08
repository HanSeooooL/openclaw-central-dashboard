import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/clients/:clientId/notification-config
export async function GET(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("clients")
      .select("notification_config")
      .eq("id", params.clientId)
      .single();
    if (error) throw error;
    return NextResponse.json({ config: data?.notification_config ?? {} });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PUT /api/clients/:clientId/notification-config
export async function PUT(
  request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const body = await request.json();
    const config = body?.config ?? {};

    // 간단한 shape 검증
    const clean: Record<string, unknown> = {};
    if (config.email && typeof config.email === "object") {
      const recipients = Array.isArray(config.email.recipients)
        ? config.email.recipients.filter((r: unknown) => typeof r === "string" && r.trim())
        : [];
      clean.email = {
        enabled: !!config.email.enabled,
        recipients,
      };
    }
    if (config.slack && typeof config.slack === "object") {
      clean.slack = {
        enabled: !!config.slack.enabled,
        webhook_url: typeof config.slack.webhook_url === "string" ? config.slack.webhook_url : "",
      };
    }
    if (["info", "warning", "critical"].includes(config.min_severity)) {
      clean.min_severity = config.min_severity;
    }

    const supabase = createServiceClient();
    const { error } = await supabase
      .from("clients")
      .update({ notification_config: clean })
      .eq("id", params.clientId);
    if (error) throw error;

    return NextResponse.json({ ok: true, config: clean });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/clients/:clientId/notification-config/test
// 간단한 테스트 알림을 dispatch-alert 로 보낸다.
export async function POST(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const supabase = createServiceClient();
    const { data: client } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", params.clientId)
      .single();
    if (!client) {
      return NextResponse.json({ error: "client not found" }, { status: 404 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const res = await fetch(`${supabaseUrl}/functions/v1/dispatch-alert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        record: {
          id: -1,
          client_id: client.id,
          type: "gateway_offline",
          message: "[TEST] 알림 채널 테스트 — 실제 장애가 아닙니다.",
          ts: new Date().toISOString(),
          metadata: {
            gateway_latency_ms: 42,
            cpu_usage: 12,
            memory_percent: 34,
            gateway_uptime: "1h 23m",
          },
        },
      }),
    });
    const out = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: res.ok, dispatch: out });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
