import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { brands, cadenceRules, inboundEmails, jobPostings, markets } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { createManualPostingAction, endPostingAction, markPostedAction, setSpendAction } from "./actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CADENCE_LABEL: Record<string, string> = { post: "Post ads", switch_mode: "Switch to trainer mode", end: "End ads", remind: "Send reminders" };

const STATUS_STYLE: Record<string, { fill: string; fg: string; label: string }> = {
  draft: { fill: "var(--usapt-neutral-200)", fg: "var(--usapt-neutral-700)", label: "Draft" },
  pending_manual_action: { fill: "var(--status-action-fill)", fg: "var(--status-action-text)", label: "Ready to publish" },
  scheduled: { fill: "var(--status-motion-fill)", fg: "var(--status-motion-text)", label: "Scheduled" },
  live: { fill: "var(--status-positive-fill)", fg: "var(--status-positive-text)", label: "Live" },
  paused: { fill: "var(--status-action-fill)", fg: "var(--status-action-text)", label: "Paused" },
  ended: { fill: "var(--usapt-neutral-200)", fg: "var(--usapt-neutral-600)", label: "Ended" },
};

type Tab = "publish" | "week" | "intake";
const TABS: { key: Tab; label: string }[] = [
  { key: "publish", label: "Publish" },
  { key: "week", label: "This week" },
  { key: "intake", label: "Intake" },
];

export default async function SourcingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab: Tab = sp.tab === "week" || sp.tab === "intake" ? sp.tab : "publish";
  const dow = new Date().getDay();

  const { postings, scopedMarkets, brandRows, rules, triage } = await withUser(async (tx, _client, user) => {
    const postings = await tx
      .select({
        id: jobPostings.id,
        roleType: jobPostings.roleType,
        channel: jobPostings.channel,
        status: jobPostings.status,
        mode: jobPostings.mode,
        manualActionPayload: jobPostings.manualActionPayload,
        spend: jobPostings.spend,
        scheduledPostAt: jobPostings.scheduledPostAt,
        cadenceRuleId: jobPostings.cadenceRuleId,
        brandName: brands.name,
        marketName: markets.name,
      })
      .from(jobPostings)
      .leftJoin(brands, eq(brands.id, jobPostings.brandId))
      .leftJoin(markets, eq(markets.id, jobPostings.marketId))
      .orderBy(desc(jobPostings.scheduledPostAt));
    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, user.orgId));
    const brandIds = new Set(brandRows.map((b) => b.id));
    const scopedMarkets = (await tx.select().from(markets)).filter((m) => brandIds.has(m.brandId));
    const rules = await tx
      .select()
      .from(cadenceRules)
      .where(and(eq(cadenceRules.orgId, user.orgId), eq(cadenceRules.active, true)))
      .orderBy(cadenceRules.dayOfWeek, cadenceRules.time);
    const triage = await tx
      .select()
      .from(inboundEmails)
      .where(sql`${inboundEmails.orgId} = ${user.orgId} AND ${inboundEmails.parsedStatus} <> 'parsed'`)
      .orderBy(desc(inboundEmails.createdAt));
    return { postings, scopedMarkets, brandRows, rules, triage };
  });

  const pending = postings.filter((p) => p.status === "pending_manual_action");
  const inputStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "1px solid var(--usapt-border)" };
  const td: React.CSSProperties = { padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, verticalAlign: "top" };
  const h3: React.CSSProperties = { fontSize: 15, margin: "0 0 10px", borderBottom: "1px solid var(--usapt-border)", paddingBottom: 8 };

  const counts: Record<Tab, number> = { publish: pending.length, week: rules.filter((r) => r.dayOfWeek === dow).length, intake: triage.length };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        The funnel · step 1
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Sourcing</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 18, maxWidth: 660 }}>
        One place to get candidates in — publish the postings the cadence engine prepared, see this week&rsquo;s
        Sun/Tue/Thu ritual, and clear anything that couldn&rsquo;t auto-parse into a candidate.
      </p>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--usapt-border)", marginBottom: 24 }}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.key === "publish" ? "/sourcing" : `/sourcing?tab=${t.key}`}
              style={{
                padding: "10px 18px",
                fontSize: 13.5,
                fontWeight: 700,
                textDecoration: "none",
                color: active ? "var(--usapt-brand-blue)" : "var(--usapt-text-muted)",
                borderBottom: `3px solid ${active ? "var(--usapt-brand-red)" : "transparent"}`,
                marginBottom: -2,
              }}
            >
              {t.label}
              {counts[t.key] > 0 ? (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, padding: "1px 7px", background: "var(--status-action-fill)", color: "var(--status-action-text)" }}>{counts[t.key]}</span>
              ) : null}
            </Link>
          );
        })}
      </div>

      {tab === "publish" ? (
        <>
          {pending.length > 0 ? (
            <section style={{ marginBottom: 28 }}>
              <h3 style={h3}>Ready to publish</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pending.map((p) => {
                  const pkg = p.manualActionPayload as { copy?: string; schedulingLink?: string; contactNumber?: string } | null;
                  return (
                    <div key={p.id} style={{ border: "2px solid var(--status-action-marker)", background: "var(--status-action-fill)", padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <strong style={{ textTransform: "capitalize" }}>
                          {p.roleType} · {p.channel} · {p.brandName}
                          {p.marketName ? ` · ${p.marketName}` : ""}
                        </strong>
                        <span style={{ fontSize: 11, color: "var(--status-action-text)" }}>{p.cadenceRuleId ? "from cadence" : "manual"}</span>
                      </div>
                      <div style={{ background: "var(--usapt-surface-raised)", border: "1px solid var(--usapt-border)", padding: 10, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {pkg?.copy}
                        {"\n\n"}Apply / schedule: {pkg?.schedulingLink}
                        {"\n"}Questions? {pkg?.contactNumber}
                      </div>
                      <form action={markPostedAction.bind(null, p.id)} style={{ marginTop: 10 }}>
                        <button type="submit" style={{ padding: "9px 16px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>
                          ✓ Mark as posted
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section style={{ marginBottom: 28 }}>
            <h3 style={h3}>Ad-hoc posting (Friday slot)</h3>
            <form action={createManualPostingAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select name="brandId" required style={inputStyle}>
                <option value="">Brand…</option>
                {brandRows.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <select name="marketId" style={inputStyle} defaultValue="">
                <option value="">All markets</option>
                {scopedMarkets.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <select name="roleType" style={inputStyle} defaultValue="trainer">
                <option value="trainer">Trainer</option>
                <option value="manager">Manager</option>
              </select>
              <select name="channel" style={inputStyle} defaultValue="indeed">
                <option value="indeed">Indeed</option>
                <option value="linkedin">LinkedIn</option>
                <option value="other">Other</option>
              </select>
              <input name="spend" placeholder="Spend $" style={{ ...inputStyle, width: 100 }} />
              <button type="submit" style={{ padding: "8px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>
                Prepare posting
              </button>
            </form>
          </section>

          <h3 style={h3}>All postings</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Role", "Channel", "Brand · market", "Status", "Mode", "Spend", ""].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {postings.map((p) => {
                const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.draft;
                return (
                  <tr key={p.id}>
                    <td style={{ ...td, fontSize: 13.5, textTransform: "capitalize", fontWeight: 600 }}>{p.roleType}</td>
                    <td style={{ ...td, fontSize: 13.5, textTransform: "capitalize" }}>{p.channel}</td>
                    <td style={{ ...td, fontSize: 13.5, color: "var(--usapt-text-muted)" }}>{p.brandName}{p.marketName ? ` · ${p.marketName}` : ""}</td>
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: st.fill, color: st.fg }}>{st.label}</span></td>
                    <td style={{ ...td, fontSize: 12, color: "var(--usapt-text-muted)" }}>{p.mode === "full_auto" ? "Auto" : "Semi"}</td>
                    <td style={{ ...td, fontSize: 13 }}>
                      <form action={setSpendAction.bind(null, p.id)} style={{ display: "flex", gap: 4 }}>
                        <input name="spend" defaultValue={p.spend ?? ""} placeholder="$" style={{ width: 70, padding: "4px 6px", fontSize: 12, border: "1px solid var(--usapt-border)" }} />
                        <button type="submit" style={{ padding: "4px 8px", fontSize: 11, border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)", cursor: "pointer" }}>Save</button>
                      </form>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      {p.status === "live" ? (
                        <form action={endPostingAction.bind(null, p.id)}>
                          <button type="submit" style={{ padding: "4px 10px", fontSize: 12, border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)", cursor: "pointer" }}>End</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {postings.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...td, color: "var(--usapt-text-muted)" }}>
                    No postings yet. Seed the cadence ruleset in Settings, or prepare an ad-hoc posting above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </>
      ) : null}

      {tab === "week" ? (
        <section>
          <h3 style={h3}>This week&rsquo;s ritual</h3>
          <p style={{ fontSize: 12.5, color: "var(--usapt-text-muted)", margin: "-2px 0 16px", maxWidth: 620 }}>
            The Sunday/Tuesday/Thursday cadence that fires automatically — no one has to remember it&rsquo;s Tuesday. To
            change the schedule, edit the rules in <Link href="/settings/cadence-rules" style={{ color: "var(--usapt-brand-blue)" }}>Settings → Cadence rules</Link>.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, background: "var(--usapt-border)", border: "1px solid var(--usapt-border)" }}>
            {DAYS.map((day, i) => {
              const dayRules = rules.filter((r) => r.dayOfWeek === i);
              const isToday = i === dow;
              return (
                <div key={day} style={{ background: "var(--usapt-bg)", padding: "10px 10px 14px", minHeight: 150 }}>
                  <div style={{ fontFamily: "var(--font-archivo-black), sans-serif", fontSize: 11, color: isToday ? "var(--usapt-brand-red)" : "var(--usapt-brand-blue)", letterSpacing: "0.04em" }}>
                    {day.slice(0, 3).toUpperCase()}{isToday ? " ·" : ""}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                    {dayRules.map((r) => (
                      <div key={r.id} style={{ borderLeft: "3px solid var(--status-action-marker)", background: "var(--usapt-surface)", padding: "6px 8px" }}>
                        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{CADENCE_LABEL[r.action] ?? r.action}</div>
                        <div style={{ fontSize: 10.5, color: "var(--usapt-text-muted)", marginTop: 2, textTransform: "capitalize" }}>{r.roleType} · {r.time.slice(0, 5)}</div>
                      </div>
                    ))}
                    {dayRules.length === 0 ? <div style={{ fontSize: 11, color: "var(--usapt-text-faint)" }}>—</div> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {rules.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginTop: 16 }}>
              No active cadence rules. Seed the default USAPT ruleset in Settings → Cadence rules.
            </p>
          ) : null}
        </section>
      ) : null}

      {tab === "intake" ? (
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...h3 } as React.CSSProperties}>
            <span>Application intake</span>
            <Link href="/candidates/new" style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "var(--usapt-brand-blue)", padding: "7px 14px", textDecoration: "none" }}>
              ＋ Add candidate manually
            </Link>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--usapt-text-muted)", margin: "-2px 0 16px", maxWidth: 640 }}>
            Inbound applications that couldn&rsquo;t be auto-parsed into a candidate — missing contact info, an unknown
            brand/market, or a notification-format change. A silent parse-rate drop is logged as an incident, not swallowed.
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Received", "Status", "Parser v", "From", "Subject"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {triage.map((r) => {
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
              {triage.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ ...td, color: "var(--usapt-text-muted)" }}>Nothing in triage — all inbound applications parsed cleanly.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
