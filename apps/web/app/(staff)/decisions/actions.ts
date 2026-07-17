"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { withUser } from "@/lib/db-context";
import { bulkNotSelect, recordDecision, revealDisclosure, type Disposition } from "@/lib/decisions";

export async function recordDecisionAction(candidateId: string, outcome: Disposition, formData: FormData) {
  const notes = String(formData.get("notes") ?? "").trim() || null;
  await withUser((tx, client, user) => recordDecision(tx, client, user.orgId, candidateId, user.userId, outcome, notes));
  redirect("/decisions");
}

export async function bulkNotSelectAction(formData: FormData) {
  const candidateIds = formData.getAll("candidateId").map(String).filter(Boolean);
  const reason = String(formData.get("reason") ?? "").trim();
  if (candidateIds.length === 0 || !reason) return;
  await withUser((tx, client, user) => bulkNotSelect(tx, client, user.orgId, candidateIds, user.userId, reason));
  revalidatePath("/decisions");
}

export interface RevealState {
  revealed: boolean;
  detail?: string;
  hasDisclosure?: boolean;
}

export async function revealDisclosureAction(candidateId: string, _prev: RevealState, _formData: FormData): Promise<RevealState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for") ?? null;
  const result = await withUser((tx, _client, user) => revealDisclosure(tx, user.orgId, candidateId, user.userId, ip));
  return { revealed: true, detail: result?.detail, hasDisclosure: Boolean(result?.hasDisclosure) };
}
