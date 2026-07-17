import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import type { PoolClient } from "pg";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { candidates, classCohorts, cohortMembers, jobPostings } from "@usapt/db/schema";

type Tx = NodePgDatabase<typeof dbSchema>;

export interface AnalyticsFilters {
  role?: "manager" | "trainer";
  brandId?: string;
  marketId?: string;
  source?: "indeed" | "linkedin" | "referral" | "other";
  from?: Date;
  to?: Date;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Conversion from the PREVIOUS stage (null for the first). */
  conversionFromPrev: number | null;
  /** Allocated cost per candidate at this stage (approximate). */
  costPer: number | null;
  /** True if this is the tightest gate (largest proportional drop). */
  tightestGate: boolean;
}

export interface FunnelResult {
  stages: FunnelStage[];
  totalSpend: number;
  spendIsAllocated: boolean;
}

/**
 * Live funnel (FR-1.11): applicants → booked → attended → completed → offers →
 * acceptances → starts → graduates. "Reached a stage" is computed from the
 * append-only candidate_status_history (max stage rank ever reached), so a
 * candidate who later went terminal still counts toward every stage they
 * actually passed through. Cost-per-stage divides allocated posting spend by
 * the stage count and is labeled approximate wherever spend was allocated.
 */
export async function computeFunnel(tx: Tx, client: PoolClient, filters: AnalyticsFilters): Promise<FunnelResult> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (clause: string, val: unknown) => {
    params.push(val);
    where.push(clause.replace("$?", `$${params.length}`));
  };
  if (filters.role) add("c.role_type = $?", filters.role);
  if (filters.brandId) add("c.brand_id = $?", filters.brandId);
  if (filters.marketId) add("c.market_id = $?", filters.marketId);
  if (filters.source) add("c.source = $?", filters.source);
  if (filters.from) add("c.applied_at >= $?", filters.from);
  if (filters.to) add("c.applied_at <= $?", filters.to);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { rows } = await client.query<{
    applicants: string; booked: string; attended: string; completed: string; offers: string; acceptances: string; starts: string; graduates: string;
  }>(
    `WITH ranked AS (
       SELECT c.id,
         MAX(CASE h.to_status
           WHEN 'applied' THEN 1 WHEN 'invited' THEN 2 WHEN 'no_show' THEN 2
           WHEN 'attended' THEN 3
           WHEN 'evaluated' THEN 4 WHEN 'backup' THEN 4 WHEN 'awaiting_review' THEN 4
           WHEN 'offer' THEN 5 WHEN 'awaiting_reply' THEN 5 WHEN 'referred_local' THEN 5 WHEN 'working_interview' THEN 5
           WHEN 'confirmed_orientation' THEN 6
           WHEN 'in_class' THEN 7
           WHEN 'graduated' THEN 8 WHEN 'graduated_inactive' THEN 8
           ELSE 0 END) AS rank,
         EXISTS (SELECT 1 FROM session_bookings sb WHERE sb.candidate_id = c.id) AS booked
       FROM candidates c
       LEFT JOIN candidate_status_history h ON h.candidate_id = c.id
       ${whereSql}
       GROUP BY c.id
     )
     SELECT
       count(*) AS applicants,
       count(*) FILTER (WHERE booked) AS booked,
       count(*) FILTER (WHERE rank >= 3) AS attended,
       count(*) FILTER (WHERE rank >= 4) AS completed,
       count(*) FILTER (WHERE rank >= 5) AS offers,
       count(*) FILTER (WHERE rank >= 6) AS acceptances,
       count(*) FILTER (WHERE rank >= 7) AS starts,
       count(*) FILTER (WHERE rank >= 8) AS graduates
     FROM ranked`,
    params,
  );
  const r = rows[0];
  const counts: { key: string; label: string; count: number }[] = [
    { key: "applicants", label: "Applicants", count: Number(r.applicants) },
    { key: "booked", label: "Booked", count: Number(r.booked) },
    { key: "attended", label: "Attended", count: Number(r.attended) },
    { key: "completed", label: "Completed", count: Number(r.completed) },
    { key: "offers", label: "Offers", count: Number(r.offers) },
    { key: "acceptances", label: "Acceptances", count: Number(r.acceptances) },
    { key: "starts", label: "Class starts", count: Number(r.starts) },
    { key: "graduates", label: "Graduates", count: Number(r.graduates) },
  ];

  // Allocated spend across matching postings (brand/market/role/date-aware).
  const spendConds: SQL[] = [];
  if (filters.role) spendConds.push(eq(jobPostings.roleType, filters.role));
  if (filters.brandId) spendConds.push(eq(jobPostings.brandId, filters.brandId));
  if (filters.marketId) spendConds.push(eq(jobPostings.marketId, filters.marketId));
  if (filters.from) spendConds.push(gte(jobPostings.scheduledPostAt, filters.from));
  if (filters.to) spendConds.push(lte(jobPostings.scheduledPostAt, filters.to));
  const [{ total }] = await tx
    .select({ total: sql<string>`coalesce(sum(${jobPostings.spend}), 0)` })
    .from(jobPostings)
    .where(spendConds.length ? and(...spendConds) : undefined);
  const totalSpend = Number(total);

  // Tightest gate = largest proportional drop between consecutive stages.
  let worstIdx = -1;
  let worstDrop = -1;
  for (let i = 1; i < counts.length; i++) {
    const prev = counts[i - 1].count;
    if (prev === 0) continue;
    const drop = 1 - counts[i].count / prev;
    if (drop > worstDrop) {
      worstDrop = drop;
      worstIdx = i;
    }
  }

  const stages: FunnelStage[] = counts.map((c, i) => ({
    key: c.key,
    label: c.label,
    count: c.count,
    conversionFromPrev: i === 0 || counts[i - 1].count === 0 ? null : c.count / counts[i - 1].count,
    costPer: totalSpend > 0 && c.count > 0 ? totalSpend / c.count : null,
    tightestGate: i === worstIdx && worstDrop > 0,
  }));

  return { stages, totalSpend, spendIsAllocated: totalSpend > 0 };
}

export interface ClassComparisonRow {
  cohortId: string;
  label: string;
  started: number;
  graduated: number;
  rate: number | null;
}

/** Class-by-class started vs graduated (FR-1.11). */
export async function classComparison(tx: Tx, orgId: string): Promise<ClassComparisonRow[]> {
  const cohorts = await tx.select().from(classCohorts).where(eq(classCohorts.orgId, orgId));
  const out: ClassComparisonRow[] = [];
  for (const cohort of cohorts) {
    const members = await tx
      .select({ status: candidates.status })
      .from(cohortMembers)
      .innerJoin(candidates, eq(candidates.id, cohortMembers.candidateId))
      .where(eq(cohortMembers.cohortId, cohort.id));
    const started = members.filter((m) => ["in_class", "graduated", "graduated_inactive", "quit_during_class"].includes(m.status)).length;
    const graduated = members.filter((m) => ["graduated", "graduated_inactive"].includes(m.status)).length;
    out.push({
      cohortId: cohort.id,
      label: new Date(cohort.classStartAt).toLocaleDateString(),
      started,
      graduated,
      rate: started > 0 ? graduated / started : null,
    });
  }
  return out;
}
