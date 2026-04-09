import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname.startsWith("/login");

  if (!user && !isLoginPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user) {
    // role 분기: internal_operators 에 있으면 운영자(/clients 전체 뷰),
    // 아니면 테넌트 사용자(/portal 자기 고객사만)
    const { data: isOperator } = await supabase.rpc("is_internal_operator");

    const isAdminPath = pathname === "/" || pathname.startsWith("/clients");
    const isPortalPath = pathname.startsWith("/portal");

    if (isLoginPage) {
      const home = request.nextUrl.clone();
      home.pathname = isOperator ? "/clients" : "/portal";
      return NextResponse.redirect(home);
    }

    if (isAdminPath && !isOperator) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/portal";
      return NextResponse.redirect(redirect);
    }

    if (isPortalPath && isOperator) {
      const redirect = request.nextUrl.clone();
      redirect.pathname = "/clients";
      return NextResponse.redirect(redirect);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
