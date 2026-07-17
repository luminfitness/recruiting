import "server-only";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { withRequestContext } from "@usapt/db";
import { requireUser } from "./auth";
import type { AuthedUser } from "./session";

type Tx = NodePgDatabase<typeof dbSchema>;

/**
 * Runs `fn` inside the current authenticated user's RLS context — the single
 * wrapper every staff page/action should use for DB work, so `SET LOCAL
 * app.current_org_id` / market scope is applied consistently and no query can
 * accidentally run unscoped. Redirects to /login if there's no session.
 */
export async function withUser<T>(
  fn: (tx: Tx, client: PoolClient, user: AuthedUser) => Promise<T>,
): Promise<T> {
  const user = await requireUser();
  return withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: user.marketIds }, (tx, client) =>
    fn(tx, client, user),
  );
}
