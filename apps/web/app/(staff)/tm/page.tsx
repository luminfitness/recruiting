import { withUser } from "@/lib/db-context";
import { listNoShowQueue } from "@/lib/tm";
import { recordTmOutreachAction } from "./actions";

export default async function TmQueuePage() {
  const queue = await withUser((tx) => listNoShowQueue(tx));

  return (
    <div style={{ minHeight: "100%", background: "var(--usapt-neutral-700)", padding: "28px 20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-neutral-300)", marginBottom: 12 }}>
        Field · 390px · Territory manager
      </div>
      <div style={{ width: 390, maxWidth: "100%", background: "var(--usapt-bg)", boxShadow: "var(--usapt-shadow-lg)", display: "flex", flexDirection: "column" }}>
        <div style={{ background: "var(--usapt-brand-blue)", color: "#fff", padding: "14px 18px" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>No-show outreach</span>
          <div style={{ fontSize: 11, color: "#9db4d6", marginTop: 8 }}>{queue.length} to reach · your territory</div>
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          {queue.map((c) => (
            <div key={c.candidateId} style={{ background: "#fff", border: "1px solid var(--usapt-border)", padding: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 2, textTransform: "capitalize" }}>
                {c.roleType} · {c.marketName}
              </div>
              <div style={{ fontSize: 13, marginTop: 8 }}>
                <a href={`tel:${c.phone ?? ""}`} style={{ color: "var(--usapt-brand-blue)", textDecoration: "none" }}>
                  {c.phone ?? "no phone"}
                </a>
                <span style={{ color: "var(--usapt-text-muted)" }}> · {c.email}</span>
              </div>
              {c.lastOutreach ? (
                <div style={{ fontSize: 11.5, color: "var(--usapt-text-faint)", marginTop: 6 }}>Last outreach: {c.lastOutreach}</div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12 }}>
                <form action={recordTmOutreachAction.bind(null, c.candidateId, "rebooked")}>
                  <button type="submit" style={{ width: "100%", minHeight: 46, fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--status-positive-marker)", border: 0, cursor: "pointer" }}>
                    Rebooked
                  </button>
                </form>
                <form action={recordTmOutreachAction.bind(null, c.candidateId, "unresponsive")}>
                  <button type="submit" style={{ width: "100%", minHeight: 46, fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "var(--status-negative-text)", background: "var(--status-negative-fill)", border: "1px solid var(--usapt-border)", cursor: "pointer" }}>
                    Unresponsive
                  </button>
                </form>
              </div>
            </div>
          ))}
          {queue.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid var(--usapt-border)", padding: 16, fontSize: 13, color: "var(--usapt-text-muted)" }}>
              No no-shows to work right now. When a candidate misses their session, they appear here for outreach.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
