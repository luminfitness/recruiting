"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { recordLocalOutcome, scheduleWorkingInterview, type LocalOutcome } from "@/lib/referrals";

export async function scheduleWorkingInterviewAction(referralId: string, formData: FormData) {
  const raw = String(formData.get("scheduledAt") ?? "");
  if (!raw) return;
  await withUser((tx, client, user) => scheduleWorkingInterview(tx, client, user.orgId, referralId, new Date(raw), user.userId));
  revalidatePath("/local");
}

export async function recordLocalOutcomeAction(referralId: string, outcome: LocalOutcome, formData: FormData) {
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await withUser((tx, client, user) => recordLocalOutcome(tx, client, user.orgId, referralId, outcome, notes, user.userId));
  revalidatePath("/local");
}
