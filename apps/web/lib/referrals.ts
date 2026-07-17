import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { auditLog, brands, candidates, evaluationsSafe, localReferrals, markets } from "@usapt/db/schema";
import { getProvider, transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

/**
 * Trainer path: on an offer decision, the candidate is referred to local
 * management for an in-person working interview (FR-1.9). Creates the
 * local_referrals row in the candidate's market, notifies the candidate that a
 * local working interview is the next step (so they're never waiting on an
 * unprompted call), advances offer -> referred_local, and audit-logs.
 */
export async function createLocalReferral(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  actorUserId: string,
): Promise<void> {
  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error("Candidate not found");
  const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));

  await tx.insert(localReferrals).values({ candidateId, marketId: candidate.marketId });

  const email = await getProvider(tx, orgId, "messaging_email");
  await email.sendEmail({
    to: candidate.email,
    fromName: brand?.replyIdentityName ?? "Recruiting",
    fromEmail: brand?.replyIdentityEmail ?? "recruiting@example.com",
    subject: `Next step — your in-person working interview at ${brand?.name ?? ""}`,
    body: `Hi ${candidate.firstName},\n\nGreat news — you're moving forward! The next step is a short in-person working interview at your local ${brand?.name ?? ""} club. The local manager will reach out to schedule; you'll get a confirmation with the time and what to bring.`,
    templateKey: "local_referral",
  });

  await tx.insert(auditLog).values({ orgId, actorUserId, action: "referred_local", resourceType: "candidate", resourceId: candidateId, metadata: {} });
  await transitionCandidate({ tx, client, candidateId, event: "referred_to_local", actorUserId });
}

export interface LocalQueueEntry {
  referralId: string;
  candidateId: string;
  name: string;
  status: string;
  gradeText: string;
  quizText: string;
  workingInterviewAt: Date | null;
  outcome: string | null;
  marketName: string | null;
}

/**
 * The local manager's queue — trainers referred to THEIR market(s) only.
 * RLS already restricts candidate visibility to the caller's market scope; this
 * additionally filters to the referral pipeline statuses. The evaluation
 * summary is the safe view (no felony detail, which local managers must not see).
 */
export async function listLocalQueue(tx: Tx): Promise<LocalQueueEntry[]> {
  const rows = await tx
    .select({
      referralId: localReferrals.id,
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      status: candidates.status,
      workingInterviewAt: localReferrals.workingInterviewAt,
      outcome: localReferrals.outcome,
      marketName: markets.name,
      interviewGrade: evaluationsSafe.interviewGrade,
      quizScore: evaluationsSafe.quizScore,
    })
    .from(localReferrals)
    .innerJoin(candidates, eq(candidates.id, localReferrals.candidateId))
    .leftJoin(markets, eq(markets.id, localReferrals.marketId))
    .leftJoin(evaluationsSafe, eq(evaluationsSafe.candidateId, candidates.id))
    .where(inArray(candidates.status, ["referred_local", "working_interview"]))
    .orderBy(desc(localReferrals.referredAt));

  return rows.map((r) => {
    const g = r.interviewGrade as { total?: number; max?: number } | null;
    return {
      referralId: r.referralId,
      candidateId: r.candidateId,
      name: `${r.firstName} ${r.lastName}`,
      status: r.status,
      gradeText: g?.total != null ? `${g.total}/${g.max}` : "—",
      quizText: r.quizScore != null ? `${r.quizScore}%` : "—",
      workingInterviewAt: r.workingInterviewAt,
      outcome: r.outcome,
      marketName: r.marketName,
    };
  });
}

/** Local manager schedules the working interview; candidate gets a confirmation (time/location/what to bring). */
export async function scheduleWorkingInterview(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  referralId: string,
  at: Date,
  actorUserId: string,
): Promise<void> {
  const [referral] = await tx.select().from(localReferrals).where(eq(localReferrals.id, referralId));
  if (!referral) throw new Error("Referral not found");
  await tx.update(localReferrals).set({ workingInterviewAt: at }).where(eq(localReferrals.id, referralId));

  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, referral.candidateId));
  const [brand] = candidate ? await tx.select().from(brands).where(eq(brands.id, candidate.brandId)) : [];
  if (candidate) {
    const email = await getProvider(tx, orgId, "messaging_email");
    await email.sendEmail({
      to: candidate.email,
      fromName: brand?.replyIdentityName ?? "Recruiting",
      fromEmail: brand?.replyIdentityEmail ?? "recruiting@example.com",
      subject: `Your working interview is confirmed — ${brand?.name ?? ""}`,
      body: `Hi ${candidate.firstName},\n\nYour in-person working interview is set for ${at.toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}. Please arrive 10 minutes early, wear athletic clothes you can train in, and bring any certifications. See you there!`,
      templateKey: "working_interview_confirmation",
    });
  }

  await transitionCandidate({ tx, client, candidateId: referral.candidateId, event: "working_interview_scheduled", actorUserId });
}

export type LocalOutcome = "hired" | "declined" | "no_show";

/**
 * Local manager records the working-interview outcome — the entry IS the status
 * transition (FR-1.9), closing the handoff loop that was a visibility black
 * hole in the spreadsheet world. no_show rebooks back to referred_local.
 */
export async function recordLocalOutcome(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  referralId: string,
  outcome: LocalOutcome,
  notes: string | null,
  actorUserId: string,
): Promise<void> {
  const [referral] = await tx.select().from(localReferrals).where(eq(localReferrals.id, referralId));
  if (!referral) throw new Error("Referral not found");

  await tx
    .update(localReferrals)
    .set({ outcome, outcomeBy: actorUserId, outcomeNotes: notes })
    .where(eq(localReferrals.id, referralId));

  const event =
    outcome === "hired" ? "local_outcome_hired" : outcome === "declined" ? "local_outcome_declined" : "local_outcome_no_show_rebook";
  await tx.insert(auditLog).values({ orgId, actorUserId, action: `local_outcome_${outcome}`, resourceType: "candidate", resourceId: referral.candidateId, metadata: {} });
  await transitionCandidate({ tx, client, candidateId: referral.candidateId, event, actorUserId, reason: notes ?? undefined });
}

/** Central-only market reassignment (a candidate is visible in exactly one market at a time). */
export async function reassignMarket(tx: Tx, orgId: string, candidateId: string, newMarketId: string, actorUserId: string): Promise<void> {
  await tx.update(candidates).set({ marketId: newMarketId, updatedAt: new Date() }).where(eq(candidates.id, candidateId));
  // Move any still-open referral to the new market too.
  await tx.update(localReferrals).set({ marketId: newMarketId }).where(and(eq(localReferrals.candidateId, candidateId), isNull(localReferrals.outcome)));
  await tx.insert(auditLog).values({ orgId, actorUserId, action: "market_reassigned", resourceType: "candidate", resourceId: candidateId, metadata: { newMarketId } });
}
