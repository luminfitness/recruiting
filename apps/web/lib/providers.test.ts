import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { encryptCredentials, decryptCredentials, getProvider, SendGridMessagingProvider, TwilioMessagingProvider, ZoomMeetingProvider, MockMessagingProvider } from "@usapt/core";
import { setIntegration } from "./integrations";
import { processZoomWebhook } from "./zoom-webhook";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

describe("credential encryption (pure)", () => {
  it("roundtrips and rejects tampering", () => {
    const enc = encryptCredentials({ apiKey: "secret-123" });
    expect(JSON.stringify(enc)).not.toContain("secret-123");
    expect(decryptCredentials(enc).apiKey).toBe("secret-123");
    const tampered = { ...enc, ciphertext: Buffer.from("garbage").toString("base64") };
    expect(() => decryptCredentials(tampered)).toThrow();
  });
});

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;
type Tx = NodePgDatabase<typeof schema>;

run("provider factory + zoom webhook", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";
  let hostId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Prov Org", slug: `prov-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db.insert(schema.brands).values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" }).returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "M", timezone: "UTC" }).returning();
    marketId = market.id;
    const [u] = await db.insert(schema.users).values({ orgId, name: "H", email: "h@b.test" }).returning();
    hostId = u.id;
    for (const category of ["messaging_email", "messaging_sms", "meeting"] as const) {
      await db.insert(schema.integrationConfigs).values({ orgId, category, providerKey: "mock" });
    }
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

  it("factory returns Mock by default and Real once configured with encrypted creds", async () => {
    const before = await tx((t) => getProvider(t, orgId, "messaging_email"));
    expect(before).toBeInstanceOf(MockMessagingProvider);

    await tx((t) => setIntegration(t, orgId, "messaging_email", "sendgrid", { apiKey: "SG.test" }));
    const after = await tx((t) => getProvider(t, orgId, "messaging_email"));
    expect(after).toBeInstanceOf(SendGridMessagingProvider);

    await tx((t) => setIntegration(t, orgId, "messaging_sms", "twilio", { accountSid: "AC1", authToken: "tok", fromNumber: "+1555" }));
    expect(await tx((t) => getProvider(t, orgId, "messaging_sms"))).toBeInstanceOf(TwilioMessagingProvider);

    await tx((t) => setIntegration(t, orgId, "meeting", "zoom", { accountId: "a", clientId: "c", clientSecret: "s" }));
    expect(await tx((t) => getProvider(t, orgId, "meeting"))).toBeInstanceOf(ZoomMeetingProvider);
  });

  it("stores credentials encrypted (never plaintext)", async () => {
    await tx((t) => setIntegration(t, orgId, "messaging_email", "sendgrid", { apiKey: "SG.super-secret" }));
    const [cfg] = await db.select().from(schema.integrationConfigs).where(eq(schema.integrationConfigs.orgId, orgId));
    // whichever row, ensure no plaintext secret anywhere in the configs
    const all = await db.select().from(schema.integrationConfigs).where(eq(schema.integrationConfigs.orgId, orgId));
    expect(JSON.stringify(all)).not.toContain("super-secret");
    expect(cfg).toBeTruthy();
  });

  it("zoom webhook auto-confirms a unique roster match as webhook_confirm", async () => {
    const [session] = await db.insert(schema.interviewSessions).values({ orgId, roleType: "trainer", marketId, scheduledAt: new Date(), capacity: 12, meetingUrl: "http://x", hostUserId: hostId, meetingProvider: "zoom", externalMeetingId: "zoom-abc-123" }).returning();
    const [cand] = await db.insert(schema.candidates).values({ orgId, brandId, marketId, firstName: "Alex", lastName: "Rivera", email: `alex-${randomBytes(4).toString("hex")}@b.test`, roleType: "trainer", source: "indeed", token: randomBytes(24).toString("base64url"), status: "invited" }).returning();
    const [booking] = await db.insert(schema.sessionBookings).values({ sessionId: session.id, candidateId: cand.id, status: "booked" }).returning();

    const payload = { event: "meeting.participant_joined", payload: { object: { id: "zoom-abc-123", participant: { user_name: "Alex Rivera", join_time: new Date().toISOString() } } } };
    const res = await tx((t, client) => processZoomWebhook(t, client, payload));
    expect(res.matched).toBe(1);

    const [att] = await db.select().from(schema.attendanceEvents).where(eq(schema.attendanceEvents.sessionBookingId, booking.id));
    expect(att.joinMethod).toBe("webhook_confirm");
    const [after] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, cand.id));
    expect(after.status).toBe("attended");
  });

  it("zoom webhook leaves an unknown participant for host confirmation", async () => {
    const [session] = await db.insert(schema.interviewSessions).values({ orgId, roleType: "trainer", marketId, scheduledAt: new Date(), capacity: 12, meetingUrl: "http://x", hostUserId: hostId, meetingProvider: "zoom", externalMeetingId: "zoom-xyz-999" }).returning();
    const payload = { event: "meeting.participant_joined", payload: { object: { id: "zoom-xyz-999", participant: { user_name: "Nobody OnRoster", join_time: new Date().toISOString() } } } };
    const res = await tx((t, client) => processZoomWebhook(t, client, payload));
    expect(res.unmatched).toBe(1);
    const unmatched = await db.select().from(schema.webhookEvents).where(eq(schema.webhookEvents.orgId, orgId));
    expect(unmatched.some((w) => (w.payload as { sessionId?: string }).sessionId === session.id)).toBe(true);
  });
});
