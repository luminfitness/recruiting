import type { PoolClient } from "pg";
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { brands, candidates, interviewReminders } from "@usapt/db/schema";
import { getProvider } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

/**
 * Pre-interview reminder sequence (FR-1.3). For each org's configured offsets
 * (default 24h + 1h before the session), sends a reminder to booked, still-
 * `invited` candidates whose session falls within that offset window and who
 * haven't already gotten that offset for that booking. The interview_reminders
 * unique index (booking, offset) makes it idempotent.
 *
 * Suppression when a TM is actively working the candidate: reminders only
 * target `invited` candidates with a future booking, so a `no_show` under TM
 * outreach is naturally excluded; additionally a candidate with an open
 * 'working' tm_outreach in the last 24h is skipped (belt-and-suspenders).
 */
export async function sendDueReminders(tx: Tx, client: PoolClient): Promise<number> {
  // Find due (booking, offset) pairs that haven't been sent, honoring each
  // org's reminder_offsets_hours and skipping candidates a TM is working.
  const { rows } = await client.query<{ booking_id: string; candidate_id: string; offset_hours: number }>(
    `WITH offsets AS (
       SELECT ts.org_id, (jsonb_array_elements_text(ts.reminder_offsets_hours))::int AS offset_hours
         FROM threshold_settings ts
     )
     SELECT sb.id AS booking_id, c.id AS candidate_id, o.offset_hours
       FROM session_bookings sb
       JOIN candidates c ON c.id = sb.candidate_id
       JOIN interview_sessions s ON s.id = sb.session_id
       JOIN offsets o ON o.org_id = c.org_id
      WHERE sb.status = 'booked'
        AND c.status = 'invited'
        AND s.scheduled_at > now()
        AND s.scheduled_at <= now() + make_interval(hours => o.offset_hours)
        AND NOT EXISTS (
          SELECT 1 FROM interview_reminders r
           WHERE r.session_booking_id = sb.id AND r.offset_hours = o.offset_hours
        )
        AND NOT EXISTS (
          SELECT 1 FROM tm_outreach t
           WHERE t.candidate_id = c.id AND t.outcome = 'working' AND t.created_at > now() - interval '24 hours'
        )`,
  );

  for (const row of rows) {
    const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, row.candidate_id));
    if (!candidate) continue;
    const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";

    const email = await getProvider(tx, candidate.orgId, "messaging_email");
    await email.sendEmail({
      to: candidate.email,
      fromName: brand?.replyIdentityName ?? "Recruiting",
      fromEmail: brand?.replyIdentityEmail ?? "recruiting@example.com",
      subject: `Reminder: your ${brand?.name ?? ""} interview is coming up`,
      body: `Hi ${candidate.firstName}, this is a reminder about your upcoming group interview. Your personal join link: ${baseUrl}/join/${candidate.token}`,
      templateKey: `reminder_${row.offset_hours}h`,
    });
    if (candidate.phone) {
      const sms = await getProvider(tx, candidate.orgId, "messaging_sms");
      await sms.sendSms({ to: candidate.phone, fromNumber: "+15557204180", body: `Reminder: your ${brand?.name ?? ""} interview is soon. Join: ${baseUrl}/join/${candidate.token}`, templateKey: `reminder_${row.offset_hours}h` });
    }

    await tx.insert(interviewReminders).values({ sessionBookingId: row.booking_id, candidateId: row.candidate_id, offsetHours: row.offset_hours });
  }
  return rows.length;
}
