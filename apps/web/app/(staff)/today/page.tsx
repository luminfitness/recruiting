import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { cadenceRules, jobPostings, localReferrals, offers, candidates } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { hasRole } from "@/lib/auth";
import { primaryRoleLabel } from "@/lib/roles";
import { computeFunnel } from "@/lib/analytics";
import { listDecisionQueue } from "@/lib/decisions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ACTION_LABEL: Record<string, string> = {
  post: "Post ads",
  switch_mode: "Switch to trainer mode",
  end: "End ads",
  remind: "Send reminders",
};

// Time thresholds (FR §6 defaults) used to flag aging work on the action hub.
const OFFER_AGING_DAYS = 5;

type Family = "motion" | "action" | "positive" | "negative" | "risk";
type ActionItem = { key: string; family: Family; title: string; detail: string; cta: string; href: string };

export default async function TodayPage() {
  const now = new Date();
  const dow = now.getDay();
  const offerAgingCutoff = new Date(now.getTime() - OFFER_AGING_DAYS * 86400000);

  const data = await withUser(async (tx, client, user) => {
    const funnel = await computeFunnel(tx, client, {});
    const queue = await listDecisionQueue(tx);
    const rules = await tx
      .select()
      .from(cadenceRules)
      .where(and(eq(cadenceRules.orgId, user.orgId), eq(cadenceRules.active, true)))
      .orderBy(cadenceRules.dayOfWeek, cadenceRules.time);
    const pendingPostings = (
      await tx.select({ id: jobPostings.id }).from(jobPostings).where(eq(jobPostings.status, "pending_manual_action"))
    ).length;

    const referralRows = await tx
      .select({ outcome: localReferrals.outcome, agingAlertedAt: localReferrals.agingAlertedAt })
      .from(localReferrals);
    const referralsAging = referralRows.filter((r) => !r.outcome && r.agingAlertedAt).length;

    const offerRows = await tx
      .select({ sentAt: offers.sentAt })
      .from(offers)
      .innerJoin(candidates, eq(candidates.id, offers.candidateId))
      .where(and(isNull(offers.response), isNull(offers.retractedAt)));
    const offersAwaiting = offerRows.length;
    const offersAging = offerRows.filter((r) => r.sentAt < offerAgingCutoff).length;

    return { funnel, queue, rules, pendingPostings, referralsAging, offersAwaiting, offersAging, roles: user.roles };
  });

  const { funnel, queue, rules, pendingPostings, referralsAging, offersAwaiting, offersAging, roles } = data;
  const canManagerOffers = roles.includes("recruiting_lead") || roles.includes("admin");
  const isTrainerCoord = roles.includes("trainer_coordinator");
  const plural = (n: number) => (n === 1 ? "" : "s");

  const byKey = Object.fromEntries(funnel.stages.map((s) => [s.key, s]));
  const stats = [
    { label: "Applicants", key: "applicants" },
    { label: "Booked", key: "booked" },
    { label: "Attended", key: "attended" },
    { label: "Offers", key: "offers" },
    { label: "Acceptances", key: "acceptances" },
    { label: "Graduates", key: "graduates" },
  ].map((s) => ({
    label: s.label,
    value: String(byKey[s.key]?.count ?? 0),
    sub: byKey[s.key]?.conversionFromPrev != null ? `${Math.round((byKey[s.key]!.conversionFromPrev ?? 0) * 100)}% conv.` : "",
  }));

  // Prioritized action list — most time-sensitive first (the anti-spreadsheet).
  const todaysRules = rules.filter((r) => r.dayOfWeek === dow);
  const actions: ActionItem[] = [];
  for (const r of todaysRules) {
    actions.push({
      key: `cadence-${r.id}`,
      family: "action",
      title: `${ACTION_LABEL[r.action] ?? r.action} — ${r.roleType}`,
      detail: `Today's ${DAYS[dow]} ritual · ${r.channel} · ${r.time.slice(0, 5)}`,
      cta: "Do it",
      href: "/postings",
    });
  }
  if (queue.length) {
    actions.push({
      key: "bundles",
      family: "motion",
      title: `${queue.length} decision bundle${plural(queue.length)} ready`,
      detail: "Grade and quiz are both in — awaiting your call",
      cta: "Review",
      href: "/decisions",
    });
  }
  if (pendingPostings) {
    actions.push({
      key: "postings",
      family: "action",
      title: `${pendingPostings} posting${plural(pendingPostings)} to publish`,
      detail: "Cadence prepared them for one-click publish",
      cta: "Publish",
      href: "/postings",
    });
  }
  if (canManagerOffers && offersAwaiting) {
    actions.push({
      key: "offers",
      family: offersAging ? "risk" : "motion",
      title: offersAging
        ? `${offersAging} offer${plural(offersAging)} aging`
        : `${offersAwaiting} offer${plural(offersAwaiting)} awaiting reply`,
      detail: offersAging ? "No reply past the 5-day threshold — nudge the candidate" : "Manager offers with no response yet",
      cta: "Nudge",
      href: "/pipeline",
    });
  }
  if (referralsAging) {
    actions.push({
      key: "referrals",
      family: "risk",
      title: `${referralsAging} referral${plural(referralsAging)} stale`,
      detail: "No local working-interview outcome past the threshold",
      cta: "Follow up",
      href: "/pipeline",
    });
  }

  const roleLabel = primaryRoleLabel(roles);
  const scopeLine = isTrainerCoord && !roles.includes("recruiting_lead") ? "trainer pipeline & local handoff" : "centralized funnel";

  const sectionHeader: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: "2px solid var(--usapt-border-strong)",
    paddingBottom: 8,
  };
  const btnPrimary: React.CSSProperties = { padding: "9px 16px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, textDecoration: "none", whiteSpace: "nowrap" };
  const btnSecondary: React.CSSProperties = { padding: "9px 16px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "var(--usapt-ink)", background: "#fff", border: "1px solid var(--usapt-border-strong)", textDecoration: "none", whiteSpace: "nowrap" };

  return (
    <div style={{ padding: "34px 40px 48px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
            {roleLabel} · {scopeLine}
          </div>
          <h1 style={{ fontSize: 34, margin: "4px 0 0" }}>Today — {now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</h1>
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

      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 34, marginTop: 34, alignItems: "start" }}>
        <section>
          <div style={sectionHeader}>
            <h3 style={{ fontSize: 17, margin: 0 }}>What needs you now</h3>
            {actions.length > 0 ? (
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: "var(--status-action-fill)", color: "var(--status-action-text)" }}>{actions.length} open</span>
            ) : null}
          </div>
          {actions.map((a) => (
            <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 0", borderBottom: "1px solid var(--usapt-border)" }}>
              <span aria-hidden style={{ width: 10, height: 10, flex: "none", background: `var(--status-${a.family}-marker)` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 2 }}>{a.detail}</div>
              </div>
              <Link href={a.href} style={{ ...btnSecondary, padding: "6px 14px" }}>{a.cta} →</Link>
            </div>
          ))}
          {actions.length === 0 ? (
            <p style={{ fontSize: 13.5, color: "var(--usapt-text-muted)", padding: "20px 0" }}>
              You&rsquo;re all caught up — nothing needs you right now.
            </p>
          ) : null}
        </section>

        <section>
          <div style={sectionHeader}>
            <h3 style={{ fontSize: 17, margin: 0 }}>This week&rsquo;s ritual</h3>
            <Link href="/postings" style={{ fontSize: 13, fontWeight: 600, color: "var(--usapt-brand-blue)", textDecoration: "none" }}>Sourcing →</Link>
          </div>
          {rules.map((c) => {
            const isToday = c.dayOfWeek === dow;
            return (
              <div key={c.id} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--usapt-border)", opacity: isToday ? 1 : 0.72 }}>
                <div style={{ width: 44, flex: "none" }}>
                  <div style={{ fontFamily: "var(--font-archivo-black), sans-serif", fontSize: 12, color: isToday ? "var(--usapt-brand-red)" : "var(--usapt-brand-blue)" }}>{DAYS[c.dayOfWeek].slice(0, 3)}</div>
                  <div style={{ fontSize: 10, color: "var(--usapt-text-faint)" }}>{c.time.slice(0, 5)}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{ACTION_LABEL[c.action] ?? c.action} — <span style={{ textTransform: "capitalize" }}>{c.roleType}</span></div>
                  <div style={{ fontSize: 11.5, color: "var(--usapt-text-muted)", marginTop: 1 }}>on {c.channel}</div>
                </div>
              </div>
            );
          })}
          {rules.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", padding: "16px 0" }}>No cadence rules yet — set them up in Settings.</p>
          ) : null}
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
