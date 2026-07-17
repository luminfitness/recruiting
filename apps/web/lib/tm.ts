import { desc, eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { auditLog, brands, candidates, markets, tmOutreach } from "@usapt/db/schema";
import { getProvider, transitionCandidate } from "@usapt/core";

type Tx = NodePgDatabase<typeof dbSchema>;

export interface NoShowEntry {
  candidateId: string;
  name: string;
  email: string;
  phone: string | null;
  roleType: string;
  marketName: string | null;
  lastOutreach: string | null;
}

/**
 * The territory manager's no-show outreach queue — candidates in `no_show`,
 * market-scoped by RLS to the TM's territory. Shows contact info for direct
 * outreach and the last logged outreach outcome.
 */
export async function listNoShowQueue(tx: Tx): Promise<NoShowEntry[]> {
  const rows = await tx
    .select({
      candidateId: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      email: candidates.email,
      phone: candidates.phone,
      roleType: candidates.roleType,
      marketName: markets.name,
    })
    .from(candidates)
    .leftJoin(markets, eq(markets.id, candidates.marketId))
    .where(eq(candidates.status, "no_show"))
    .orderBy(desc(candidates.updatedAt));

  const result: NoShowEntry[] = [];
  for (const r of rows) {
    const [last] = await tx.select().from(tmOutreach).where(eq(tmOutreach.candidateId, r.candidateId)).orderBy(desc(tmOutreach.createdAt));
    result.push({
      candidateId: r.candidateId,
      name: `${r.firstName} ${r.lastName}`,
      email: r.email,
      phone: r.phone,
      roleType: r.roleType,
      marketName: r.marketName,
      lastOutreach: last?.outcome ?? null,
    });
  }
  return result;
}

export type TmOutcome = "rebooked" | "unresponsive";

/**
 * Records a TM outreach outcome — the outcome IS the status update (FR-1.3).
 * `rebooked` recovers the candidate to `invited` and re-sends their booking
 * link; `unresponsive` closes them out (`not_selected`, reason required by the
 * state machine). Both are one tap and audit-logged.
 */
export async function recordTmOutreach(
  tx: Tx,
  client: PoolClient,
  orgId: string,
  candidateId: string,
  outcome: TmOutcome,
  actorUserId: string,
): Promise<void> {
  await tx.insert(tmOutreach).values({ candidateId, actorUserId, outcome });
  await tx.insert(auditLog).values({ orgId, actorUserId, action: `tm_${outcome}`, resourceType: "candidate", resourceId: candidateId, metadata: {} });

  if (outcome === "rebooked") {
    await transitionCandidate({ tx, client, candidateId, event: "rebooked", actorUserId });
    // Re-send the booking link so they can pick a new session.
    const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
    if (candidate) {
      const [brand] = await tx.select().from(brands).where(eq(brands.id, candidate.brandId));
      const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
      const email = await getProvider(tx, orgId, "messaging_email");
      await email.sendEmail({
        to: candidate.email,
        fromName: brand?.replyIdentityName ?? "Recruiting",
        fromEmail: brand?.replyIdentityEmail ?? "recruiting@example.com",
        subject: `Let's get you rebooked — ${brand?.name ?? ""} interview`,
        body: `Hi ${candidate.firstName}, no problem missing the last session — pick a new time here: ${baseUrl}/t/${candidate.token}`,
        templateKey: "tm_rebook",
      });
    }
  } else {
    await transitionCandidate({ tx, client, candidateId, event: "stale_closeout", actorUserId, reason: "Unresponsive to TM outreach" });
  }
}
