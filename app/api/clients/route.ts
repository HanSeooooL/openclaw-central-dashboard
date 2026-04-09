import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createAuthedServerClient, isInternalOperator } from "@/lib/supabase-server";

// GET /api/clients — 전체 고객사 목록 + 최신 스냅샷 (LATERAL JOIN RPC)
// RLS 기반: RPC 내부에서 is_internal_operator / current_user_client_ids 필터.
export async function GET() {
  try {
    const supabase = await createAuthedServerClient();

    const { data, error } = await supabase.rpc("get_clients_with_latest_snapshot");
    if (error) throw error;

    const clientsWithSnapshot = (data ?? []).map((row: {
      id: string; name: string; slug: string;
      created_at: string; notes: string | null;
      latest_snapshot: Record<string, unknown> | null;
    }) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      created_at: row.created_at,
      notes: row.notes,
      latestSnapshot: row.latest_snapshot ?? null,
    }));

    return NextResponse.json({ clients: clientsWithSnapshot });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/clients — 신규 고객사 등록
export async function POST(request: Request) {
  try {
    if (!(await isInternalOperator())) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const { name, slug, token, notes } = body;

    if (!name || !slug || !token) {
      return NextResponse.json({ error: "name, slug, token 필수" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // bcrypt 대신 단순 SHA-256 해시 (Edge Function에서 검증)
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: client, error } = await supabase
      .from("clients")
      .insert({ name, slug, token_hash: tokenHash, notes })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ client }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
