import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isInternalOperator } from "@/lib/supabase-server";
import { handleApiError } from "@/lib/api-utils";

// DELETE /api/clients/:clientId/users/:userId — client_users 행 제거 (운영자 전용)
// auth.users 는 건드리지 않는다 — 다른 고객사 소속일 수 있음.
export async function DELETE(
  _request: Request,
  { params }: { params: { clientId: string; userId: string } }
) {
  try {
    if (!(await isInternalOperator())) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const service = createServiceClient();
    const { error } = await service
      .from("client_users")
      .delete()
      .eq("id", params.userId)
      .eq("client_id", params.clientId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
