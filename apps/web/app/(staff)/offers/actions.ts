"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { resendOffer } from "@/lib/offers";

/** Nudge a manager candidate whose offer hasn't had a reply (resend offer + onboarding). */
export async function nudgeOfferAction(candidateId: string) {
  await withUser((tx, _client, user) => resendOffer(tx, user.orgId, candidateId, user.userId));
  revalidatePath("/offers");
}
