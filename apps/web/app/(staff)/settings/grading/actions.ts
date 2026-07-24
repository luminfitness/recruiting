"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withRequestContext } from "@usapt/db";
import { auditLog, thresholdSettings } from "@usapt/db/schema";
import { requireUser, hasRole } from "@/lib/auth";

function pct(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(String(raw ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Updates the org's decision-suggestion policy. Admin-only, like the rest of
 * org configuration. Changing this only changes what the queue *suggests* —
 * it never revisits decisions already made, and never moves a candidate.
 */
export async function saveGradingPolicyAction(formData: FormData) {
  const user = await requireUser();
  if (!hasRole(user, "admin")) throw new Error("Only admins may change the grading policy");

  const minPassPct = pct(formData.get("minPassPct"), 70);
  const quizPassScore = pct(formData.get("quizPassScore"), 70);
  // A floor above the pass mark would make the "backup" band empty and the
  // policy incoherent, so clamp it rather than storing something unreadable.
  const backupFloorPct = Math.min(pct(formData.get("backupFloorPct"), 60), minPassPct);

  await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: "*" }, async (tx) => {
    const [existing] = await tx.select().from(thresholdSettings).where(eq(thresholdSettings.orgId, user.orgId));
    if (existing) {
      await tx
        .update(thresholdSettings)
        .set({ minPassPct, backupFloorPct, quizPassScore })
        .where(eq(thresholdSettings.orgId, user.orgId));
    } else {
      await tx.insert(thresholdSettings).values({ orgId: user.orgId, minPassPct, backupFloorPct, quizPassScore });
    }
    await tx.insert(auditLog).values({
      orgId: user.orgId,
      actorUserId: user.userId,
      action: "grading_policy_updated",
      resourceType: "org",
      resourceId: user.orgId,
      metadata: { minPassPct, backupFloorPct, quizPassScore },
    });
  });

  revalidatePath("/settings/grading");
  revalidatePath("/decisions");
}
