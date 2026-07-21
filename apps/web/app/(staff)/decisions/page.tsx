import Link from "next/link";
import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";
import { listDecisionQueue } from "@/lib/decisions";
import { bulkNotSelectAction } from "./actions";

export default async function DecisionsPage() {
  const rows = await withUser((tx) => listDecisionQueue(tx));

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
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        The funnel · step 3
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Decisions</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20 }}>
        Every candidate here has both halves in (grade + quiz). A disclosure shows only as a flag — open the bundle to
        review detail (access is logged). Disposition is always human.
      </p>

      <form action={bulkNotSelectAction}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}></th>
              <th style={th}>Candidate</th>
              <th style={th}>Role</th>
              <th style={th}>Brand · market</th>
              <th style={{ ...th, textAlign: "right" }}>Grade</th>
              <th style={{ ...th, textAlign: "right" }}>Quiz</th>
              <th style={th}>Flags</th>
              <th style={th}>Status</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.candidateId}>
                <td style={td}>
                  <input type="checkbox" name="candidateId" value={r.candidateId} />
                </td>
                <td style={{ ...td, fontWeight: 600 }}>
                  <Link href={`/decisions/${r.candidateId}`} style={{ color: "var(--usapt-ink)", textDecoration: "none" }}>
                    {r.name}
                  </Link>
                </td>
                <td style={{ ...td, textTransform: "capitalize" }}>{r.roleType}</td>
                <td style={{ ...td, color: "var(--usapt-text-muted)" }}>
                  {r.brandName} · {r.marketName}
                </td>
                <td style={{ ...td, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {r.gradeTotal != null ? `${r.gradeTotal}/${r.gradeMax}` : "—"}
                </td>
                <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.quizScore != null ? `${r.quizScore}%` : "—"}</td>
                <td style={td}>
                  {r.hasDisclosure ? (
                    <span title="Disclosure on file" style={{ color: "var(--status-action-marker)", fontWeight: 700 }}>
                      ◆ disclosure
                    </span>
                  ) : null}
                </td>
                <td style={td}>
                  <StatusPill status={r.status} />
                </td>
                <td style={{ ...td, textAlign: "right" }}>
                  <Link href={`/decisions/${r.candidateId}`} style={{ color: "var(--usapt-brand-blue)", fontWeight: 600, textDecoration: "none" }}>
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td style={{ ...td, color: "var(--usapt-text-muted)" }} colSpan={9}>
                  No candidates awaiting a decision. Bundles appear here once both the grade and quiz are in.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {rows.length > 0 ? (
          <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
            <input
              name="reason"
              placeholder="Reason (required for bulk not-selected)"
              style={{ flex: 1, maxWidth: 380, padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)" }}
            />
            <button
              type="submit"
              style={{ padding: "8px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "var(--status-negative-text)", background: "var(--status-negative-fill)", border: "1px solid var(--usapt-border)", cursor: "pointer" }}
            >
              Not selected (bulk)
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
