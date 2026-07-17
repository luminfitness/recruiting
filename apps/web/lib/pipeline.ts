import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as dbSchema from "@usapt/db/schema";
import { brands, candidates, cohortMembers, evaluationsSafe, markets } from "@usapt/db/schema";

type Tx = NodePgDatabase<typeof dbSchema>;

/** Kanban stage columns — group the ~22 lifecycle statuses into the 7 columns the tracker shows. */
export const PIPELINE_COLUMNS: { key: string; title: string; statuses: string[] }[] = [
  { key: "applied", title: "Applied", statuses: ["applied"] },
  { key: "invited", title: "Invited / no-show", statuses: ["invited", "no_show"] },
  { key: "attended", title: "Attended", statuses: ["attended"] },
  { key: "evaluated", title: "Evaluated / review", statuses: ["evaluated", "awaiting_review", "backup"] },
  { key: "offer", title: "Offer / referral", statuses: ["offer", "awaiting_reply", "referred_local", "working_interview"] },
  { key: "hired", title: "Hired / class", statuses: ["confirmed_orientation", "in_class", "graduated"] },
  { key: "closed", title: "Closed", statuses: ["not_selected", "declined", "local_declined", "mia", "never_started", "quit_after_orientation", "quit_during_class", "graduated_inactive"] },
];

export interface PipelineFilters {
  role?: "manager" | "trainer";
  brandId?: string;
  marketId?: string;
  source?: "indeed" | "linkedin" | "referral" | "other";
  cohortId?: string;
  from?: Date;
  to?: Date;
}

export interface PipelineRow {
  id: string;
  name: string;
  roleType: string;
  source: string;
  status: string;
  brandName: string | null;
  marketName: string | null;
  gradeText: string;
  quizText: string;
  appliedAt: Date;
  ageDays: number;
}

export async function getPipeline(tx: Tx, filters: PipelineFilters): Promise<PipelineRow[]> {
  const conds: SQL[] = [];
  if (filters.role) conds.push(eq(candidates.roleType, filters.role));
  if (filters.brandId) conds.push(eq(candidates.brandId, filters.brandId));
  if (filters.marketId) conds.push(eq(candidates.marketId, filters.marketId));
  if (filters.source) conds.push(eq(candidates.source, filters.source));
  if (filters.from) conds.push(gte(candidates.appliedAt, filters.from));
  if (filters.to) conds.push(lte(candidates.appliedAt, filters.to));

  if (filters.cohortId) {
    const members = await tx.select({ id: cohortMembers.candidateId }).from(cohortMembers).where(eq(cohortMembers.cohortId, filters.cohortId));
    const ids = members.map((m) => m.id);
    if (ids.length === 0) return [];
    conds.push(inArray(candidates.id, ids));
  }

  const rows = await tx
    .select({
      id: candidates.id,
      firstName: candidates.firstName,
      lastName: candidates.lastName,
      roleType: candidates.roleType,
      source: candidates.source,
      status: candidates.status,
      appliedAt: candidates.appliedAt,
      brandName: brands.name,
      marketName: markets.name,
      interviewGrade: evaluationsSafe.interviewGrade,
      quizScore: evaluationsSafe.quizScore,
    })
    .from(candidates)
    .leftJoin(brands, eq(brands.id, candidates.brandId))
    .leftJoin(markets, eq(markets.id, candidates.marketId))
    .leftJoin(evaluationsSafe, eq(evaluationsSafe.candidateId, candidates.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(candidates.appliedAt));

  const now = Date.now();
  return rows.map((r) => {
    const g = r.interviewGrade as { total?: number; max?: number } | null;
    return {
      id: r.id,
      name: `${r.firstName} ${r.lastName}`,
      roleType: r.roleType,
      source: r.source,
      status: r.status,
      brandName: r.brandName,
      marketName: r.marketName,
      gradeText: g?.total != null ? `${g.total}/${g.max}` : "—",
      quizText: r.quizScore != null ? `${r.quizScore}%` : "—",
      appliedAt: r.appliedAt,
      ageDays: Math.floor((now - r.appliedAt.getTime()) / 86_400_000),
    };
  });
}

/** CSV of the filtered pipeline. Never includes felony disclosure (not a candidate/safe-view field). */
export function pipelineToCsv(rows: PipelineRow[]): string {
  const header = ["Name", "Role", "Brand", "Market", "Source", "Status", "Grade", "Quiz", "Applied", "Age (days)"];
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [r.name, r.roleType, r.brandName ?? "", r.marketName ?? "", r.source, r.status, r.gradeText, r.quizText, r.appliedAt.toISOString().slice(0, 10), String(r.ageDays)]
      .map(esc)
      .join(","),
  );
  return [header.map(esc).join(","), ...lines].join("\n");
}
