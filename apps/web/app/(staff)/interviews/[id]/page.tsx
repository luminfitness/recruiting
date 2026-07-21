import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";
import { getRosterView } from "@/lib/roster";
import { confirmMatchAction, confirmPresentAction, simulateDirectJoinAction } from "./actions";

export default async function RosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await withUser((tx) => getRosterView(tx, id));
  if (!view) notFound();

  const notJoined = view.roster.filter((r) => !r.joined);
  const confirmPresent = confirmPresentAction.bind(null, id);
  const simulate = simulateDirectJoinAction.bind(null, id);
  const confirmMatch = confirmMatchAction.bind(null, id);

  const sectionLabel: React.CSSProperties = {
    fontSize: 12,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--usapt-text-muted)",
    margin: "0 0 10px",
  };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginBottom: 12 }}>
        <Link href="/sessions" style={{ color: "inherit" }}>
          Sessions
        </Link>{" "}
        → Roster
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, borderBottom: "1px solid var(--usapt-border)", paddingBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, background: "var(--usapt-brand-red)", borderRadius: "50%" }} />
            <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-red)" }}>
              Live session
            </span>
          </div>
          <h1 style={{ fontSize: 28, margin: "4px 0 0", textTransform: "capitalize" }}>{view.session.roleType} group interview</h1>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: "var(--usapt-text-muted)" }}>
            {new Date(view.session.scheduledAt).toLocaleString()}
          </p>
        </div>
        <div style={{ display: "flex", gap: 2, background: "var(--usapt-border)", border: "1px solid var(--usapt-border)" }}>
          <div style={{ background: "var(--usapt-bg)", padding: "8px 16px", textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-archivo-black)", fontSize: 22, fontVariantNumeric: "tabular-nums" }}>
              {view.presentCount}
              <span style={{ fontSize: 13, color: "var(--usapt-text-faint)" }}>/{view.roster.length}</span>
            </div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--usapt-text-muted)" }}>Present</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 36, marginTop: 30, alignItems: "start" }}>
        <section>
          <h4 style={sectionLabel}>Expected roster</h4>
          <div style={{ border: "1px solid var(--usapt-border)" }}>
            {view.roster.map((r) => (
              <div key={r.bookingId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: "1px solid var(--usapt-neutral-200)" }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    flex: "none",
                    background: r.joined ? "var(--status-positive-marker)" : "var(--usapt-neutral-400)",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "var(--usapt-text-muted)" }}>
                    {r.joined
                      ? `Joined ${r.joinMethod === "token_link" ? "via token link" : "— confirmed by host"}`
                      : "Not joined yet"}
                  </div>
                </div>
                {r.joined ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StatusPill status={r.status} />
                    <Link
                      href={`/score/${r.candidateId}`}
                      style={{ padding: "5px 12px", whiteSpace: "nowrap", fontFamily: "inherit", fontWeight: 600, fontSize: 12.5, border: "1px solid var(--usapt-border-strong)", background: "var(--usapt-surface-raised)", textDecoration: "none", color: "var(--usapt-ink)" }}
                    >
                      Score →
                    </Link>
                  </div>
                ) : (
                  <form action={confirmPresent}>
                    <input type="hidden" name="bookingId" value={r.bookingId} />
                    <input type="hidden" name="candidateId" value={r.candidateId} />
                    <button
                      type="submit"
                      style={{ padding: "5px 12px", whiteSpace: "nowrap", fontFamily: "inherit", fontWeight: 600, fontSize: 12.5, border: "1px solid var(--usapt-border-strong)", background: "var(--usapt-surface-raised)", cursor: "pointer" }}
                    >
                      Confirm present
                    </button>
                  </form>
                )}
              </div>
            ))}
            {view.roster.length === 0 ? (
              <div style={{ padding: 14, fontSize: 13, color: "var(--usapt-text-muted)" }}>No candidates booked into this session yet.</div>
            ) : null}
          </div>
        </section>

        <section>
          <div style={{ border: "2px solid var(--status-action-marker)", background: "var(--status-action-fill)" }}>
            <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--usapt-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h4 style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--status-action-text)", margin: 0 }}>
                Unmatched participants
              </h4>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--status-action-text)" }}>{view.unmatched.length}</span>
            </div>
            <div style={{ padding: "6px 0" }}>
              {view.unmatched.map((u) => (
                <form key={u.id} action={confirmMatch} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px" }}>
                  <input type="hidden" name="unmatchedId" value={u.id} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--usapt-ink)" }}>{u.displayName}</div>
                    <div style={{ fontSize: 11, color: "var(--status-action-text)" }}>joined directly — match to a booked candidate</div>
                  </div>
                  <select name="match" required style={{ fontSize: 12, padding: "4px 6px", border: "1px solid var(--usapt-border)", maxWidth: 130 }}>
                    <option value="">Match…</option>
                    {notJoined.map((r) => (
                      <option key={r.bookingId} value={`${r.bookingId}:${r.candidateId}`}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" style={{ padding: "5px 10px", whiteSpace: "nowrap", fontFamily: "inherit", fontWeight: 700, fontSize: 12, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>
                    Confirm
                  </button>
                </form>
              ))}
              {view.unmatched.length === 0 ? (
                <div style={{ padding: "9px 14px", fontSize: 12, color: "var(--status-action-text)" }}>No unmatched participants.</div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 16, border: "1px dashed var(--usapt-border)", padding: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-faint)", marginBottom: 8 }}>
              Demo · simulate a direct join
            </div>
            <form action={simulate} style={{ display: "flex", gap: 6 }}>
              <input name="displayName" placeholder="Participant name from meeting" style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid var(--usapt-border)" }} />
              <button type="submit" style={{ padding: "6px 10px", fontFamily: "inherit", fontWeight: 600, fontSize: 12, border: "1px solid var(--usapt-border-strong)", background: "var(--usapt-surface-raised)", cursor: "pointer" }}>
                Add
              </button>
            </form>
            <p style={{ fontSize: 10.5, color: "var(--usapt-text-faint)", margin: "8px 0 0" }}>
              Stands in for a candidate who joined the meeting without clicking their token link. In production this comes
              from the Zoom participant webhook (Phase 11).
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
