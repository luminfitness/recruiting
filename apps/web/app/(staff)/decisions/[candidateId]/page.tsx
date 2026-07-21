import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";
import { getDecisionBundle, type Disposition } from "@/lib/decisions";
import { recordDecisionAction } from "../actions";
import { RevealDisclosure } from "./RevealDisclosure";

const DISPOSITIONS: { outcome: Disposition; label: string; fill: string; fg: string }[] = [
  { outcome: "offer", label: "Offer", fill: "var(--usapt-brand-blue)", fg: "#fff" },
  { outcome: "backup", label: "Backup", fill: "var(--status-motion-fill)", fg: "var(--status-motion-text)" },
  { outcome: "awaiting_review", label: "Awaiting review", fill: "var(--status-action-fill)", fg: "var(--status-action-text)" },
  { outcome: "not_selected", label: "Not selected", fill: "var(--status-negative-fill)", fg: "var(--status-negative-text)" },
];

export default async function DecisionBundlePage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const bundle = await withUser((tx) => getDecisionBundle(tx, candidateId));
  if (!bundle) notFound();

  const canDecide = ["evaluated", "awaiting_review"].includes(bundle.candidate.status);
  const sectionLabel: React.CSSProperties = { fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-text-muted)", margin: "0 0 10px" };
  const availKeys = Object.keys(bundle.availability).filter((k) => bundle.availability[k]);

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 1000 }}>
      <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginBottom: 12 }}>
        <Link href="/decisions" style={{ color: "inherit" }}>
          Decision queue
        </Link>{" "}
        → Bundle
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, borderBottom: "1px solid var(--usapt-border)", paddingBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>{bundle.candidate.name}</h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", fontSize: 12, color: "var(--usapt-text-muted)" }}>
            <span style={{ textTransform: "capitalize" }}>{bundle.candidate.roleType}</span>
            <span>·</span>
            <span>{bundle.candidate.brandName}</span>
            <span>·</span>
            <span>{bundle.candidate.marketName}</span>
            <span>·</span>
            <span style={{ textTransform: "capitalize" }}>{bundle.candidate.source}</span>
          </div>
        </div>
        <StatusPill status={bundle.candidate.status} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 40, marginTop: 28, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <section>
            <h4 style={sectionLabel}>Interview grade</h4>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
              <div style={{ fontFamily: "var(--font-archivo-black)", fontSize: 40, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                {bundle.grade.total ?? "—"}
                {bundle.grade.max ? <span style={{ fontSize: 18, color: "var(--usapt-text-faint)" }}>/{bundle.grade.max}</span> : null}
              </div>
              {bundle.grade.notes ? <div style={{ fontSize: 12.5, color: "var(--usapt-text-muted)", fontStyle: "italic" }}>“{bundle.grade.notes}”</div> : null}
            </div>
            {bundle.grade.criteria ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {bundle.grade.criteria.criteria.map((c) => (
                  <div key={c.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "1px solid var(--usapt-neutral-200)" }}>
                    <span>{c.label}</span>
                    <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {bundle.grade.values[c.key] ?? "—"}/{bundle.grade.criteria!.scale.max}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <h4 style={{ ...sectionLabel, margin: 0 }}>Knowledge quiz — auto-scored</h4>
              <span style={{ fontFamily: "var(--font-archivo-black)", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>{bundle.quiz.score ?? "—"}%</span>
            </div>
            <div style={{ border: "1px solid var(--usapt-border)" }}>
              {(bundle.quiz.schema?.questions ?? []).map((q) => {
                const ans = bundle.quiz.answers[q.id];
                const correct = ans === q.correct;
                const chosen = q.options.find((o) => o.id === ans);
                return (
                  <div key={q.id} style={{ display: "flex", gap: 10, padding: "9px 12px", borderBottom: "1px solid var(--usapt-neutral-200)", alignItems: "flex-start" }}>
                    <span style={{ flex: "none", width: 16, height: 16, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#fff", background: correct ? "var(--status-positive-marker)" : "var(--status-risk-marker)" }}>
                      {correct ? "✓" : "✕"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{q.prompt}</div>
                      <div style={{ fontSize: 11.5, color: "var(--usapt-text-muted)", marginTop: 1 }}>{chosen?.label ?? "(no answer)"}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h4 style={sectionLabel}>Written response</h4>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, padding: "12px 14px", background: "var(--usapt-surface)", borderLeft: "3px solid var(--usapt-border-strong)" }}>
              {bundle.writtenResponse || "(none)"}
            </p>
          </section>

          <section>
            <h4 style={sectionLabel}>Availability</h4>
            {availKeys.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {availKeys.map((k) => (
                  <span key={k} style={{ fontSize: 11.5, fontWeight: 600, padding: "5px 9px", border: "1px solid var(--usapt-border)", background: "var(--status-motion-fill)", color: "var(--status-motion-text)" }}>
                    {k}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", margin: 0 }}>None provided.</p>
            )}
          </section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section style={{ border: "1px solid var(--usapt-border)", padding: 16 }}>
            <h4 style={{ ...sectionLabel, marginBottom: 14 }}>Disposition</h4>
            {!canDecide ? (
              <p style={{ fontSize: 12.5, color: "var(--usapt-text-muted)", margin: "0 0 10px" }}>
                A decision has been recorded — status advanced. {bundle.priorDecision ? `Last: ${bundle.priorDecision.outcome}.` : ""}
              </p>
            ) : null}
            {canDecide ? (
              <form style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <textarea
                  name="notes"
                  placeholder="Notes (optional)"
                  rows={2}
                  style={{ padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)", fontFamily: "inherit", marginBottom: 4 }}
                />
                {DISPOSITIONS.map((d) => (
                  <button
                    key={d.outcome}
                    type="submit"
                    formAction={recordDecisionAction.bind(null, candidateId, d.outcome)}
                    style={{ textAlign: "left", fontFamily: "inherit", fontWeight: 600, fontSize: 13.5, padding: "10px 12px", border: "1px solid var(--usapt-border-strong)", background: d.fill, color: d.fg, cursor: "pointer" }}
                  >
                    {d.label}
                  </button>
                ))}
              </form>
            ) : null}
          </section>

          <section style={{ border: "1px solid var(--usapt-border)", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h4 style={{ ...sectionLabel, margin: 0 }}>Background disclosure</h4>
              {bundle.hasDisclosure ? (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: "var(--status-action-fill)", color: "var(--status-action-text)" }}>◆ On file</span>
              ) : null}
            </div>
            {bundle.hasDisclosure ? (
              <RevealDisclosure candidateId={candidateId} />
            ) : (
              <p style={{ fontSize: 12.5, color: "var(--usapt-text-muted)", margin: 0 }}>No disclosures on file for this candidate.</p>
            )}
          </section>

          {bundle.quizWithoutAttendance ? (
            <div style={{ fontSize: 12, color: "var(--status-action-text)", background: "var(--status-action-fill)", padding: "10px 12px" }}>
              ⚠ Quiz submitted without attendance — review before deciding.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
