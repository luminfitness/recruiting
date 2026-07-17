import { and, asc, eq, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { attendanceEvents, brands, candidates, interviewSessions, sessionBookings } from "@usapt/db/schema";
import { getProvider, transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

/** Default window before a session's start during which new bookings/rebookings are blocked (FR-1.13). */
export const DEFAULT_BOOKING_LOCKOUT_MINUTES = 60;

export interface NewSessionInput {
  roleType: "manager" | "trainer";
  marketId?: string;
  scheduledAt: Date;
  capacity: number;
  hostUserId: string;
}

/**
 * Creates an interview session. The meeting URL comes from the org's configured
 * MeetingProvider (Mock by default — it points at a placeholder waiting room,
 * which is fine because the token-redirect page, not the meeting platform, is
 * the attendance source of truth per FRD Section 7).
 */
export async function createSession(tx: Tx, orgId: string, input: NewSessionInput): Promise<string> {
  const meeting = await getProvider(tx, orgId, "meeting");
  const created = await meeting.createMeeting({
    roleType: input.roleType,
    scheduledAt: input.scheduledAt,
    hostUserId: input.hostUserId,
  });

  const [session] = await tx
    .insert(interviewSessions)
    .values({
      orgId,
      roleType: input.roleType,
      marketId: input.marketId ?? null,
      scheduledAt: input.scheduledAt,
      capacity: input.capacity,
      meetingUrl: created.meetingUrl,
      hostUserId: input.hostUserId,
      meetingProvider: "mock",
      externalMeetingId: created.externalMeetingId ?? null,
    })
    .returning();

  return session.id;
}

export class SessionFullError extends Error {
  constructor() {
    super("Session is at capacity");
    this.name = "SessionFullError";
  }
}

export class BookingLockedError extends Error {
  constructor() {
    super("Bookings are locked this close to the session start");
    this.name = "BookingLockedError";
  }
}

export interface BookableSession {
  id: string;
  scheduledAt: Date;
  capacity: number;
  booked: number;
  isCurrentBooking: boolean;
}

/**
 * Sessions a candidate can book: same role_type, in the future beyond the
 * lockout window, and (respecting the candidate's market for market-scoped
 * sessions — sessions with a null market_id are open to any market). Includes
 * a `booked` count so the UI can show remaining capacity, and flags the
 * candidate's current booking.
 */
export async function listBookableSessions(
  tx: Tx,
  candidate: { id: string; orgId: string; roleType: "manager" | "trainer"; marketId: string },
  lockoutMinutes = DEFAULT_BOOKING_LOCKOUT_MINUTES,
): Promise<BookableSession[]> {
  const lockoutCutoff = new Date(Date.now() + lockoutMinutes * 60 * 1000);

  const sessions = await tx
    .select({
      id: interviewSessions.id,
      scheduledAt: interviewSessions.scheduledAt,
      capacity: interviewSessions.capacity,
      marketId: interviewSessions.marketId,
    })
    .from(interviewSessions)
    .where(and(eq(interviewSessions.orgId, candidate.orgId), eq(interviewSessions.roleType, candidate.roleType)))
    .orderBy(asc(interviewSessions.scheduledAt));

  const [currentBooking] = await tx
    .select({ sessionId: sessionBookings.sessionId })
    .from(sessionBookings)
    .where(and(eq(sessionBookings.candidateId, candidate.id), eq(sessionBookings.status, "booked")));

  const result: BookableSession[] = [];
  for (const s of sessions) {
    // Market-scoped sessions only show to candidates in that market; null = open to all markets.
    if (s.marketId && s.marketId !== candidate.marketId) continue;
    const isCurrent = currentBooking?.sessionId === s.id;
    // Hide sessions inside the lockout window UNLESS it's the candidate's current booking.
    if (s.scheduledAt < lockoutCutoff && !isCurrent) continue;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(sessionBookings)
      .where(and(eq(sessionBookings.sessionId, s.id), eq(sessionBookings.status, "booked")));

    result.push({ id: s.id, scheduledAt: s.scheduledAt, capacity: s.capacity, booked: count, isCurrentBooking: isCurrent });
  }
  return result;
}

/**
 * Books (or rebooks) a candidate into a session. "Later booking replaces
 * earlier": any existing active booking is cancelled in the same transaction
 * before the new one is inserted, so the partial unique index never rejects.
 * Enforces capacity and the lockout window. Safe to call after a no-show
 * (self-rebooking): if the candidate is in no_show, this also transitions them
 * back to invited via the rebooked event.
 */
export async function bookSession(
  tx: Tx,
  client: PoolClient,
  candidate: { id: string; orgId: string; status: string },
  sessionId: string,
  lockoutMinutes = DEFAULT_BOOKING_LOCKOUT_MINUTES,
): Promise<void> {
  const [session] = await tx
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.orgId, candidate.orgId)));
  if (!session) throw new Error("Session not found");

  if (session.scheduledAt.getTime() < Date.now() + lockoutMinutes * 60 * 1000) {
    throw new BookingLockedError();
  }

  // Cancel any existing active booking first (idempotent rebooking).
  await tx
    .update(sessionBookings)
    .set({ status: "cancelled" })
    .where(and(eq(sessionBookings.candidateId, candidate.id), eq(sessionBookings.status, "booked")));

  // Capacity check against currently-booked count (after cancelling our own prior one).
  const [{ count }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(sessionBookings)
    .where(and(eq(sessionBookings.sessionId, sessionId), eq(sessionBookings.status, "booked")));
  if (count >= session.capacity) {
    throw new SessionFullError();
  }

  await tx.insert(sessionBookings).values({ sessionId, candidateId: candidate.id, status: "booked" });

  // Self-rebooking after a no-show returns the candidate to invited (FR-1.3 recovery path).
  if (candidate.status === "no_show") {
    await transitionCandidate({ tx, client, candidateId: candidate.id, event: "rebooked" });
  }

  // Send a booking confirmation (email + optional SMS) via the org's provider.
  await sendBookingConfirmation(tx, candidate.orgId, candidate.id, sessionId);
}

async function sendBookingConfirmation(tx: Tx, orgId: string, candidateId: string, sessionId: string): Promise<void> {
  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) return;
  const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));
  const [session] = await tx.select().from(interviewSessions).where(eq(interviewSessions.id, sessionId));

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const joinUrl = `${baseUrl}/join/${candidate.token}`;
  const when = session.scheduledAt.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });

  const email = await getProvider(tx, orgId, "messaging_email");
  await email.sendEmail({
    to: candidate.email,
    fromName: brand?.replyIdentityName ?? "Recruiting",
    fromEmail: brand?.replyIdentityEmail ?? "recruiting@example.com",
    subject: `You're booked — ${brand?.name ?? ""} group interview`,
    body: `Hi ${candidate.firstName},\n\nYou're confirmed for your virtual group interview:\n\n${when}\n\nJoin with your personal link (it's unique to you — don't forward it):\n${joinUrl}\n\nThe link goes live shortly before the session.`,
    templateKey: "booking_confirmation",
  });

  if (candidate.phone) {
    const sms = await getProvider(tx, orgId, "messaging_sms");
    await sms.sendSms({
      to: candidate.phone,
      fromNumber: "+15557204180",
      body: `${brand?.name ?? "Recruiting"}: you're booked for ${when}. Join: ${joinUrl}`,
      templateKey: "booking_confirmation",
    });
  }
}

export interface AttendanceResult {
  meetingUrl: string;
  alreadyAttended: boolean;
}

/**
 * The token-redirect attendance pipeline (FRD Section 7, scenario 1) — the
 * architectural centerpiece. Logs joined_at + candidate_id against the active
 * booking, auto-advances invited -> attended, and returns the meeting URL to
 * forward to. Idempotent: the partial unique index on attendance_events makes
 * "first joined_at stands" race-safe, so a second click (or drop/rejoin) is a
 * no-op that still returns the meeting URL. Kept deliberately lean (no
 * synchronous notification sends) to meet the <1s latency NFR.
 *
 * Scenario 5 (candidate attends a different session than booked) still matches
 * by token — attendance attaches to whatever their active booking is.
 */
export async function recordTokenAttendance(
  tx: Tx,
  client: PoolClient,
  token: string,
): Promise<AttendanceResult | null> {
  const [candidate] = await tx.select().from(candidates).where(eq(candidates.token, token));
  if (!candidate) return null;

  const [booking] = await tx
    .select()
    .from(sessionBookings)
    .where(and(eq(sessionBookings.candidateId, candidate.id), eq(sessionBookings.status, "booked")));
  if (!booking) return null;

  const [session] = await tx.select().from(interviewSessions).where(eq(interviewSessions.id, booking.sessionId));
  if (!session) return null;

  // Insert attendance if absent; the partial unique index drops a duplicate race-safely.
  const inserted = await tx
    .insert(attendanceEvents)
    .values({ sessionBookingId: booking.id, candidateId: candidate.id, joinMethod: "token_link" })
    .onConflictDoNothing()
    .returning();

  const isFirst = inserted.length > 0;
  if (isFirst && candidate.status === "invited") {
    await transitionCandidate({ tx, client, candidateId: candidate.id, event: "session_joined" });
  }

  return { meetingUrl: session.meetingUrl, alreadyAttended: !isFirst };
}
