import { eq } from "drizzle-orm";
import { getServiceDb } from "@usapt/db";
import { brands, candidates, markets } from "@usapt/db/schema";
import type { BrandTheme } from "@usapt/design-tokens";

export interface ResolvedCandidate {
  id: string;
  orgId: string;
  firstName: string;
  lastName: string;
  roleType: "manager" | "trainer";
  status: string;
  marketId: string;
  marketName: string | null;
  brandName: string | null;
  theme: Partial<BrandTheme>;
}

/**
 * Resolves a candidate-facing token to its candidate + brand theme. Candidate
 * routes are anonymous (no session, no org context), so the token IS the
 * credential — we look it up via the BYPASSRLS service role because there is
 * no org to scope RLS to yet. The unguessable token is what authorizes access
 * to exactly this one candidate's booking/quiz surfaces; nothing else is
 * exposed. Returns null for an unknown token.
 */
export async function resolveCandidateToken(token: string): Promise<ResolvedCandidate | null> {
  const db = getServiceDb();
  const [row] = await db
    .select({
      id: candidates.id,
      orgId: candidates.orgId,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      roleType: candidates.roleType,
      status: candidates.status,
      marketId: candidates.marketId,
      marketName: markets.name,
      brandName: brands.name,
      themeConfig: brands.themeConfig,
      logoUrl: brands.logoUrl,
      replyIdentityName: brands.replyIdentityName,
    })
    .from(candidates)
    .leftJoin(brands, eq(brands.id, candidates.brandId))
    .leftJoin(markets, eq(markets.id, candidates.marketId))
    .where(eq(candidates.token, token));

  if (!row) return null;

  const tc = (row.themeConfig ?? {}) as Record<string, string>;
  return {
    id: row.id,
    orgId: row.orgId,
    firstName: row.firstName,
    lastName: row.lastName,
    roleType: row.roleType,
    status: row.status,
    marketId: row.marketId,
    marketName: row.marketName,
    brandName: row.brandName,
    theme: {
      name: row.brandName ?? undefined,
      sender: row.replyIdentityName ?? undefined,
      primary: tc.primary,
      ink: tc.ink,
      tint: tc.tint,
      logoUrl: row.logoUrl ?? undefined,
    },
  };
}
