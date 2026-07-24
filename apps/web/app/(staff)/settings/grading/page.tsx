import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { withUser } from "@/lib/db-context";
import { getGradingPolicy, suggestDisposition } from "@/lib/decisions";
import { saveGradingPolicyAction } from "./actions";

/**
 * Settings → Grading. Tunes the ADVISORY suggested disposition on the decision
 * queue. Deliberately shows a worked example so the effect of a change is
 * legible before saving.
 */
export default async function GradingSettingsPage() {
  const authed = await requireUser();
  if (!hasRole(authed, "admin")) redirect("/settings/appearance");

  const policy = await withUser((tx, _client, user) => getGradingPolicy(tx, user.orgId));

  const input: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 14,
    width: 90,
    border: "1px solid var(--usapt-border)",
    background: "var(--usapt-surface-raised)",
    color: "var(--usapt-ink)",
    borderRadius: "var(--usapt-radius-sm)",
    fontVariantNumeric: "tabular-nums",
  };
  const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 6 };
  const hint: React.CSSProperties = { fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 6, maxWidth: 380, lineHeight: 1.45 };

  // Worked examples, computed with the live policy so they can't drift from it.
  const examples = [
    { name: "Strong all round", gradeTotal: 18, gradeMax: 20, quizScore: 90, hasDisclosure: false },
    { name: "Interview passes, quiz doesn't", gradeTotal: 16, gradeMax: 20, quizScore: 55, hasDisclosure: false },
    { name: "Just under the pass mark", gradeTotal: 13, gradeMax: 20, quizScore: 80, hasDisclosure: false },
    { name: "Below the floor", gradeTotal: 10, gradeMax: 20, quizScore: 80, hasDisclosure: false },
    { name: "Disclosure on file", gradeTotal: 18, gradeMax: 20, quizScore: 90, hasDisclosure: true },
  ].map((e) => ({ ...e, result: suggestDisposition(policy, e) }));

  const LABEL: Record<string, string> = {
    offer: "Offer",
    backup: "Backup",
    awaiting_review: "Awaiting review",
    not_selected: "Not selected",
  };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)", fontWeight: 700 }}>
        Services
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 8px", fontWeight: 800 }}>Grading</h1>
      <p style={{ color: "var(--usapt-text-muted)", fontSize: 13.5, marginBottom: 24, maxWidth: 640, lineHeight: 1.5 }}>
        Thresholds behind the <strong>suggested</strong>{" "}disposition on the decision queue. A suggestion is a hint on a
        button — it never moves a candidate and never records a decision on its own. Percentages are of the interview
        rubric&rsquo;s maximum, so the policy keeps its meaning if the scorecard ever changes.
      </p>

      <form action={saveGradingPolicyAction} style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 640 }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
          <div>
            <label style={label} htmlFor="minPassPct">Pass mark</label>
            <input id="minPassPct" name="minPassPct" type="number" min={0} max={100} defaultValue={policy.minPassPct} style={input} /> %
            <div style={hint}>At or above this interview grade, a candidate is offer-eligible.</div>
          </div>
          <div>
            <label style={label} htmlFor="backupFloorPct">Backup floor</label>
            <input id="backupFloorPct" name="backupFloorPct" type="number" min={0} max={100} defaultValue={policy.backupFloorPct} style={input} /> %
            <div style={hint}>At or above this but under the pass mark suggests Backup. Below it suggests Not selected.</div>
          </div>
          <div>
            <label style={label} htmlFor="quizPassScore">Quiz pass</label>
            <input id="quizPassScore" name="quizPassScore" type="number" min={0} max={100} defaultValue={policy.quizPassScore} style={input} /> %
            <div style={hint}>A passing grade with a failing quiz goes to Awaiting review rather than straight to Offer.</div>
          </div>
        </div>

        <button
          type="submit"
          style={{ alignSelf: "flex-start", padding: "10px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, borderRadius: "var(--usapt-radius-sm)", cursor: "pointer" }}
        >
          Save grading policy
        </button>
      </form>

      <h3 style={{ fontSize: 15, margin: "34px 0 10px", borderBottom: "1px solid var(--usapt-border)", paddingBottom: 8 }}>
        What this policy suggests
      </h3>
      <table style={{ width: "100%", maxWidth: 640, borderCollapse: "collapse" }}>
        <tbody>
          {examples.map((e) => (
            <tr key={e.name}>
              <td style={{ padding: "10px 0", borderBottom: "1px solid var(--usapt-border)", fontSize: 13 }}>
                {e.name}
                <div style={{ fontSize: 11.5, color: "var(--usapt-text-faint)", fontVariantNumeric: "tabular-nums" }}>
                  grade {e.gradeTotal}/{e.gradeMax} · quiz {e.quizScore}%{e.hasDisclosure ? " · disclosure" : ""}
                </div>
              </td>
              <td style={{ padding: "10px 0", borderBottom: "1px solid var(--usapt-border)", textAlign: "right" }}>
                {e.result.outcome ? (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--usapt-radius-pill)", background: "var(--usapt-brand-soft)", color: "var(--usapt-brand-ink)" }}>
                    {LABEL[e.result.outcome]}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--usapt-text-muted)" }}>No suggestion</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ ...hint, maxWidth: 640 }}>
        A felony disclosure never produces a suggestion — those go to a person to decide directly. The disclosure is
        still shown on the candidate&rsquo;s record; we decline to score it, not to surface it.
      </p>
    </div>
  );
}
