import { pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, brands, markets } from "./tenancy";
import { candidateSourceEnum, candidateStatusEnum, roleTypeEnum } from "./enums";
import { jobPostings } from "./cadence";
import { users } from "./auth";

/**
 * The identity thread. `token` is issued once at creation and embedded in
 * every candidate-facing URL — all matching (booking, attendance, quiz) is
 * by token, never by name. `status` may ONLY be written by
 * packages/core's transitionCandidate() — see the BEFORE UPDATE trigger in
 * 0002_candidate_state_machine_guard.sql.
 */
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "cascade" }),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    roleType: roleTypeEnum("role_type").notNull(),
    source: candidateSourceEnum("source").notNull(),
    token: text("token").notNull().unique(),
    status: candidateStatusEnum("status").notNull().default("applied"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    postingId: uuid("posting_id").references(() => jobPostings.id, { onDelete: "set null" }),
    duplicateOf: uuid("duplicate_of").references((): AnyPgColumn => candidates.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most ONE active candidate per (org, email). PARTIAL — excludes the
    // inactive/soft-terminal statuses (see INACTIVE_STATUSES in @usapt/core)
    // so re-application can create a fresh record with the same email while
    // the prior one sits in not_selected/declined/etc. This is the DB-level
    // backstop for the app-level duplicate-merge logic in lib/candidates.ts;
    // it must never forbid re-application.
    uniqueIndex("candidates_org_email_active_idx")
      .on(t.orgId, t.email)
      .where(
        sql`${t.status} NOT IN ('not_selected','local_declined','declined','never_started','quit_after_orientation','quit_during_class','graduated_inactive')`,
      ),
  ],
);

/**
 * Append-only. This table — not candidates.status alone — is the source of
 * truth for FR-1.10's per-candidate event timeline. Every transitionCandidate()
 * call appends exactly one row in the same transaction as the status write.
 */
export const candidateStatusHistory = pgTable("candidate_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  fromStatus: candidateStatusEnum("from_status"),
  toStatus: candidateStatusEnum("to_status").notNull(),
  event: text("event").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
