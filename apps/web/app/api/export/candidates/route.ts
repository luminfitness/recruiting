import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { withRequestContext } from "@usapt/db";
import { getPipeline, pipelineToCsv, type PipelineFilters } from "@/lib/pipeline";

/**
 * CSV export of the (filtered) pipeline, scoped to the caller's org/market via
 * RLS. Felony disclosure is never included — the export reads candidate fields
 * and the evaluations_safe view only (FRD: sensitive fields never in exports).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const filters: PipelineFilters = {
    role: sp.get("role") === "manager" || sp.get("role") === "trainer" ? (sp.get("role") as "manager" | "trainer") : undefined,
    brandId: sp.get("brand") || undefined,
    marketId: sp.get("market") || undefined,
    source: (["indeed", "linkedin", "referral", "other"].includes(sp.get("source") ?? "") ? sp.get("source") : undefined) as PipelineFilters["source"],
    cohortId: sp.get("cohort") || undefined,
  };

  const rows = await withRequestContext({ orgId: user.orgId, userId: user.userId, marketIds: user.marketIds }, (tx) => getPipeline(tx, filters));
  const csv = pipelineToCsv(rows);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pipeline-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
