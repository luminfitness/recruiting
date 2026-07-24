import { and, eq } from "drizzle-orm";
import { withServiceTransaction } from "@usapt/db";
import { brands, markets } from "@usapt/db/schema";
import { createCandidate } from "./candidates";

/**
 * The public application form — the ONLY unauthenticated write path into the
 * database, and the destination our published job ads point at
 * (/apply/{brandSlug}?role=…).
 *
 * Because there is no session, this runs through withServiceTransaction, which
 * bypasses RLS. That makes the rules below load-bearing rather than cosmetic:
 *
 *  1. orgId is NEVER taken from the request. It is derived from the brand slug
 *     in the URL, and every write is scoped to that org.
 *  2. marketId is verified to belong to that brand, so a crafted post cannot
 *     attach an applicant to another tenant's market.
 *  3. Input is length-capped and shape-checked before it reaches the DB.
 *  4. The response is identical whether or not the person already exists —
 *     the form must not become an oracle for "is this email in your system".
 */

export const MAX_LENGTHS = { firstName: 80, lastName: 80, email: 254, phone: 40 } as const;

export type ApplyResult =
  | { ok: true }
  | { ok: false; error: string };

export interface PublicBrand {
  brandId: string;
  orgId: string;
  name: string;
  slug: string;
  theme: { primary?: string; ink?: string; tint?: string };
  markets: { id: string; name: string }[];
}

/** Public-safe brand lookup: only what the form needs to render. Never org data. */
export async function getPublicBrand(slug: string): Promise<PublicBrand | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean || clean.length > 100) return null;

  return withServiceTransaction(async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.slug, clean));
    if (!brand) return null;
    const marketRows = await tx
      .select({ id: markets.id, name: markets.name })
      .from(markets)
      .where(eq(markets.brandId, brand.id));
    return {
      brandId: brand.id,
      orgId: brand.orgId,
      name: brand.name,
      slug: brand.slug,
      theme: (brand.themeConfig ?? {}) as PublicBrand["theme"],
      markets: marketRows,
    };
  });
}

export function normalizeRole(raw: string | undefined): "manager" | "trainer" {
  return raw === "manager" ? "manager" : "trainer";
}

const SOURCES = ["indeed", "linkedin", "referral", "other"] as const;
export function normalizeSource(raw: string | undefined): (typeof SOURCES)[number] {
  return SOURCES.includes(raw as (typeof SOURCES)[number]) ? (raw as (typeof SOURCES)[number]) : "other";
}

/**
 * Deliberately permissive: this rejects the shapes that are definitely not an
 * address, not the ones RFC 5322 forbids. Bouncing a real applicant is a much
 * worse failure here than accepting an odd-looking address.
 */
export function isPlausibleEmail(email: string): boolean {
  if (email.length > MAX_LENGTHS.email) return false;
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email);
}

export interface ApplyInput {
  brandSlug: string;
  roleType: string;
  marketId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source?: string;
  /** Hidden field. Real people leave it empty; bots fill it in. */
  honeypot?: string;
}

/**
 * In-memory sliding window per IP. This is a speed bump, not a real defence —
 * it resets on redeploy and is per-instance on serverless. A shared store (or
 * an edge rule) is the durable answer; noted rather than pretended.
 */
const RATE_LIMIT = { max: 5, windowMs: 10 * 60 * 1000 };
const hits = new Map<string, number[]>();

export function rateLimitOk(ip: string, now = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  if (recent.length >= RATE_LIMIT.max) {
    hits.set(ip, recent);
    return false;
  }
  recent.push(now);
  hits.set(ip, recent);
  return true;
}

export async function submitApplication(input: ApplyInput, ip: string): Promise<ApplyResult> {
  // Bot: accept silently. Telling it that it failed just teaches it to retry.
  if (input.honeypot && input.honeypot.trim() !== "") return { ok: true };

  if (!rateLimitOk(ip)) {
    return { ok: false, error: "Too many applications from this connection. Please try again later." };
  }

  const firstName = input.firstName.trim().slice(0, MAX_LENGTHS.firstName);
  const lastName = input.lastName.trim().slice(0, MAX_LENGTHS.lastName);
  const email = input.email.trim().toLowerCase().slice(0, MAX_LENGTHS.email);
  const phone = input.phone?.trim().slice(0, MAX_LENGTHS.phone) || undefined;

  if (!firstName || !lastName) return { ok: false, error: "Please enter your first and last name." };
  if (!isPlausibleEmail(email)) return { ok: false, error: "Please enter a valid email address." };

  const brand = await getPublicBrand(input.brandSlug);
  if (!brand) return { ok: false, error: "This posting is no longer available." };

  return withServiceTransaction(async (tx, client) => {
    // The market must belong to THIS brand — otherwise a crafted post could
    // file an applicant under another tenant's market.
    const [market] = await tx
      .select({ id: markets.id })
      .from(markets)
      .where(and(eq(markets.id, input.marketId), eq(markets.brandId, brand.brandId)));
    if (!market) return { ok: false, error: "Please choose a location." };

    await createCandidate(tx, client, brand.orgId, {
      brandId: brand.brandId,
      marketId: market.id,
      firstName,
      lastName,
      email,
      phone,
      roleType: normalizeRole(input.roleType),
      source: normalizeSource(input.source),
    });

    // Same response whether this created a record or matched an existing one.
    return { ok: true };
  });
}
