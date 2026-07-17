import { and, desc, eq, inArray } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { candidates, classCohorts, cohortMembers } from "@usapt/db/schema";
import { transitionCandidate, type TransitionEvent } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

export async function createCohort(tx: Tx, orgId: string, input: { brandId?: string | null; marketId?: string | null; orientationAt: Date; classStartAt: Date }): Promise<string> {
  const [c] = await tx
    .insert(classCohorts)
    .values({ orgId, brandId: input.brandId ?? null, marketId: input.marketId ?? null, orientationAt: input.orientationAt, classStartAt: input.classStartAt })
    .returning();
  return c.id;
}

/** Assign confirmed_orientation candidates to a cohort. */
export async function addCohortMembers(tx: Tx, cohortId: string, candidateIds: string[]): Promise<void> {
  for (const candidateId of candidateIds) {
    await tx.insert(cohortMembers).values({ cohortId, candidateId }).onConflictDoNothing();
  }
}

export interface CohortMemberRow {
  candidateId: string;
  name: string;
  status: string;
}

export async function listCohortMembers(tx: Tx, cohortId: string): Promise<CohortMemberRow[]> {
  const rows = await tx
    .select({ candidateId: candidates.id, firstName: candidates.firstName, lastName: candidates.lastName, status: candidates.status })
    .from(cohortMembers)
    .innerJoin(candidates, eq(candidates.id, cohortMembers.candidateId))
    .where(eq(cohortMembers.cohortId, cohortId));
  return rows.map((r) => ({ candidateId: r.candidateId, name: `${r.firstName} ${r.lastName}`, status: r.status }));
}

/** Candidates available to add: confirmed_orientation and not already in any cohort. */
export async function listAssignable(tx: Tx): Promise<CohortMemberRow[]> {
  const assigned = await tx.select({ id: cohortMembers.candidateId }).from(cohortMembers);
  const assignedIds = new Set(assigned.map((a) => a.id));
  const rows = await tx.select().from(candidates).where(eq(candidates.status, "confirmed_orientation"));
  return rows.filter((r) => !assignedIds.has(r.id)).map((r) => ({ candidateId: r.id, name: `${r.firstName} ${r.lastName}`, status: r.status }));
}

/** Post-hire transition on a single cohort member (class start, graduate, or attrition). */
export async function transitionMember(
  tx: Tx,
  client: PoolClient,
  candidateId: string,
  event: Extract<TransitionEvent, "class_started" | "graduated" | "never_started" | "quit_after_orientation" | "quit_during_class" | "graduated_inactive">,
  actorUserId: string,
): Promise<void> {
  const requiresReason = ["never_started", "quit_after_orientation", "quit_during_class", "graduated_inactive"].includes(event);
  await transitionCandidate({ tx, client, candidateId, event, actorUserId, reason: requiresReason ? `Cohort: ${event}` : undefined });
}

/** Bulk "start class": every confirmed_orientation member of the cohort -> in_class. */
export async function startClass(tx: Tx, client: PoolClient, cohortId: string, actorUserId: string): Promise<number> {
  const members = await listCohortMembers(tx, cohortId);
  const eligible = members.filter((m) => m.status === "confirmed_orientation");
  for (const m of eligible) {
    await transitionCandidate({ tx, client, candidateId: m.candidateId, event: "class_started", actorUserId });
  }
  return eligible.length;
}
