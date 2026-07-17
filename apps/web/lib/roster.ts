import { and, eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { attendanceEvents, candidates, interviewSessions, sessionBookings, webhookEvents } from "@usapt/db/schema";
import { transitionCandidate } from "@usapt/core";
import { sendQuizInvite } from "./evaluation";

type Tx = NodePgDatabase<typeof dbSchema>;

export interface RosterEntry {
  candidateId: string;
  bookingId: string;
  name: string;
  status: string;
  joined: boolean;
  joinMethod: string | null;
  joinedAt: Date | null;
}

export interface UnmatchedParticipant {
  id: string;
  displayName: string;
}

export interface RosterView {
  session: { id: string; roleType: string; scheduledAt: Date; capacity: number; meetingUrl: string; hostUserId: string };
  roster: RosterEntry[];
  unmatched: UnmatchedParticipant[];
  presentCount: number;
}

export async function getRosterView(tx: Tx, sessionId: string): Promise<RosterView | null> {
  const [session] = await tx.select().from(interviewSessions).where(eq(interviewSessions.id, sessionId));
  if (!session) return null;

  const bookings = await tx
    .select({
      bookingId: sessionBookings.id,
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      status: candidates.status,
    })
    .from(sessionBookings)
    .innerJoin(candidates, eq(candidates.id, sessionBookings.candidateId))
    .where(and(eq(sessionBookings.sessionId, sessionId), eq(sessionBookings.status, "booked")));

  const roster: RosterEntry[] = [];
  let presentCount = 0;
  for (const b of bookings) {
    const [att] = await tx.select().from(attendanceEvents).where(eq(attendanceEvents.sessionBookingId, b.bookingId));
    const joined = Boolean(att);
    if (joined) presentCount++;
    roster.push({
      candidateId: b.candidateId,
      bookingId: b.bookingId,
      name: `${b.firstName} ${b.lastName}`,
      status: b.status,
      joined,
      joinMethod: att?.joinMethod ?? null,
      joinedAt: att?.joinedAt ?? null,
    });
  }

  // Simulated direct-joins (scenario 2): meeting-provider participant events we
  // couldn't auto-match to a token, awaiting host confirmation.
  const unmatchedRows = await tx
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, "meeting_sim"), eq(webhookEvents.status, "unmatched")));
  const unmatched: UnmatchedParticipant[] = unmatchedRows
    .filter((r) => (r.payload as { sessionId?: string })?.sessionId === sessionId)
    .map((r) => ({ id: r.id, displayName: (r.payload as { displayName?: string })?.displayName ?? "Unknown" }));

  return {
    session: {
      id: session.id,
      roleType: session.roleType,
      scheduledAt: session.scheduledAt,
      capacity: session.capacity,
      meetingUrl: session.meetingUrl,
      hostUserId: session.hostUserId,
    },
    roster,
    unmatched,
    presentCount,
  };
}

/**
 * Host marks an expected-roster candidate present when no token event fired
 * (join_method = manual_confirm — the ONLY place name-matching survives, and
 * it's human-confirmed, never automatic, per FRD Section 7 scenario 2).
 * Idempotent via the attendance_events partial unique index.
 */
export async function confirmPresent(
  tx: Tx,
  client: PoolClient,
  bookingId: string,
  candidateId: string,
  hostUserId: string,
): Promise<void> {
  const inserted = await tx
    .insert(attendanceEvents)
    .values({ sessionBookingId: bookingId, candidateId, joinMethod: "manual_confirm", confirmedByUserId: hostUserId })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
    if (candidate?.status === "invited") {
      await transitionCandidate({ tx, client, candidateId, event: "session_joined", actorUserId: hostUserId });
      await sendQuizInvite(tx, candidate.orgId, candidateId);
    }
  }
}

/** Dev/demo: simulate a candidate joining the meeting directly (no token event) — creates an unmatched participant. */
export async function simulateDirectJoin(tx: Tx, orgId: string, sessionId: string, displayName: string): Promise<void> {
  await tx.insert(webhookEvents).values({
    orgId,
    provider: "meeting_sim",
    externalId: `sim-${sessionId}-${displayName}-${Date.now()}`,
    payload: { sessionId, displayName },
    status: "unmatched",
  });
}

/**
 * Host matches an unmatched participant to a booked candidate — one tap. Creates
 * a manual_confirm attendance for that candidate and marks the unmatched event
 * resolved.
 */
export async function confirmUnmatchedMatch(
  tx: Tx,
  client: PoolClient,
  unmatchedId: string,
  bookingId: string,
  candidateId: string,
  hostUserId: string,
): Promise<void> {
  await confirmPresent(tx, client, bookingId, candidateId, hostUserId);
  await tx.update(webhookEvents).set({ status: "matched", processedAt: new Date() }).where(eq(webhookEvents.id, unmatchedId));
}
