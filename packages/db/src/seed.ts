import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { SCORECARD_V1, QUIZ_V1 } from "./eval-config";

/**
 * Local-dev / demo seed: one organization (USA Personal Training) with two
 * brands (USAPT corporate + the Crunch Fitness theming example from the
 * mockup), a market each, and an admin user. Run with `pnpm db:seed`.
 */
async function main() {
  // Seeding creates the very first org/users, so it must run outside any
  // per-org RLS scope — same reasoning as getServiceDb().
  const connectionString = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("SERVICE_DATABASE_URL (or DATABASE_URL) is not set — see .env.example");
  }
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "USA Personal Training", slug: "usapt", defaultTimezone: "America/Chicago" })
    .returning();

  const [usaptBrand] = await db
    .insert(schema.brands)
    .values({
      orgId: org.id,
      name: "USA Personal Training",
      slug: "usapt",
      themeConfig: { primary: "#0e4091", ink: "#201e1d", tint: "#e7edf6" },
      replyIdentityName: "USA PT Recruiting",
      replyIdentityEmail: "recruiting@usapt.example",
    })
    .returning();

  const [crunchBrand] = await db
    .insert(schema.brands)
    .values({
      orgId: org.id,
      name: "Crunch Fitness",
      slug: "crunch",
      themeConfig: { primary: "#e8352e", ink: "#1a1a1a", tint: "#fde3d0" },
      replyIdentityName: "Crunch Fitness Careers",
      replyIdentityEmail: "careers@crunch.example",
    })
    .returning();

  await db.insert(schema.markets).values([
    { brandId: usaptBrand.id, name: "Denver, CO", timezone: "America/Denver" },
    { brandId: crunchBrand.id, name: "Dallas, TX", timezone: "America/Chicago" },
  ]);

  const [admin] = await db
    .insert(schema.users)
    .values({ orgId: org.id, name: "Marc Calderon", email: "marc@usapt.example" })
    .returning();

  await db.insert(schema.userRoles).values([
    { userId: admin.id, orgId: org.id, role: "admin" },
    { userId: admin.id, orgId: org.id, role: "recruiting_lead" },
  ]);

  for (const category of ["job_board_indeed", "job_board_linkedin", "messaging_email", "messaging_sms", "meeting"] as const) {
    await db.insert(schema.integrationConfigs).values({ orgId: org.id, category, providerKey: "mock" });
  }

  await db.insert(schema.thresholdSettings).values({ orgId: org.id });

  for (const roleType of ["trainer", "manager"] as const) {
    await db.insert(schema.scorecardCriteriaVersions).values({ orgId: org.id, roleType, version: 1, schema: SCORECARD_V1[roleType], active: true });
    await db.insert(schema.quizDefinitions).values({ orgId: org.id, roleType, version: 1, schema: QUIZ_V1[roleType], active: true });
  }

  console.log(`Seeded org ${org.slug} (${org.id}) with admin ${admin.email} + v1 criteria/quiz`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
