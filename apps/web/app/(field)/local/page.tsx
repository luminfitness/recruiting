import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";
import { listLocalQueue } from "@/lib/referrals";
import { recordLocalOutcomeAction, scheduleWorkingInterviewAction } from "./actions";

export default async function LocalQueuePage() {
  const queue = await withUser((tx) => listLocalQueue(tx));

  const pending = queue.filter((q) => q.status === "referred_local" && !q.workingInterviewAt).length;

  return (
    <div style={{ background: "var(--usapt-bg)", minHeight: "100%" }}>
      <div style={{ background: "var(--usapt-brand-blue)", color: "#fff", padding: "16px 18px" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Trainer queue</span>
          <div style={{ fontSize: 11, color: "#9db4d6", marginTop: 8 }}>{pending} awaiting your outcome · your market only</div>
        </div>

        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {queue.map((c) => {
            const schedule = scheduleWorkingInterviewAction.bind(null, c.referralId);
            return (
              <div key={c.referralId} style={{ background: "#fff", border: "1px solid var(--usapt-border)", padding: 14 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 2 }}>
                      Grade {c.gradeText} · Quiz {c.quizText}
                    </div>
                  </div>
                  <StatusPill status={c.status} />
                </div>

                {c.workingInterviewAt ? (
                  <div style={{ fontSize: 12.5, color: "var(--usapt-neutral-800)", marginTop: 8, padding: "8px 10px", background: "var(--usapt-surface)" }}>
                    Working interview: {new Date(c.workingInterviewAt).toLocaleString()}
                  </div>
                ) : (
                  <form action={schedule} style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <input name="scheduledAt" type="datetime-local" required style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid var(--usapt-border)" }} />
                    <button type="submit" style={{ padding: "6px 10px", fontFamily: "inherit", fontWeight: 700, fontSize: 12, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>
                      Schedule
                    </button>
                  </form>
                )}

                {c.status === "working_interview" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 12 }}>
                    <form action={recordLocalOutcomeAction.bind(null, c.referralId, "hired")}>
                      <button type="submit" style={{ width: "100%", minHeight: 46, fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--status-positive-marker)", border: 0, cursor: "pointer" }}>
                        Hired
                      </button>
                    </form>
                    <form action={recordLocalOutcomeAction.bind(null, c.referralId, "declined")}>
                      <button type="submit" style={{ width: "100%", minHeight: 46, fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "var(--usapt-ink)", background: "var(--usapt-neutral-200)", border: "1px solid var(--usapt-border)", cursor: "pointer" }}>
                        Declined
                      </button>
                    </form>
                    <form action={recordLocalOutcomeAction.bind(null, c.referralId, "no_show")}>
                      <button type="submit" style={{ width: "100%", minHeight: 46, fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "var(--status-risk-text)", background: "var(--status-risk-fill)", border: 0, cursor: "pointer" }}>
                        No-show
                      </button>
                    </form>
                  </div>
                ) : null}
              </div>
            );
          })}
          {queue.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid var(--usapt-border)", padding: 16, fontSize: 13, color: "var(--usapt-text-muted)" }}>
              No trainers referred to your market yet. When central offers a trainer, they appear here for the working
              interview.
            </div>
          ) : null}
      </div>
    </div>
  );
}
