import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { candidates } from "./candidates";
import { sessionBookings } from "./interviews";
import { users } from "./auth";
import { bookingStatusEnum } from "./enums";

/**
 * One row per reminder actually sent, so the cron reminder job is idempotent:
 * a candidate gets each configured pre-interview offset (e.g. 24h, 1h) exactly
 * once per booking. FR-1.3.
 */
export const interviewReminders = pgTable(
  "interview_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionBookingId: uuid("session_booking_id")
      .notNull()
      .references(() => sessionBookings.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "cascade" }),
    offsetHours: integer("offset_hours").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("interview_reminders_once_idx").on(t.sessionBookingId, t.offsetHours)],
);

/**
 * Territory-manager no-show outreach. Recording an outcome IS the status update
 * (FR-1.3). Also used to suppress auto-reminders while a TM is actively working
 * a candidate.
 */
export const tmOutreach = pgTable("tm_outreach", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  outcome: text("outcome").notNull(), // 'rebooked' | 'unresponsive' | 'working'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Re-export so callers can reference the booking status enum from one place if needed.
export { bookingStatusEnum };
