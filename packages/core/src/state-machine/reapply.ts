import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { candidates, candidateStatusHistory } from "@usapt/db/schema";
import { generateCandidateToken } from "../tokens";

/**
 * FRD Section 6: "not_selected / local_declined -> applied: re-application
 * creates a NEW candidate record, duplicate_of set, prior history visible to
 * reviewers." This is deliberately NOT a transitionCandidate() event — the
 * old record's terminal status is untouched; a fresh row with its own token
 * and its own candidate_status_history starts the lifecycle over, linked
 * back via duplicate_of so reviewers see the full history across both.
 */
export async function reapplyCandidate(
  tx: NodePgDatabase<typeof dbSchema>,
  priorCandidateId: string,
): Promise<string> {
  const [prior] = await tx.select().from(candidates).where(eq(candidates.id, priorCandidateId));
  if (!prior) {
    throw new Error(`Candidate ${priorCandidateId} not found`);
  }
  if (prior.status !== "not_selected" && prior.status !== "local_declined") {
    throw new Error(`Candidate ${priorCandidateId} is not in a re-appliable status (got "${prior.status}")`);
  }

  const [fresh] = await tx
    .insert(candidates)
    .values({
      orgId: prior.orgId,
      brandId: prior.brandId,
      marketId: prior.marketId,
      firstName: prior.firstName,
      lastName: prior.lastName,
      email: prior.email,
      phone: prior.phone,
      roleType: prior.roleType,
      source: prior.source,
      token: generateCandidateToken(),
      status: "applied",
      duplicateOf: prior.id,
    })
    .returning();

  await tx.insert(candidateStatusHistory).values({
    candidateId: fresh.id,
    fromStatus: null,
    toStatus: "applied",
    event: "reapplied",
    reason: `Re-application of ${prior.id}`,
  });

  return fresh.id;
}
