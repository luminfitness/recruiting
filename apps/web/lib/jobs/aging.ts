import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

/**
 * Offer-sent-no-reply -> mia (FR-1.8). Uses each org's configured
 * offer_no_reply_days threshold. Only touches awaiting_reply candidates whose
 * offer has no response and isn't retracted, so it's idempotent.
 */
export async function markOfferMia(tx: Tx, client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ candidate_id: string }>(
    `SELECT c.id AS candidate_id
       FROM candidates c
       JOIN offers o ON o.candidate_id = c.id
       JOIN threshold_settings t ON t.org_id = c.org_id
      WHERE c.status = 'awaiting_reply'
        AND o.response IS NULL
        AND o.retracted_at IS NULL
        AND o.sent_at < now() - make_interval(days => t.offer_no_reply_days)`,
  );
  for (const row of rows) {
    await transitionCandidate({ tx, client, candidateId: row.candidate_id, event: "mia_threshold_reached" });
  }
  return rows.length;
}

/**
 * Local referral with no outcome past the aging threshold -> flag for the
 * trainer coordinator's attention (FR-1.9). This is an ALERT, not a status
 * change: it stamps aging_alerted_at (once) so the referral surfaces as stale
 * without altering the candidate's lifecycle status.
 */
export async function flagAgingReferrals(_tx: Tx, client: PoolClient): Promise<number> {
  const { rowCount } = await client.query(
    `UPDATE local_referrals lr
        SET aging_alerted_at = now()
       FROM candidates c, threshold_settings t
      WHERE lr.candidate_id = c.id
        AND t.org_id = c.org_id
        AND c.status = 'referred_local'
        AND lr.outcome IS NULL
        AND lr.aging_alerted_at IS NULL
        AND lr.referred_at < now() - make_interval(days => t.referral_aging_days)`,
  );
  return rowCount ?? 0;
}
