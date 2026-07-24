import Link from "next/link";
import { eq } from "drizzle-orm";
import { brands, classCohorts, markets } from "@usapt/db/schema";
import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";
import { getPipeline, PIPELINE_COLUMNS, type PipelineFilters } from "@/lib/pipeline";

type SP = Record<string, string | undefined>;

function filtersFrom(sp: SP): PipelineFilters {
  return {
    role: sp.role === "manager" || sp.role === "trainer" ? sp.role : undefined,
    brandId: sp.brand || undefined,
    marketId: sp.market || undefined,
    source: (["indeed", "linkedin", "referral", "other"].includes(sp.source ?? "") ? sp.source : undefined) as PipelineFilters["source"],
    cohortId: sp.cohort || undefined,
    q: sp.q || undefined,
  };
}

function qs(sp: SP, patch: SP): string {
  const merged = { ...sp, ...patch };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
  return `?${p.toString()}`;
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view = sp.view === "table" ? "table" : "kanban";
  const filters = filtersFrom(sp);

  const { rows, brandRows, marketRows, cohorts } = await withUser(async (tx, _client, user) => {
    const rows = await getPipeline(tx, filters);
    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, user.orgId));
    const brandIds = new Set(brandRows.map((b) => b.id));
    const marketRows = (await tx.select().from(markets)).filter((m) => brandIds.has(m.brandId));
    const cohorts = await tx.select().from(classCohorts).where(eq(classCohorts.orgId, user.orgId));
    return { rows, brandRows, marketRows, cohorts };
  });

  const byColumn = PIPELINE_COLUMNS.map((col) => ({ ...col, cards: rows.filter((r) => col.statuses.includes(r.status)) }));

  const chip = (active: boolean): React.CSSProperties => ({
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
    padding: "5px 11px",
    border: "1px solid var(--usapt-border-strong)",
    background: active ? "var(--usapt-brand-blue)" : "var(--usapt-surface-raised)",
    color: active ? "#fff" : "var(--usapt-ink)",
    textDecoration: "none",
  });
  const selStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 12, border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "30px 40px 16px", borderBottom: "1px solid var(--usapt-border)" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
              Insight · master tracker
            </div>
            <h1 style={{ fontSize: 30, margin: "4px 0 0" }}>Pipeline</h1>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", border: "1px solid var(--usapt-border-strong)" }}>
              <Link href={qs(sp, { view: "kanban" })} style={{ ...chip(view === "kanban"), border: 0 }}>
                Kanban
              </Link>
              <Link href={qs(sp, { view: "table" })} style={{ ...chip(view === "table"), border: 0 }}>
                Table
              </Link>
            </div>
            <Link href={`/api/export/candidates${qs(sp, {})}`} style={{ ...chip(false), whiteSpace: "nowrap" }}>
              Export CSV
            </Link>
            <Link href="/pipeline/import" style={{ ...chip(false), whiteSpace: "nowrap" }}>
              Import…
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-text-muted)" }}>Role</span>
            <Link href={qs(sp, { role: undefined })} style={chip(!filters.role)}>All</Link>
            <Link href={qs(sp, { role: "manager" })} style={chip(filters.role === "manager")}>Manager</Link>
            <Link href={qs(sp, { role: "trainer" })} style={chip(filters.role === "trainer")}>Trainer</Link>
          </div>
          <form style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="hidden" name="view" value={view} />
            <input
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="Search name, email, phone…"
              aria-label="Search candidates"
              style={{ ...selStyle, width: 210 }}
            />
            <select name="brand" defaultValue={filters.brandId ?? ""} style={selStyle}>
              <option value="">All brands</option>
              {brandRows.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <select name="market" defaultValue={filters.marketId ?? ""} style={selStyle}>
              <option value="">All markets</option>
              {marketRows.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <select name="source" defaultValue={filters.source ?? ""} style={selStyle}>
              <option value="">All sources</option>
              {["indeed", "linkedin", "referral", "other"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select name="cohort" defaultValue={filters.cohortId ?? ""} style={selStyle}>
              <option value="">All cohorts</option>
              {cohorts.map((c) => (
                <option key={c.id} value={c.id}>{new Date(c.classStartAt).toLocaleDateString()}</option>
              ))}
            </select>
            <button type="submit" style={{ ...chip(false), cursor: "pointer" }}>Apply</button>
          </form>
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--usapt-text-muted)", fontVariantNumeric: "tabular-nums" }}>{rows.length} shown</div>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="usapt-scroll" style={{ flex: 1, overflow: "auto", padding: "24px 40px 34px" }}>
          <div style={{ display: "flex", gap: 2, alignItems: "flex-start", background: "var(--usapt-border)", border: "1px solid var(--usapt-border)", minWidth: "min-content" }}>
            {byColumn.map((col) => (
              <div key={col.key} style={{ width: 224, flex: "none", background: "var(--usapt-bg)", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--usapt-border)", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>{col.title}</span>
                  <span style={{ fontSize: 11, color: "var(--usapt-text-muted)", fontVariantNumeric: "tabular-nums" }}>{col.cards.length}</span>
                </div>
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 10, minHeight: 80 }}>
                  {col.cards.map((card) => (
                    <Link key={card.id} href={`/candidates/${card.id}`} style={{ background: "var(--usapt-surface-raised)", border: "1px solid var(--usapt-border)", padding: 10, boxShadow: "var(--usapt-shadow-sm)", textDecoration: "none", color: "var(--usapt-ink)" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.15 }}>{card.name}</div>
                      <div style={{ fontSize: 11, color: "var(--usapt-text-muted)", marginTop: 3, textTransform: "capitalize" }}>
                        {card.roleType} · {card.marketName}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "capitalize", padding: "2px 7px", borderRadius: "var(--usapt-radius-pill)", background: "var(--usapt-surface)", color: "var(--usapt-text-muted)" }}>
                          {card.source}
                        </span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 9 }}>
                        <StatusPill status={card.status} />
                        {card.gradeText !== "—" ? <span style={{ fontSize: 10.5, color: "var(--usapt-text-muted)" }}>{card.gradeText}</span> : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="usapt-scroll" style={{ flex: 1, overflow: "auto", padding: "0 40px 34px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr>
                {["Candidate", "Role", "Brand", "Market", "Source", "Status", "Grade", "Quiz", "Age"].map((h) => (
                  <th key={h} style={{ position: "sticky", top: 0, background: "var(--usapt-bg)", textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "10px 12px", borderBottom: "1px solid var(--usapt-border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5, fontWeight: 600 }}>
                    <Link href={`/candidates/${r.id}`} style={{ color: "var(--usapt-ink)", textDecoration: "none" }}>{r.name}</Link>
                    <div style={{ fontSize: 11.5, fontWeight: 400, color: "var(--usapt-text-muted)", marginTop: 2 }}>{r.email}</div>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, textTransform: "capitalize" }}>{r.roleType}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, color: "var(--usapt-text-muted)" }}>{r.brandName}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, color: "var(--usapt-text-muted)" }}>{r.marketName}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, color: "var(--usapt-text-muted)", textTransform: "capitalize" }}>{r.source}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)" }}><StatusPill status={r.status} /></td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{r.gradeText}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{r.quizText}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, color: "var(--usapt-text-muted)", fontVariantNumeric: "tabular-nums" }}>{r.ageDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
