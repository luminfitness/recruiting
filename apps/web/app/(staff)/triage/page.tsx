import { desc, eq, sql } from "drizzle-orm";
import { inboundEmails } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";

export default async function TriagePage() {
  const rows = await withUser((tx, _client, user) =>
    tx
      .select()
      .from(inboundEmails)
      .where(sql`${inboundEmails.orgId} = ${user.orgId} AND ${inboundEmails.parsedStatus} <> 'parsed'`)
      .orderBy(desc(inboundEmails.createdAt)),
  );

  const td: React.CSSProperties = { padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, verticalAlign: "top" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "2px solid var(--usapt-border-strong)" };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Ingestion triage
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Application triage</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20, maxWidth: 640 }}>
        Inbound applications that couldn&apos;t be fully auto-parsed into a candidate — missing contact info, an unknown
        brand/market, or a notification-format change. A silent parse-rate drop is logged as an incident, not swallowed.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Received", "Status", "Parser v", "From", "Subject"].map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const raw = r.rawSource as { from?: string; subject?: string };
            return (
              <tr key={r.id}>
                <td style={{ ...td, whiteSpace: "nowrap", color: "var(--usapt-text-muted)" }}>{new Date(r.createdAt).toLocaleString()}</td>
                <td style={td}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: r.parsedStatus === "failed" ? "var(--status-risk-fill)" : "var(--status-action-fill)", color: r.parsedStatus === "failed" ? "var(--status-risk-text)" : "var(--status-action-text)" }}>
                    {r.parsedStatus === "failed" ? "Parse failed" : "Needs review"}
                  </span>
                </td>
                <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.parserVersion}</td>
                <td style={td}>{raw?.from ?? "—"}</td>
                <td style={{ ...td, color: "var(--usapt-text-muted)" }}>{raw?.subject ?? "—"}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...td, color: "var(--usapt-text-muted)" }}>
                Nothing in triage — all inbound applications parsed cleanly.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
