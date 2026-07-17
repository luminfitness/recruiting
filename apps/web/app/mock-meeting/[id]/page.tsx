export default async function MockMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1a1a1a",
        color: "#fff",
        fontFamily: "var(--font-archivo), system-ui, sans-serif",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9b9797" }}>
          Mock meeting provider
        </div>
        <h1 style={{ fontSize: 24, margin: "8px 0" }}>You&apos;re &quot;in&quot; the interview</h1>
        <p style={{ color: "#bab6b6", maxWidth: 420 }}>
          Meeting {id} — no real video platform is wired up yet. The token-redirect page that brought you here already
          marked your attendance; this placeholder stands in for Zoom/Meet/Teams until Phase 11.
        </p>
      </div>
    </div>
  );
}
