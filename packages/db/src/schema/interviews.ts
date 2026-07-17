import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, markets } from "./tenancy";
import { candidates } from "./candidates";
import { users } from "./auth";
import { bookingStatusEnum, joinMethodEnum, providerKeyEnum, roleTypeEnum } from "./enums";

export const interviewSessions = pgTable("interview_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  roleType: roleTypeEnum("role_type").notNull(),
  marketId: uuid("market_id").references(() => markets.id, { onDelete: "set null" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  capacity: integer("capacity").notNull(),
  meetingUrl: text("meeting_url").notNull(),
  hostUserId: uuid("host_user_id")
    .notNull()
    .references(() => users.id),
  meetingProvider: providerKeyEnum("meeting_provider").notNull().default("mock"),
  externalMeetingId: text("external_meeting_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Partial unique index on (candidate_id) WHERE status = 'booked' gives
 * "a later booking replaces an earlier one" for free — the app cancels
 * the prior row (status='cancelled') in the same transaction as inserting
 * the new one, so the constraint never actually rejects an insert.
 */
export const sessionBookings = pgTable(
  "session_bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    bookedAt: timestamp("booked_at", { withTimezone: true }).notNull().defaultNow(),
    status: bookingStatusEnum("status").notNull().default("booked"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("session_bookings_active_per_candidate_idx")
      .on(t.candidateId)
      .where(sql`${t.status} = 'booked'`),
  ],
);

/**
 * Partial unique index on (session_booking_id) gives "first joined_at
 * stands, later joins ignored" race-safely at the DB level — the insert
 * from a duplicate join attempt simply conflicts and is dropped.
 */
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionBookingId: uuid("session_booking_id")
      .notNull()
      .references(() => sessionBookings.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    joinMethod: joinMethodEnum("join_method").notNull(),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendance_events_one_per_booking_idx").on(t.sessionBookingId)],
);
