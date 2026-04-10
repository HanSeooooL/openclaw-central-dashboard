import { NextResponse } from "next/server";

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** catch 블록에서 사용: 내부 에러를 숨기고 generic 메시지 반환 */
export function handleApiError(e: unknown, fallbackMessage = "서버 오류가 발생했습니다") {
  console.error("[API Error]", e);
  return apiError(fallbackMessage, 500);
}
