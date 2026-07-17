import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { sendDueReminders } from "./jobs/reminders";
import { recordTmOutreach, listNoShowQueue } from "./tm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;
type Tx = NodePgDatabase<typeof schema>;

run("reminders & TM no-show recovery", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";
  let hostId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Rem Org", slug: `rem-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db.insert(schema.brands).values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" }).returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "M", timezone: "UTC" }).returning();
    marketId = market.id;
    const [u] = await db.insert(schema.users).values({ orgId, name: "TM", email: "tm@b.test" }).returning();
    hostId = u.id;
    await db.insert(schema.thresholdSettings).values({ orgId }); // defaults incl. reminder_offsets_hours [24,1]
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

  async function bookedInvited(hoursOut: number): Promise<string> {
    const [session] = await db.insert(schema.interviewSessions).values({ orgId, roleType: "manager", marketId, scheduledAt: new Date(Date.now() + hoursOut * 3600_000), capacity: 12, meetingUrl: "http://x", hostUserId: hostId, meetingProvider: "mock" }).returning();
    const [c] = await db.insert(schema.candidates).values({ orgId, brandId, marketId, firstName: "R", lastName: "T", email: `r-${randomBytes(5).toString("hex")}@b.test`, roleType: "manager", source: "indeed", token: randomBytes(24).toString("base64url"), status: "invited" }).returning();
    await db.insert(schema.sessionBookings).values({ sessionId: session.id, candidateId: c.id, status: "booked" });
    return c.id;
  }

  it("sends the 1h reminder for an imminent session and is idempotent", async () => {
    const id = await bookedInvited(0.5); // 30 min out → within 1h offset (and 24h)
    const sent1 = await tx((t, client) => sendDueReminders(t, client));
    expect(sent1).toBeGreaterThanOrEqual(1);
    const rows = await db.select().from(schema.interviewReminders).where(eq(schema.interviewReminders.candidateId, id));
    // Both 24h and 1h windows include a 30-min-out session.
    expect(rows.length).toBe(2);
    const sent2 = await tx((t, client) => sendDueReminders(t, client));
    void sent2;
    const rows2 = await db.select().from(schema.interviewReminders).where(eq(schema.interviewReminders.candidateId, id));
    expect(rows2.length).toBe(2); // no duplicates
  });

  it("does not remind for a session outside all offset windows", async () => {
    const id = await bookedInvited(72); // 3 days out → beyond 24h
    await tx((t, client) => sendDueReminders(t, client));
    const rows = await db.select().from(schema.interviewReminders).where(eq(schema.interviewReminders.candidateId, id));
    expect(rows.length).toBe(0);
  });

  it("TM 'rebooked' recovers a no_show to invited and appears/leaves the queue", async () => {
    const [c] = await db.insert(schema.candidates).values({ orgId, brandId, marketId, firstName: "N", lastName: "S", email: `ns-${randomBytes(5).toString("hex")}@b.test`, roleType: "manager", source: "indeed", token: randomBytes(24).toString("base64url"), status: "no_show" }).returning();
    const before = await tx((t) => listNoShowQueue(t));
    expect(before.some((x) => x.candidateId === c.id)).toBe(true);
    await tx((t, client) => recordTmOutreach(t, client, orgId, c.id, "rebooked", hostId));
    const [after] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, c.id));
    expect(after.status).toBe("invited");
    const queueAfter = await tx((t) => listNoShowQueue(t));
    expect(queueAfter.some((x) => x.candidateId === c.id)).toBe(false);
  });

  it("TM 'unresponsive' closes a no_show out to not_selected", async () => {
    const [c] = await db.insert(schema.candidates).values({ orgId, brandId, marketId, firstName: "U", lastName: "R", email: `ur-${randomBytes(5).toString("hex")}@b.test`, roleType: "manager", source: "indeed", token: randomBytes(24).toString("base64url"), status: "no_show" }).returning();
    await tx((t, client) => recordTmOutreach(t, client, orgId, c.id, "unresponsive", hostId));
    const [after] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, c.id));
    expect(after.status).toBe("not_selected");
    const outreach = await db.select().from(schema.tmOutreach).where(eq(schema.tmOutreach.candidateId, c.id));
    expect(outreach[0].outcome).toBe("unresponsive");
  });
});
