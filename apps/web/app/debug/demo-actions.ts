"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { brands, markets } from "@usapt/db/schema";
import { requireUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { withUser } from "@/lib/db-context";
import { createCandidate } from "@/lib/candidates";
import { createSession, listBookableSessions } from "@/lib/sessions";
import { DEMO_COOKIE, DEMO_STEPS, stepHref, getDemoSession, type DemoSession } from "@/lib/demo-walkthrough";

/** The walkthrough follows the manager path — the cleanest end-to-end spine. */
const ROLE = "manager" as const;

const FIRST_NAMES = ["Jordan", "Riley", "Avery", "Casey", "Rowan", "Quinn"];
const LAST_NAMES = ["Sinclair", "Okafor", "Delgado", "Whitfield", "Barlow", "Nakamura"];

async function writeSession(session: DemoSession) {
  const jar = await cookies();
  jar.set(DEMO_COOKIE, JSON.stringify(session), { path: "/", maxAge: 60 * 60 * 8, sameSite: "lax" });
}

/**
 * Starts a guided demo: creates a real prospect at `applied` and drops the
 * presenter on step 1. A fresh email each run so repeat demos never collide
 * with the dedupe rule (an active duplicate would return the old candidate).
 */
export async function startDemoAction() {
  if (!isDemoMode()) throw new Error("Not available");
  const user = await requireUser();

  const stamp = Date.now().toString(36);
  const seed = Math.floor(Date.now() / 1000);
  const firstName = FIRST_NAMES[seed % FIRST_NAMES.length];
  // Offset so the two lists never land on the same word (no "Avery Avery").
  const lastName = LAST_NAMES[(seed + 3) % LAST_NAMES.length];

  const created = await withUser(async (tx, client, u) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.orgId, u.orgId));
    if (!brand) throw new Error("No brand configured — seed the org first");
    const [market] = await tx.select().from(markets).where(eq(markets.brandId, brand.id));
    if (!market) throw new Error("No market configured — seed the org first");

    const created = await createCandidate(
      tx,
      client,
      u.orgId,
      {
        brandId: brand.id,
        marketId: market.id,
        firstName,
        lastName,
        email: `demo+${stamp}@usapt.example`,
        phone: "(470) 555-0142",
        roleType: ROLE,
        source: "indeed",
      },
      user.userId,
    );

    // The booking step is a dead end if there's nothing to book. Guarantee an
    // upcoming session for this role/market so the walkthrough always has a
    // slot to pick — the demo can't be allowed to stall in front of a client.
    const bookable = await listBookableSessions(tx, {
      id: created.candidateId,
      orgId: u.orgId,
      roleType: ROLE,
      marketId: market.id,
    });
    if (bookable.length === 0) {
      const scheduledAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // in two days
      scheduledAt.setMinutes(0, 0, 0);
      await createSession(tx, u.orgId, {
        roleType: ROLE,
        marketId: market.id,
        scheduledAt,
        capacity: 12,
        hostUserId: user.userId,
      });
    }

    return created;
  });

  await writeSession({ candidateId: created.candidateId, token: created.token, name: `${firstName} ${lastName}`, step: 0 });
  redirect(DEMO_STEPS[0].href);
}

/** Moves to a step and navigates to the screen that step is about. */
export async function setDemoStepAction(step: number) {
  const session = await getDemoSession();
  if (!session) return;
  const next = Math.min(Math.max(step, 0), DEMO_STEPS.length - 1);
  const updated = { ...session, step: next };
  await writeSession(updated);

  const target = DEMO_STEPS[next];
  // Candidate-facing steps open in a new tab from the guide itself, so we stay
  // on the operator screen the presenter is already showing.
  if (!target.external) redirect(stepHref(target, updated));
  revalidatePath("/", "layout");
}

export async function endDemoAction() {
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  redirect("/debug");
}
