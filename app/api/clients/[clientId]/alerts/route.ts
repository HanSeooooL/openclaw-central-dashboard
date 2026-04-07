import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/clients/:clientId/alerts
export async function GET(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const supabase = createServiceClient();

    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("client_id", params.clientId)
      .order("ts", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ alerts: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// PATCH /api/clients/:clientId/alerts — 전체 읽음 처리
export async function PATCH(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const supabase = createServiceClient();

    const { error } = await supabase
      .from("alerts")
      .update({ read: true })
      .eq("client_id", params.clientId)
      .eq("read", false);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
