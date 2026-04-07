import { createBrowserClient as _createBrowserClient } from "@supabase/ssr";
import { createServerClient as _createServerClient, type CookieOptions } from "@supabase/ssr";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 브라우저 클라이언트 (컴포넌트 내 Realtime 구독용)
export function createBrowserClient() {
  return _createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// 서버 클라이언트 (Route Handler / Server Component용)
export function createServerClient(cookieStore: ReadonlyRequestCookies) {
  return _createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try { (cookieStore as unknown as { set: (n: string, v: string, o: CookieOptions) => void }).set(name, value, options); } catch { /* 무시 */ }
      },
      remove(name: string, options: CookieOptions) {
        try { (cookieStore as unknown as { set: (n: string, v: string, o: CookieOptions) => void }).set(name, "", options); } catch { /* 무시 */ }
      },
    },
  });
}

// Service Role 클라이언트 (API Route Handler 전용 — 브라우저에서 절대 사용 금지)
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다");
  return _createBrowserClient(SUPABASE_URL, serviceKey);
}
