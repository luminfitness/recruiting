import { and, eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { attendanceEvents, candidates, interviewSessions, sessionBookings, webhookEvents } from "@usapt/db/schema";
import { ZoomMeetingProvider, transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

export interface ZoomProcessResult {
  matched: number;
  unmatched: number;
}

/**
 * Processes a Zoom participant webhook (the FRD Section 7 scenario-2 UPGRADE).
 * A candidate who joined the Zoom directly (no token-link click) shows up here;
 * because Zoom's participant identity is more reliable than a host eyeballing a
 * name, we auto-confirm a UNIQUE name match on the meeting's roster as
 * join_method='webhook_confirm'. Anything ambiguous or unmatched still falls to
 * the host's unmatched-participant panel — automatic matching only when it's
 * unambiguous.
 */
export async function processZoomWebhook(tx: Tx, client: PoolClient, payload: unknown): Promise<ZoomProcessResult> {
  const zoom = new ZoomMeetingProvider("", "", ""); // parsing only; no API calls
  const events = await zoom.handleParticipantWebhook!(payload);
  const result: ZoomProcessResult = { matched: 0, unmatched: 0 };
  if (events.length === 0) return result;

  const externalMeetingId = (payload as { payload?: { object?: { id?: string | number } } })?.payload?.object?.id;
  if (externalMeetingId == null) return result;
  const [session] = await tx.select().from(interviewSessions).where(eq(interviewSessions.externalMeetingId, String(externalMeetingId)));
  if (!session) return result;

  const roster = await tx
    .select({ bookingId: sessionBookings.id, candidateId: candidates.id, firstName: candidates.firstName, lastName: candidates.lastName, status: candidates.status })
    .from(sessionBookings)
    .innerJoin(candidates, eq(candidates.id, sessionBookings.candidateId))
    .where(and(eq(sessionBookings.sessionId, session.id), eq(sessionBookings.status, "booked")));

  for (const ev of events) {
    const name = ev.externalParticipantLabel.trim().toLowerCase();
    const matches = roster.filter((r) => `${r.firstName} ${r.lastName}`.toLowerCase() === name);

    if (matches.length === 1) {
      const m = matches[0];
      const inserted = await tx
        .insert(attendanceEvents)
        .values({ sessionBookingId: m.bookingId, candidateId: m.candidateId, joinMethod: "webhook_confirm", joinedAt: ev.joinedAt })
        .onConflictDoNothing()
        .returning();
      if (inserted.length > 0 && m.status === "invited") {
        await transitionCandidate({ tx, client, candidateId: m.candidateId, event: "session_joined" });
      }
      result.matched++;
    } else {
      // Ambiguous or unknown — leave for the host's unmatched panel.
      await tx.insert(webhookEvents).values({
        orgId: session.orgId,
        provider: "meeting_sim",
        externalId: `zoom-${session.id}-${ev.externalParticipantLabel}-${ev.joinedAt.getTime()}`,
        payload: { sessionId: session.id, displayName: ev.externalParticipantLabel },
        status: "unmatched",
      });
      result.unmatched++;
    }
  }
  return result;
}
