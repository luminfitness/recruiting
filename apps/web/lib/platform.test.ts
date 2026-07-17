import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@usapt/db/schema";
import { createOrganization, listOrgHealth } from "./platform";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const SERVICE_URL = process.env.SERVICE_DATABASE_URL;
const run = SERVICE_URL ? describe : describe.skip;

run("platform admin + deactivation", () => {
  const pool = new Pool({ connectionString: SERVICE_URL });
  const db = drizzle(pool, { schema });
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const id of createdOrgIds) {
      await db.delete(schema.candidates).where(eq(schema.candidates.orgId, id)).catch(() => {});
      await db.delete(schema.organizations).where(eq(schema.organizations.id, id)).catch(() => {});
    }
    await pool.end();
  });

  it("provisions an org with an admin, thresholds, integrations, and admin role", async () => {
    const slug = `plat-${randomBytes(4).toString("hex")}`;
    const orgId = await createOrganization({ name: "Plat Co", slug, adminName: "Ada Admin", adminEmail: `ada.${slug}@x.com` });
    createdOrgIds.push(orgId);

    const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
    expect(org.slug).toBe(slug);
    const users = await db.select().from(schema.users).where(eq(schema.users.orgId, orgId));
    expect(users).toHaveLength(1);
    const roles = await db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, users[0].id));
    expect(roles.map((r) => r.role)).toContain("admin");
    const integrations = await db.select().from(schema.integrationConfigs).where(eq(schema.integrationConfigs.orgId, orgId));
    expect(integrations).toHaveLength(5);
    expect(integrations.every((i) => i.providerKey === "mock")).toBe(true);
    const [thresholds] = await db.select().from(schema.thresholdSettings).where(eq(schema.thresholdSettings.orgId, orgId));
    expect(thresholds).toBeTruthy();
  });

  it("appears in cross-org health with counts", async () => {
    const health = await listOrgHealth();
    const mine = health.find((h) => createdOrgIds.includes(h.id));
    expect(mine).toBeTruthy();
    expect(mine!.userCount).toBe(1);
  });

  it("deactivating a user preserves their decision attribution (restrict FK)", async () => {
    const slug = `plat-${randomBytes(4).toString("hex")}`;
    const orgId = await createOrganization({ name: "Attr Co", slug, adminName: "Dee Decider", adminEmail: `dee.${slug}@x.com` });
    createdOrgIds.push(orgId);
    const [decider] = await db.select().from(schema.users).where(eq(schema.users.orgId, orgId));
    const [brand] = await db.insert(schema.brands).values({ orgId, name: "B", slug: "b", replyIdentityName: "B", replyIdentityEmail: "b@b.test" }).returning();
    const [market] = await db.insert(schema.markets).values({ brandId: brand.id, name: "M", timezone: "UTC" }).returning();
    const [cand] = await db.insert(schema.candidates).values({ orgId, brandId: brand.id, marketId: market.id, firstName: "C", lastName: "C", email: `c-${randomBytes(4).toString("hex")}@x.com`, roleType: "trainer", source: "indeed", token: randomBytes(24).toString("base64url"), status: "evaluated" }).returning();
    await db.insert(schema.decisions).values({ candidateId: cand.id, outcome: "offer", decidedBy: decider.id });

    // Deactivate (not delete) — attribution must survive.
    await db.update(schema.users).set({ deactivatedAt: new Date() }).where(eq(schema.users.id, decider.id));

    const [d] = await db.select().from(schema.decisions).where(eq(schema.decisions.candidateId, cand.id));
    expect(d.decidedBy).toBe(decider.id);
    const [stillThere] = await db.select().from(schema.users).where(eq(schema.users.id, decider.id));
    expect(stillThere.deactivatedAt).not.toBeNull();
  });
});
