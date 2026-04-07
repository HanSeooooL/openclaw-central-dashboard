import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/clients — 전체 고객사 목록 + 최신 스냅샷
export async function GET() {
  try {
    const supabase = createServiceClient();

    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name, slug, created_at, notes")
      .order("name");

    if (clientsError) throw clientsError;

    // 각 고객사의 최신 스냅샷을 가져오기 (최신 1개)
    const clientsWithSnapshot = await Promise.all(
      (clients ?? []).map(async (client) => {
        const { data: snaps } = await supabase
          .from("snapshots")
          .select("*")
          .eq("client_id", client.id)
          .order("ts", { ascending: false })
          .limit(1);

        return {
          ...client,
          latestSnapshot: snaps?.[0] ?? null,
        };
      })
    );

    return NextResponse.json({ clients: clientsWithSnapshot });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/clients — 신규 고객사 등록
export async function POST(request: Request) {
  try {
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
