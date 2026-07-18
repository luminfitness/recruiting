"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getServiceDb } from "@usapt/db";
import { users } from "@usapt/db/schema";
import { isDemoMode } from "@/lib/demo";
import { createSession, encodeSessionCookie, SESSION_COOKIE_NAME } from "@/lib/session";
import { SESSION_TTL_DAYS } from "@usapt/core";

/**
 * Demo-only: assume a user's identity without authenticating. Refuses unless
 * demo mode is on. Creates a real session for the target user and sets the
 * session cookie, then drops you on their dashboard.
 */
export async function becomeUserAction(userId: string) {
  if (!isDemoMode()) throw new Error("Not available");
  const db = getServiceDb();
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new Error("User not found");

  const rawToken = await createSession(u.orgId, u.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, encodeSessionCookie(u.orgId, rawToken), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
  redirect("/dashboard");
}
