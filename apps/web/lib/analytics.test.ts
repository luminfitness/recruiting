import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { computeFunnel } from "./analytics";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const APP_URL = process.env.DATABASE_URL;
const run = SERVICE_URL && APP_URL ? describe : describe.skip;
type Tx = NodePgDatabase<typeof schema>;

run("funnel analytics", () => {
  const pool = new Pool({ connectionString: SERVICE_URL }); // seeding (bypass RLS)
  const appPool = new Pool({ connectionString: APP_URL }); // computeFunnel runs RLS-scoped, like production
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "An Org", slug: `an-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db.insert(schema.brands).values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" }).returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "M", timezone: "UTC" }).returning();
    marketId = market.id;

    // Build candidates that reached different depths, via history rows.
    // 3 applicants; 2 attended; 1 graduated.
    async function mk(historyStatuses: string[], current: string) {
      const [c] = await db.insert(schema.candidates).values({ orgId, brandId, marketId, firstName: "A", lastName: "B", email: `a-${randomBytes(5).toString("hex")}@b.test`, roleType: "trainer", source: "indeed", token: randomBytes(24).toString("base64url"), status: current as (typeof schema.candidates.$inferInsert)["status"] }).returning();
      for (const s of historyStatuses) {
        await db.insert(schema.candidateStatusHistory).values({ candidateId: c.id, toStatus: s as (typeof schema.candidateStatusHistory.$inferInsert)["toStatus"], event: "seed" });
      }
      return c.id;
    }
    await mk(["applied"], "applied");
    await mk(["applied", "invited", "attended"], "attended");
    await mk(["applied", "invited", "attended", "evaluated", "offer", "referred_local", "working_interview", "confirmed_orientation", "in_class", "graduated"], "graduated");

    // A posting with spend for cost-per.
    await db.insert(schema.jobPostings).values({ orgId, brandId, marketId, roleType: "trainer", channel: "indeed", status: "live", mode: "semi_auto", copySnapshot: "x", scheduledPostAt: new Date(), spend: "900" });
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(schema.candidates).where(eq(schema.candidates.orgId, orgId));
      await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    }
    await pool.end();
    await appPool.end();
  });

  // Runs fn through the RLS-scoped app role with this org's context set — exactly
  // how /analytics runs computeFunnel in production (via withRequestContext).
  async function tx<T>(fn: (tx: Tx, client: PoolClient) => Promise<T>): Promise<T> {
    const client = await appPool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [orgId]);
      await client.query("SELECT set_config('app.market_ids', '*', true)");
      const r = await fn(drizzle(client, { schema }), client);
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  it("counts each funnel stage by furthest status reached", async () => {
    const funnel = await tx((t, client) => computeFunnel(t, client, {}));
    const by = Object.fromEntries(funnel.stages.map((s) => [s.key, s.count]));
    expect(by.applicants).toBe(3);
    expect(by.attended).toBe(2); // two reached attended
    expect(by.completed).toBe(1); // one reached evaluated+
    expect(by.graduates).toBe(1);
  });

  it("computes conversion from the previous stage and allocates cost per stage", async () => {
    const funnel = await tx((t, client) => computeFunnel(t, client, {}));
    expect(funnel.totalSpend).toBe(900);
    const applicants = funnel.stages.find((s) => s.key === "applicants")!;
    const attended = funnel.stages.find((s) => s.key === "attended")!;
    const completed = funnel.stages.find((s) => s.key === "completed")!;
    expect(applicants.costPer).toBeCloseTo(300, 5); // 900 / 3
    expect(attended.costPer).toBeCloseTo(450, 5); // 900 / 2
    // completed(1) from attended(2) = 50% — a stage whose predecessor is non-zero.
    expect(completed.conversionFromPrev).toBeCloseTo(0.5, 5);
  });

  it("filters by role", async () => {
    const funnel = await tx((t, client) => computeFunnel(t, client, { role: "manager" }));
    expect(funnel.stages[0].count).toBe(0); // all seeded candidates are trainers
  });
});
