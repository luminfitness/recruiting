"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withServiceTransaction } from "@usapt/db";
import { candidates } from "@usapt/db/schema";
import { bookSession, BookingLockedError, SessionFullError } from "@/lib/sessions";

export interface BookingActionState {
  status: "idle" | "error";
  message: string;
}

/**
 * Candidate self-service booking. Token-authorized (no account) — resolves the
 * candidate by token via the service transaction, then books/rebooks. Errors
 * (full session, inside lockout) surface to the candidate; success re-renders
 * the page into the confirmed state.
 */
export async function bookSessionAction(
  token: string,
  _prev: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return { status: "error", message: "Pick a session first." };

  try {
    await withServiceTransaction(async (tx, client) => {
      const [candidate] = await tx.select().from(candidates).where(eq(candidates.token, token));
      if (!candidate) throw new Error("This link is no longer valid.");
      await bookSession(tx, client, { id: candidate.id, orgId: candidate.orgId, status: candidate.status }, sessionId);
    });
  } catch (err) {
    if (err instanceof SessionFullError) {
      return { status: "error", message: "That session just filled up — please pick another." };
    }
    if (err instanceof BookingLockedError) {
      return { status: "error", message: "That session is starting too soon to book — please pick a later one." };
    }
    return { status: "error", message: (err as Error).message || "Something went wrong. Please try again." };
  }

  revalidatePath(`/t/${token}`);
  return { status: "idle", message: "" };
}
