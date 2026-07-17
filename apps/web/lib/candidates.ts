import { and, eq, desc } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { brands, candidates, candidateStatusHistory } from "@usapt/db/schema";
import {
  generateCandidateToken,
  getProvider,
  isActiveStatus,
  transitionCandidate,
  type CandidateStatus,
} from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

export interface NewCandidateInput {
  brandId: string;
  marketId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roleType: "manager" | "trainer";
  source: "indeed" | "linkedin" | "referral" | "other";
  postingId?: string;
}

export interface CreateCandidateResult {
  candidateId: string;
  token: string;
  isDuplicate: boolean;
}

/**
 * The front door of the identity thread (FR-1.2). All three ingestion paths
 * (Indeed API, email parser, manual add) converge here. Issues the token ONCE,
 * writes the initial `applied` history row, and — for a genuinely new,
 * non-duplicate candidate — immediately sends the invitation (transitioning
 * applied -> invited). A duplicate ACTIVE application (same email in the org,
 * not in an inactive status) merges into the existing record and does NOT get
 * a second token or a second invite, per the FRD Section 6 edge case.
 */
export async function createCandidate(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  input: NewCandidateInput,
  actorUserId?: string,
): Promise<CreateCandidateResult> {
  const email = input.email.trim().toLowerCase();

  const existing = await tx
    .select()
    .from(candidates)
    .where(and(eq(candidates.orgId, orgId), eq(candidates.email, email)))
    .orderBy(desc(candidates.appliedAt));

  const activeDuplicate = existing.find((c) => isActiveStatus(c.status as CandidateStatus));
  if (activeDuplicate) {
    return { candidateId: activeDuplicate.id, token: activeDuplicate.token, isDuplicate: true };
  }

  const token = generateCandidateToken();
  const [created] = await tx
    .insert(candidates)
    .values({
      orgId,
      brandId: input.brandId,
      marketId: input.marketId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      phone: input.phone?.trim() || null,
      roleType: input.roleType,
      source: input.source,
      token,
      status: "applied",
      postingId: input.postingId ?? null,
    })
    .returning();

  // Initial history row — the insert itself is the `applied` event (no prior status).
  await tx.insert(candidateStatusHistory).values({
    candidateId: created.id,
    fromStatus: null,
    toStatus: "applied",
    event: "applied",
    actorUserId: actorUserId ?? null,
  });

  await sendInvitation(tx, client, orgId, created.id, actorUserId);

  return { candidateId: created.id, token, isDuplicate: false };
}

/**
 * Sends the interview invitation (email + SMS) carrying the candidate's
 * personal booking link, then advances applied -> invited. The link IS the
 * identity thread reaching the candidate — booking/attendance/quiz all hang
 * off /t/{token}. Sending is via the org's configured MessagingProvider
 * (Mock by default, which logs to messages_log).
 */
export async function sendInvitation(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  actorUserId?: string,
): Promise<void> {
  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);
  const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const bookingUrl = `${baseUrl}/t/${candidate.token}`;
  const fromName = brand?.replyIdentityName ?? "Recruiting";
  const fromEmail = brand?.replyIdentityEmail ?? "recruiting@example.com";
  const roleLabel = candidate.roleType === "manager" ? "manager" : "personal trainer";

  const email = await getProvider(tx, orgId, "messaging_email");
  await email.sendEmail({
    to: candidate.email,
    fromName,
    fromEmail,
    subject: `You're invited to a ${brand?.name ?? ""} group interview`,
    body: `Hi ${candidate.firstName},\n\nThanks for applying to be a ${roleLabel} at ${brand?.name ?? "our brand"}. Book your virtual group interview here — no account needed:\n\n${bookingUrl}\n\nNeed help scheduling? Reply to this message.`,
    templateKey: "interview_invitation",
  });

  if (candidate.phone) {
    const sms = await getProvider(tx, orgId, "messaging_sms");
    await sms.sendSms({
      to: candidate.phone,
      fromNumber: "+15557204180",
      body: `${brand?.name ?? "Recruiting"}: book your interview — ${bookingUrl}`,
      templateKey: "interview_invitation",
    });
  }

  await transitionCandidate({
    tx,
    client,
    candidateId,
    event: "invitation_sent",
    actorUserId,
  });
}
