import { eq } from "drizzle-orm";
import { brands, markets } from "@usapt/db/schema";
import { chartPalette } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";
import { classComparison, computeFunnel, type AnalyticsFilters } from "@/lib/analytics";

type SP = Record<string, string | undefined>;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const filters: AnalyticsFilters = {
    role: sp.role === "manager" || sp.role === "trainer" ? sp.role : undefined,
    brandId: sp.brand || undefined,
    marketId: sp.market || undefined,
    source: (["indeed", "linkedin", "referral", "other"].includes(sp.source ?? "") ? sp.source : undefined) as AnalyticsFilters["source"],
  };

  const { funnel, classes, brandRows, marketRows } = await withUser(async (tx, client, user) => {
    const funnel = await computeFunnel(tx, client, filters);
    const classes = await classComparison(tx, user.orgId);
    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, user.orgId));
    const brandIds = new Set(brandRows.map((b) => b.id));
    const marketRows = (await tx.select().from(markets)).filter((m) => brandIds.has(m.brandId));
    return { funnel, classes, brandRows, marketRows };
  });

  const maxCount = Math.max(1, ...funnel.stages.map((s) => s.count));
  const selStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 12, border: "1px solid var(--usapt-border)", background: "#fff" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "2px solid var(--usapt-border-strong)" };
  const td: React.CSSProperties = { padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, fontVariantNumeric: "tabular-nums" };
  const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ borderBottom: "2px solid var(--usapt-border-strong)", paddingBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
          Live funnel · computed continuously
        </div>
        <h1 style={{ fontSize: 28, margin: "4px 0 0" }}>Recruiting analytics</h1>
      </div>

      <form style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <select name="role" defaultValue={filters.role ?? ""} style={selStyle}>
          <option value="">All roles</option>
          <option value="manager">Manager</option>
          <option value="trainer">Trainer</option>
        </select>
        <select name="brand" defaultValue={filters.brandId ?? ""} style={selStyle}>
          <option value="">All brands</option>
          {brandRows.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
        </select>
        <select name="market" defaultValue={filters.marketId ?? ""} style={selStyle}>
          <option value="">All markets</option>
          {marketRows.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
        </select>
        <select name="source" defaultValue={filters.source ?? ""} style={selStyle}>
          <option value="">All sources</option>
          {["indeed", "linkedin", "referral", "other"].map((s) => (<option key={s} value={s}>{s}</option>))}
        </select>
        <button type="submit" style={{ padding: "6px 12px", fontFamily: "inherit", fontWeight: 700, fontSize: 12, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>Apply</button>
      </form>

      {/* Top stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, background: "var(--usapt-border)", border: "2px solid var(--usapt-border-strong)", marginTop: 18 }}>
        {[
          { label: "Applicants", value: String(funnel.stages[0].count) },
          { label: "Offers", value: String(funnel.stages[4].count) },
          { label: "Graduates", value: String(funnel.stages[7].count) },
          { label: "Ad spend", value: funnel.totalSpend > 0 ? fmtMoney(funnel.totalSpend) : "—" },
        ].map((s) => (
          <div key={s.label} style={{ background: "var(--usapt-bg)", padding: 14 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-text-muted)" }}>{s.label}</div>
            <div style={{ fontFamily: "var(--font-archivo-black)", fontSize: 24, lineHeight: 1.1, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40, marginTop: 38, alignItems: "start" }}>
        <section>
          <h4 style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-text-muted)", margin: "0 0 12px" }}>
            Funnel — applicants to graduate
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {funnel.stages.map((s, i) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 96, flex: "none", fontSize: 12, fontWeight: 600, textAlign: "right" }}>{s.label}</div>
                <div style={{ flex: 1, background: "var(--usapt-neutral-200)", height: 26, position: "relative" }}>
                  <div style={{ height: "100%", width: `${Math.max((s.count / maxCount) * 100, s.count > 0 ? 6 : 0)}%`, background: chartPalette[i % chartPalette.length], display: "flex", alignItems: "center", paddingLeft: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>{s.count}</span>
                  </div>
                  {s.tightestGate ? (
                    <span style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, color: "var(--status-action-text)", background: "var(--status-action-fill)", padding: "1px 6px" }}>tightest gate</span>
                  ) : null}
                </div>
                <div style={{ width: 44, flex: "none", fontSize: 11.5, color: "var(--usapt-text-muted)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {s.conversionFromPrev != null ? `${Math.round(s.conversionFromPrev * 100)}%` : ""}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, padding: "12px 14px", background: "var(--usapt-surface)", border: "1px solid var(--usapt-border)" }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>&quot;$10K producer&quot; — early production</div>
            <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 4 }}>
              Pending data source (POS / payroll integration, OQ-5). Schema is ready; this metric activates once early-
              performance data is wired in.
            </div>
          </div>
        </section>

        <section>
          <h4 style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-text-muted)", margin: "0 0 10px" }}>
            Cost per stage {funnel.spendIsAllocated ? "(approximate — allocated spend)" : ""}
          </h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Stage</th>
                <th style={{ ...th, textAlign: "right" }}>Count</th>
                <th style={{ ...th, textAlign: "right" }}>Cost / cand.</th>
              </tr>
            </thead>
            <tbody>
              {funnel.stages.map((s) => (
                <tr key={s.key}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {s.label}
                    {s.tightestGate ? <span style={{ fontSize: 10, fontWeight: 700, color: "var(--status-action-text)", marginLeft: 6 }}>◆</span> : null}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{s.count}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--usapt-text-muted)" }}>{s.costPer != null ? `~${fmtMoney(s.costPer)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-text-muted)", margin: "22px 0 10px" }}>Class-by-class</h4>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Class</th>
                <th style={{ ...th, textAlign: "right" }}>Started</th>
                <th style={{ ...th, textAlign: "right" }}>Grad</th>
                <th style={{ ...th, textAlign: "right" }}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c) => (
                <tr key={c.cohortId}>
                  <td style={{ ...td, fontWeight: 600 }}>{c.label}</td>
                  <td style={{ ...td, textAlign: "right" }}>{c.started}</td>
                  <td style={{ ...td, textAlign: "right" }}>{c.graduated}</td>
                  <td style={{ ...td, textAlign: "right", color: "var(--usapt-text-muted)" }}>{c.rate != null ? `${Math.round(c.rate * 100)}%` : "—"}</td>
                </tr>
              ))}
              {classes.length === 0 ? (
                <tr><td colSpan={4} style={{ ...td, color: "var(--usapt-text-muted)" }}>No cohorts yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
