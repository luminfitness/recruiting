import { eq, and, gt, isNull } from "drizzle-orm";
import { withRequestContext } from "@usapt/db";
import { sessions, users, userRoles, userMarketScopes } from "@usapt/db/schema";
import { generateAuthToken, hashAuthToken, SESSION_TTL_DAYS } from "@usapt/core";

export const SESSION_COOKIE_NAME = "usapt_session";

/**
 * The cookie value carries {orgId, token} — NOT signed, and that's fine: orgId
 * is just a routing hint (which org to SET LOCAL app.current_org_id to before
 * looking the session up), never a trust boundary by itself. If it's tampered
 * with, the RLS-scoped sessions lookup below simply finds no matching row
 * (a session's real org is fixed at creation time) — verification fails
 * exactly as it should, with no bypass-RLS lookup ever required to bootstrap
 * "which org is this session in."
 */
export function encodeSessionCookie(orgId: string, rawToken: string): string {
  return Buffer.from(JSON.stringify({ orgId, token: rawToken }), "utf8").toString("base64url");
}

export function decodeSessionCookie(value: string): { orgId: string; token: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed?.orgId === "string" && typeof parsed?.token === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

export interface AuthedUser {
  userId: string;
  orgId: string;
  name: string;
  email: string;
  roles: string[];
  /** "*" if any org-wide role (admin/recruiting_lead/trainer_coordinator); otherwise the specific market ids this user's local_manager/territory_manager roles scope to. */
  marketIds: string[] | "*";
}

const ORG_WIDE_ROLES = new Set(["admin", "recruiting_lead", "trainer_coordinator"]);

export async function createSession(orgId: string, userId: string): Promise<string> {
  const rawToken = generateAuthToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await withRequestContext({ orgId, userId, marketIds: "*" }, async (tx) => {
    await tx.insert(sessions).values({ userId, tokenHash: hashAuthToken(rawToken), expiresAt });
  });
  return rawToken;
}

/**
 * Verifies a session cookie value and, if valid, resolves the user's full
 * role/market scope. Every DB read here happens inside withRequestContext
 * scoped to the cookie's claimed org — see the module doc comment above for
 * why a tampered orgId simply fails to resolve rather than needing a
 * bypass-RLS lookup.
 */
export async function verifySessionCookie(value: string): Promise<AuthedUser | null> {
  const parsed = decodeSessionCookie(value);
  if (!parsed) return null;
  const { orgId, token } = parsed;
  const tokenHash = hashAuthToken(token);

  return withRequestContext({ orgId, marketIds: "*" }, async (tx) => {
    const [row] = await tx
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        deactivatedAt: users.deactivatedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date()), isNull(users.deactivatedAt)));

    if (!row) return null;

    const roleRows = await tx.select().from(userRoles).where(eq(userRoles.userId, row.userId));
    const roles = roleRows.map((r) => r.role);
    const hasOrgWideRole = roles.some((r) => ORG_WIDE_ROLES.has(r));

    let marketIds: string[] | "*" = "*";
    if (!hasOrgWideRole) {
      const scopeRows = await tx
        .select({ marketId: userMarketScopes.marketId })
        .from(userMarketScopes)
        .innerJoin(userRoles, eq(userRoles.id, userMarketScopes.userRoleId))
        .where(eq(userRoles.userId, row.userId));
      marketIds = scopeRows.map((s) => s.marketId);
    }

    return { userId: row.userId, orgId, name: row.name, email: row.email, roles, marketIds };
  });
}
