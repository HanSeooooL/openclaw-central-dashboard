import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isInternalOperator } from "@/lib/supabase-server";
import { handleApiError } from "@/lib/api-utils";
import { randomBytes } from "node:crypto";

// POST /api/clients/:clientId/rotate-token
// 새 reporter 토큰을 발급한다.
// - 현재 token_hash 를 token_previous_hash 로 이동 (24시간 grace window)
// - 새 token_hash 를 저장
// - 새 토큰 원문을 1회 응답에 포함 (운영자가 reporter config 에 반영해야 함)
export async function POST(
  _request: Request,
  { params }: { params: { clientId: string } }
) {
  try {
    if (!(await isInternalOperator())) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const supabase = createServiceClient();

    const { data: client, error: fetchError } = await supabase
      .from("clients")
      .select("id, token_hash")
      .eq("id", params.clientId)
      .single();

    if (fetchError || !client) {
      return NextResponse.json({ error: "client not found" }, { status: 404 });
    }

    // 32바이트 랜덤 토큰 → hex 64자
    const newToken = randomBytes(32).toString("hex");
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(newToken));
    const newHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const now = new Date();
    const gracePeriodMs = 24 * 60 * 60 * 1000;
    const graceExpires = new Date(now.getTime() + gracePeriodMs);

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        token_hash: newHash,
        token_rotated_at: now.toISOString(),
        token_previous_hash: client.token_hash,
        token_previous_expires_at: graceExpires.toISOString(),
      })
      .eq("id", params.clientId);

    if (updateError) throw updateError;

    // audit log
    await supabase.from("audit_logs").insert({
      client_id: params.clientId,
      action: "token_rotated",
      meta: { grace_expires: graceExpires.toISOString() },
    });

    return NextResponse.json({
      ok: true,
      token: newToken,
      grace_expires: graceExpires.toISOString(),
      warning: "이 토큰은 한 번만 표시됩니다. 즉시 reporter config.json 에 반영하세요. 이전 토큰은 24시간 동안 계속 동작합니다.",
    });
  } catch (e) {
    return handleApiError(e);
  }
}
