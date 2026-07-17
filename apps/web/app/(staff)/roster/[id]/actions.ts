"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { confirmPresent, confirmUnmatchedMatch, simulateDirectJoin } from "@/lib/roster";

export async function confirmPresentAction(sessionId: string, formData: FormData) {
  const bookingId = String(formData.get("bookingId") ?? "");
  const candidateId = String(formData.get("candidateId") ?? "");
  if (!bookingId || !candidateId) return;
  await withUser((tx, client, user) => confirmPresent(tx, client, bookingId, candidateId, user.userId));
  revalidatePath(`/roster/${sessionId}`);
}

export async function simulateDirectJoinAction(sessionId: string, formData: FormData) {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return;
  await withUser((tx, _client, user) => simulateDirectJoin(tx, user.orgId, sessionId, displayName));
  revalidatePath(`/roster/${sessionId}`);
}

export async function confirmMatchAction(sessionId: string, formData: FormData) {
  const unmatchedId = String(formData.get("unmatchedId") ?? "");
  const combined = String(formData.get("match") ?? ""); // "bookingId:candidateId"
  const [bookingId, candidateId] = combined.split(":");
  if (!unmatchedId || !bookingId || !candidateId) return;
  await withUser((tx, client, user) => confirmUnmatchedMatch(tx, client, unmatchedId, bookingId, candidateId, user.userId));
  revalidatePath(`/roster/${sessionId}`);
}
