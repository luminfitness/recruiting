import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

let pool: Pool | undefined;
let servicePool: Pool | undefined;

/**
 * A pooled, session-holding connection (node-postgres against Neon's pooled
 * connection string) — NOT Neon's one-shot HTTP fetch driver. Required so
 * `SET LOCAL app.current_org_id` inside withRequestContext's transaction
 * actually scopes every query that follows it. See the plan's Phase 0 risk
 * note: this is the single riskiest plumbing detail in the whole stack.
 *
 * IMPORTANT: the Postgres role behind DATABASE_URL must NOT have BYPASSRLS.
 * Every table in the schema (except platform_admins/scheduled_job_runs) has
 * RLS enabled and defaults to returning zero rows when no
 * app.current_org_id is set — so plain getDb()/getPool() usage outside
 * withRequestContext fails CLOSED (empty results), never open. That's the
 * deliberately safe default; use getServiceDb() only for the narrow set of
 * operations that must legitimately span organizations.
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set — see .env.example");
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export function getDb(): Db {
  return drizzle(getPool(), { schema });
}

/**
 * A SEPARATE Postgres role WITH BYPASSRLS, for the narrow set of operations
 * that must legitimately see across organizations before any per-request org
 * context exists:
 *   - the cron-tick handler enumerating which orgs have due work, before
 *     handing off to withRequestContext() per org for the actual processing
 *   - the magic-link login flow's initial "which org is this email in"
 *     lookup (see apps/web/lib/magic-link.ts) — reads only users.id/orgId/email,
 *     nothing candidate- or market-scoped
 *   - migrate.ts / seed.ts, which run outside any request context entirely
 * Everything else MUST go through withRequestContext(). Needs SERVICE_DATABASE_URL
 * pointed at a role created with `CREATE ROLE ... BYPASSRLS` — see
 * packages/db/drizzle/0001_rls_policies.sql's header comment for the setup note.
 */
export function getServicePool(): Pool {
  if (!servicePool) {
    const connectionString = process.env.SERVICE_DATABASE_URL;
    if (!connectionString) {
      throw new Error("SERVICE_DATABASE_URL is not set — see .env.example");
    }
    servicePool = new Pool({ connectionString });
  }
  return servicePool;
}

export function getServiceDb(): Db {
  return drizzle(getServicePool(), { schema });
}

export interface RequestContext {
  orgId: string;
  userId?: string;
  /** Comma-separated market UUIDs the current role may see, or "*" for org-wide roles (admin/recruiting_lead/trainer_coordinator). */
  marketIds?: string[] | "*";
}

/**
 * Every staff-app request (and every cron-tick job, scoped to one org at a
 * time) must run its DB work inside this wrapper — it's what makes the RLS
 * policies in drizzle/0001_rls_policies.sql actually apply. `SET LOCAL` only
 * takes effect for the remainder of the CURRENT transaction on the CURRENT
 * connection, so the org/user/market context and the queries that depend on
 * it must share one held session — hence node-postgres's pooled client
 * checkout + explicit BEGIN/COMMIT, not a one-shot query-per-call driver.
 */
export async function withRequestContext<T>(
  ctx: RequestContext,
  fn: (tx: NodePgDatabase<typeof schema>, client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_org_id', $1, true)", [ctx.orgId]);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [ctx.userId ?? ""]);
    const marketIds = ctx.marketIds === "*" ? "*" : (ctx.marketIds ?? []).join(",");
    await client.query("SELECT set_config('app.market_ids', $1, true)", [marketIds]);
    const tx = drizzle(client, { schema });
    const result = await fn(tx, client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sets the transaction-scoped flag the candidates.status guard trigger
 * requires, then runs fn. This must ONLY be called from
 * packages/core/state-machine's transitionCandidate — no other code path
 * may set this flag. See 0001_rls_policies.sql's status_transition_guard trigger.
 */
export async function withStatusTransitionAllowed<T>(
  client: PoolClient,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("SELECT set_config('app.allow_status_transition', 'on', true)");
  return fn();
}
