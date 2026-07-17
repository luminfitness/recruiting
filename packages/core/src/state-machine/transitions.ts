import type { CandidateStatus, TransitionRule } from "./types";

/** Every pre-offer status, per FRD Section 6's "any pre-offer status -> not_selected" edge transition. */
const PRE_OFFER_STATUSES: CandidateStatus[] = [
  "applied",
  "invited",
  "no_show",
  "attended",
  "evaluated",
  "backup",
  "awaiting_review",
];

/**
 * The complete FRD Section 6 transition table. transitionCandidate() is the
 * ONLY code path allowed to apply these — every other write to
 * candidates.status is rejected by the DB guard trigger.
 *
 * Re-application (not_selected/local_declined -> applied) is deliberately
 * NOT modeled here: the doc requires a NEW candidate record with
 * duplicate_of set, not a transition on the same row. See
 * packages/core/src/state-machine/reapply.ts.
 */
export const TRANSITION_TABLE: TransitionRule[] = [
  { event: "invitation_sent", from: ["applied"], to: "invited" },
  { event: "session_passed_without_attendance", from: ["invited"], to: "no_show" },
  { event: "session_joined", from: ["invited"], to: "attended" },
  { event: "rebooked", from: ["no_show"], to: "invited" },
  { event: "stale_closeout", from: ["no_show"], to: "not_selected", requiresReason: true },
  { event: "evaluation_complete", from: ["attended"], to: "evaluated" },
  { event: "quiz_incomplete_closeout", from: ["attended"], to: "not_selected", requiresReason: true },

  // Human decision on a complete bundle — fans out by payload.outcome.
  {
    event: "decision_recorded",
    from: ["evaluated", "awaiting_review"],
    to: (payload) => (payload?.outcome as CandidateStatus) ?? "awaiting_review",
  },
  { event: "promoted", from: ["backup"], to: "offer" },

  // Manager path
  { event: "offer_sent", from: ["offer"], to: "awaiting_reply" },
  { event: "candidate_accepted", from: ["awaiting_reply"], to: "confirmed_orientation" },
  { event: "candidate_declined", from: ["awaiting_reply"], to: "declined" },
  // Company withdraws the offer before the candidate replies (FRD Section 6 edge
  // case; reason required, candidate notified). Distinct from candidate_declined.
  { event: "offer_retracted", from: ["offer", "awaiting_reply"], to: "not_selected", requiresReason: true },
  { event: "mia_threshold_reached", from: ["awaiting_reply", "referred_local"], to: "mia" },

  // Trainer path
  { event: "referred_to_local", from: ["offer"], to: "referred_local" },
  { event: "working_interview_scheduled", from: ["referred_local"], to: "working_interview" },
  { event: "local_outcome_hired", from: ["working_interview"], to: "confirmed_orientation" },
  { event: "local_outcome_declined", from: ["working_interview"], to: "local_declined" },
  { event: "local_outcome_no_show_rebook", from: ["working_interview"], to: "referred_local" },
  { event: "local_outcome_no_show_closeout", from: ["working_interview"], to: "local_declined" },

  // Post-hire (built once, applied to trainers; managers stop at confirmed_orientation
  // equivalents pending FRD OQ-10 — see packages/core/src/state-machine/index.ts doc comment)
  { event: "class_started", from: ["confirmed_orientation"], to: "in_class" },
  { event: "never_started", from: ["confirmed_orientation"], to: "never_started", requiresReason: true },
  { event: "quit_after_orientation", from: ["confirmed_orientation"], to: "quit_after_orientation", requiresReason: true },
  { event: "graduated", from: ["in_class"], to: "graduated" },
  { event: "quit_during_class", from: ["in_class"], to: "quit_during_class", requiresReason: true },
  { event: "graduated_inactive", from: ["graduated"], to: "graduated_inactive", requiresReason: true },

  // Edge transitions
  { event: "closed_out", from: PRE_OFFER_STATUSES, to: "not_selected", requiresReason: true },
  {
    event: "reactivated",
    from: ["mia"],
    to: (payload) => (payload?.target as CandidateStatus) ?? "awaiting_reply",
  },
];
