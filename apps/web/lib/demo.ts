import { desc, eq } from "drizzle-orm";
import { getServiceDb } from "@usapt/db";
import { markets, userMarketScopes, userRoles, users } from "@usapt/db/schema";

/**
 * Demo mode gates the user-switcher (below). It's ON in dev, and can be turned
 * on for a hosted demo with DEMO_MODE=1 — but it MUST stay off in a real
 * production deployment, because the switcher lets anyone assume any user
 * without authenticating. Never set DEMO_MODE=1 once real candidate data lands.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1" || process.env.NODE_ENV !== "production";
}

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  orgName: string;
  roles: string[];
  markets: string[];
}

/** All users across all orgs, for the demo switcher. Service role (cross-org) — demo only. */
export async function listDemoUsers(): Promise<DemoUser[]> {
  const { organizations } = await import("@usapt/db/schema");
  const db = getServiceDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      deactivatedAt: users.deactivatedAt,
      orgName: organizations.name,
      role: userRoles.role,
      marketName: markets.name,
    })
    .from(users)
    .leftJoin(organizations, eq(organizations.id, users.orgId))
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(userMarketScopes, eq(userMarketScopes.userRoleId, userRoles.id))
    .leftJoin(markets, eq(markets.id, userMarketScopes.marketId))
    .orderBy(desc(users.createdAt));

  const byUser = new Map<string, DemoUser>();
  for (const r of rows) {
    if (r.deactivatedAt) continue;
    let du = byUser.get(r.id);
    if (!du) {
      du = { id: r.id, name: r.name, email: r.email, orgName: r.orgName ?? "", roles: [], markets: [] };
      byUser.set(r.id, du);
    }
    if (r.role && !du.roles.includes(r.role)) du.roles.push(r.role);
    if (r.marketName && !du.markets.includes(r.marketName)) du.markets.push(r.marketName);
  }
  return [...byUser.values()];
}
