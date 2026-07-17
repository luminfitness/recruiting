import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { brands, candidates, markets } from "@usapt/db/schema";
import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";

export default async function PipelinePage() {
  const rows = await withUser(async (tx) => {
    return tx
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
      })
      .from(candidates)
      .leftJoin(brands, eq(brands.id, candidates.brandId))
      .leftJoin(markets, eq(markets.id, candidates.marketId))
      .orderBy(desc(candidates.appliedAt));
  });

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--usapt-text-muted)",
    padding: "8px 12px",
    borderBottom: "2px solid var(--usapt-border-strong)",
  };
  const td: React.CSSProperties = { padding: "12px", borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5 };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
            Live pipeline · Master Tracker replacement
          </div>
          <h1 style={{ fontSize: 30, margin: "4px 0 0" }}>Candidate pipeline</h1>
        </div>
        <Link
          href="/candidates/new"
          style={{
            padding: "10px 16px",
            fontWeight: 700,
            fontSize: 13.5,
            color: "#fff",
            background: "var(--usapt-brand-blue)",
            textDecoration: "none",
          }}
        >
          + Add candidate
        </Link>
      </div>

      <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 12 }}>{rows.length} candidates</div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
        <thead>
          <tr>
            <th style={th}>Candidate</th>
            <th style={th}>Role</th>
            <th style={th}>Brand · market</th>
            <th style={th}>Source</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={{ ...td, fontWeight: 600 }}>
                <Link href={`/candidates/${r.id}`} style={{ color: "var(--usapt-ink)", textDecoration: "none" }}>
                  {r.firstName} {r.lastName}
                </Link>
              </td>
              <td style={{ ...td, textTransform: "capitalize" }}>{r.roleType}</td>
              <td style={{ ...td, color: "var(--usapt-text-muted)" }}>
                {r.brandName} · {r.marketName}
              </td>
              <td style={{ ...td, color: "var(--usapt-text-muted)", textTransform: "capitalize" }}>{r.source}</td>
              <td style={td}>
                <StatusPill status={r.status} />
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td style={{ ...td, color: "var(--usapt-text-muted)" }} colSpan={5}>
                No candidates yet. Add one to see the identity thread in action.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
