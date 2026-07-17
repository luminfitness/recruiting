import { desc, eq, sql } from "drizzle-orm";
import { getServiceDb } from "@usapt/db";
import { candidates, integrationConfigs, organizations, supportAccessGrants, thresholdSettings, users } from "@usapt/db/schema";

/**
 * Platform-admin cross-org queries run via the BYPASSRLS service role — this is
 * the ONE place cross-tenant reads are legitimate, and it's vendor-side only
 * (never reachable from an org session). Candidate DETAIL is never surfaced
 * here — only aggregate health counts — so no org's sensitive data leaks into
 * the console. Actually reading into an org's data requires the explicit,
 * audit-logged support_access_grant path, deliberately left minimal in v1.
 */
export interface OrgHealth {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  userCount: number;
  candidateCount: number;
}

export async function listOrgHealth(): Promise<OrgHealth[]> {
  const db = getServiceDb();
  const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
  const out: OrgHealth[] = [];
  for (const o of orgs) {
    const [{ uc }] = await db.select({ uc: sql<number>`count(*)::int` }).from(users).where(eq(users.orgId, o.id));
    const [{ cc }] = await db.select({ cc: sql<number>`count(*)::int` }).from(candidates).where(eq(candidates.orgId, o.id));
    out.push({ id: o.id, name: o.name, slug: o.slug, createdAt: o.createdAt, userCount: uc, candidateCount: cc });
  }
  return out;
}

/** Provisions a new organization (vendor action) with a first admin + defaults. */
export async function createOrganization(input: { name: string; slug: string; adminName: string; adminEmail: string }): Promise<string> {
  const db = getServiceDb();
  const [org] = await db.insert(organizations).values({ name: input.name, slug: input.slug }).returning();
  const [admin] = await db.insert(users).values({ orgId: org.id, name: input.adminName, email: input.adminEmail.toLowerCase() }).returning();
  await db.insert(thresholdSettings).values({ orgId: org.id });
  for (const category of ["job_board_indeed", "job_board_linkedin", "messaging_email", "messaging_sms", "meeting"] as const) {
    await db.insert(integrationConfigs).values({ orgId: org.id, category, providerKey: "mock" });
  }
  // First admin role.
  const { userRoles } = await import("@usapt/db/schema");
  await db.insert(userRoles).values({ userId: admin.id, orgId: org.id, role: "admin" });
  return org.id;
}

export interface SupportGrantRow {
  id: string;
  orgName: string | null;
  reason: string;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export async function listSupportGrants(): Promise<SupportGrantRow[]> {
  const db = getServiceDb();
  const rows = await db
    .select({
      id: supportAccessGrants.id,
      reason: supportAccessGrants.reason,
      grantedAt: supportAccessGrants.grantedAt,
      expiresAt: supportAccessGrants.expiresAt,
      revokedAt: supportAccessGrants.revokedAt,
      orgName: organizations.name,
    })
    .from(supportAccessGrants)
    .leftJoin(organizations, eq(organizations.id, supportAccessGrants.orgId))
    .orderBy(desc(supportAccessGrants.grantedAt));
  return rows;
}

/** Records an explicit, time-boxed break-glass grant. Recording it is all v1 does — no impersonation UI. */
export async function createSupportGrant(platformAdminId: string, orgId: string, reason: string, hours: number): Promise<void> {
  const db = getServiceDb();
  await db.insert(supportAccessGrants).values({
    platformAdminId,
    orgId,
    reason,
    expiresAt: new Date(Date.now() + hours * 3600_000),
  });
}
