"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { withRequestContext } from "@usapt/db";
import { auditLog, brands, markets, users, userRoles, userMarketScopes } from "@usapt/db/schema";
import { requireUser, hasRole } from "@/lib/auth";

async function requireAdmin() {
  const user = await requireUser();
  if (!hasRole(user, "admin")) {
    throw new Error("Only admins may perform this action");
  }
  return user;
}

export async function createBrandAction(formData: FormData) {
  const user = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const replyIdentityName = String(formData.get("replyIdentityName") ?? "").trim();
  const replyIdentityEmail = String(formData.get("replyIdentityEmail") ?? "").trim();
  if (!name || !slug || !replyIdentityName || !replyIdentityEmail) return;

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    await tx.insert(brands).values({ orgId: user.orgId, name, slug, replyIdentityName, replyIdentityEmail });
  });
  revalidatePath("/settings/organization");
}

export async function createMarketAction(formData: FormData) {
  const user = await requireAdmin();
  const brandId = String(formData.get("brandId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!brandId || !name || !timezone) return;

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    await tx.insert(markets).values({ brandId, name, timezone });
  });
  revalidatePath("/settings/organization");
}

export async function createUserAction(formData: FormData) {
  const user = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  if (!name || !email || !role) return;

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    const [newUser] = await tx.insert(users).values({ orgId: user.orgId, name, email }).returning();
    await tx.insert(userRoles).values({ userId: newUser.id, orgId: user.orgId, role: role as (typeof userRoles.$inferInsert)["role"] });
  });
  revalidatePath("/settings/organization");
}

/**
 * Deactivates a user — sets deactivated_at (which excludes them from login and
 * role resolution) WITHOUT deleting the row, so all their historical
 * attribution (decisions, offers, outcomes) is preserved (FRD Section 12).
 */
export async function deactivateUserAction(targetUserId: string) {
  const user = await requireAdmin();
  if (targetUserId === user.userId) return; // don't lock yourself out
  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    await tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, targetUserId));
    await tx.insert(auditLog).values({ orgId: user.orgId, actorUserId: user.userId, action: "user_deactivated", resourceType: "user", resourceId: targetUserId, metadata: {} });
  });
  revalidatePath("/settings/organization");
}

export async function reactivateUserAction(targetUserId: string) {
  const user = await requireAdmin();
  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    await tx.update(users).set({ deactivatedAt: null }).where(eq(users.id, targetUserId));
  });
  revalidatePath("/settings/organization");
}

/**
 * Grants a user a role scoped to a specific market (for local_manager /
 * territory_manager). Creates the role grant if needed, then the market scope —
 * this is what backs the RLS market_scope predicate.
 */
export async function assignMarketScopeAction(formData: FormData) {
  const user = await requireAdmin();
  const targetUserId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as "local_manager" | "territory_manager";
  const marketId = String(formData.get("marketId") ?? "");
  if (!targetUserId || !role || !marketId) return;

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    let [grant] = await tx.select().from(userRoles).where(and(eq(userRoles.userId, targetUserId), eq(userRoles.role, role)));
    if (!grant) {
      [grant] = await tx.insert(userRoles).values({ userId: targetUserId, orgId: user.orgId, role }).returning();
    }
    // Avoid duplicate scope rows.
    const existing = await tx.select().from(userMarketScopes).where(and(eq(userMarketScopes.userRoleId, grant.id), eq(userMarketScopes.marketId, marketId)));
    if (existing.length === 0) {
      await tx.insert(userMarketScopes).values({ userRoleId: grant.id, marketId });
    }
  });
  revalidatePath("/settings/organization");
}
