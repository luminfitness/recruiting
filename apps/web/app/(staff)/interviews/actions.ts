"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { createSession } from "@/lib/sessions";

export async function createSessionAction(formData: FormData) {
  const roleType = String(formData.get("roleType") ?? "trainer") as "manager" | "trainer";
  const marketId = String(formData.get("marketId") ?? "");
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "");
  const capacity = parseInt(String(formData.get("capacity") ?? "12"), 10);
  if (!scheduledAtRaw || Number.isNaN(capacity)) return;

  const scheduledAt = new Date(scheduledAtRaw);

  await withUser((tx, _client, user) =>
    createSession(tx, user.orgId, {
      roleType,
      marketId: marketId || undefined,
      scheduledAt,
      capacity,
      hostUserId: user.userId,
    }),
  );

  revalidatePath("/sessions");
}
