import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { auditLog, brands, candidates, offers } from "@usapt/db/schema";
import { getProvider, transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

/** Onboarding email sequence sent alongside the offer (manager path, FR-1.8). */
const ONBOARDING_STEPS = ["welcome", "paperwork", "first_day_logistics"] as const;

/**
 * Manager offer path: one action sends the offer (text + email) plus the
 * onboarding email sequence, records the offers row + send log, advances
 * offer -> awaiting_reply, and starts reply tracking. Templated per brand.
 */
export async function sendManagerOffer(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  actorUserId: string,
): Promise<void> {
  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error("Candidate not found");
  const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));

  const email = await getProvider(tx, orgId, "messaging_email");
  const sms = await getProvider(tx, orgId, "messaging_sms");
  const fromName = brand?.replyIdentityName ?? "Recruiting";
  const fromEmail = brand?.replyIdentityEmail ?? "recruiting@example.com";
  const channelLog: unknown[] = [];

  const offerEmail = await email.sendEmail({
    to: candidate.email,
    fromName,
    fromEmail,
    subject: `Your offer to join ${brand?.name ?? "the team"} as a Manager`,
    body: `Hi ${candidate.firstName},\n\nWe're excited to offer you the Manager role at ${brand?.name ?? "our brand"}. Details and next steps are attached — reply to accept and we'll get you started.`,
    templateKey: "manager_offer",
  });
  channelLog.push({ channel: "email", kind: "offer", id: offerEmail.externalMessageId, at: offerEmail.sentAt });

  if (candidate.phone) {
    const offerSms = await sms.sendSms({
      to: candidate.phone,
      fromNumber: "+15557204180",
      body: `${brand?.name ?? "Recruiting"}: your Manager offer is in your inbox — reply to accept!`,
      templateKey: "manager_offer",
    });
    channelLog.push({ channel: "sms", kind: "offer", id: offerSms.externalMessageId, at: offerSms.sentAt });
  }

  const onboardingSent: Record<string, string> = {};
  for (const step of ONBOARDING_STEPS) {
    const r = await email.sendEmail({
      to: candidate.email,
      fromName,
      fromEmail,
      subject: `Onboarding — ${step.replace(/_/g, " ")}`,
      body: `Onboarding step: ${step}.`,
      templateKey: `onboarding_${step}`,
    });
    onboardingSent[step] = r.externalMessageId;
  }

  await tx.insert(offers).values({
    candidateId,
    channelLog,
    onboardingEmailsSent: onboardingSent,
  });

  await tx.insert(auditLog).values({ orgId, actorUserId, action: "offer_sent", resourceType: "candidate", resourceId: candidateId, metadata: {} });
  await transitionCandidate({ tx, client, candidateId, event: "offer_sent", actorUserId });
}

/** Records a candidate's out-of-band accept/decline (staff enters it). */
export async function recordOfferResponse(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  response: "accepted" | "declined",
  actorUserId: string,
): Promise<void> {
  await tx.update(offers).set({ response }).where(eq(offers.candidateId, candidateId));
  await tx.insert(auditLog).values({ orgId, actorUserId, action: `offer_${response}`, resourceType: "candidate", resourceId: candidateId, metadata: {} });
  await transitionCandidate({
    tx,
    client,
    candidateId,
    event: response === "accepted" ? "candidate_accepted" : "candidate_declined",
    actorUserId,
  });
}

/** Resends the offer + onboarding (increments resend_count). */
export async function resendOffer(tx: Tx, orgId: string, candidateId: string, actorUserId: string): Promise<void> {
  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error("Candidate not found");
  const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));
  const email = await getProvider(tx, orgId, "messaging_email");
  await email.sendEmail({
    to: candidate.email,
    fromName: brand?.replyIdentityName ?? "Recruiting",
    fromEmail: brand?.replyIdentityEmail ?? "recruiting@example.com",
    subject: `Reminder — your ${brand?.name ?? ""} offer`,
    body: `Hi ${candidate.firstName}, just following up on your offer. Let us know if you have any questions!`,
    templateKey: "manager_offer_resend",
  });
  const [existing] = await tx.select().from(offers).where(eq(offers.candidateId, candidateId));
  await tx.update(offers).set({ resendCount: (existing?.resendCount ?? 0) + 1 }).where(eq(offers.candidateId, candidateId));
  await tx.insert(auditLog).values({ orgId, actorUserId, action: "offer_resent", resourceType: "candidate", resourceId: candidateId, metadata: {} });
}

/** Retracts an offer before reply (reason required, candidate notified). */
export async function retractOffer(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  reason: string,
  actorUserId: string,
): Promise<void> {
  const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
  if (!candidate) throw new Error("Candidate not found");
  const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));

  await tx.update(offers).set({ retractedAt: new Date(), retractionReason: reason }).where(eq(offers.candidateId, candidateId));

  const email = await getProvider(tx, orgId, "messaging_email");
  await email.sendEmail({
    to: candidate.email,
    fromName: brand?.replyIdentityName ?? "Recruiting",
    fromEmail: brand?.replyIdentityEmail ?? "recruiting@example.com",
    subject: `Update on your ${brand?.name ?? ""} application`,
    body: `Hi ${candidate.firstName}, we're writing to let you know we've had to withdraw the offer. Thank you for your time and interest.`,
    templateKey: "offer_retracted",
  });

  await tx.insert(auditLog).values({ orgId, actorUserId, action: "offer_retracted", resourceType: "candidate", resourceId: candidateId, metadata: { reason } });
  await transitionCandidate({ tx, client, candidateId, event: "offer_retracted", actorUserId, reason });
}
