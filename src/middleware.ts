import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "texai_session";

// Routes reachable with no session at all.
const PUBLIC_PATHS = ["/login", "/api/health"];

/**
 * Cheap, edge-safe first line of defense: redirects requests with no
 * session cookie straight to /login. This is NOT the real security
 * boundary — it cannot check private-beta allowlisting, RBAC or tenant
 * membership (those require a database round-trip, which is done in
 * Server Components/Actions via getCurrentUser()/resolveTenantContext()
 * on every request — see src/lib/auth/auth-service.ts). Never rely on
 * this middleware alone; it exists to avoid an unnecessary render for
 * obviously-unauthenticated requests.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
