import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { brands, candidates, candidateStatusHistory, markets } from "@usapt/db/schema";
import { StatusPill } from "@usapt/design-tokens";
import { withUser } from "@/lib/db-context";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const data = await withUser(async (tx) => {
    const [candidate] = await tx
      .select({
        id: candidates.id,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        phone: candidates.phone,
        roleType: candidates.roleType,
        source: candidates.source,
        status: candidates.status,
        token: candidates.token,
        appliedAt: candidates.appliedAt,
        duplicateOf: candidates.duplicateOf,
        brandName: brands.name,
        marketName: markets.name,
      })
      .from(candidates)
      .leftJoin(brands, eq(brands.id, candidates.brandId))
      .leftJoin(markets, eq(markets.id, candidates.marketId))
      .where(eq(candidates.id, id));

    if (!candidate) return { candidate: null, timeline: [] };

    const timeline = await tx
      .select()
      .from(candidateStatusHistory)
      .where(eq(candidateStatusHistory.candidateId, id))
      .orderBy(asc(candidateStatusHistory.createdAt));

    return { candidate, timeline };
  });

  if (!data.candidate) {
    return (
      <div style={{ padding: "34px 40px" }}>
        <h1 style={{ fontSize: 24 }}>Candidate not found</h1>
        <p style={{ color: "var(--usapt-text-muted)" }}>
          It may belong to a market outside your access. <Link href="/pipeline">Back to pipeline</Link>
        </p>
      </div>
    );
  }

  const c = data.candidate;
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const bookingUrl = `${baseUrl}/t/${c.token}`;

  const initials = `${c.firstName[0] ?? ""}${c.lastName[0] ?? ""}`.toUpperCase();
  const sectionLabel: React.CSSProperties = {
    fontSize: 12,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--usapt-text-muted)",
    margin: "0 0 10px",
  };

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 900 }}>
      <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginBottom: 12 }}>
        <Link href="/pipeline" style={{ color: "inherit" }}>
          Pipeline
        </Link>{" "}
        → Candidate
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, borderBottom: "2px solid var(--usapt-border-strong)", paddingBottom: 16 }}>
        <div
          style={{
            width: 52,
            height: 52,
            flex: "none",
            background: "var(--usapt-ink)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-archivo-black)",
            fontSize: 18,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 28, margin: 0 }}>
            {c.firstName} {c.lastName}
          </h1>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", fontSize: 12, color: "var(--usapt-text-muted)" }}>
            <span style={{ textTransform: "capitalize" }}>{c.roleType}</span>
            <span>·</span>
            <span>{c.brandName}</span>
            <span>·</span>
            <span>{c.marketName}</span>
            <span>·</span>
            <span style={{ textTransform: "capitalize" }}>{c.source}</span>
          </div>
        </div>
        <StatusPill status={c.status} />
      </div>

      {c.duplicateOf ? (
        <div style={{ marginTop: 16, padding: "10px 12px", background: "var(--status-action-fill)", color: "var(--status-action-text)", fontSize: 12.5 }}>
          This is a re-application. <Link href={`/candidates/${c.duplicateOf}`} style={{ color: "inherit" }}>View prior record →</Link>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40, marginTop: 28, alignItems: "start" }}>
        <section>
          <h4 style={sectionLabel}>Identity thread — event feed</h4>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.timeline.map((e, i) => (
              <div key={e.id} style={{ display: "flex", gap: 10, paddingBottom: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
                  <span style={{ width: 9, height: 9, background: "var(--usapt-brand-blue)", marginTop: 4 }} />
                  {i < data.timeline.length - 1 ? <span style={{ flex: 1, width: 1, background: "var(--usapt-border)", marginTop: 2 }} /> : null}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {e.fromStatus ? `${e.fromStatus} → ${e.toStatus}` : e.toStatus}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--usapt-text-muted)" }}>
                    event: {e.event}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--usapt-text-faint)", marginTop: 1 }}>
                    {new Date(e.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <h4 style={sectionLabel}>Contact</h4>
            <div style={{ fontSize: 13.5 }}>{c.email}</div>
            {c.phone ? <div style={{ fontSize: 13.5, color: "var(--usapt-text-muted)" }}>{c.phone}</div> : null}
          </div>
          <div>
            <h4 style={sectionLabel}>Personal token link</h4>
            <div style={{ fontSize: 11.5, color: "var(--usapt-text-muted)", wordBreak: "break-all", padding: "8px 10px", background: "var(--usapt-surface)", border: "1px solid var(--usapt-border)" }}>
              {bookingUrl}
            </div>
            <p style={{ fontSize: 11, color: "var(--usapt-text-faint)", marginTop: 6 }}>
              Carries this candidate&apos;s identity end-to-end — booking, attendance, and quiz all attach by this token,
              never by name.
            </p>
          </div>
          <div>
            <h4 style={sectionLabel}>Applied</h4>
            <div style={{ fontSize: 13.5 }}>{new Date(c.appliedAt).toLocaleString()}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
