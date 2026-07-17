"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { addCohortMembers, createCohort, startClass, transitionMember } from "@/lib/cohorts";
import type { TransitionEvent } from "@usapt/core";

export async function createCohortAction(formData: FormData) {
  const orientationAt = String(formData.get("orientationAt") ?? "");
  const classStartAt = String(formData.get("classStartAt") ?? "");
  if (!orientationAt || !classStartAt) return;
  await withUser((tx, _client, user) => createCohort(tx, user.orgId, { orientationAt: new Date(orientationAt), classStartAt: new Date(classStartAt) }));
  revalidatePath("/cohorts");
}

export async function addMembersAction(cohortId: string, formData: FormData) {
  const ids = formData.getAll("candidateId").map(String).filter(Boolean);
  if (!ids.length) return;
  await withUser((tx) => addCohortMembers(tx, cohortId, ids));
  revalidatePath("/cohorts");
}

export async function startClassAction(cohortId: string) {
  await withUser((tx, client, user) => startClass(tx, client, cohortId, user.userId));
  revalidatePath("/cohorts");
}

export async function transitionMemberAction(candidateId: string, event: string) {
  await withUser((tx, client, user) => transitionMember(tx, client, candidateId, event as Parameters<typeof transitionMember>[3], user.userId));
  revalidatePath("/cohorts");
}
