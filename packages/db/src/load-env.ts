import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * CLI scripts (migrate/seed) run via tsx, which does NOT auto-load .env.local
 * the way Next.js does for the web app. Import this first to load the repo-root
 * .env.local into process.env for those scripts. No-op if the file is absent
 * (e.g. on Vercel, where env vars come from the platform).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../../.env.local");
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
