"use server";

import { redirect } from "next/navigation";
import { withUser } from "@/lib/db-context";
import { createCandidate } from "@/lib/candidates";

export async function addCandidateAction(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const marketId = String(formData.get("marketId") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const roleType = String(formData.get("roleType") ?? "") as "manager" | "trainer";
  const source = String(formData.get("source") ?? "other") as "indeed" | "linkedin" | "referral" | "other";

  if (!brandId || !marketId || !firstName || !lastName || !email || !roleType) {
    return;
  }

  const result = await withUser((tx, client, user) =>
    createCandidate(tx, client, user.orgId, { brandId, marketId, firstName, lastName, email, phone, roleType, source }, user.userId),
  );

  redirect(`/candidates/${result.candidateId}`);
}
