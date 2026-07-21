import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { candidates, evaluations } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { getActiveCriteria } from "@/lib/evaluation";
import { submitScorecardAction } from "./actions";

export default async function ScorePage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;

  const data = await withUser(async (tx, _client, user) => {
    const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, candidateId));
    if (!candidate) return null;
    const criteria = await getActiveCriteria(tx, user.orgId, candidate.roleType);
    const [ev] = await tx.select().from(evaluations).where(eq(evaluations.candidateId, candidateId));
    return { candidate, criteria, ev };
  });

  if (!data || !data.candidate) notFound();
  const { candidate, criteria, ev } = data;
  const existingGrades = (ev?.interviewGrade as Record<string, number> | null) ?? {};
  const alreadyScored = Boolean(ev?.scorecardSubmittedAt);

  const saveDraft = submitScorecardAction.bind(null, candidateId, true);
  const submit = submitScorecardAction.bind(null, candidateId, false);

  const scaleValues = criteria
    ? Array.from({ length: criteria.schema.scale.max - criteria.schema.scale.min + 1 }, (_, i) => criteria.schema.scale.min + i)
    : [1, 2, 3, 4, 5];

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 640 }}>
      <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginBottom: 12 }}>
        <Link href={`/candidates/${candidateId}`} style={{ color: "inherit" }}>
          {candidate.firstName} {candidate.lastName}
        </Link>{" "}
        → Scorecard
      </div>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        In-app interviewer scorecard · criteria v{criteria?.version ?? 1}
      </div>
      <h1 style={{ fontSize: 28, margin: "4px 0 6px" }}>
        Score {candidate.firstName} {candidate.lastName}
      </h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20 }}>
        Auto-attaches to this candidate by ID — no name matching. {alreadyScored ? "Already submitted; re-submitting overwrites (pre-decision)." : "Save a draft as you go, or submit when done."}
      </p>

      <form>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {(criteria?.schema.criteria ?? []).map((c) => (
            <div key={c.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label style={{ fontSize: 14, fontWeight: 600 }}>{c.label}</label>
                {c.hint ? <span style={{ fontSize: 11.5, color: "var(--usapt-text-faint)" }}>{c.hint}</span> : null}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {scaleValues.map((v) => {
                  const checked = existingGrades[c.key] === v;
                  return (
                    <label
                      key={v}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "10px 0",
                        border: `1px solid ${checked ? "var(--usapt-brand-blue)" : "var(--usapt-border)"}`,
                        background: checked ? "var(--status-motion-fill)" : "var(--usapt-surface-raised)",
                        cursor: "pointer",
                        fontWeight: 700,
                        fontSize: 14,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      <input type="radio" name={`crit_${c.key}`} value={v} defaultChecked={checked} style={{ display: "none" }} />
                      {v}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          <div>
            <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 8 }}>Notes</label>
            <textarea
              name="notes"
              defaultValue={ev?.writtenNotes ?? ""}
              rows={4}
              style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid var(--usapt-border)", fontFamily: "inherit" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            type="submit"
            formAction={saveDraft}
            style={{ padding: "12px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 14, border: "1px solid var(--usapt-border-strong)", background: "var(--usapt-surface-raised)", cursor: "pointer" }}
          >
            Save draft
          </button>
          <button
            type="submit"
            formAction={submit}
            style={{ padding: "12px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}
          >
            Submit score
          </button>
        </div>
      </form>
    </div>
  );
}
