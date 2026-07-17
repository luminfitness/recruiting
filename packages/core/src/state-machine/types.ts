import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";

/** Mirrors the candidate_status pg enum in packages/db/src/schema/enums.ts — keep both in sync. */
export type CandidateStatus =
  | "applied"
  | "invited"
  | "no_show"
  | "attended"
  | "evaluated"
  | "offer"
  | "backup"
  | "awaiting_review"
  | "not_selected"
  | "awaiting_reply"
  | "referred_local"
  | "working_interview"
  | "local_declined"
  | "confirmed_orientation"
  | "in_class"
  | "graduated"
  | "declined"
  | "never_started"
  | "quit_after_orientation"
  | "quit_during_class"
  | "mia"
  | "graduated_inactive";

/**
 * Every event the state machine understands. One event may map to different
 * `to` statuses depending on `from` and the event payload (e.g. 'decision_recorded'
 * fans out to offer/backup/awaiting_review/not_selected based on payload.outcome).
 */
export type TransitionEvent =
  | "invitation_sent"
  | "session_passed_without_attendance"
  | "session_joined"
  | "rebooked"
  | "stale_closeout"
  | "evaluation_complete"
  | "quiz_incomplete_closeout"
  | "decision_recorded"
  | "promoted"
  | "offer_sent"
  | "candidate_accepted"
  | "candidate_declined"
  | "mia_threshold_reached"
  | "referred_to_local"
  | "working_interview_scheduled"
  | "local_outcome_hired"
  | "local_outcome_declined"
  | "local_outcome_no_show_rebook"
  | "local_outcome_no_show_closeout"
  | "class_started"
  | "never_started"
  | "quit_after_orientation"
  | "quit_during_class"
  | "graduated"
  | "graduated_inactive"
  | "closed_out"
  | "reactivated";

export interface TransitionContext {
  tx: NodePgDatabase<typeof dbSchema>;
  client: PoolClient;
  candidateId: string;
  event: TransitionEvent;
  actorUserId?: string;
  reason?: string;
  /** Event-specific data, e.g. { outcome: 'offer' } for decision_recorded, { target: 'awaiting_reply' } for reactivated. */
  payload?: Record<string, unknown>;
}

export interface TransitionRule {
  event: TransitionEvent;
  from: CandidateStatus[];
  /** Either a fixed target status, or a function of the payload (e.g. decision_recorded -> payload.outcome). */
  to: CandidateStatus | ((payload: Record<string, unknown> | undefined) => CandidateStatus);
  requiresReason?: boolean;
  guard?: (ctx: TransitionContext) => Promise<boolean> | boolean;
}
