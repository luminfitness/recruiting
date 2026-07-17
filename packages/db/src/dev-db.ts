/**
 * Local-dev Postgres via embedded-postgres — downloads a real Postgres binary
 * and runs it, so RLS/triggers/policies behave exactly as they will on Neon.
 * This is a DEV-ONLY convenience; production uses Neon (see .env.example).
 *
 * Two roles are provisioned to mirror the production security model exactly:
 *   - usapt_app     : NON-superuser, NO BYPASSRLS  -> DATABASE_URL
 *                     (RLS is actually enforced against it, which is the point)
 *   - postgres      : the embedded superuser (bypasses RLS) -> SERVICE_DATABASE_URL
 *                     used for migrations + cross-org cron/login lookups
 *
 * Subcommands:
 *   start  — initialise (first run) + start server + create db/roles/grants,
 *            then print the two connection strings
 *   stop   — stop the server (data is retained)
 *   reset  — stop + delete the data dir (next `start` is a clean slate)
 */
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { Client } from "pg";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../.pgdata");
const PORT = 5433;
const SUPERUSER = "postgres";
const SUPERPASS = "postgres";
const APP_ROLE = "usapt_app";
const APP_PASS = "usapt_app";
const DB_NAME = "usapt";

const SERVICE_URL = `postgres://${SUPERUSER}:${SUPERPASS}@localhost:${PORT}/${DB_NAME}`;
const APP_URL = `postgres://${APP_ROLE}:${APP_PASS}@localhost:${PORT}/${DB_NAME}`;

/**
 * pnpm blocks lifecycle scripts by default, so the platform package's
 * `postinstall` (which creates the versioned .dylib symlinks the postgres
 * binary needs, e.g. libzstd.1.dylib) doesn't run on install. Run it here,
 * idempotently, so `pnpm db:dev:start` just works after a fresh clone without
 * anyone needing to remember a manual step. No-op on platforms/installs where
 * the script or package isn't present.
 */
function ensurePlatformBinaryHydrated() {
  try {
    const require = createRequire(import.meta.url);
    // Resolve the platform package dir via the meta package's optional dep graph.
    const platformPkgJson = require.resolve(`@embedded-postgres/${process.platform}-${process.arch}/package.json`);
    const platformDir = dirname(platformPkgJson);
    const hydrateScript = resolve(platformDir, "scripts/hydrate-symlinks.js");
    if (existsSync(hydrateScript)) {
      execFileSync(process.execPath, [hydrateScript], { cwd: platformDir, stdio: "ignore" });
    }
  } catch {
    // If the platform package can't be resolved (unsupported platform), let
    // EmbeddedPostgres surface its own clearer error on start.
  }
}

function makeInstance() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: SUPERUSER,
    password: SUPERPASS,
    port: PORT,
    persistent: true,
  });
}

async function start() {
  ensurePlatformBinaryHydrated();
  const pg = makeInstance();
  const firstRun = !existsSync(DATA_DIR);
  if (firstRun) {
    console.log("Initialising a fresh Postgres data directory (downloads the binary on first run)…");
    await pg.initialise();
  }
  try {
    await pg.start();
  } catch (err) {
    // Already running is fine — we just proceed to ensure roles/db exist.
    console.log(`(server already running or start skipped: ${(err as Error).message})`);
  }

  // Ensure the app database exists (createDatabase throws if it already does).
  try {
    await pg.createDatabase(DB_NAME);
  } catch {
    /* already exists */
  }

  // Provision roles, grants, and default privileges on the app database.
  const admin = new Client({ connectionString: SERVICE_URL });
  await admin.connect();
  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
    if (rows.length === 0) {
      await admin.query(`CREATE ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${APP_PASS}' NOSUPERUSER NOBYPASSRLS`);
    } else {
      // Belt-and-suspenders: make sure the role never accidentally bypasses RLS.
      await admin.query(`ALTER ROLE ${APP_ROLE} WITH NOSUPERUSER NOBYPASSRLS`);
    }
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    // Existing objects (idempotent re-run after migrations):
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
    // Future objects (so tables created by later migrations are auto-granted):
    await admin.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${SUPERUSER} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}`,
    );
    await admin.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${SUPERUSER} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`,
    );
  } finally {
    await admin.end();
  }

  console.log("\nLocal Postgres is running. Add these to ~/Claude/USAPT/.env.local:\n");
  console.log(`DATABASE_URL=${APP_URL}`);
  console.log(`SERVICE_DATABASE_URL=${SERVICE_URL}\n`);
  console.log("Then: pnpm db:migrate && pnpm db:seed");
  // Do NOT call pg.stop() — pg_ctl daemonised the server; it stays up for `next dev`.
}

async function stop() {
  const pg = makeInstance();
  try {
    await pg.stop();
    console.log("Stopped.");
  } catch (err) {
    console.log(`Nothing to stop (${(err as Error).message}).`);
  }
}

async function reset() {
  await stop();
  if (existsSync(DATA_DIR)) {
    rmSync(DATA_DIR, { recursive: true, force: true });
    console.log("Deleted the data directory. Run `pnpm db:dev:start` for a clean slate.");
  }
}

const cmd = process.argv[2];
const run = cmd === "stop" ? stop : cmd === "reset" ? reset : start;
run().catch((err) => {
  console.error(err);
  process.exit(1);
});
