import { eq } from "drizzle-orm";
import { brands, markets } from "@usapt/db/schema";
import { withUser } from "@/lib/db-context";
import { addCandidateAction } from "./actions";

export default async function NewCandidatePage() {
  const { brandRows, marketRows } = await withUser(async (tx, _client, user) => {
    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, user.orgId));
    const marketRows = await tx.select().from(markets);
    return { brandRows, marketRows };
  });

  // Only markets belonging to this org's brands (RLS already filters, but keep the join tidy for the picker).
  const brandIds = new Set(brandRows.map((b) => b.id));
  const scopedMarkets = marketRows.filter((m) => brandIds.has(m.brandId));

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 14,
    border: "1px solid var(--usapt-border)",
    background: "var(--usapt-surface-raised)",
    width: "100%",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 };

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 560 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Application intake · triage
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 8px" }}>Add a candidate</h1>
      <p style={{ color: "var(--usapt-text-muted)", marginBottom: 24, fontSize: 13.5 }}>
        The manual-add path (walk-ins, referrals, un-parseable applications). On save, the system issues the candidate&apos;s
        identity token and sends the interview invitation automatically.
      </p>

      <form action={addCandidateAction} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>First name</label>
            <input name="firstName" required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Last name</label>
            <input name="lastName" required style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input name="email" type="email" required style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Phone (for SMS invite)</label>
          <input name="phone" style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Role</label>
            <select name="roleType" required style={inputStyle} defaultValue="trainer">
              <option value="trainer">Trainer</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Source</label>
            <select name="source" required style={inputStyle} defaultValue="referral">
              <option value="referral">Referral</option>
              <option value="indeed">Indeed</option>
              <option value="linkedin">LinkedIn</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div>
          <label style={labelStyle}>Brand</label>
          <select name="brandId" required style={inputStyle}>
            <option value="">Select brand…</option>
            {brandRows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Market</label>
          <select name="marketId" required style={inputStyle}>
            <option value="">Select market…</option>
            {scopedMarkets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          style={{
            marginTop: 4,
            padding: "12px 16px",
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 14,
            color: "#fff",
            background: "var(--usapt-brand-blue)",
            border: 0,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          Add candidate &amp; send invitation
        </button>
      </form>
    </div>
  );
}
