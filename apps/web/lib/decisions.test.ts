import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { InvalidTransitionError } from "@usapt/core";
import { recordDecision, revealDisclosure, bulkNotSelect, listDecisionQueue } from "./decisions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;

type Tx = NodePgDatabase<typeof schema>;

run("decisions & disposition", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";
  let userId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Dec Org", slug: `dec-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db.insert(schema.brands).values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" }).returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "M", timezone: "UTC" }).returning();
    marketId = market.id;
    const [u] = await db.insert(schema.users).values({ orgId, name: "Lead", email: "lead@b.test" }).returning();
    userId = u.id;
  });

  afterAll(async () => {
    // decisions.decided_by is restrict-on-delete (attribution is preserved;
    // users are deactivated, never hard-deleted — FRD Section 12). Delete
    // candidates first (cascades their decisions) so the org teardown's user
    // cascade isn't blocked.
    if (orgId) {
      await db.delete(schema.candidates).where(eq(schema.candidates.orgId, orgId));
      await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    }
    await pool.end();
  });

  async function tx<T>(fn: (tx: Tx, client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
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

  async function makeEvaluated(disclosure = false): Promise<string> {
    const [c] = await db
      .insert(schema.candidates)
      .values({ orgId, brandId, marketId, firstName: "D", lastName: "C", email: `d-${randomBytes(5).toString("hex")}@b.test`, roleType: "trainer", source: "indeed", token: randomBytes(24).toString("base64url"), status: "evaluated" })
      .returning();
    await db.insert(schema.evaluations).values({
      candidateId: c.id,
      interviewGrade: { total: 18, max: 20 },
      quizScore: "67",
      scorecardSubmittedAt: new Date(),
      quizSubmittedAt: new Date(),
      felonyDisclosure: disclosure ? { hasDisclosure: true, detail: "secret detail" } : null,
    });
    return c.id;
  }

  it("records an offer with a decision row + audit, and auto-routes a trainer to referred_local", async () => {
    const id = await makeEvaluated(); // trainer
    await tx((t, client) => recordDecision(t, client, orgId, id, userId, "offer", "great fit"));
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    // The decision itself is `offer`; Phase 5 auto-routing then advances a
    // trainer onward to referred_local in the same action.
    expect(c.status).toBe("referred_local");
    const [d] = await db.select().from(schema.decisions).where(eq(schema.decisions.candidateId, id));
    expect(d.outcome).toBe("offer");
    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.resourceId, id));
    expect(audits.some((a) => a.action === "decision_recorded")).toBe(true);
    expect(audits.some((a) => a.action === "referred_local")).toBe(true);
  });

  it("cannot record a decision on a candidate that isn't evaluated", async () => {
    const [c] = await db
      .insert(schema.candidates)
      .values({ orgId, brandId, marketId, firstName: "X", lastName: "Y", email: `x-${randomBytes(5).toString("hex")}@b.test`, roleType: "trainer", source: "indeed", token: randomBytes(24).toString("base64url"), status: "applied" })
      .returning();
    await expect(tx((t, client) => recordDecision(t, client, orgId, c.id, userId, "offer", null))).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("revealDisclosure returns the detail and writes an audit_log row every time", async () => {
    const id = await makeEvaluated(true);
    const before = (await db.select().from(schema.auditLog).where(eq(schema.auditLog.resourceId, id))).length;
    const result = await tx((t) => revealDisclosure(t, orgId, id, userId, "127.0.0.1"));
    expect(result?.hasDisclosure).toBe(true);
    expect(result?.detail).toBe("secret detail");
    const after = await db.select().from(schema.auditLog).where(eq(schema.auditLog.resourceId, id));
    expect(after.length).toBe(before + 1);
    expect(after.some((a) => a.action === "disclosure_viewed")).toBe(true);
  });

  it("the decision queue never exposes felony detail, only the flag", async () => {
    await makeEvaluated(true);
    const queue = await tx((t) => listDecisionQueue(t));
    // The queue rows are typed without any detail field; assert the shape carries only hasDisclosure.
    const withDisclosure = queue.find((r) => r.hasDisclosure);
    expect(withDisclosure).toBeTruthy();
    expect(JSON.stringify(queue)).not.toContain("secret detail");
  });

  it("bulk not-select closes out multiple candidates with a reason", async () => {
    const a = await makeEvaluated();
    const b = await makeEvaluated();
    const n = await tx((t, client) => bulkNotSelect(t, client, orgId, [a, b], userId, "pipeline full"));
    expect(n).toBe(2);
    const rows = await db.select().from(schema.candidates).where(eq(schema.candidates.orgId, orgId));
    expect(rows.filter((r) => [a, b].includes(r.id)).every((r) => r.status === "not_selected")).toBe(true);
  });
});
