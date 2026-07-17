import { and, desc, eq, inArray } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import {
  auditLog,
  brands,
  candidates,
  decisions,
  evaluations,
  evaluationsSafe,
  markets,
  quizDefinitions,
  scorecardCriteriaVersions,
} from "@usapt/db/schema";
import type { QuizSchema, ScorecardSchema } from "@usapt/db";
import { transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

export type Disposition = "offer" | "backup" | "awaiting_review" | "not_selected";

export interface QueueRow {
  candidateId: string;
  name: string;
  roleType: string;
  brandName: string | null;
  marketName: string | null;
  gradeTotal: number | null;
  gradeMax: number | null;
  quizScore: string | null;
  hasDisclosure: boolean;
  status: string;
}

/**
 * The decision queue: candidates whose bundle is complete (`evaluated`) or
 * deferred (`awaiting_review`). Reads ONLY evaluations_safe — the felony
 * disclosure shows as a flag (hasDisclosure), never the detail, and never in
 * this list (FRD Section 9). RLS + security_invoker keep it org/market scoped.
 */
export async function listDecisionQueue(tx: Tx): Promise<QueueRow[]> {
  const rows = await tx
    .select({
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      roleType: candidates.roleType,
      status: candidates.status,
      brandName: brands.name,
      marketName: markets.name,
      interviewGrade: evaluationsSafe.interviewGrade,
      quizScore: evaluationsSafe.quizScore,
      hasDisclosure: evaluationsSafe.hasDisclosure,
    })
    .from(candidates)
    .innerJoin(evaluationsSafe, eq(evaluationsSafe.candidateId, candidates.id))
    .leftJoin(brands, eq(brands.id, candidates.brandId))
    .leftJoin(markets, eq(markets.id, candidates.marketId))
    .where(inArray(candidates.status, ["evaluated", "awaiting_review"]))
    .orderBy(desc(candidates.updatedAt));

  return rows.map((r) => {
    const g = r.interviewGrade as { total?: number; max?: number } | null;
    return {
      candidateId: r.candidateId,
      name: `${r.firstName} ${r.lastName}`,
      roleType: r.roleType,
      brandName: r.brandName,
      marketName: r.marketName,
      gradeTotal: g?.total ?? null,
      gradeMax: g?.max ?? null,
      quizScore: r.quizScore,
      hasDisclosure: Boolean(r.hasDisclosure),
      status: r.status,
    };
  });
}

export interface DecisionBundle {
  candidate: { id: string; name: string; roleType: "manager" | "trainer"; status: string; brandName: string | null; marketName: string | null; source: string };
  grade: { criteria: ScorecardSchema | null; values: Record<string, number>; total: number | null; max: number | null; notes: string | null };
  quiz: { schema: QuizSchema | null; answers: Record<string, string>; score: string | null };
  writtenResponse: string | null;
  availability: Record<string, boolean>;
  hasDisclosure: boolean;
  quizWithoutAttendance: boolean;
  priorDecision: { outcome: string; notes: string | null } | null;
}

/**
 * The full bundle for one candidate — everything EXCEPT the felony detail,
 * which is fetched separately and audit-logged (revealDisclosure). Reads the
 * safe view for the sensitive-flag boolean; grade/quiz content come from the
 * candidate-side columns which are not sensitive.
 */
export async function getDecisionBundle(tx: Tx, candidateId: string): Promise<DecisionBundle | null> {
  const [row] = await tx
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      roleType: candidates.roleType,
      status: candidates.status,
      source: candidates.source,
      brandName: brands.name,
      marketName: markets.name,
    })
    .from(candidates)
    .leftJoin(brands, eq(brands.id, candidates.brandId))
    .leftJoin(markets, eq(markets.id, candidates.marketId))
    .where(eq(candidates.id, candidateId));
  if (!row) return null;

  const [ev] = await tx.select().from(evaluationsSafe).where(eq(evaluationsSafe.candidateId, candidateId));

  let criteria: ScorecardSchema | null = null;
  if (ev?.criteriaVersionId) {
    const [cv] = await tx.select().from(scorecardCriteriaVersions).where(eq(scorecardCriteriaVersions.id, ev.criteriaVersionId));
    criteria = (cv?.schema as ScorecardSchema) ?? null;
  }
  let quizSchema: QuizSchema | null = null;
  if (ev?.quizDefinitionVersionId) {
    const [qd] = await tx.select().from(quizDefinitions).where(eq(quizDefinitions.id, ev.quizDefinitionVersionId));
    quizSchema = (qd?.schema as QuizSchema) ?? null;
  }

  const grade = (ev?.interviewGrade as (Record<string, number> & { total?: number; max?: number }) | null) ?? null;
  const [prior] = await tx.select().from(decisions).where(eq(decisions.candidateId, candidateId)).orderBy(desc(decisions.decidedAt));

  return {
    candidate: {
      id: row.id,
      name: `${row.firstName} ${row.lastName}`,
      roleType: row.roleType,
      status: row.status,
      brandName: row.brandName,
      marketName: row.marketName,
      source: row.source,
    },
    grade: {
      criteria,
      values: grade ?? {},
      total: grade?.total ?? null,
      max: grade?.max ?? null,
      notes: ev?.writtenNotes ?? null,
    },
    quiz: { schema: quizSchema, answers: (ev?.quizAnswers as Record<string, string> | null) ?? {}, score: ev?.quizScore ?? null },
    writtenResponse: ev?.writtenResponse ?? null,
    availability: (ev?.availability as Record<string, boolean> | null) ?? {},
    hasDisclosure: Boolean(ev?.hasDisclosure),
    quizWithoutAttendance: Boolean(ev?.quizWithoutAttendanceFlag),
    priorDecision: prior ? { outcome: prior.outcome, notes: prior.notes } : null,
  };
}

/**
 * Reveals the felony-disclosure detail — the ONLY code path that reads the
 * sensitive column. Writes an audit_log row on every access (FRD Security),
 * unconditionally, before returning. EEOC/ban-the-box: this is display only;
 * disposition is always a separate human action and the system never
 * auto-rejects on a disclosure.
 */
export async function revealDisclosure(
  tx: Tx,
  orgId: string,
  candidateId: string,
  actorUserId: string,
  ip: string | null,
): Promise<{ hasDisclosure: boolean; detail?: string } | null> {
  const [ev] = await tx.select({ felonyDisclosure: evaluations.felonyDisclosure }).from(evaluations).where(eq(evaluations.candidateId, candidateId));

  await tx.insert(auditLog).values({
    orgId,
    actorUserId,
    action: "disclosure_viewed",
    resourceType: "candidate",
    resourceId: candidateId,
    metadata: {},
    ipAddress: ip,
  });

  return (ev?.felonyDisclosure as { hasDisclosure: boolean; detail?: string } | null) ?? { hasDisclosure: false };
}

/**
 * Records a disposition — exactly the four FRD values. A decision requires a
 * complete bundle (candidate must be `evaluated`, or `awaiting_review` for a
 * re-decision). Writes the decisions row + audit_log, then fires the state
 * transition (the status change is the side effect, never set directly).
 * Routing to the manager/trainer paths happens off the resulting `offer`
 * status in Phase 5.
 */
export async function recordDecision(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  actorUserId: string,
  outcome: Disposition,
  notes: string | null,
): Promise<void> {
  await tx.insert(decisions).values({ candidateId, outcome, decidedBy: actorUserId, notes });
  await tx.insert(auditLog).values({
    orgId,
    actorUserId,
    action: "decision_recorded",
    resourceType: "candidate",
    resourceId: candidateId,
    metadata: { outcome },
  });
  await transitionCandidate({
    tx,
    client,
    candidateId,
    event: "decision_recorded",
    actorUserId,
    reason: notes ?? undefined,
    payload: { outcome },
  });
}

/** Bulk not-selected close-out (FR-1.7). Reason required per the state machine. */
export async function bulkNotSelect(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateIds: string[],
  actorUserId: string,
  reason: string,
): Promise<number> {
  let n = 0;
  for (const candidateId of candidateIds) {
    await tx.insert(decisions).values({ candidateId, outcome: "not_selected", decidedBy: actorUserId, notes: reason });
    await tx.insert(auditLog).values({ orgId, actorUserId, action: "decision_recorded", resourceType: "candidate", resourceId: candidateId, metadata: { outcome: "not_selected", bulk: true } });
    await transitionCandidate({ tx, client, candidateId, event: "decision_recorded", actorUserId, reason, payload: { outcome: "not_selected" } });
    n++;
  }
  return n;
}
