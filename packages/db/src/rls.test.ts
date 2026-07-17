import "./load-env";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Inlined rather than imported from @usapt/core to avoid a db<->core dep cycle in tests.
const generateCandidateToken = () => randomBytes(24).toString("base64url");

/**
 * Phase 0's headline verification (plan's Verification section): prove RLS
 * actually isolates tenants and markets at the DB layer, against the
 * non-superuser app role — NOT the superuser, which bypasses RLS. These tests
 * connect via DATABASE_URL (usapt_app: NOSUPERUSER NOBYPASSRLS) so a failure
 * here means a real isolation hole, not a test artifact.
 *
 * Requires a running dev DB with migrations applied:
 *   pnpm db:dev:start && pnpm db:migrate
 * Skips itself (rather than failing) if DATABASE_URL/SERVICE_DATABASE_URL are absent.
 */
const APP_URL = process.env.DATABASE_URL;
const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = APP_URL && SERVICE_URL ? describe : describe.skip;

run("RLS isolation", () => {
  const servicePool = new Pool({ connectionString: SERVICE_URL });
  const appPool = new Pool({ connectionString: APP_URL });
  const service = drizzle(servicePool, { schema });

  // Test fixture ids, filled in beforeAll.
  const ids = {
    orgA: "",
    orgB: "",
    brandA: "",
    brandB: "",
    marketA1: "",
    marketA2: "",
    candA1: "",
    candA2: "",
    candB1: "",
  };

  beforeAll(async () => {
    // Seed two orgs, each with a brand; org A has two markets, one candidate in each.
    const [orgA] = await service.insert(schema.organizations).values({ name: "Org A", slug: `a-${Date.now()}` }).returning();
    const [orgB] = await service.insert(schema.organizations).values({ name: "Org B", slug: `b-${Date.now()}` }).returning();
    ids.orgA = orgA.id;
    ids.orgB = orgB.id;

    const [brandA] = await service
      .insert(schema.brands)
      .values({ orgId: orgA.id, name: "Brand A", slug: "ba", replyIdentityName: "A", replyIdentityEmail: "a@a.test" })
      .returning();
    const [brandB] = await service
      .insert(schema.brands)
      .values({ orgId: orgB.id, name: "Brand B", slug: "bb", replyIdentityName: "B", replyIdentityEmail: "b@b.test" })
      .returning();
    ids.brandA = brandA.id;
    ids.brandB = brandB.id;

    const [mA1] = await service.insert(schema.markets).values({ brandId: brandA.id, name: "A1", timezone: "UTC" }).returning();
    const [mA2] = await service.insert(schema.markets).values({ brandId: brandA.id, name: "A2", timezone: "UTC" }).returning();
    const [mB1] = await service.insert(schema.markets).values({ brandId: brandB.id, name: "B1", timezone: "UTC" }).returning();
    ids.marketA1 = mA1.id;
    ids.marketA2 = mA2.id;

    const [cA1] = await service
      .insert(schema.candidates)
      .values({ orgId: orgA.id, brandId: brandA.id, marketId: mA1.id, firstName: "CA1", lastName: "X", email: "ca1@a.test", roleType: "trainer", source: "indeed", token: generateCandidateToken() })
      .returning();
    const [cA2] = await service
      .insert(schema.candidates)
      .values({ orgId: orgA.id, brandId: brandA.id, marketId: mA2.id, firstName: "CA2", lastName: "X", email: "ca2@a.test", roleType: "trainer", source: "indeed", token: generateCandidateToken() })
      .returning();
    const [cB1] = await service
      .insert(schema.candidates)
      .values({ orgId: orgB.id, brandId: brandB.id, marketId: mB1.id, firstName: "CB1", lastName: "X", email: "cb1@b.test", roleType: "trainer", source: "indeed", token: generateCandidateToken() })
      .returning();
    ids.candA1 = cA1.id;
    ids.candA2 = cA2.id;
    ids.candB1 = cB1.id;
  });

  afterAll(async () => {
    // Clean up (service role bypasses RLS). Cascades handle children.
    if (ids.orgA) await service.delete(schema.organizations).where(eq(schema.organizations.id, ids.orgA));
    if (ids.orgB) await service.delete(schema.organizations).where(eq(schema.organizations.id, ids.orgB));
    await servicePool.end();
    await appPool.end();
  });

  /** Runs a query as the app role inside a transaction with the given RLS context set. */
  async function asContext<T>(
    ctx: { orgId: string; marketIds: string[] | "*" },
    fn: (client: import("pg").PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [ctx.orgId]);
      const markets = ctx.marketIds === "*" ? "*" : ctx.marketIds.join(",");
      await client.query("SELECT set_config('app.market_ids', $1, true)", [markets]);
      return await fn(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  }

  it("org-wide role in Org A sees only Org A candidates", async () => {
    const rows = await asContext({ orgId: ids.orgA, marketIds: "*" }, (c) =>
      c.query("SELECT id FROM candidates").then((r) => r.rows),
    );
    const seen = rows.map((r) => r.id);
    expect(seen).toContain(ids.candA1);
    expect(seen).toContain(ids.candA2);
    expect(seen).not.toContain(ids.candB1);
  });

  it("Org A context cannot see Org B candidates even by direct id", async () => {
    const rows = await asContext({ orgId: ids.orgA, marketIds: "*" }, (c) =>
      c.query("SELECT id FROM candidates WHERE id = $1", [ids.candB1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);
  });

  it("market-scoped role sees only its market's candidates within the org", async () => {
    // A user scoped to market A1 only (e.g. a local_manager) must not see A2's candidate.
    const rows = await asContext({ orgId: ids.orgA, marketIds: [ids.marketA1] }, (c) =>
      c.query("SELECT id, market_id FROM candidates").then((r) => r.rows),
    );
    const seen = rows.map((r) => r.id);
    expect(seen).toContain(ids.candA1);
    expect(seen).not.toContain(ids.candA2);
    expect(seen).not.toContain(ids.candB1);
  });

  it("stackable cross-market roles see the union of their markets, nothing more", async () => {
    // local_manager in A1 + territory_manager in A2 => sees A1 and A2, never B.
    const rows = await asContext({ orgId: ids.orgA, marketIds: [ids.marketA1, ids.marketA2] }, (c) =>
      c.query("SELECT id FROM candidates").then((r) => r.rows),
    );
    const seen = rows.map((r) => r.id);
    expect(seen).toContain(ids.candA1);
    expect(seen).toContain(ids.candA2);
    expect(seen).not.toContain(ids.candB1);
  });

  it("the candidates.status guard trigger rejects a raw UPDATE outside transitionCandidate", async () => {
    await expect(
      asContext({ orgId: ids.orgA, marketIds: "*" }, (c) =>
        c.query("UPDATE candidates SET status = 'invited' WHERE id = $1", [ids.candA1]),
      ),
    ).rejects.toThrow(/transitionCandidate/);
  });

  it("evaluations_safe enforces RLS (security_invoker) and never exposes the felony column", async () => {
    // Seed an evaluation with a disclosure on Org B's candidate (as service).
    await service
      .insert(schema.evaluations)
      .values({ candidateId: ids.candB1, felonyDisclosure: { hasDisclosure: true, detail: "secret" } });

    // Org A context must NOT see Org B's evaluation through the view.
    const rows = await asContext({ orgId: ids.orgA, marketIds: "*" }, (c) =>
      c.query("SELECT candidate_id FROM evaluations_safe WHERE candidate_id = $1", [ids.candB1]).then((r) => r.rows),
    );
    expect(rows).toHaveLength(0);

    // The view must expose has_disclosure (boolean) but NOT felony_disclosure.
    const cols = await asContext({ orgId: ids.orgA, marketIds: "*" }, (c) =>
      c
        .query("SELECT column_name FROM information_schema.columns WHERE table_name = 'evaluations_safe'")
        .then((r) => r.rows.map((x) => x.column_name)),
    );
    expect(cols).toContain("has_disclosure");
    expect(cols).not.toContain("felony_disclosure");
  });
});
