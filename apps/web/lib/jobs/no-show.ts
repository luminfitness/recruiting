import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

/**
 * Auto-marks no-shows (FR-1.3): any candidate still `invited` whose booked
 * session's start time has passed with no attendance event. Runs across all
 * orgs from the cron tick (service role). Idempotent — only candidates in
 * `invited` are affected, so a candidate already marked no_show (or who later
 * rebooked back to invited for a *future* session) isn't wrongly re-marked,
 * because the join is against a session whose scheduled_at is in the past.
 *
 * Returns the number of candidates transitioned.
 */
export async function markNoShows(tx: Tx, client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ candidate_id: string }>(
    `SELECT sb.candidate_id
       FROM session_bookings sb
       JOIN interview_sessions s ON s.id = sb.session_id
       JOIN candidates c ON c.id = sb.candidate_id
       LEFT JOIN attendance_events a ON a.session_booking_id = sb.id
      WHERE sb.status = 'booked'
        AND s.scheduled_at < now()
        AND a.id IS NULL
        AND c.status = 'invited'`,
  );

  for (const row of rows) {
    await transitionCandidate({ tx, client, candidateId: row.candidate_id, event: "session_passed_without_attendance" });
  }
  return rows.length;
}
