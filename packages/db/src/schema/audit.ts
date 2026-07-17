import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./tenancy";
import { users } from "./auth";

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per-org overrides of the FRD Section 6 default thresholds. */
export const thresholdSettings = pgTable("threshold_settings", {
  orgId: uuid("org_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  quizIncompleteDays: integer("quiz_incomplete_days").notNull().default(7),
  offerNoReplyDays: integer("offer_no_reply_days").notNull().default(5),
  referralAgingDays: integer("referral_aging_days").notNull().default(7),
  backupExpiryDays: integer("backup_expiry_days").notNull().default(30),
  /** Hours-before-session at which to send pre-interview reminders (FR-1.3). */
  reminderOffsetsHours: jsonb("reminder_offsets_hours").notNull().default(sql`'[24, 1]'::jsonb`),
});

/** Gives the cron tick idempotency per named job per time window without a durable queue product. */
export const scheduledJobRuns = pgTable("scheduled_job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobName: text("job_name").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
});
