import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { consumeMagicToken, makeSessionToken, PLATFORM_COOKIE } from "@/lib/platform-auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const adminId = consumeMagicToken(token);
  if (!adminId) {
    return NextResponse.redirect(new URL("/platform/login?error=invalid", request.url));
  }
  const jar = await cookies();
  jar.set(PLATFORM_COOKIE, makeSessionToken(adminId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/platform",
    maxAge: 12 * 60 * 60,
  });
  return NextResponse.redirect(new URL("/platform", request.url));
}
