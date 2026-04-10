import { NextResponse } from "next/server";
import { createAuthedServerClient } from "@/lib/supabase-server";
import { handleApiError } from "@/lib/api-utils";

// GET /api/clients/:clientId/alerts
export async function GET(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const supabase = await createAuthedServerClient();

    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("client_id", params.clientId)
      .order("ts", { ascending: false })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({ alerts: data ?? [] });
  } catch (e) {
    return handleApiError(e);
  }
}

// PATCH /api/clients/:clientId/alerts — 전체 읽음 처리
export async function PATCH(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const supabase = await createAuthedServerClient();

    const { error } = await supabase
      .from("alerts")
      .update({ read: true })
      .eq("client_id", params.clientId)
      .eq("read", false);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
