import { cookies } from "next/headers";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { createServerClient } from "@/lib/supabase";

// 인증된 서버 클라이언트 (Route Handler / Server Component 기본 선택).
// 로그인한 사용자의 쿠키 세션을 그대로 쓰므로 RLS 정책이 적용된다.
// 내부 운영자(internal_operators) 또는 client_users 의 client_id 범위 안의 데이터만 조회 가능.
export async function createAuthedServerClient() {
  const cookieStore = (await cookies()) as unknown as ReadonlyRequestCookies;
  return createServerClient(cookieStore);
}

// 현재 로그인 사용자가 internal_operators 에 등록되어 있는지 확인.
// 내부 전용 엔드포인트(토큰 로테이션, 고객사 생성 등)에서 service_role 을 쓰기 전에 호출.
export async function isInternalOperator(): Promise<boolean> {
  const supabase = await createAuthedServerClient();
  const { data, error } = await supabase.rpc("is_internal_operator");
  if (error) return false;
  return !!data;
}
