import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool, type PoolClient } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { getPipeline, pipelineToCsv } from "./pipeline";
import { parseCsv, importCandidates } from "./import";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;
type Tx = NodePgDatabase<typeof schema>;

describe("CSV parser (pure)", () => {
  it("handles quoted fields with embedded commas and quotes", () => {
    const { headers, rows } = parseCsv('a,b,c\n1,"Dallas, TX","he said ""hi"""\n2,x,y');
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows[0]).toEqual(["1", "Dallas, TX", 'he said "hi"']);
    expect(rows).toHaveLength(2);
  });
});

describe("pipelineToCsv", () => {
  it("emits a header and never a felony column", () => {
    const csv = pipelineToCsv([
      { id: "x", name: "A B", email: "a.b@example.com", roleType: "trainer", source: "indeed", status: "graduated", brandName: "Br", marketName: "Mk", gradeText: "18/20", quizText: "80%", appliedAt: new Date("2025-01-01"), ageDays: 10 },
    ]);
    expect(csv.split("\n")[0]).toContain("Name");
    expect(csv.toLowerCase()).not.toContain("felony");
    expect(csv).toContain("graduated");
  });
});

run("pipeline + import", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  let orgId = "";
  let brandId = "";
  let marketId = "";

  beforeAll(async () => {
    const [org] = await db.insert(schema.organizations).values({ name: "Pipe Org", slug: `pipe-${Date.now()}` }).returning();
    orgId = org.id;
    const [brand] = await db.insert(schema.brands).values({ orgId, name: "Crunch Fitness", slug: "crunch", replyIdentityName: "B", replyIdentityEmail: "b@b.test" }).returning();
    brandId = brand.id;
    const [market] = await db.insert(schema.markets).values({ brandId, name: "Dallas, TX", timezone: "America/Chicago" }).returning();
    marketId = market.id;
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

  it("imports historical rows at their status with a synthesized timeline and dedups actives", async () => {
    const csv = `First,Last,Email,Role,Brand,Market,Source,Status,Applied
Terrell,Owens,t.owens.${randomBytes(3).toString("hex")}@x.com,Trainer,Crunch Fitness,"Dallas, TX",Indeed,graduated,2025-02-10
Bianca,Cole,b.cole.${randomBytes(3).toString("hex")}@x.com,Trainer,Crunch Fitness,"Dallas, TX",LinkedIn,in_class,2025-03-01`;
    const { headers, rows } = parseCsv(csv);
    const mapping = {
      firstName: headers.indexOf("First"),
      lastName: headers.indexOf("Last"),
      email: headers.indexOf("Email"),
      roleType: headers.indexOf("Role"),
      brand: headers.indexOf("Brand"),
      market: headers.indexOf("Market"),
      source: headers.indexOf("Source"),
      status: headers.indexOf("Status"),
      appliedAt: headers.indexOf("Applied"),
    };
    const result = await tx((t) => importCandidates(t, orgId, mapping, rows));
    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(0);

    const all = await db.select().from(schema.candidates).where(eq(schema.candidates.orgId, orgId));
    expect(all.map((c) => c.status).sort()).toEqual(["graduated", "in_class"]);
    // No invitations for historical rows.
    const msgs = await db.select().from(schema.messagesLog).where(eq(schema.messagesLog.orgId, orgId));
    expect(msgs).toHaveLength(0);
    // Synthesized history exists.
    const hist = await db.select().from(schema.candidateStatusHistory).where(eq(schema.candidateStatusHistory.candidateId, all[0].id));
    expect(hist.some((h) => h.event === "imported")).toBe(true);

    // Re-importing the same active candidates skips them as duplicates.
    const again = await tx((t) => importCandidates(t, orgId, mapping, rows));
    // 'graduated' is inactive (re-appliable) so it re-creates; 'in_class' is active so it's skipped.
    expect(again.skippedDuplicates).toBeGreaterThanOrEqual(1);
  });

  it("getPipeline filters by role", async () => {
    const rows = await tx((t) => getPipeline(t, { role: "trainer" }));
    expect(rows.every((r) => r.roleType === "trainer")).toBe(true);
  });

  it("getPipeline q searches name, full name and email, case-insensitively", async () => {
    const all = await tx((t) => getPipeline(t, {}));
    expect(all.length).toBeGreaterThan(0);
    const target = all[0];
    const [first, ...rest] = target.name.split(" ");

    // first name, lowercased — should still match
    const byFirst = await tx((t) => getPipeline(t, { q: first.toLowerCase() }));
    expect(byFirst.some((r) => r.id === target.id)).toBe(true);

    // full "first last" spans two columns — the concat branch covers it
    if (rest.length) {
      const byFull = await tx((t) => getPipeline(t, { q: target.name.toUpperCase() }));
      expect(byFull.some((r) => r.id === target.id)).toBe(true);
    }

    // email
    const byEmail = await tx((t) => getPipeline(t, { q: target.email }));
    expect(byEmail.some((r) => r.id === target.id)).toBe(true);

    // a string nobody matches
    const none = await tx((t) => getPipeline(t, { q: "zzz-no-such-candidate-zzz" }));
    expect(none).toHaveLength(0);
  });
});
