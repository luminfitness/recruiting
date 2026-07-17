import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import {
  transitionCandidate,
  reapplyCandidate,
  InvalidTransitionError,
  ReasonRequiredError,
  type TransitionEvent,
} from "./index";

/**
 * Integration test for the candidate state machine against a real DB (so the
 * status-guard trigger and candidate_status_history writes are exercised for
 * real, not mocked). Lives in packages/core, which already depends on
 * @usapt/db. Skips if the dev DB env isn't set (see packages/db/src/rls.test.ts).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;

run("candidate state machine", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";
  const createdCandidateIds: string[] = [];

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "SM Org", slug: `sm-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db
      .insert(schema.brands)
      .values({ orgId, name: "SM Brand", slug: "sm", replyIdentityName: "SM", replyIdentityEmail: "sm@sm.test" })
      .returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "SM Market", timezone: "UTC" }).returning();
    marketId = market.id;
  });

  afterEach(async () => {
    for (const id of createdCandidateIds) {
      await db.delete(schema.candidates).where(eq(schema.candidates.id, id)).catch(() => {});
    }
    createdCandidateIds.length = 0;
  });

  afterAll(async () => {
    if (orgId) await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await pool.end();
  });

  async function makeCandidate(roleType: "manager" | "trainer" = "trainer"): Promise<string> {
    const [c] = await db
      .insert(schema.candidates)
      .values({
        orgId,
        brandId,
        marketId,
        firstName: "T",
        lastName: "C",
        email: `t-${randomBytes(6).toString("hex")}@sm.test`,
        roleType,
        source: "indeed",
        token: randomBytes(24).toString("base64url"),
      })
      .returning();
    createdCandidateIds.push(c.id);
    return c.id;
  }

  /** Drives a sequence of events through transitionCandidate inside one transaction (service-role client). */
  async function drive(
    candidateId: string,
    steps: { event: TransitionEvent; reason?: string; payload?: Record<string, unknown> }[],
  ): Promise<string> {
    const client: PoolClient = await pool.connect();
    let final = "";
    try {
      await client.query("BEGIN");
      const tx = drizzle(client, { schema });
      for (const s of steps) {
        final = await transitionCandidate({ tx, client, candidateId, event: s.event, reason: s.reason, payload: s.payload });
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    return final;
  }

  it("walks the manager happy path applied → confirmed_orientation", async () => {
    const id = await makeCandidate("manager");
    const final = await drive(id, [
      { event: "invitation_sent" },
      { event: "session_joined" },
      { event: "evaluation_complete" },
      { event: "decision_recorded", payload: { outcome: "offer" } },
      { event: "offer_sent" },
      { event: "candidate_accepted" },
    ]);
    expect(final).toBe("confirmed_orientation");
  });

  it("walks the trainer happy path through the local referral loop", async () => {
    const id = await makeCandidate("trainer");
    const final = await drive(id, [
      { event: "invitation_sent" },
      { event: "session_joined" },
      { event: "evaluation_complete" },
      { event: "decision_recorded", payload: { outcome: "offer" } },
      { event: "referred_to_local" },
      { event: "working_interview_scheduled" },
      { event: "local_outcome_hired" },
      { event: "class_started" },
      { event: "graduated" },
    ]);
    expect(final).toBe("graduated");
  });

  it("rejects an invalid transition (offer_sent from applied)", async () => {
    const id = await makeCandidate();
    await expect(drive(id, [{ event: "offer_sent" }])).rejects.toBeInstanceOf(InvalidTransitionError);
  });

  it("requires a reason for close-out", async () => {
    const id = await makeCandidate();
    await drive(id, [{ event: "invitation_sent" }]);
    await expect(drive(id, [{ event: "closed_out" }])).rejects.toBeInstanceOf(ReasonRequiredError);
    const final = await drive(id, [{ event: "closed_out", reason: "stale" }]);
    expect(final).toBe("not_selected");
  });

  it("records every transition in candidate_status_history in order", async () => {
    const id = await makeCandidate();
    await drive(id, [{ event: "invitation_sent" }, { event: "session_joined" }]);
    const history = await db
      .select()
      .from(schema.candidateStatusHistory)
      .where(eq(schema.candidateStatusHistory.candidateId, id))
      .orderBy(schema.candidateStatusHistory.createdAt);
    expect(history.map((h) => h.toStatus)).toEqual(["invited", "attended"]);
  });

  it("re-application creates a NEW record with duplicate_of set and its own token", async () => {
    const id = await makeCandidate();
    await drive(id, [{ event: "invitation_sent" }, { event: "closed_out", reason: "not a fit" }]);

    const client = await pool.connect();
    let freshId = "";
    try {
      await client.query("BEGIN");
      const tx = drizzle(client, { schema });
      freshId = await reapplyCandidate(tx, id);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    createdCandidateIds.push(freshId);

    const [fresh] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, freshId));
    const [prior] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, id));
    expect(fresh.duplicateOf).toBe(id);
    expect(fresh.status).toBe("applied");
    expect(fresh.token).not.toBe(prior.token);
  });
});
