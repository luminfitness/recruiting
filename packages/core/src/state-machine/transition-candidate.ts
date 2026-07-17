import { eq } from "drizzle-orm";
import { candidates, candidateStatusHistory } from "@usapt/db/schema";
import { withStatusTransitionAllowed } from "@usapt/db";
import { TRANSITION_TABLE } from "./transitions";
import type { CandidateStatus, TransitionContext } from "./types";

export class InvalidTransitionError extends Error {
  constructor(event: string, from: CandidateStatus) {
    super(`No transition rule for event "${event}" from status "${from}"`);
    this.name = "InvalidTransitionError";
  }
}

export class TransitionGuardError extends Error {
  constructor(event: string) {
    super(`Guard rejected transition for event "${event}"`);
    this.name = "TransitionGuardError";
  }
}

export class ReasonRequiredError extends Error {
  constructor(event: string) {
    super(`Event "${event}" requires a reason`);
    this.name = "ReasonRequiredError";
  }
}

/**
 * THE single chokepoint for every candidate status change in the product.
 * No other code path may write candidates.status — the DB guard trigger
 * (0001_rls_policies.sql's status_transition_guard) rejects any UPDATE that
 * doesn't happen inside the app.allow_status_transition flag this function
 * sets. This is what makes "status is a side effect of an action, never a
 * manual status-entry screen" (FRD Section 3) a mechanically enforced rule
 * instead of a convention every future contributor has to remember.
 *
 * Every call appends exactly one row to candidate_status_history in the
 * same transaction as the status write — that table, not candidates.status
 * alone, is what backs FR-1.10's per-candidate event timeline.
 */
export async function transitionCandidate(ctx: TransitionContext): Promise<CandidateStatus> {
  const { tx, client, candidateId, event, actorUserId, reason, payload } = ctx;

  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) {
    throw new Error(`Candidate ${candidateId} not found`);
  }
  const from = candidate.status as CandidateStatus;

  const rule = TRANSITION_TABLE.find((r) => r.event === event && r.from.includes(from));
  if (!rule) {
    throw new InvalidTransitionError(event, from);
  }
  if (rule.requiresReason && !reason) {
    throw new ReasonRequiredError(event);
  }
  if (rule.guard && !(await rule.guard(ctx))) {
    throw new TransitionGuardError(event);
  }

  const to = typeof rule.to === "function" ? rule.to(payload) : rule.to;

  await withStatusTransitionAllowed(client, async () => {
    await tx.update(candidates).set({ status: to, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
  });

  await tx.insert(candidateStatusHistory).values({
    candidateId,
    fromStatus: from,
    toStatus: to,
    event,
    actorUserId: actorUserId ?? null,
    reason: reason ?? null,
  });

  return to;
}
