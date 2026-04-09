import { NextResponse } from "next/server";
import { createAuthedServerClient } from "@/lib/supabase-server";
import type { GatewayCommand } from "@/lib/types";

const VALID_COMMANDS: GatewayCommand[] = ["gateway_start", "gateway_stop", "gateway_restart"];

// POST /api/clients/:clientId/commands — 게이트웨이 명령 발행
export async function POST(
  request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const body = await request.json();
    const { command } = body as { command: GatewayCommand };

    if (!VALID_COMMANDS.includes(command)) {
      return NextResponse.json({ error: "유효하지 않은 명령" }, { status: 400 });
    }

    const supabase = await createAuthedServerClient();

    const { data, error } = await supabase
      .from("pending_commands")
      .insert({ client_id: params.clientId, command, status: "pending" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ command: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// GET /api/clients/:clientId/commands?id=123 — 명령 상태 조회
export async function GET(
  request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    const supabase = await createAuthedServerClient();

    if (id) {
      const { data, error } = await supabase
        .from("pending_commands")
        .select("*")
        .eq("id", id)
        .eq("client_id", params.clientId)
        .single();

      if (error) throw error;
      return NextResponse.json({ command: data });
    }

    // 최근 명령 목록
    const { data, error } = await supabase
      .from("pending_commands")
      .select("*")
      .eq("client_id", params.clientId)
      .order("issued_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return NextResponse.json({ commands: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
