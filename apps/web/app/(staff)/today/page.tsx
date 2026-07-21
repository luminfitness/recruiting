import Link from "next/link";
import { eq } from "drizzle-orm";
import { cadenceRules, jobPostings, localReferrals } from "@usapt/db/schema";
import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";
import { computeFunnel } from "@/lib/analytics";
import { listDecisionQueue } from "@/lib/decisions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACTION_LABEL: Record<string, string> = { post: "Post ads", switch_mode: "Switch to trainer mode", end: "End ads", remind: "Send reminders" };

export default async function DashboardPage() {
  const today = new Date();
  const dow = today.getDay();

  const { funnel, queue, cadence, alerts } = await withUser(async (tx, client, user) => {
    const funnel = await computeFunnel(tx, client, {});
    const queue = await listDecisionQueue(tx);
    const rules = await tx.select().from(cadenceRules).where(eq(cadenceRules.orgId, user.orgId)).orderBy(cadenceRules.dayOfWeek, cadenceRules.time);
    const pendingPostings = (await tx.select().from(jobPostings).where(eq(jobPostings.status, "pending_manual_action"))).length;
    const agingReferrals = (await tx.select().from(localReferrals)).filter((r) => r.agingAlertedAt && !r.outcome).length;
    return {
      funnel,
      queue,
      cadence: rules,
      alerts: { pendingPostings, agingReferrals, bundles: queue.length },
    };
  });

  const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s]));
  const stats = [
    { label: "Applicants", key: "applicants" },
    { label: "Booked", key: "booked" },
    { label: "Attended", key: "attended" },
    { label: "Offers", key: "offers" },
    { label: "Acceptances", key: "acceptances" },
    { label: "Graduates", key: "graduates" },
  ].map((s) => ({ label: s.label, value: String(byKey[s.key]?.count ?? 0), sub: byKey[s.key]?.conversionFromPrev != null ? `${Math.round((byKey[s.key]!.conversionFromPrev ?? 0) * 100)}% conv.` : "" }));

  const todaysCadence = cadence.filter((c) => c.dayOfWeek === dow);
  const cadenceToShow = todaysCadence.length ? todaysCadence : cadence.slice(0, 4);

  const alertItems = [
    alerts.bundles > 0 ? { label: `${alerts.bundles} decision bundle${alerts.bundles === 1 ? "" : "s"} ready`, detail: "Both grade and quiz are in — awaiting your call", status: "evaluated", href: "/decisions" } : null,
    alerts.pendingPostings > 0 ? { label: `${alerts.pendingPostings} posting${alerts.pendingPostings === 1 ? "" : "s"} to publish`, detail: "Cadence prepared them for one-click publish", status: "awaiting_review", href: "/postings" } : null,
    alerts.agingReferrals > 0 ? { label: `${alerts.agingReferrals} referral${alerts.agingReferrals === 1 ? "" : "s"} aging`, detail: "No local outcome past the threshold", status: "aging", href: "/local" } : null,
  ].filter(Boolean) as { label: string; detail: string; status: string; href: string }[];

  const sectionHeader: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid var(--usapt-border-strong)", paddingBottom: 8 };
  const btnPrimary: React.CSSProperties = { padding: "9px 16px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, textDecoration: "none", whiteSpace: "nowrap" };
  const btnSecondary: React.CSSProperties = { padding: "9px 16px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "var(--usapt-ink)", background: "#fff", border: "1px solid var(--usapt-border-strong)", textDecoration: "none", whiteSpace: "nowrap" };

  return (
    <div style={{ padding: "34px 40px 48px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>Recruiting Lead · centralized funnel</div>
          <h1 style={{ fontSize: 34, margin: "4px 0 0" }}>Today — {today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/pipeline" style={btnSecondary}>Open pipeline</Link>
          <Link href="/decisions" style={btnPrimary}>Work decision queue</Link>
        </div>
      </div>

      {/* Stat grid — 6 cols, 2px gridlines, 2px ink border (Modernist) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 2, background: "var(--usapt-border)", border: "2px solid var(--usapt-border-strong)", marginTop: 32 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--usapt-bg)", padding: "20px 18px 22px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-neutral-600)" }}>{s.label}</div>
            <div style={{ fontFamily: "var(--font-archivo), sans-serif", fontWeight: 800, fontSize: 30, fontVariantNumeric: "tabular-nums", lineHeight: 1.05, marginTop: 6 }}>{s.value}</div>
            <div style={{ fontSize: 11, marginTop: 3, color: "var(--usapt-text-muted)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 34, marginTop: 34, alignItems: "start" }}>
        <section>
          <div style={sectionHeader}><h3 style={{ fontSize: 17, margin: 0 }}>{todaysCadence.length ? "Today's cadence" : "Weekly cadence"}</h3></div>
          {cadenceToShow.map((c) => (
            <div key={c.id} style={{ display: "flex", gap: 14, padding: "20px 0", borderBottom: "1px solid var(--usapt-border)" }}>
              <div style={{ width: 52, flex: "none" }}>
                <div style={{ fontFamily: "var(--font-archivo-black), sans-serif", fontSize: 12, color: c.dayOfWeek === dow ? "var(--usapt-brand-red)" : "var(--usapt-brand-blue)" }}>{DAYS[c.dayOfWeek]}</div>
                <div style={{ fontSize: 10, color: "var(--usapt-text-faint)" }}>{c.time.slice(0, 5)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>{ACTION_LABEL[c.action]} — {c.roleType}</div>
                <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 2 }}>on {c.channel}</div>
              </div>
              <Link href="/postings" style={{ ...btnSecondary, alignSelf: "center", padding: "5px 12px" }}>Review</Link>
            </div>
          ))}
          {cadenceToShow.length === 0 ? <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", padding: "16px 0" }}>No cadence rules yet — set them up on the Posting cadence screen.</p> : null}
        </section>

        <section>
          <div style={sectionHeader}>
            <h3 style={{ fontSize: 17, margin: 0 }}>Needs your attention</h3>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: "var(--status-action-fill)", color: "var(--status-action-text)" }}>{alertItems.length} open</span>
          </div>
          {alertItems.map((a) => (
            <Link key={a.label} href={a.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0", borderBottom: "1px solid var(--usapt-border)", textDecoration: "none", color: "var(--usapt-ink)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{a.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--usapt-text-muted)" }}>{a.detail}</div>
              </div>
              <StatusPill status={a.status} />
            </Link>
          ))}
          {alertItems.length === 0 ? <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", padding: "16px 0" }}>All clear — nothing needs attention right now.</p> : null}
        </section>
      </div>

      <section style={{ marginTop: 38 }}>
        <div style={sectionHeader}>
          <h3 style={{ fontSize: 17, margin: 0 }}>Decision queue — bundles ready</h3>
          <Link href="/decisions" style={{ fontSize: 13, fontWeight: 600, color: "var(--usapt-brand-blue)", textDecoration: "none" }}>Open queue →</Link>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
          <thead>
            <tr>
              {["Candidate", "Role", "Brand · market", "Grade", "Quiz", "Flags", ""].map((h, i) => (
                <th key={h} style={{ textAlign: i === 3 || i === 4 ? "right" : "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "1px solid var(--usapt-border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {queue.slice(0, 5).map((d) => (
              <tr key={d.candidateId}>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5, fontWeight: 600 }}>{d.name}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, textTransform: "capitalize" }}>{d.roleType}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, color: "var(--usapt-text-muted)" }}>{d.brandName} · {d.marketName}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{d.gradeTotal != null ? `${d.gradeTotal}/${d.gradeMax}` : "—"}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.quizScore != null ? `${d.quizScore}%` : "—"}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)" }}>{d.hasDisclosure ? <span style={{ fontSize: 11, color: "var(--status-action-marker)", fontWeight: 700 }}>◆ disclosure</span> : null}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", textAlign: "right" }}>
                  <Link href={`/decisions/${d.candidateId}`} style={{ ...btnSecondary, padding: "4px 12px" }}>Review</Link>
                </td>
              </tr>
            ))}
            {queue.length === 0 ? <tr><td colSpan={7} style={{ padding: 12, fontSize: 13, color: "var(--usapt-text-muted)" }}>No bundles awaiting a decision.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
