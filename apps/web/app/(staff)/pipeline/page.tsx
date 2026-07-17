export default function PipelinePage() {
  return (
    <div style={{ padding: "34px 40px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Live pipeline · Master Tracker replacement
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 0" }}>Candidate pipeline</h1>
      <p style={{ marginTop: 16, color: "var(--usapt-text-muted)", maxWidth: 560 }}>
        A minimal version ships in Phase 1 (identity thread); the full kanban/table/filter/export build-out is Phase 8.
      </p>
    </div>
  );
}
