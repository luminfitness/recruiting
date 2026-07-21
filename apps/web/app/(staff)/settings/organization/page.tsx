import { eq } from "drizzle-orm";
import { withRequestContext } from "@usapt/db";
import { brands, markets, organizations, userRoles, users } from "@usapt/db/schema";
import { requireUser, hasRole } from "@/lib/auth";
import { assignMarketScopeAction, createBrandAction, createMarketAction, createUserAction, deactivateUserAction, reactivateUserAction } from "./actions";

const ROLE_OPTIONS = ["admin", "recruiting_lead", "trainer_coordinator", "territory_manager", "local_manager"];

export default async function AdminPage() {
  const authedUser = await requireUser();
  if (!hasRole(authedUser, "admin")) {
    return (
      <div style={{ padding: "34px 40px" }}>
        <h1 style={{ fontSize: 24 }}>Admin</h1>
        <p style={{ color: "var(--usapt-text-muted)" }}>Your account doesn&apos;t hold the admin role.</p>
      </div>
    );
  }

  const data = await withRequestContext({ orgId: authedUser.orgId, userId: authedUser.userId, marketIds: "*" }, async (tx) => {
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, authedUser.orgId));
    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, authedUser.orgId));
    const marketRows = await tx.select().from(markets);
    const userRows = await tx.select().from(users).where(eq(users.orgId, authedUser.orgId));
    const roleRows = await tx.select().from(userRoles).where(eq(userRoles.orgId, authedUser.orgId));
    return { org, brandRows, marketRows, userRows, roleRows };
  });

  const rolesByUser = new Map<string, string[]>();
  for (const r of data.roleRows) {
    rolesByUser.set(r.userId, [...(rolesByUser.get(r.userId) ?? []), r.role]);
  }
  const brandById = new Map(data.brandRows.map((b) => [b.id, b]));
  const marketsByBrand = new Map<string, typeof data.marketRows>();
  for (const m of data.marketRows) {
    if (!brandById.has(m.brandId)) continue; // belongs to another org
    marketsByBrand.set(m.brandId, [...(marketsByBrand.get(m.brandId) ?? []), m]);
  }

  const sectionStyle: React.CSSProperties = { marginTop: 32 };
  const headingStyle: React.CSSProperties = {
    fontSize: 17,
    margin: 0,
    borderBottom: "1px solid var(--usapt-border)",
    paddingBottom: 8,
  };
  const inputStyle: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: 13,
    border: "1px solid var(--usapt-border)",
    background: "var(--usapt-surface-raised)",
  };
  const buttonStyle: React.CSSProperties = {
    padding: "8px 14px",
    fontFamily: "inherit",
    fontWeight: 700,
    fontSize: 13,
    color: "#fff",
    background: "var(--usapt-brand-blue)",
    border: 0,
    cursor: "pointer",
  };

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 900 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Organization admin
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 0" }}>{data.org?.name}</h1>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>Brands</h3>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
          {data.brandRows.map((b) => (
            <li key={b.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--usapt-border)" }}>
              <strong>{b.name}</strong> <span style={{ color: "var(--usapt-text-muted)" }}>/{b.slug}</span>
              <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 4 }}>
                Markets: {(marketsByBrand.get(b.id) ?? []).map((m) => m.name).join(", ") || "none yet"}
              </div>
            </li>
          ))}
        </ul>
        <form action={createBrandAction} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input name="name" placeholder="Brand name" required style={inputStyle} />
          <input name="slug" placeholder="slug" required style={inputStyle} />
          <input name="replyIdentityName" placeholder="Reply-from name" required style={inputStyle} />
          <input name="replyIdentityEmail" type="email" placeholder="reply@brand.com" required style={inputStyle} />
          <button type="submit" style={buttonStyle}>
            Add brand
          </button>
        </form>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>Markets</h3>
        <form action={createMarketAction} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <select name="brandId" required style={inputStyle}>
            <option value="">Brand…</option>
            {data.brandRows.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input name="name" placeholder="Market name (e.g. Dallas, TX)" required style={inputStyle} />
          <input name="timezone" placeholder="America/Chicago" required style={inputStyle} />
          <button type="submit" style={buttonStyle}>
            Add market
          </button>
        </form>
      </section>

      <section style={sectionStyle}>
        <h3 style={headingStyle}>Users</h3>
        <ul style={{ listStyle: "none", padding: 0, marginTop: 12 }}>
          {data.userRows.map((u) => (
            <li key={u.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--usapt-border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, opacity: u.deactivatedAt ? 0.55 : 1 }}>
              <div>
                <strong>{u.name}</strong> <span style={{ color: "var(--usapt-text-muted)" }}>{u.email}</span>
                {u.deactivatedAt ? <span style={{ fontSize: 11, marginLeft: 6, color: "var(--status-negative-text)", background: "var(--status-negative-fill)", padding: "1px 6px" }}>deactivated</span> : null}
                <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", marginTop: 4 }}>
                  Roles: {(rolesByUser.get(u.id) ?? []).join(", ") || "none"}
                </div>
              </div>
              {u.id !== authedUser.userId ? (
                u.deactivatedAt ? (
                  <form action={reactivateUserAction.bind(null, u.id)}>
                    <button type="submit" style={{ ...inputStyle, cursor: "pointer", fontSize: 12 }}>Reactivate</button>
                  </form>
                ) : (
                  <form action={deactivateUserAction.bind(null, u.id)}>
                    <button type="submit" style={{ ...inputStyle, cursor: "pointer", fontSize: 12, color: "var(--status-risk-text)" }}>Deactivate</button>
                  </form>
                )
              ) : null}
            </li>
          ))}
        </ul>

        <div style={{ marginTop: 16, padding: 12, background: "var(--usapt-surface)", border: "1px solid var(--usapt-border)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Assign a market-scoped role</div>
          <form action={assignMarketScopeAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select name="userId" required style={inputStyle}>
              <option value="">User…</option>
              {data.userRows.filter((u) => !u.deactivatedAt).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <select name="role" required style={inputStyle} defaultValue="local_manager">
              <option value="local_manager">local_manager</option>
              <option value="territory_manager">territory_manager</option>
            </select>
            <select name="marketId" required style={inputStyle}>
              <option value="">Market…</option>
              {data.marketRows.filter((m) => brandById.has(m.brandId)).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <button type="submit" style={buttonStyle}>Grant scope</button>
          </form>
        </div>
        <form action={createUserAction} style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input name="name" placeholder="Full name" required style={inputStyle} />
          <input name="email" type="email" placeholder="email@usapt.example" required style={inputStyle} />
          <select name="role" required style={inputStyle}>
            <option value="">Role…</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button type="submit" style={buttonStyle}>
            Add user
          </button>
        </form>
      </section>
    </div>
  );
}
