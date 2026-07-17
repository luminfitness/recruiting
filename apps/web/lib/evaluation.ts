import { and, desc, eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import {
  attendanceEvents,
  brands,
  candidates,
  evaluations,
  quizDefinitions,
  scorecardCriteriaVersions,
  sessionBookings,
} from "@usapt/db/schema";
import type { QuizSchema, ScorecardSchema } from "@usapt/db";
import { getProvider, transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

export async function getActiveCriteria(tx: Tx, orgId: string, roleType: "manager" | "trainer") {
  const [row] = await tx
    .select()
    .from(scorecardCriteriaVersions)
    .where(
      and(
        eq(scorecardCriteriaVersions.orgId, orgId),
        eq(scorecardCriteriaVersions.roleType, roleType),
        eq(scorecardCriteriaVersions.active, true),
      ),
    )
    .orderBy(desc(scorecardCriteriaVersions.version));
  return row ? { id: row.id, version: row.version, schema: row.schema as ScorecardSchema } : null;
}

export async function getActiveQuiz(tx: Tx, orgId: string, roleType: "manager" | "trainer") {
  const [row] = await tx
    .select()
    .from(quizDefinitions)
    .where(and(eq(quizDefinitions.orgId, orgId), eq(quizDefinitions.roleType, roleType), eq(quizDefinitions.active, true)))
    .orderBy(desc(quizDefinitions.version));
  return row ? { id: row.id, version: row.version, schema: row.schema as QuizSchema } : null;
}

/**
 * Sends the candidate their personal quiz/intake link post-interview (email +
 * optional SMS via the org's provider). Called once, when attendance is first
 * recorded (token or host-confirmed). Idempotent-safe to call again — worst
 * case a duplicate reminder, which the reminder sequence (Phase 7) will
 * formalize.
 */
export async function sendQuizInvite(tx: Tx, orgId: string, candidateId: string): Promise<void> {
  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) return;
  const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const quizUrl = `${baseUrl}/q/${candidate.token}`;

  const email = await getProvider(tx, orgId, "messaging_email");
  await email.sendEmail({
    to: candidate.email,
    fromName: brand?.replyIdentityName ?? "Recruiting",
    fromEmail: brand?.replyIdentityEmail ?? "recruiting@example.com",
    subject: `One last step — your ${brand?.name ?? ""} quiz & intake`,
    body: `Hi ${candidate.firstName},\n\nGreat to see you at the interview! Please complete your short quiz and intake (about 5 minutes) — it's how we finish reviewing your application:\n\n${quizUrl}`,
    templateKey: "quiz_invite",
  });
  if (candidate.phone) {
    const sms = await getProvider(tx, orgId, "messaging_sms");
    await sms.sendSms({
      to: candidate.phone,
      fromNumber: "+15557204180",
      body: `${brand?.name ?? "Recruiting"}: finish your application — quick quiz here: ${quizUrl}`,
      templateKey: "quiz_invite",
    });
  }
}

/** Fetches (or lazily initializes) the single evaluation row for a candidate. */
async function ensureEvaluationRow(tx: Tx, candidateId: string) {
  const [existing] = await tx.select().from(evaluations).where(eq(evaluations.candidateId, candidateId));
  if (existing) return existing;
  const [created] = await tx.insert(evaluations).values({ candidateId, isDraft: true }).returning();
  return created;
}

/**
 * The auto-pairing rule (FR-1.7 / Section 9): a candidate becomes `evaluated`
 * ONLY when BOTH halves are present — the interviewer scorecard AND the
 * candidate quiz — and only if they actually attended. No human ever pairs
 * grade to quiz; both attach to the same evaluations row (keyed by
 * candidate_id, reached by token on the candidate side), and this function
 * fires the transition when the pair completes. This is the deletion of the
 * spreadsheet's manual name/contact matching step — the headline of the build.
 */
export async function maybeCompleteEvaluation(tx: Tx, client: PoolClient, candidateId: string): Promise<boolean> {
  const [ev] = await tx.select().from(evaluations).where(eq(evaluations.candidateId, candidateId));
  if (!ev) return false;
  if (!ev.scorecardSubmittedAt || !ev.quizSubmittedAt) return false;

  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  // Quiz submitted without attendance is flagged for human review and must NOT auto-advance (Section 7 scenario 6).
  if (!candidate || candidate.status !== "attended") return false;

  await transitionCandidate({ tx, client, candidateId, event: "evaluation_complete" });
  return true;
}

export interface ScorecardSubmission {
  grades: Record<string, number>;
  notes?: string;
  isDraft: boolean;
}

/**
 * Interviewer side. Auto-attaches by candidate_id (the roster row the host
 * tapped) — no name matching. Records the criteria version so the bundle
 * always renders against the version scored on. A non-draft submission may
 * complete the evaluation if the quiz half is already in.
 */
export async function submitScorecard(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  interviewerId: string,
  roleType: "manager" | "trainer",
  submission: ScorecardSubmission,
): Promise<void> {
  const criteria = await getActiveCriteria(tx, orgId, roleType);
  const ev = await ensureEvaluationRow(tx, candidateId);

  const values = Object.values(submission.grades);
  const total = values.reduce((a, b) => a + b, 0);
  const max = criteria ? criteria.schema.criteria.length * criteria.schema.scale.max : values.length * 5;
  const interviewGrade = { ...submission.grades, total, max };

  await tx
    .update(evaluations)
    .set({
      interviewerId,
      criteriaVersionId: criteria?.id ?? ev.criteriaVersionId,
      interviewGrade,
      writtenNotes: submission.notes ?? ev.writtenNotes,
      isDraft: submission.isDraft,
      scorecardSubmittedAt: submission.isDraft ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(evaluations.candidateId, candidateId));

  if (!submission.isDraft) {
    await maybeCompleteEvaluation(tx, client, candidateId);
  }
}

export interface QuizIntakeSubmission {
  answers: Record<string, string>;
  writtenResponse: string;
  availability: Record<string, boolean>;
  felonyDisclosure: { hasDisclosure: boolean; detail?: string } | null;
  /** true = partial save (resumable), false = final submit. */
  draft: boolean;
}

export function scoreQuiz(quiz: QuizSchema, answers: Record<string, string>): number {
  if (quiz.questions.length === 0) return 0;
  const correct = quiz.questions.filter((q) => answers[q.id] === q.correct).length;
  return Math.round((correct / quiz.questions.length) * 100);
}

/**
 * Candidate side, reached by token (no account). Auto-attaches by candidate_id.
 * Persists partial progress on `draft` saves (resumable per FR-1.6); on final
 * submit computes the quiz score, records the quiz version, flags
 * quiz_without_attendance if they never attended, and may complete the
 * evaluation if the scorecard half is already in.
 */
export async function submitQuizIntake(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  roleType: "manager" | "trainer",
  submission: QuizIntakeSubmission,
): Promise<void> {
  const quiz = await getActiveQuiz(tx, orgId, roleType);
  await ensureEvaluationRow(tx, candidateId);

  const [attendance] = await tx
    .select({ id: attendanceEvents.id })
    .from(attendanceEvents)
    .innerJoin(sessionBookings, eq(sessionBookings.id, attendanceEvents.sessionBookingId))
    .where(eq(sessionBookings.candidateId, candidateId));
  const attended = Boolean(attendance);

  if (submission.draft) {
    await tx
      .update(evaluations)
      .set({
        quizAnswers: submission.answers,
        writtenResponse: submission.writtenResponse,
        availability: submission.availability,
        updatedAt: new Date(),
      })
      .where(eq(evaluations.candidateId, candidateId));
    return;
  }

  const quizScore = quiz ? scoreQuiz(quiz.schema, submission.answers) : 0;
  await tx
    .update(evaluations)
    .set({
      quizDefinitionVersionId: quiz?.id ?? null,
      quizAnswers: submission.answers,
      quizScore: String(quizScore),
      writtenResponse: submission.writtenResponse,
      availability: submission.availability,
      felonyDisclosure: submission.felonyDisclosure,
      quizSubmittedAt: new Date(),
      quizWithoutAttendanceFlag: !attended,
      updatedAt: new Date(),
    })
    .where(eq(evaluations.candidateId, candidateId));

  await maybeCompleteEvaluation(tx, client, candidateId);
}
