import { listOrgHealth, listSupportGrants } from "@/lib/platform";
import { createOrgAction, createSupportGrantAction } from "./actions";

export default async function PlatformDashboard() {
  const [orgs, grants] = await Promise.all([listOrgHealth(), listSupportGrants()]);

  const inputStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)", background: "#fff" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "2px solid var(--usapt-border-strong)" };
  const td: React.CSSProperties = { padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5 };
  const btn: React.CSSProperties = { padding: "8px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-ink)", border: 0, cursor: "pointer" };

  return (
    <div style={{ maxWidth: 1000 }}>
      <h1 style={{ fontSize: 28, margin: "0 0 4px" }}>Organizations</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20 }}>
        Cross-org health — aggregate counts only. No org&apos;s candidate detail is visible here; reaching into an org
        requires an explicit, time-boxed support-access grant (below), and even then it&apos;s audit-logged.
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28 }}>
        <thead>
          <tr>
            {["Organization", "Slug", "Users", "Candidates", "Created"].map((h) => (<th key={h} style={th}>{h}</th>))}
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => (
            <tr key={o.id}>
              <td style={{ ...td, fontWeight: 600 }}>{o.name}</td>
              <td style={{ ...td, color: "var(--usapt-text-muted)" }}>{o.slug}</td>
              <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{o.userCount}</td>
              <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{o.candidateCount}</td>
              <td style={{ ...td, color: "var(--usapt-text-muted)" }}>{new Date(o.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
        <section>
          <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "2px solid var(--usapt-border-strong)", paddingBottom: 8 }}>Provision an organization</h3>
          <form action={createOrgAction} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input name="name" placeholder="Organization name" required style={inputStyle} />
            <input name="slug" placeholder="slug (used in apply+slug@…)" required style={inputStyle} />
            <input name="adminName" placeholder="First admin name" required style={inputStyle} />
            <input name="adminEmail" type="email" placeholder="admin@org.example" required style={inputStyle} />
            <button type="submit" style={{ ...btn, alignSelf: "flex-start" }}>Create organization</button>
          </form>
        </section>

        <section>
          <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "2px solid var(--usapt-border-strong)", paddingBottom: 8 }}>Support access (break-glass)</h3>
          <form action={createSupportGrantAction} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            <select name="orgId" required style={inputStyle}>
              <option value="">Organization…</option>
              {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
            </select>
            <input name="reason" placeholder="Reason (required)" required style={inputStyle} />
            <input name="hours" type="number" min={1} defaultValue={4} style={{ ...inputStyle, width: 120 }} />
            <button type="submit" style={{ ...btn, alignSelf: "flex-start" }}>Grant time-boxed access</button>
          </form>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {grants.map((g) => (
              <li key={g.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--usapt-border)", fontSize: 12.5 }}>
                <strong>{g.orgName}</strong> — {g.reason}
                <div style={{ color: "var(--usapt-text-muted)" }}>
                  {new Date(g.grantedAt).toLocaleString()} → expires {new Date(g.expiresAt).toLocaleString()}
                  {g.revokedAt ? " · revoked" : new Date(g.expiresAt) < new Date() ? " · expired" : " · active"}
                </div>
              </li>
            ))}
            {grants.length === 0 ? <li style={{ fontSize: 12.5, color: "var(--usapt-text-muted)", padding: "8px 0" }}>No grants issued.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}
