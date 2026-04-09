import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createAuthedServerClient, isInternalOperator } from "@/lib/supabase-server";

// GET /api/clients/:clientId/users — 이 고객사에 속한 사용자 목록
export async function GET(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    const supabase = await createAuthedServerClient();
    const { data, error } = await supabase
      .from("client_users")
      .select("id, auth_user_id, role, created_at")
      .eq("client_id", params.clientId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    // email 조회는 service_role 로 (auth.users 는 RLS 대상 아님)
    const service = createServiceClient();
    const results = await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: u } = await service.auth.admin.getUserById(row.auth_user_id);
        return { ...row, email: u?.user?.email ?? null };
      })
    );

    return NextResponse.json({ users: results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// POST /api/clients/:clientId/users — 사용자 초대 (운영자 전용)
// body: { email: string, role?: "admin" | "viewer" }
export async function POST(
  request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    if (!(await isInternalOperator())) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const email = String(body?.email ?? "").trim();
    const role = body?.role === "admin" ? "admin" : "viewer";

    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const service = createServiceClient();

    // 1) 이미 auth.users 에 있는지 확인 (service.auth.admin.listUsers 로는 email 필터 불가 → invite 시도 후 에러 처리)
    //    더 단순하게: 존재하면 기존 user_id, 없으면 magic link 발송.
    let authUserId: string | null = null;

    const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/clients`,
    });

    if (inviteError) {
      // 이미 등록된 사용자면 email 로 조회
      // @supabase/supabase-js v2: listUsers 는 email 필터가 없음 → generateLink("magiclink") 로 fallback
      const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/clients`,
        },
      });
      if (linkErr) throw linkErr;
      authUserId = linkData?.user?.id ?? null;
    } else {
      authUserId = invited?.user?.id ?? null;
    }

    if (!authUserId) {
      return NextResponse.json({ error: "failed to resolve auth user" }, { status: 500 });
    }

    // 2) client_users upsert
    const { error: cuError } = await service
      .from("client_users")
      .upsert(
        { client_id: params.clientId, auth_user_id: authUserId, role },
        { onConflict: "client_id,auth_user_id" }
      );
    if (cuError) throw cuError;

    return NextResponse.json({ ok: true, auth_user_id: authUserId, email, role }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
