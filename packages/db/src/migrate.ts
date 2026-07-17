import "./load-env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  // DDL (CREATE TABLE/POLICY/TRIGGER, etc.) needs a role with rights across
  // the whole schema, not an RLS-scoped one — same reasoning as getServiceDb().
  const connectionString = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("SERVICE_DATABASE_URL (or DATABASE_URL) is not set — see .env.example");
  }
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
