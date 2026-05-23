import { NextRequest, NextResponse } from "next/server";

const AUTH_PATHS = new Set(["/login", "/register"]);
const SESSION_COOKIE = "mila_session";

export default function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (path.startsWith("/app") && !hasSession) {
    const next = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(new URL(`/login?next=${next}`, req.nextUrl));
  }

  if (hasSession && AUTH_PATHS.has(path)) {
    return NextResponse.redirect(new URL("/app", req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
