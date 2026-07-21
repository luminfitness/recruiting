import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { brands, candidates, localReferrals, markets, offers } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { nudgeOfferAction } from "./actions";

// FR §6 thresholds surfaced as aging flags on the two hire paths.
const OFFER_AGING_DAYS = 5;

function daysAgo(d: Date, now: Date) {
  return Math.floor((now.getTime() - new Date(d).getTime()) / 86400000);
}

export default async function OffersPage() {
  const now = new Date();
  const offerAgingCutoff = new Date(now.getTime() - OFFER_AGING_DAYS * 86400000);

  const { offerRows, referralRows } = await withUser(async (tx) => {
    const offerRows = await tx
      .select({
        candidateId: offers.candidateId,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        status: candidates.status,
        brandName: brands.name,
        marketName: markets.name,
        sentAt: offers.sentAt,
        resendCount: offers.resendCount,
      })
      .from(offers)
      .innerJoin(candidates, eq(candidates.id, offers.candidateId))
      .leftJoin(brands, eq(brands.id, candidates.brandId))
      .leftJoin(markets, eq(markets.id, candidates.marketId))
      .where(and(isNull(offers.response), isNull(offers.retractedAt)))
      .orderBy(asc(offers.sentAt));

    const referralRows = await tx
      .select({
        candidateId: localReferrals.candidateId,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        marketName: markets.name,
        referredAt: localReferrals.referredAt,
        workingInterviewAt: localReferrals.workingInterviewAt,
        agingAlertedAt: localReferrals.agingAlertedAt,
      })
      .from(localReferrals)
      .innerJoin(candidates, eq(candidates.id, localReferrals.candidateId))
      .leftJoin(markets, eq(markets.id, localReferrals.marketId))
      .where(isNull(localReferrals.outcome))
      .orderBy(asc(localReferrals.referredAt));

    return { offerRows, referralRows };
  });

  const offersAging = offerRows.filter((o) => o.sentAt < offerAgingCutoff).length;
  const referralsAging = referralRows.filter((r) => r.agingAlertedAt).length;

  const eyebrow: React.CSSProperties = { fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "1px solid var(--usapt-border)" };
  const td: React.CSSProperties = { padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, verticalAlign: "middle" };
  const sectionTitle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--usapt-border)", paddingBottom: 8, marginBottom: 4 };
  const agingPill = (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", background: "var(--status-risk-fill)", color: "var(--status-risk-text)", marginLeft: 8 }}>AGING</span>
  );
  const linkBtn: React.CSSProperties = { padding: "4px 12px", fontSize: 12, fontWeight: 700, border: "1px solid var(--usapt-border-strong)", background: "var(--usapt-surface-raised)", color: "var(--usapt-ink)", textDecoration: "none" };

  const stats = [
    { label: "Offers awaiting reply", value: offerRows.length },
    { label: "Offers aging", value: offersAging, risk: true },
    { label: "Referrals in flight", value: referralRows.length },
    { label: "Referrals stale", value: referralsAging, risk: true },
  ];

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={eyebrow}>The funnel · step 4</div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Offers &amp; hiring</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 22, maxWidth: 680 }}>
        Both hire paths in one view — manager offers awaiting a reply from central recruiting, and trainer candidates
        referred out for a local working interview. Anything past its threshold is flagged so nothing stalls silently.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 2, background: "var(--usapt-border)", border: "1px solid var(--usapt-border)", marginBottom: 34 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "var(--usapt-bg)", padding: "16px 16px 18px" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-neutral-600)" }}>{s.label}</div>
            <div style={{ fontFamily: "var(--font-archivo), sans-serif", fontWeight: 800, fontSize: 28, fontVariantNumeric: "tabular-nums", lineHeight: 1.05, marginTop: 6, color: s.risk && s.value > 0 ? "var(--status-risk-text)" : "var(--usapt-ink)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 34, alignItems: "start" }}>
        {/* Manager path */}
        <section>
          <div style={sectionTitle}>
            <h3 style={{ fontSize: 17, margin: 0 }}>Manager offers</h3>
            <span style={{ fontSize: 11, color: "var(--usapt-text-muted)" }}>awaiting reply</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Candidate", "Brand · market", "Sent", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {offerRows.map((o) => {
                const aging = o.sentAt < offerAgingCutoff;
                return (
                  <tr key={o.candidateId}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      <Link href={`/candidates/${o.candidateId}`} style={{ color: "var(--usapt-ink)", textDecoration: "none" }}>
                        {o.firstName} {o.lastName}
                      </Link>
                      {aging ? agingPill : null}
                      {o.resendCount > 0 ? <span style={{ fontSize: 10.5, color: "var(--usapt-text-faint)", marginLeft: 6 }}>· nudged {o.resendCount}×</span> : null}
                    </td>
                    <td style={{ ...td, color: "var(--usapt-text-muted)" }}>{o.brandName}{o.marketName ? ` · ${o.marketName}` : ""}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{daysAgo(o.sentAt, now)}d ago</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <form action={nudgeOfferAction.bind(null, o.candidateId)}>
                        <button type="submit" style={{ padding: "4px 12px", fontSize: 12, fontWeight: 700, border: 0, background: "var(--usapt-brand-blue)", color: "#fff", cursor: "pointer" }}>Nudge</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {offerRows.length === 0 ? (
                <tr><td colSpan={4} style={{ ...td, color: "var(--usapt-text-muted)" }}>No manager offers awaiting a reply.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {/* Trainer path */}
        <section>
          <div style={sectionTitle}>
            <h3 style={{ fontSize: 17, margin: 0 }}>Trainer referrals</h3>
            <span style={{ fontSize: 11, color: "var(--usapt-text-muted)" }}>in flight locally</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Candidate", "Market", "Stage", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {referralRows.map((r) => (
                <tr key={r.candidateId}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    <Link href={`/candidates/${r.candidateId}`} style={{ color: "var(--usapt-ink)", textDecoration: "none" }}>
                      {r.firstName} {r.lastName}
                    </Link>
                    {r.agingAlertedAt ? agingPill : null}
                  </td>
                  <td style={{ ...td, color: "var(--usapt-text-muted)" }}>{r.marketName ?? "—"}</td>
                  <td style={td}>
                    {r.workingInterviewAt ? (
                      <span style={{ fontSize: 12 }}>Interview {new Date(r.workingInterviewAt).toLocaleDateString()}</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: "var(--status-motion-fill)", color: "var(--status-motion-text)" }}>Referred · {daysAgo(r.referredAt, now)}d</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <Link href={`/candidates/${r.candidateId}`} style={linkBtn}>Open</Link>
                  </td>
                </tr>
              ))}
              {referralRows.length === 0 ? (
                <tr><td colSpan={4} style={{ ...td, color: "var(--usapt-text-muted)" }}>No trainer referrals in flight.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
