import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Every valid Candidate.status value from FRD Section 6. This is the ONLY
 * place this list may be defined — packages/core/state-machine reads it to
 * build the transition table, and StatusPill's STATUS_FAMILY map (in
 * @usapt/design-tokens) must stay a superset of it.
 */
export const candidateStatusEnum = pgEnum("candidate_status", [
  "applied",
  "invited",
  "no_show",
  "attended",
  "evaluated",
  "offer",
  "backup",
  "awaiting_review",
  "not_selected",
  "awaiting_reply",
  "referred_local",
  "working_interview",
  "local_declined",
  "confirmed_orientation",
  "in_class",
  "graduated",
  "declined",
  "never_started",
  "quit_after_orientation",
  "quit_during_class",
  "mia",
  "graduated_inactive",
]);

export const roleTypeEnum = pgEnum("role_type", ["manager", "trainer"]);

export const candidateSourceEnum = pgEnum("candidate_source", ["indeed", "linkedin", "referral", "other"]);

export const postingChannelEnum = pgEnum("posting_channel", ["indeed", "linkedin", "other"]);

export const postingStatusEnum = pgEnum("posting_status", [
  "draft",
  "pending_manual_action",
  "scheduled",
  "live",
  "paused",
  "ended",
]);

export const postingModeEnum = pgEnum("posting_mode", ["full_auto", "semi_auto"]);

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "recruiting_lead",
  "trainer_coordinator",
  "territory_manager",
  "local_manager",
]);

export const integrationCategoryEnum = pgEnum("integration_category", [
  "job_board_indeed",
  "job_board_linkedin",
  "messaging_email",
  "messaging_sms",
  "meeting",
]);

export const providerKeyEnum = pgEnum("provider_key", [
  "mock",
  "indeed",
  "linkedin",
  "sendgrid",
  "twilio",
  "zoom",
]);

export const cadenceActionEnum = pgEnum("cadence_action", ["post", "switch_mode", "end", "remind"]);

export const cadenceOverrideEnum = pgEnum("cadence_override", ["skip", "shift"]);

export const joinMethodEnum = pgEnum("join_method", ["token_link", "manual_confirm", "webhook_confirm"]);

export const bookingStatusEnum = pgEnum("booking_status", ["booked", "rebooked", "cancelled"]);

export const decisionOutcomeEnum = pgEnum("decision_outcome", ["offer", "backup", "awaiting_review", "not_selected"]);

export const offerResponseEnum = pgEnum("offer_response", ["accepted", "declined"]);

export const referralOutcomeEnum = pgEnum("referral_outcome", ["hired", "declined", "no_show"]);

export const parsedStatusEnum = pgEnum("parsed_status", ["parsed", "failed", "needs_review"]);
