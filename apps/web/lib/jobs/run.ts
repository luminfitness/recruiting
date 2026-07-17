import { withServiceTransaction } from "@usapt/db";
import { markNoShows } from "./no-show";

export interface CronTickResult {
  ran: boolean;
  noShowsMarked?: number;
}

/**
 * The cron tick entrypoint, invoked every ~5 min by the external scheduler
 * (GitHub Actions workflow POSTing to /api/cron/tick with the bearer secret).
 * Runs all time-based jobs across every org under the BYPASSRLS service role.
 * A transaction-scoped advisory lock (pg_try_advisory_xact_lock) prevents two
 * overlapping ticks from double-processing; if the lock isn't acquired we skip
 * this tick entirely (the next one will pick up the work).
 *
 * As later phases land, their jobs are added here: reminder sends (Phase 7),
 * offer-MIA aging (Phase 5), referral aging (Phase 5), backup-pool expiry.
 */
const TICK_LOCK_KEY = 4820571; // arbitrary constant identifying the cron-tick lock

export async function runCronTick(): Promise<CronTickResult> {
  return withServiceTransaction(async (tx, client) => {
    const { rows } = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS locked", [TICK_LOCK_KEY]);
    if (!rows[0]?.locked) {
      return { ran: false };
    }

    const noShowsMarked = await markNoShows(tx, client);
    return { ran: true, noShowsMarked };
  });
}
