"use server";

import { revalidatePath } from "next/cache";
import { withUser } from "@/lib/db-context";
import { recordTmOutreach, type TmOutcome } from "@/lib/tm";

export async function recordTmOutreachAction(candidateId: string, outcome: TmOutcome) {
  await withUser((tx, client, user) => recordTmOutreach(tx, client, user.orgId, candidateId, outcome, user.userId));
  revalidatePath("/tm");
}
