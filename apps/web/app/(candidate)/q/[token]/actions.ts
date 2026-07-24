"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withServiceTransaction } from "@usapt/db";
import { candidates } from "@usapt/db/schema";
import { submitQuizIntake } from "@/lib/evaluation";

function parsePayload(formData: FormData) {
  const answers: Record<string, string> = {};
  const availability: Record<string, boolean> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("q_")) answers[k.slice(2)] = String(v);
    if (k.startsWith("avail_")) availability[k.slice(6)] = true;
  }
  const writtenResponse = String(formData.get("writtenResponse") ?? "").trim();
  // Kept RAW here. An unanswered disclosure must not collapse into "no" —
  // that would record a criminal-history attestation the candidate never made.
  // The final submit validates it; drafts never persist it (see below).
  const rawDisclosure = String(formData.get("hasDisclosure") ?? "");
  const detail = String(formData.get("disclosureDetail") ?? "").trim();
  return { answers, availability, writtenResponse, rawDisclosure, detail };
}

async function withCandidate<T>(token: string, fn: (ctx: { orgId: string; id: string; roleType: "manager" | "trainer" }, tx: Parameters<Parameters<typeof withServiceTransaction>[0]>[0], client: Parameters<Parameters<typeof withServiceTransaction>[0]>[1]) => Promise<T>): Promise<T> {
  return withServiceTransaction(async (tx, client) => {
    const [candidate] = await tx.select().from(candidates).where(eq(candidates.token, token));
    if (!candidate) throw new Error("This link is no longer valid.");
    return fn({ orgId: candidate.orgId, id: candidate.id, roleType: candidate.roleType }, tx, client);
  });
}

/**
 * Partial save for resumability (FR-1.6). Deliberately does NOT revalidate —
 * it's a background save fired between wizard steps; revalidating would reset
 * the client component's step state. The final submit is what re-renders.
 */
export async function saveQuizProgressAction(token: string, formData: FormData) {
  const { answers, availability, writtenResponse } = parsePayload(formData);
  await withCandidate(token, (c, tx, client) =>
    submitQuizIntake(tx, client, c.orgId, c.id, c.roleType, {
      answers,
      availability,
      writtenResponse,
      // Ignored on the draft path — submitQuizIntake only writes
      // felony_disclosure on a final submit, so a part-finished wizard never
      // records an answer to a question the candidate hasn't reached yet.
      felonyDisclosure: { hasDisclosure: false },
      draft: true,
    }),
  );
}

export async function submitQuizIntakeAction(token: string, formData: FormData) {
  const { answers, availability, writtenResponse, rawDisclosure, detail } = parsePayload(formData);

  // Backstop behind the required radios: only an explicit answer counts. A
  // missing field is a refusal to record, never an implied "no convictions".
  // (A "use server" module may only export async functions, so this is a plain
  // throw rather than a named error class.)
  if (rawDisclosure !== "yes" && rawDisclosure !== "no") {
    throw new Error("Please answer the background disclosure question before submitting.");
  }
  const felonyDisclosure = rawDisclosure === "yes" ? { hasDisclosure: true, detail } : { hasDisclosure: false };

  await withCandidate(token, (c, tx, client) =>
    submitQuizIntake(tx, client, c.orgId, c.id, c.roleType, { answers, availability, writtenResponse, felonyDisclosure, draft: false }),
  );
  revalidatePath(`/q/${token}`);
}
