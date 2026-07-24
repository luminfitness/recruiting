import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { renderPostingCopy, defaultPostingCopy } from "@usapt/db";
import { isPlausibleEmail, normalizeRole, normalizeSource, rateLimitOk, submitApplication } from "./public-apply";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;

describe("posting copy (pure)", () => {
  it("substitutes every placeholder", () => {
    const out = renderPostingCopy("{{brand}} in {{market}} — {{scheduling_link}} · {{contact_number}}", {
      brand: "USA PT",
      market: "Alpharetta, GA",
      schedulingLink: "https://x/apply",
      contactNumber: "(470) 555-0100",
    });
    expect(out).toBe("USA PT in Alpharetta, GA — https://x/apply · (470) 555-0100");
  });

  it("leaves an unknown or unfilled placeholder visible rather than blanking the line", () => {
    // Silently deleting text would ship a broken ad without anyone noticing.
    expect(renderPostingCopy("a {{nonsense}} b", {})).toBe("a {{nonsense}} b");
    expect(renderPostingCopy("call {{contact_number}}", { brand: "X" })).toBe("call {{contact_number}}");
  });

  it("ships a real ad for both roles, each carrying the role-correct placeholders", () => {
    for (const role of ["manager", "trainer"] as const) {
      const body = defaultPostingCopy(role);
      expect(body.length).toBeGreaterThan(500);
      expect(body).toContain("{{scheduling_link}}");
      expect(body).toContain("{{contact_number}}");
      expect(body).toContain("{{market}}");
    }
    expect(defaultPostingCopy("manager")).toContain("Assistant Fitness Manager");
    expect(defaultPostingCopy("trainer")).toContain("Certified Personal Trainer");
  });
});

describe("public apply validation (pure)", () => {
  it("accepts ordinary addresses and rejects obvious non-addresses", () => {
    expect(isPlausibleEmail("a.b+tag@example.co.uk")).toBe(true);
    expect(isPlausibleEmail("nope")).toBe(false);
    expect(isPlausibleEmail("no@domain")).toBe(false);
    expect(isPlausibleEmail("a b@x.com")).toBe(false);
    expect(isPlausibleEmail("x".repeat(250) + "@x.com")).toBe(false);
  });

  it("defaults unknown role/source rather than trusting the query string", () => {
    expect(normalizeRole("manager")).toBe("manager");
    expect(normalizeRole("admin")).toBe("trainer");
    expect(normalizeRole(undefined)).toBe("trainer");
    expect(normalizeSource("indeed")).toBe("indeed");
    expect(normalizeSource("'; drop table--")).toBe("other");
  });

  it("rate limits per IP after a burst", () => {
    const ip = `test-${randomBytes(4).toString("hex")}`;
    for (let i = 0; i < 5; i++) expect(rateLimitOk(ip)).toBe(true);
    expect(rateLimitOk(ip)).toBe(false);
    // a different caller is unaffected
    expect(rateLimitOk(`${ip}-other`)).toBe(true);
  });
});

run("public apply — the unauthenticated write path", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let otherOrgId = "";
  let brandId = "";
  let brandSlug = "";
  let marketId = "";
  let foreignMarketId = "";

  beforeAll(async () => {
    const stamp = randomBytes(4).toString("hex");
    const [org] = await db.insert(schema.organizations).values({ name: "Apply Org", slug: `apply-${stamp}` }).returning();
    orgId = org.id;
    brandSlug = `applybrand-${stamp}`;
    const [brand] = await db
      .insert(schema.brands)
      .values({ orgId, name: "Apply Brand", slug: brandSlug, replyIdentityName: "A", replyIdentityEmail: "a@b.test" })
      .returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "Atlanta, GA", timezone: "America/New_York" }).returning();
    marketId = market.id;

    // A second tenant, to prove one can't be written into via the public form.
    const [other] = await db.insert(schema.organizations).values({ name: "Other Org", slug: `other-${stamp}` }).returning();
    otherOrgId = other.id;
    const [otherBrand] = await db
      .insert(schema.brands)
      .values({ orgId: otherOrgId, name: "Other Brand", slug: `otherbrand-${stamp}`, replyIdentityName: "O", replyIdentityEmail: "o@b.test" })
      .returning();
    const [otherMarket] = await db.insert(schema.markets).values({ brandId: otherBrand.id, name: "Denver, CO", timezone: "America/Denver" }).returning();
    foreignMarketId = otherMarket.id;

    for (const category of ["messaging_email", "meeting"] as const) {
      await db.insert(schema.integrationConfigs).values({ orgId, category, providerKey: "mock" });
    }
  });

  afterAll(async () => {
    for (const id of [orgId, otherOrgId]) {
      if (!id) continue;
      await db.delete(schema.candidates).where(eq(schema.candidates.orgId, id));
      await db.delete(schema.organizations).where(eq(schema.organizations.id, id));
    }
    await pool.end();
  });

  const base = (over: Partial<Parameters<typeof submitApplication>[0]> = {}) => ({
    brandSlug,
    roleType: "trainer",
    marketId,
    firstName: "Pat",
    lastName: "Rivera",
    email: `pat-${randomBytes(5).toString("hex")}@example.com`,
    ...over,
  });

  it("creates a candidate scoped to the brand's org, at applied", async () => {
    const email = `new-${randomBytes(5).toString("hex")}@example.com`;
    const res = await submitApplication(base({ email }), `ip-${randomBytes(4).toString("hex")}`);
    expect(res.ok).toBe(true);

    const [c] = await db.select().from(schema.candidates).where(eq(schema.candidates.email, email));
    expect(c).toBeTruthy();
    expect(c.orgId).toBe(orgId);
    expect(c.brandId).toBe(brandId);
    expect(c.roleType).toBe("trainer");
    // createCandidate auto-sends the invite, so they land past `applied`.
    expect(["applied", "invited"]).toContain(c.status);
  });

  it("REFUSES a market belonging to another tenant", async () => {
    const email = `cross-${randomBytes(5).toString("hex")}@example.com`;
    const res = await submitApplication(base({ email, marketId: foreignMarketId }), `ip-${randomBytes(4).toString("hex")}`);
    expect(res.ok).toBe(false);

    const rows = await db.select().from(schema.candidates).where(eq(schema.candidates.email, email));
    expect(rows).toHaveLength(0);
  });

  it("silently accepts a honeypot submission without writing anything", async () => {
    const email = `bot-${randomBytes(5).toString("hex")}@example.com`;
    const res = await submitApplication(base({ email, honeypot: "Acme Corp" }), `ip-${randomBytes(4).toString("hex")}`);
    expect(res.ok).toBe(true); // the bot is told nothing useful
    const rows = await db.select().from(schema.candidates).where(eq(schema.candidates.email, email));
    expect(rows).toHaveLength(0);
  });

  it("rejects an unknown brand slug without leaking whether it exists", async () => {
    const res = await submitApplication(base({ brandSlug: "no-such-brand-anywhere" }), `ip-${randomBytes(4).toString("hex")}`);
    expect(res.ok).toBe(false);
  });

  it("gives the same answer for a repeat application as a new one (no existence oracle)", async () => {
    const email = `dupe-${randomBytes(5).toString("hex")}@example.com`;
    const first = await submitApplication(base({ email }), `ip-${randomBytes(4).toString("hex")}`);
    const second = await submitApplication(base({ email }), `ip-${randomBytes(4).toString("hex")}`);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);

    // and it did not create a second active record for the same person
    const rows = await db
      .select()
      .from(schema.candidates)
      .where(and(eq(schema.candidates.orgId, orgId), eq(schema.candidates.email, email)));
    expect(rows).toHaveLength(1);
  });

  it("rejects a malformed email before touching the database", async () => {
    const res = await submitApplication(base({ email: "not-an-email" }), `ip-${randomBytes(4).toString("hex")}`);
    expect(res.ok).toBe(false);
  });
});
