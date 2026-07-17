import { desc, eq } from "drizzle-orm";
import { brands, jobPostings, markets } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { createManualPostingAction, endPostingAction, markPostedAction, setSpendAction } from "./actions";

const STATUS_STYLE: Record<string, { fill: string; fg: string; label: string }> = {
  draft: { fill: "var(--usapt-neutral-200)", fg: "var(--usapt-neutral-700)", label: "Draft" },
  pending_manual_action: { fill: "var(--status-action-fill)", fg: "var(--status-action-text)", label: "Ready to publish" },
  scheduled: { fill: "var(--status-motion-fill)", fg: "var(--status-motion-text)", label: "Scheduled" },
  live: { fill: "var(--status-positive-fill)", fg: "var(--status-positive-text)", label: "Live" },
  paused: { fill: "var(--status-action-fill)", fg: "var(--status-action-text)", label: "Paused" },
  ended: { fill: "var(--usapt-neutral-200)", fg: "var(--usapt-neutral-600)", label: "Ended" },
};

export default async function PostingsPage() {
  const { postings, scopedMarkets, brandRows } = await withUser(async (tx, _client, user) => {
    const postings = await tx
      .select({
        id: jobPostings.id,
        roleType: jobPostings.roleType,
        channel: jobPostings.channel,
        status: jobPostings.status,
        mode: jobPostings.mode,
        copySnapshot: jobPostings.copySnapshot,
        schedulingLink: jobPostings.schedulingLink,
        contactNumber: jobPostings.contactNumber,
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
    return { postings, scopedMarkets, brandRows };
  });

  const inputStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)", background: "#fff" };
  const pending = postings.filter((p) => p.status === "pending_manual_action");

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Posting cadence · semi-auto
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Job postings</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20, maxWidth: 640 }}>
        The cadence engine prepares each posting (copy + role-correct scheduling link + phone number) and drops it here to
        publish with one click. {pending.length} ready to publish now. Analytics don&apos;t care whether a posting was
        auto- or semi-posted — the record is identical.
      </p>

      {pending.length > 0 ? (
        <section style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "2px solid var(--usapt-border-strong)", paddingBottom: 8 }}>
            Ready to publish
          </h3>
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
                  <div style={{ background: "#fff", border: "1px solid var(--usapt-border)", padding: 10, fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
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
        <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "2px solid var(--usapt-border-strong)", paddingBottom: 8 }}>
          Ad-hoc posting (Friday slot)
        </h3>
        <form action={createManualPostingAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select name="brandId" required style={inputStyle}>
            <option value="">Brand…</option>
            {brandRows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select name="marketId" style={inputStyle} defaultValue="">
            <option value="">All markets</option>
            {scopedMarkets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
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

      <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "2px solid var(--usapt-border-strong)", paddingBottom: 8 }}>
        All postings
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Role", "Channel", "Brand · market", "Status", "Mode", "Spend", ""].map((h) => (
              <th key={h} style={{ textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "2px solid var(--usapt-border-strong)" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {postings.map((p) => {
            const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.draft;
            return (
              <tr key={p.id}>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5, textTransform: "capitalize", fontWeight: 600 }}>{p.roleType}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5, textTransform: "capitalize" }}>{p.channel}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5, color: "var(--usapt-text-muted)" }}>
                  {p.brandName}
                  {p.marketName ? ` · ${p.marketName}` : ""}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: st.fill, color: st.fg }}>{st.label}</span>
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 12, color: "var(--usapt-text-muted)" }}>{p.mode === "full_auto" ? "Auto" : "Semi"}</td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13 }}>
                  <form action={setSpendAction.bind(null, p.id)} style={{ display: "flex", gap: 4 }}>
                    <input name="spend" defaultValue={p.spend ?? ""} placeholder="$" style={{ width: 70, padding: "4px 6px", fontSize: 12, border: "1px solid var(--usapt-border)" }} />
                    <button type="submit" style={{ padding: "4px 8px", fontSize: 11, border: "1px solid var(--usapt-border)", background: "#fff", cursor: "pointer" }}>
                      Save
                    </button>
                  </form>
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", textAlign: "right" }}>
                  {p.status === "live" ? (
                    <form action={endPostingAction.bind(null, p.id)}>
                      <button type="submit" style={{ padding: "4px 10px", fontSize: 12, border: "1px solid var(--usapt-border)", background: "#fff", cursor: "pointer" }}>
                        End
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {postings.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13, color: "var(--usapt-text-muted)" }}>
                No postings yet. Seed the cadence ruleset (Cadence screen) or prepare an ad-hoc posting above.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
