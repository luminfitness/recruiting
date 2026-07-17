import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { recordDecision } from "./decisions";
import { recordOfferResponse, retractOffer } from "./offers";
import { scheduleWorkingInterview, recordLocalOutcome, listLocalQueue } from "./referrals";
import { markOfferMia } from "./jobs/aging";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;
type Tx = NodePgDatabase<typeof schema>;

run("hire paths — manager offer & trainer local referral", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";
  let userId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Hire Org", slug: `hire-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db.insert(schema.brands).values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" }).returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "M", timezone: "UTC" }).returning();
    marketId = market.id;
    const [u] = await db.insert(schema.users).values({ orgId, name: "Lead", email: "lead@b.test" }).returning();
    userId = u.id;
    await db.insert(schema.thresholdSettings).values({ orgId });
  });

  afterAll(async () => {
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

  async function makeEvaluated(roleType: "manager" | "trainer"): Promise<string> {
    const [c] = await db
      .insert(schema.candidates)
      .values({ orgId, brandId, marketId, firstName: "H", lastName: "C", email: `h-${randomBytes(5).toString("hex")}@b.test`, roleType, source: "indeed", token: randomBytes(24).toString("base64url"), status: "evaluated" })
      .returning();
    await db.insert(schema.evaluations).values({ candidateId: c.id, interviewGrade: { total: 18, max: 20 }, quizScore: "80", scorecardSubmittedAt: new Date(), quizSubmittedAt: new Date() });
    return c.id;
  }

  it("manager offer decision auto-routes to awaiting_reply and sends offer + onboarding", async () => {
    const id = await makeEvaluated("manager");
    await tx((t, client) => recordDecision(t, client, orgId, id, userId, "offer", null));
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("awaiting_reply");
    const [offer] = await db.select().from(schema.offers).where(eq(schema.offers.candidateId, id));
    expect(offer).toBeTruthy();
    expect(Object.keys(offer.onboardingEmailsSent as object).length).toBe(3);
  });

  it("manager acceptance advances to confirmed_orientation", async () => {
    const id = await makeEvaluated("manager");
    await tx((t, client) => recordDecision(t, client, orgId, id, userId, "offer", null));
    await tx((t, client) => recordOfferResponse(t, client, orgId, id, "accepted", userId));
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("confirmed_orientation");
  });

  it("offer retraction requires a reason and closes to not_selected", async () => {
    const id = await makeEvaluated("manager");
    await tx((t, client) => recordDecision(t, client, orgId, id, userId, "offer", null));
    await tx((t, client) => retractOffer(t, client, orgId, id, "position filled internally", userId));
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("not_selected");
    const [offer] = await db.select().from(schema.offers).where(eq(schema.offers.candidateId, id));
    expect(offer.retractedAt).toBeTruthy();
  });

  it("offer MIA job marks awaiting_reply past threshold", async () => {
    const id = await makeEvaluated("manager");
    await tx((t, client) => recordDecision(t, client, orgId, id, userId, "offer", null));
    // Backdate the offer past the org's 5-day default threshold.
    await db.update(schema.offers).set({ sentAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) }).where(eq(schema.offers.candidateId, id));
    const marked = await tx((t, client) => markOfferMia(t, client));
    expect(marked).toBeGreaterThanOrEqual(1);
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("mia");
  });

  it("trainer offer decision auto-refers to local and appears on the local queue", async () => {
    const id = await makeEvaluated("trainer");
    await tx((t, client) => recordDecision(t, client, orgId, id, userId, "offer", null));
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("referred_local");
    const queue = await tx((t) => listLocalQueue(t));
    expect(queue.some((q) => q.candidateId === id)).toBe(true);
  });

  it("trainer local path: schedule then hired -> confirmed_orientation", async () => {
    const id = await makeEvaluated("trainer");
    await tx((t, client) => recordDecision(t, client, orgId, id, userId, "offer", null));
    const [ref] = await db.select().from(schema.localReferrals).where(eq(schema.localReferrals.candidateId, id));
    await tx((t, client) => scheduleWorkingInterview(t, client, orgId, ref.id, new Date(Date.now() + 86400000), userId));
    let [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("working_interview");
    await tx((t, client) => recordLocalOutcome(t, client, orgId, ref.id, "hired", "great session", userId));
    [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("confirmed_orientation");
    const [updated] = await db.select().from(schema.localReferrals).where(eq(schema.localReferrals.id, ref.id));
    expect(updated.outcome).toBe("hired");
  });

  it("trainer no-show rebooks back to referred_local", async () => {
    const id = await makeEvaluated("trainer");
    await tx((t, client) => recordDecision(t, client, orgId, id, userId, "offer", null));
    const [ref] = await db.select().from(schema.localReferrals).where(eq(schema.localReferrals.candidateId, id));
    await tx((t, client) => scheduleWorkingInterview(t, client, orgId, ref.id, new Date(Date.now() + 86400000), userId));
    await tx((t, client) => recordLocalOutcome(t, client, orgId, ref.id, "no_show", null, userId));
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("referred_local");
  });
});
