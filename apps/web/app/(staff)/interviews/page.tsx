import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { brands, interviewSessions, markets, sessionBookings } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { createSessionAction } from "./actions";

export default async function RosterIndexPage() {
  const { sessions, scopedMarkets } = await withUser(async (tx, _client, user) => {
    const sessions = await tx
      .select({
        id: interviewSessions.id,
        roleType: interviewSessions.roleType,
        scheduledAt: interviewSessions.scheduledAt,
        capacity: interviewSessions.capacity,
        marketName: markets.name,
        booked: sql<number>`(select count(*)::int from ${sessionBookings} sb where sb.session_id = ${interviewSessions.id} and sb.status = 'booked')`,
      })
      .from(interviewSessions)
      .leftJoin(markets, eq(markets.id, interviewSessions.marketId))
      .orderBy(asc(interviewSessions.scheduledAt));

    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, user.orgId));
    const brandIds = new Set(brandRows.map((b) => b.id));
    const marketRows = await tx.select().from(markets);
    const scopedMarkets = marketRows.filter((m) => brandIds.has(m.brandId));
    return { sessions, scopedMarkets };
  });

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 10,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--usapt-text-muted)",
    padding: "8px 12px",
    borderBottom: "1px solid var(--usapt-border)",
  };
  const td: React.CSSProperties = { padding: "12px", borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5 };
  const inputStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)" };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        The funnel · step 2
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 20px" }}>Interviews</h1>

      <section style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "1px solid var(--usapt-border)", paddingBottom: 8 }}>
          Schedule a session
        </h3>
        <form action={createSessionAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select name="roleType" required style={inputStyle} defaultValue="trainer">
            <option value="trainer">Trainer</option>
            <option value="manager">Manager</option>
          </select>
          <select name="marketId" style={inputStyle} defaultValue="">
            <option value="">All markets</option>
            {scopedMarkets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input name="scheduledAt" type="datetime-local" required style={inputStyle} />
          <input name="capacity" type="number" min={1} defaultValue={12} required style={{ ...inputStyle, width: 90 }} />
          <button
            type="submit"
            style={{ padding: "8px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}
          >
            Add session
          </button>
        </form>
      </section>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>When</th>
            <th style={th}>Role</th>
            <th style={th}>Market</th>
            <th style={th}>Booked / capacity</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td style={{ ...td, fontWeight: 600 }}>{new Date(s.scheduledAt).toLocaleString()}</td>
              <td style={{ ...td, textTransform: "capitalize" }}>{s.roleType}</td>
              <td style={{ ...td, color: "var(--usapt-text-muted)" }}>{s.marketName ?? "All markets"}</td>
              <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                {s.booked} / {s.capacity}
              </td>
              <td style={{ ...td, textAlign: "right" }}>
                <Link href={`/interviews/${s.id}`} style={{ color: "var(--usapt-brand-blue)", fontWeight: 600, textDecoration: "none" }}>
                  Open roster →
                </Link>
              </td>
            </tr>
          ))}
          {sessions.length === 0 ? (
            <tr>
              <td style={{ ...td, color: "var(--usapt-text-muted)" }} colSpan={5}>
                No sessions scheduled yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
