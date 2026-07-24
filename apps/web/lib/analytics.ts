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

export interface TrendPoint {
  /** Monday 00:00 of the ISO week. */
  weekStart: Date;
  offers: number;
  starts: number;
}

/**
 * Weekly offers and class starts over the last N weeks, read off the
 * append-only candidate_status_history. Counts DISTINCT candidates per week so
 * a re-offer doesn't double-count. Empty weeks are filled in so the chart has a
 * continuous x-axis. Reads through the RLS-scoped client, same as computeFunnel.
 */
export async function weeklyTrend(
  client: PoolClient,
  filters: AnalyticsFilters,
  weeks = 8,
): Promise<TrendPoint[]> {
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

  // Anchor to the start of the ISO week `weeks - 1` back, so we always return
  // exactly `weeks` buckets ending with the current (partial) week.
  const firstWeek = new Date();
  firstWeek.setUTCHours(0, 0, 0, 0);
  const dow = (firstWeek.getUTCDay() + 6) % 7; // Monday = 0
  firstWeek.setUTCDate(firstWeek.getUTCDate() - dow - (weeks - 1) * 7);
  add("h.created_at >= $?", firstWeek);

  // Bucket in UTC and key on a plain YYYY-MM-DD string. `date_trunc('week', …)`
  // on a timestamptz truncates in the DB *session* timezone, which would return
  // e.g. 05:00Z for a UTC-5 session and never match a midnight-UTC key — so
  // shift to UTC explicitly and compare as text, immune to session tz and to
  // how the driver parses timestamps back into Date objects.
  const { rows } = await client.query<{ wk: string; offers: string; starts: string }>(
    `SELECT to_char(date_trunc('week', h.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS wk,
            count(DISTINCT h.candidate_id) FILTER (WHERE h.to_status = 'offer')    AS offers,
            count(DISTINCT h.candidate_id) FILTER (WHERE h.to_status = 'in_class') AS starts
       FROM candidate_status_history h
       JOIN candidates c ON c.id = h.candidate_id
      WHERE ${where.join(" AND ")}
      GROUP BY 1
      ORDER BY 1`,
    params,
  );

  const byWeek = new Map(rows.map((r) => [r.wk, r]));
  const out: TrendPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const ws = new Date(firstWeek);
    ws.setUTCDate(ws.getUTCDate() + i * 7);
    const hit = byWeek.get(ws.toISOString().slice(0, 10));
    out.push({ weekStart: ws, offers: Number(hit?.offers ?? 0), starts: Number(hit?.starts ?? 0) });
  }
  return out;
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
