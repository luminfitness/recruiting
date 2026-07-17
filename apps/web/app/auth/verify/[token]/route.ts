import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { consumeMagicLink } from "@/lib/magic-link";
import { createSession, encodeSessionCookie, SESSION_COOKIE_NAME } from "@/lib/session";
import { SESSION_TTL_DAYS } from "@usapt/core";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const orgId = request.nextUrl.searchParams.get("org");
  if (!orgId) {
    return NextResponse.redirect(new URL("/login?error=missing_org", request.url));
  }

  const result = await consumeMagicLink(orgId, token);
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=invalid_or_expired", request.url));
  }

  const sessionToken = await createSession(orgId, result.userId);
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, encodeSessionCookie(orgId, sessionToken), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });

  return NextResponse.redirect(new URL("/admin", request.url));
}
