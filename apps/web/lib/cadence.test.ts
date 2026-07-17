import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { fireCadenceRules, rolePackage, seedDefaultCadence } from "./cadence";
import { parseIndeedEmail } from "./ingestion";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;
type Tx = NodePgDatabase<typeof schema>;

describe("email parser (pure)", () => {
  it("parses an Indeed-style body and strips trailing punctuation", () => {
    const p = parseIndeedEmail("You have a new application. Applicant: Jane Doe. Email: jane@x.com. Phone: 555-123-4567. Position: Personal Trainer — Crunch Fitness (Dallas, TX).");
    expect(p).toBeTruthy();
    expect(p!.email).toBe("jane@x.com");
    expect(p!.phone).toBe("555-123-4567");
    expect(p!.firstName).toBe("Jane");
    expect(p!.lastName).toBe("Doe");
    expect(p!.roleType).toBe("trainer");
    expect(p!.brandName).toBe("Crunch Fitness");
    expect(p!.marketName).toBe("Dallas, TX");
  });

  it("detects manager role and returns null when essentials are missing", () => {
    expect(parseIndeedEmail("Applicant: Sam Lee. Email: sam@x.com. Position: General Manager — USA PT (Denver, CO).")!.roleType).toBe("manager");
    expect(parseIndeedEmail("garbled, no fields here")).toBeNull();
  });
});

describe("rolePackage invariant", () => {
  it("always pairs a role with its own scheduling link + phone (never crosses)", () => {
    const mgr = rolePackage("http://x", "b", "manager");
    const trn = rolePackage("http://x", "b", "trainer");
    expect(mgr.schedulingLink).toContain("role=manager");
    expect(trn.schedulingLink).toContain("role=trainer");
    expect(mgr.contactNumber).not.toBe(trn.contactNumber);
  });
});

run("cadence firing", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Cad Org", slug: `cad-${Date.now()}`, defaultTimezone: "America/Chicago" }).returning();
    orgId = org.id;
    const [brand] = await db.insert(schema.brands).values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" }).returning();
    brandId = brand.id;
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

  it("seeds the default 4-rule ruleset", async () => {
    await tx((t) => seedDefaultCadence(t, orgId, brandId));
    const rules = await db.select().from(schema.cadenceRules).where(eq(schema.cadenceRules.orgId, orgId));
    expect(rules).toHaveLength(4);
    expect(rules.filter((r) => r.action === "switch_mode")).toHaveLength(1);
  });

  it("fires a due 'post' rule once and is idempotent for the same local date", async () => {
    // A post rule due 'now' in the org's timezone.
    const now = new Date();
    const wk = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(now);
    const dowChi = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wk]!;
    await db.insert(schema.cadenceRules).values({ orgId, brandId, dayOfWeek: dowChi, time: "00:01", action: "post", roleType: "manager", channel: "linkedin" });

    const fired1 = await tx((t, client) => fireCadenceRules(t, client, now));
    expect(fired1).toBeGreaterThanOrEqual(1);
    const postings1 = await db.select().from(schema.jobPostings).where(and(eq(schema.jobPostings.orgId, orgId), eq(schema.jobPostings.channel, "linkedin")));
    expect(postings1).toHaveLength(1);
    expect(postings1[0].status).toBe("pending_manual_action");
    expect(postings1[0].mode).toBe("semi_auto");

    const fired2 = await tx((t, client) => fireCadenceRules(t, client, now));
    void fired2;
    const postings2 = await db.select().from(schema.jobPostings).where(and(eq(schema.jobPostings.orgId, orgId), eq(schema.jobPostings.channel, "linkedin")));
    expect(postings2).toHaveLength(1); // not duplicated
  });

  it("switch_mode ends the other role's live postings (atomic mode swap)", async () => {
    // A live manager 'other' posting that a trainer switch_mode should end.
    await db.insert(schema.jobPostings).values({ orgId, brandId, roleType: "manager", channel: "indeed", status: "live", mode: "semi_auto", copySnapshot: "x", scheduledPostAt: new Date(Date.now() - 86400000) });
    const now = new Date();
    const wk = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(now);
    const dowChi = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wk]!;
    await db.insert(schema.cadenceRules).values({ orgId, brandId, dayOfWeek: dowChi, time: "00:01", action: "switch_mode", roleType: "trainer", channel: "indeed" });

    await tx((t, client) => fireCadenceRules(t, client, now));
    const liveManager = await db
      .select()
      .from(schema.jobPostings)
      .where(and(eq(schema.jobPostings.orgId, orgId), eq(schema.jobPostings.roleType, "manager"), eq(schema.jobPostings.channel, "indeed"), eq(schema.jobPostings.status, "live")));
    expect(liveManager).toHaveLength(0); // manager ad was ended by the switch
    const trainerPosting = await db
      .select()
      .from(schema.jobPostings)
      .where(and(eq(schema.jobPostings.orgId, orgId), eq(schema.jobPostings.roleType, "trainer"), eq(schema.jobPostings.channel, "indeed")));
    expect(trainerPosting.length).toBeGreaterThanOrEqual(1);
    // The new trainer posting carries the trainer link, never the manager one.
    expect(trainerPosting[0].schedulingLink).toContain("role=trainer");
  });
});
