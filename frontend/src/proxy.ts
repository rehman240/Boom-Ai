import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Must match SESSION_COOKIE_NAME on the backend.
const SESSION_COOKIE = "boooom_session";

const AUTH_PAGES = ["/login", "/signup"];

/**
 * Quick check only: is there a session cookie at all? The backend still checks the
 * cookie on every API call, and the app shell sends the user to /login on a 401.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (!hasSession && !isAuthPage) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (hasSession && isAuthPage) {
    return NextResponse.redirect(new URL("/overview", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Private app pages plus the login pages. The landing page, /api and static files are skipped.
  matcher: ["/overview/:path*", "/projects/:path*", "/settings/:path*", "/login", "/signup"],
};
