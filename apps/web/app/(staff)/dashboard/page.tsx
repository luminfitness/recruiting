export default function DashboardPage() {
  return (
    <div style={{ padding: "34px 40px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Recruiting Lead · centralized funnel
      </div>
      <h1 style={{ fontSize: 34, margin: "4px 0 0" }}>Lead dashboard</h1>
      <p style={{ marginTop: 16, color: "var(--usapt-text-muted)", maxWidth: 560 }}>
        Cadence status, decision-queue counts, and today&apos;s alerts land here in Phase 6 (posting cadence) and Phase 4
        (decision queue) — this shell exists now so navigation and auth are exercised end to end.
      </p>
    </div>
  );
}
