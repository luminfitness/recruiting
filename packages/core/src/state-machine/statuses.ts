import type { CandidateStatus } from "./types";

/**
 * Soft-terminal / inactive statuses. A candidate in one of these is NOT
 * "active" for duplicate-detection purposes — a re-application while in one of
 * these creates a fresh record with duplicate_of set (see reapplyCandidate),
 * whereas a duplicate arriving while ACTIVE merges into the existing record
 * with no second token issued (FRD Section 6 edge cases).
 */
export const INACTIVE_STATUSES: ReadonlySet<CandidateStatus> = new Set([
  "not_selected",
  "local_declined",
  "declined",
  "never_started",
  "quit_after_orientation",
  "quit_during_class",
  "graduated_inactive",
]);

export function isActiveStatus(status: CandidateStatus): boolean {
  return !INACTIVE_STATUSES.has(status);
}
