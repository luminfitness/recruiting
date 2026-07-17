import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { SCORECARD_V1, QUIZ_V1 } from "@usapt/db";
import { submitScorecard, submitQuizIntake } from "./evaluation";

/**
 * Integration test for the headline auto-pairing (FR-1.5/1.6/1.7): a candidate
 * becomes `evaluated` only when BOTH the scorecard and the quiz are in, both
 * attach by candidate id/token with no name matching, and quiz-without-
 * attendance is flagged and does NOT auto-advance.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;

type Tx = NodePgDatabase<typeof schema>;

run("evaluation auto-pairing", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";
  let interviewerId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Eval Org", slug: `eval-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db
      .insert(schema.brands)
      .values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" })
      .returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "M", timezone: "UTC" }).returning();
    marketId = market.id;
    const [u] = await db.insert(schema.users).values({ orgId, name: "Scorer", email: "scorer@b.test" }).returning();
    interviewerId = u.id;
    for (const roleType of ["trainer", "manager"] as const) {
      await db.insert(schema.scorecardCriteriaVersions).values({ orgId, roleType, version: 1, schema: SCORECARD_V1[roleType], active: true });
      await db.insert(schema.quizDefinitions).values({ orgId, roleType, version: 1, schema: QUIZ_V1[roleType], active: true });
    }
  });

  afterAll(async () => {
    if (orgId) await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
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

  /** Makes an attended trainer candidate (booking + attendance event). */
  async function makeAttendedCandidate(): Promise<string> {
    const [session] = await db
      .insert(schema.interviewSessions)
      .values({ orgId, roleType: "trainer", marketId, scheduledAt: new Date(), capacity: 12, meetingUrl: "http://x", hostUserId: interviewerId, meetingProvider: "mock" })
      .returning();
    const [c] = await db
      .insert(schema.candidates)
      .values({ orgId, brandId, marketId, firstName: "E", lastName: "C", email: `e-${randomBytes(5).toString("hex")}@b.test`, roleType: "trainer", source: "indeed", token: randomBytes(24).toString("base64url"), status: "attended" })
      .returning();
    const [booking] = await db.insert(schema.sessionBookings).values({ sessionId: session.id, candidateId: c.id, status: "booked" }).returning();
    await db.insert(schema.attendanceEvents).values({ sessionBookingId: booking.id, candidateId: c.id, joinMethod: "token_link" });
    return c.id;
  }

  it("does not evaluate on the scorecard alone", async () => {
    const id = await makeAttendedCandidate();
    await tx((t, client) => submitScorecard(t, client, orgId, id, interviewerId, "trainer", { grades: { communication: 5, sales: 4, coachability: 5, professionalism: 4 }, isDraft: false }));
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("attended");
  });

  it("auto-pairs and evaluates when both halves are in (either order)", async () => {
    const id = await makeAttendedCandidate();
    // quiz first, then scorecard
    await tx((t, client) => submitQuizIntake(t, client, orgId, id, "trainer", { answers: { q1: "b", q2: "b", q3: "a" }, writtenResponse: "x", availability: { "Mon-AM": true }, felonyDisclosure: { hasDisclosure: false }, draft: false }));
    let [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("attended"); // still just one half
    await tx((t, client) => submitScorecard(t, client, orgId, id, interviewerId, "trainer", { grades: { communication: 5, sales: 4, coachability: 5, professionalism: 4 }, isDraft: false }));
    [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("evaluated");

    const [ev] = await db.select().from(schema.evaluations).where(eq(schema.evaluations.candidateId, id));
    expect(ev.quizScore).toBe("100"); // 3/3 correct
    expect((ev.interviewGrade as { total: number }).total).toBe(18);
  });

  it("a draft scorecard never evaluates", async () => {
    const id = await makeAttendedCandidate();
    await tx((t, client) => submitQuizIntake(t, client, orgId, id, "trainer", { answers: { q1: "b" }, writtenResponse: "x", availability: {}, felonyDisclosure: null, draft: false }));
    await tx((t, client) => submitScorecard(t, client, orgId, id, interviewerId, "trainer", { grades: { communication: 3 }, isDraft: true }));
    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(c.status).toBe("attended");
  });

  it("quiz without attendance is flagged and does not auto-advance", async () => {
    // Candidate who never attended (status invited, no attendance event).
    const [c] = await db
      .insert(schema.candidates)
      .values({ orgId, brandId, marketId, firstName: "NoShow", lastName: "Quiz", email: `nq-${randomBytes(5).toString("hex")}@b.test`, roleType: "trainer", source: "indeed", token: randomBytes(24).toString("base64url"), status: "invited" })
      .returning();
    await tx((t, client) => submitQuizIntake(t, client, orgId, c.id, "trainer", { answers: { q1: "b", q2: "b", q3: "a" }, writtenResponse: "x", availability: {}, felonyDisclosure: null, draft: false }));
    await tx((t, client) => submitScorecard(t, client, orgId, c.id, interviewerId, "trainer", { grades: { communication: 5, sales: 5, coachability: 5, professionalism: 5 }, isDraft: false }));

    const [ev] = await db.select().from(schema.evaluations).where(eq(schema.evaluations.candidateId, c.id));
    expect(ev.quizWithoutAttendanceFlag).toBe(true);
    const [after] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, c.id));
    expect(after.status).toBe("invited"); // never advanced — needs human review
  });
});
