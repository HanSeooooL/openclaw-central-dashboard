import { NextResponse } from "next/server";
import { createAuthedServerClient } from "@/lib/supabase-server";

// GET /api/clients/:clientId/snapshots?hours=24
export async function GET(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const url = new URL(_request.url);
    const hours = parseInt(url.searchParams.get("hours") ?? "24", 10);

    const supabase = await createAuthedServerClient();

    let query = supabase
      .from("snapshots")
      .select("id, client_id, ts, gateway_online, gateway_latency_ms, session_count, total_tokens, total_cost_usd, tasks_running, tasks_failed, full_status, system_info")
      .eq("client_id", params.clientId)
      .order("ts", { ascending: true });

    if (hours > 0) {
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      query = query.gte("ts", since);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ snapshots: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
