"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { candidates } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { submitScorecard, getActiveCriteria } from "@/lib/evaluation";

export async function submitScorecardAction(candidateId: string, isDraft: boolean, formData: FormData) {
  const notes = String(formData.get("notes") ?? "").trim();

  await withUser(async (tx, client, user) => {
    const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
    if (!candidate) throw new Error("Candidate not found");
    const criteria = await getActiveCriteria(tx, user.orgId, candidate.roleType);
    const grades: Record<string, number> = {};
    for (const c of criteria?.schema.criteria ?? []) {
      const v = parseInt(String(formData.get(`crit_${c.key}`) ?? ""), 10);
      if (!Number.isNaN(v)) grades[c.key] = v;
    }
    await submitScorecard(tx, client, user.orgId, candidateId, user.userId, candidate.roleType, { grades, notes, isDraft });
  });

  revalidatePath(`/candidates/${candidateId}`);
  if (!isDraft) redirect(`/candidates/${candidateId}`);
  else revalidatePath(`/score/${candidateId}`);
}
