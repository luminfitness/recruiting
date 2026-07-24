import { boolean, integer, jsonb, numeric, pgTable, pgView, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, markets } from "./tenancy";
import { candidates } from "./candidates";
import { users } from "./auth";
import { decisionOutcomeEnum, offerResponseEnum, referralOutcomeEnum, roleTypeEnum } from "./enums";

export const scorecardCriteriaVersions = pgTable("scorecard_criteria_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  roleType: roleTypeEnum("role_type").notNull(),
  version: integer("version").notNull(),
  schema: jsonb("schema").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizDefinitions = pgTable("quiz_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  roleType: roleTypeEnum("role_type").notNull(),
  version: integer("version").notNull(),
  schema: jsonb("schema").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * felony_disclosure is the single most sensitive column in the schema.
 * No query outside the gated detail-view code path (which unconditionally
 * writes to audit_log) may select it — see the evaluations_safe view below,
 * which every list/kanban/table/export code path must use instead.
 */
export const evaluations = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .unique()
    .references(() => candidates.id, { onDelete: "cascade" }),
  interviewerId: uuid("interviewer_id").references(() => users.id, { onDelete: "set null" }),
  criteriaVersionId: uuid("criteria_version_id").references(() => scorecardCriteriaVersions.id),
  interviewGrade: jsonb("interview_grade"),
  writtenNotes: text("written_notes"),
  isDraft: boolean("is_draft").notNull().default(true),
  quizDefinitionVersionId: uuid("quiz_definition_version_id").references(() => quizDefinitions.id),
  quizAnswers: jsonb("quiz_answers"),
  quizScore: numeric("quiz_score"),
  writtenResponse: text("written_response"),
  availability: jsonb("availability"),
  /** SENSITIVE — see the module doc comment above. */
  felonyDisclosure: jsonb("felony_disclosure"),
  scorecardSubmittedAt: timestamp("scorecard_submitted_at", { withTimezone: true }),
  quizSubmittedAt: timestamp("quiz_submitted_at", { withTimezone: true }),
  quizWithoutAttendanceFlag: boolean("quiz_without_attendance_flag").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The ONLY view list/kanban/table/CSV-export code may query. felony_disclosure
 * itself is NEVER selected here — only a derived boolean (`hasDisclosure`) so
 * a flag can render in list views per FRD Section 9 ("flag + detail-on-demand,
 * never in list views"). Naively aliasing the sensitive column in a `.select()`
 * object (e.g. `hasDisclosure: evaluations.felonyDisclosure`) is NOT sufficient
 * — drizzle-kit's generated view SQL uses the underlying column reference, so
 * the real column would still be selected under the alias name. Use a genuine
 * derived SQL expression instead, as below.
 */
export const evaluationsSafe = pgView("evaluations_safe").as((qb) =>
  qb
    .select({
      id: evaluations.id,
      candidateId: evaluations.candidateId,
      interviewerId: evaluations.interviewerId,
      criteriaVersionId: evaluations.criteriaVersionId,
      interviewGrade: evaluations.interviewGrade,
      writtenNotes: evaluations.writtenNotes,
      isDraft: evaluations.isDraft,
      quizDefinitionVersionId: evaluations.quizDefinitionVersionId,
      quizAnswers: evaluations.quizAnswers,
      quizScore: evaluations.quizScore,
      writtenResponse: evaluations.writtenResponse,
      availability: evaluations.availability,
      hasDisclosure: sql<boolean>`(${evaluations.felonyDisclosure} is not null)`.as("has_disclosure"),
      scorecardSubmittedAt: evaluations.scorecardSubmittedAt,
      quizSubmittedAt: evaluations.quizSubmittedAt,
      quizWithoutAttendanceFlag: evaluations.quizWithoutAttendanceFlag,
    })
    .from(evaluations),
);

export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  outcome: decisionOutcomeEnum("outcome").notNull(),
  /**
   * What the grading policy suggested at the moment this decision was made
   * (null when no suggestion was offered — incomplete bundle or a disclosure on
   * file). Recorded purely so we can later ask "how often do we override the
   * policy?" before anyone considers automating it. Never used to drive state.
   */
  suggestedOutcome: decisionOutcomeEnum("suggested_outcome"),
  decidedBy: uuid("decided_by")
    .notNull()
    .references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .unique()
    .references(() => candidates.id, { onDelete: "cascade" }),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  channelLog: jsonb("channel_log").notNull().default([]),
  onboardingEmailsSent: jsonb("onboarding_emails_sent").notNull().default({}),
  response: offerResponseEnum("response"),
  retractedAt: timestamp("retracted_at", { withTimezone: true }),
  retractionReason: text("retraction_reason"),
  resendCount: integer("resend_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const localReferrals = pgTable("local_referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id, { onDelete: "cascade" }),
  marketId: uuid("market_id")
    .notNull()
    .references(() => markets.id, { onDelete: "cascade" }),
  referredAt: timestamp("referred_at", { withTimezone: true }).notNull().defaultNow(),
  workingInterviewAt: timestamp("working_interview_at", { withTimezone: true }),
  outcome: referralOutcomeEnum("outcome"),
  outcomeBy: uuid("outcome_by").references(() => users.id, { onDelete: "set null" }),
  outcomeNotes: text("outcome_notes"),
  agingAlertedAt: timestamp("aging_alerted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
