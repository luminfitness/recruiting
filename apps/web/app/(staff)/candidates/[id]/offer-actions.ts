"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { recordOfferResponse, resendOffer, retractOffer } from "@/lib/offers";

export async function recordOfferResponseAction(candidateId: string, response: "accepted" | "declined") {
  await withUser((tx, client, user) => recordOfferResponse(tx, client, user.orgId, candidateId, response, user.userId));
  revalidatePath(`/candidates/${candidateId}`);
}

export async function resendOfferAction(candidateId: string) {
  await withUser((tx, _client, user) => resendOffer(tx, user.orgId, candidateId, user.userId));
  revalidatePath(`/candidates/${candidateId}`);
}

export async function retractOfferAction(candidateId: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;
  await withUser((tx, client, user) => retractOffer(tx, client, user.orgId, candidateId, reason, user.userId));
  revalidatePath(`/candidates/${candidateId}`);
}
