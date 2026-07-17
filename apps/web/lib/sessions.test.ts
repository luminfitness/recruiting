import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";

type Tx = NodePgDatabase<typeof schema>;
import { bookSession, createSession, recordTokenAttendance, SessionFullError } from "./sessions";
import { markNoShows } from "./jobs/no-show";

/**
 * Integration test for Phase 2 — booking, the token-redirect attendance
 * pipeline, and no-show marking — against the real dev DB. Skips if the dev
 * DB env isn't configured.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;

run("sessions, booking & attendance", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";
  let hostId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Sess Org", slug: `sess-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db
      .insert(schema.brands)
      .values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" })
      .returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "M", timezone: "UTC" }).returning();
    marketId = market.id;
    const [host] = await db.insert(schema.users).values({ orgId, name: "Host", email: "host@b.test" }).returning();
    hostId = host.id;
  });

  afterAll(async () => {
    if (orgId) await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
    await pool.end();
  });

  async function tx<T>(fn: (tx: Tx, client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const t = drizzle(client, { schema });
      const r = await fn(t, client);
      await client.query("COMMIT");
      return r;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async function makeCandidate(status: "applied" | "invited" | "no_show" = "invited"): Promise<{ id: string; token: string }> {
    const token = randomBytes(24).toString("base64url");
    const [c] = await db
      .insert(schema.candidates)
      .values({
        orgId,
        brandId,
        marketId,
        firstName: "C",
        lastName: "C",
        email: `c-${randomBytes(5).toString("hex")}@b.test`,
        roleType: "trainer",
        source: "indeed",
        token,
        status,
      })
      .returning();
    return { id: c.id, token };
  }

  function futureSession(capacity = 12) {
    return tx((t) =>
      createSession(t, orgId, {
        roleType: "trainer",
        marketId,
        scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        capacity,
        hostUserId: hostId,
      }),
    );
  }

  it("books a candidate and enforces capacity", async () => {
    const sessionId = await futureSession(1);
    const a = await makeCandidate();
    const b = await makeCandidate();
    await tx((t, client) => bookSession(t, client, { id: a.id, orgId, status: "invited" }, sessionId));
    await expect(tx((t, client) => bookSession(t, client, { id: b.id, orgId, status: "invited" }, sessionId))).rejects.toBeInstanceOf(
      SessionFullError,
    );
  });

  it("a later booking replaces the earlier one (single active booking)", async () => {
    const s1 = await futureSession();
    const s2 = await futureSession();
    const c = await makeCandidate();
    await tx((t, client) => bookSession(t, client, { id: c.id, orgId, status: "invited" }, s1));
    await tx((t, client) => bookSession(t, client, { id: c.id, orgId, status: "invited" }, s2));
    const active = await db
      .select()
      .from(schema.sessionBookings)
      .where(and(eq(schema.sessionBookings.candidateId, c.id), eq(schema.sessionBookings.status, "booked")));
    expect(active).toHaveLength(1);
    expect(active[0].sessionId).toBe(s2);
  });

  it("token attendance advances invited -> attended and is idempotent", async () => {
    const sessionId = await futureSession();
    const c = await makeCandidate("invited");
    await tx((t, client) => bookSession(t, client, { id: c.id, orgId, status: "invited" }, sessionId));

    const first = await tx((t, client) => recordTokenAttendance(t, client, c.token));
    expect(first?.alreadyAttended).toBe(false);
    const second = await tx((t, client) => recordTokenAttendance(t, client, c.token));
    expect(second?.alreadyAttended).toBe(true);

    const [cand] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, c.id));
    expect(cand.status).toBe("attended");
    const events = await db.select().from(schema.attendanceEvents).where(eq(schema.attendanceEvents.candidateId, c.id));
    expect(events).toHaveLength(1);
  });

  it("no-show job marks booked non-attendees of a past session, sparing attendees", async () => {
    // Past session created directly (createSession would use 'now'); insert raw.
    const [past] = await db
      .insert(schema.interviewSessions)
      .values({
        orgId,
        roleType: "trainer",
        marketId,
        scheduledAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        capacity: 12,
        meetingUrl: "http://x",
        hostUserId: hostId,
        meetingProvider: "mock",
      })
      .returning();

    const noShow = await makeCandidate("invited");
    const attended = await makeCandidate("invited");
    await db.insert(schema.sessionBookings).values([
      { sessionId: past.id, candidateId: noShow.id, status: "booked" },
      { sessionId: past.id, candidateId: attended.id, status: "booked" },
    ]);
    // Mark one as attended so the job must spare them.
    const [attBooking] = await db
      .select()
      .from(schema.sessionBookings)
      .where(and(eq(schema.sessionBookings.candidateId, attended.id), eq(schema.sessionBookings.status, "booked")));
    await tx(async (t, client) => {
      await t.insert(schema.attendanceEvents).values({ sessionBookingId: attBooking.id, candidateId: attended.id, joinMethod: "token_link" });
      // manually advance attended candidate so it's not 'invited'
      await client.query("SELECT set_config('app.allow_status_transition','on',true)");
      await client.query("UPDATE candidates SET status='attended' WHERE id=$1", [attended.id]);
    });

    const marked = await tx((t, client) => markNoShows(t, client));
    expect(marked).toBeGreaterThanOrEqual(1);

    const [ns] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, noShow.id));
    const [at] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, attended.id));
    expect(ns.status).toBe("no_show");
    expect(at.status).toBe("attended");
  });
});
