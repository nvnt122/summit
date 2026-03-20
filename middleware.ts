import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;

  const pathname = request.nextUrl.pathname;

  const authPages = ["/login", "/register", "/forgot-password"];

  if (token && authPages.includes(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}