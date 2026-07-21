"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { createPosting, endPosting, markPosted, setPostingSpend, type Channel, type RoleType } from "@/lib/cadence";

export async function createManualPostingAction(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  const marketId = String(formData.get("marketId") ?? "") || null;
  const roleType = String(formData.get("roleType") ?? "trainer") as RoleType;
  const channel = String(formData.get("channel") ?? "indeed") as Channel;
  const spend = String(formData.get("spend") ?? "").trim() || null;
  if (!brandId) return;
  await withUser((tx, _client, user) =>
    createPosting(tx, { orgId: user.orgId, brandId, marketId, roleType, channel, scheduledPostAt: new Date(), spend }),
  );
  revalidatePath("/sourcing");
}

export async function markPostedAction(postingId: string) {
  await withUser((tx, _client, user) => markPosted(tx, user.orgId, postingId, user.userId));
  revalidatePath("/sourcing");
}

export async function endPostingAction(postingId: string) {
  await withUser((tx, _client, user) => endPosting(tx, user.orgId, postingId, user.userId));
  revalidatePath("/sourcing");
}

export async function setSpendAction(postingId: string, formData: FormData) {
  const spend = String(formData.get("spend") ?? "").trim() || null;
  await withUser((tx) => setPostingSpend(tx, postingId, spend));
  revalidatePath("/sourcing");
}
