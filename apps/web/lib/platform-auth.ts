import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getServiceDb } from "@usapt/db";
import { platformAdmins } from "@usapt/db/schema";

export const PLATFORM_COOKIE = "usapt_platform";
const MAGIC_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string {
  return process.env.AUTH_SECRET ?? "dev-auth-secret";
}

/**
 * Platform-admin auth is deliberately minimal (the plan says don't over-build
 * the vendor console in v1): stateless HMAC-signed tokens, no new session
 * tables. A token is `<base64url(payload)>.<base64url(hmac)>` where payload is
 * {adminId, exp, kind}. Used for both the emailed magic link (kind="magic")
 * and the resulting session cookie (kind="session").
 */
function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string): { adminId: string; exp: number; kind: string } | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.adminId !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function makeMagicToken(adminId: string): string {
  return sign({ adminId, exp: Date.now() + MAGIC_TTL_MS, kind: "magic" });
}

export function consumeMagicToken(token: string): string | null {
  const p = verify(token);
  return p && p.kind === "magic" ? p.adminId : null;
}

export function makeSessionToken(adminId: string): string {
  return sign({ adminId, exp: Date.now() + SESSION_TTL_MS, kind: "session" });
}

export interface PlatformAdmin {
  id: string;
  email: string;
}

export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const jar = await cookies();
  const raw = jar.get(PLATFORM_COOKIE)?.value;
  if (!raw) return null;
  const p = verify(raw);
  if (!p || p.kind !== "session") return null;
  const db = getServiceDb();
  const [admin] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, p.adminId));
  return admin ? { id: admin.id, email: admin.email } : null;
}

export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login");
  return admin;
}
