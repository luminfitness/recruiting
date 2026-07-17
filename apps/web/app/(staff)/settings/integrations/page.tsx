import { requireUser, hasRole } from "@/lib/auth";
import { withUser } from "@/lib/db-context";
import { CATEGORY_META, listIntegrations } from "@/lib/integrations";
import { setIntegrationAction } from "./actions";

export default async function IntegrationsPage() {
  const authed = await requireUser();
  if (!hasRole(authed, "admin")) {
    return (
      <div style={{ padding: "34px 40px" }}>
        <h1 style={{ fontSize: 24 }}>Integrations</h1>
        <p style={{ color: "var(--usapt-text-muted)" }}>Admins only.</p>
      </div>
    );
  }

  const current = await withUser((tx, _c, user) => listIntegrations(tx, user.orgId));
  const byCat = new Map(current.map((c) => [c.category, c]));
  const inputStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)", background: "#fff" };

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 720 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Organization settings
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Integrations</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 24, maxWidth: 620 }}>
        Each category runs on Mock by default — the whole platform works with zero real credentials. Switch to a real
        provider and enter its keys (encrypted at rest) to go live; the app uses the exact same code either way.
      </p>

      {CATEGORY_META.map((m) => {
        const state = byCat.get(m.category)!;
        const activeProvider = m.providers.find((p) => p.key === state.providerKey) ?? m.providers[0];
        const onlyMock = m.providers.length === 1;
        return (
          <section key={m.category} style={{ marginBottom: 20, border: "1px solid var(--usapt-border)", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>{m.label}</h3>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", background: state.providerKey === "mock" ? "var(--usapt-neutral-200)" : "var(--status-positive-fill)", color: state.providerKey === "mock" ? "var(--usapt-neutral-700)" : "var(--status-positive-text)" }}>
                {activeProvider.label}{state.hasCredentials ? " · keys set" : ""}
              </span>
            </div>
            {onlyMock ? (
              <p style={{ fontSize: 12.5, color: "var(--usapt-text-muted)", margin: 0 }}>
                Partner-gated API (OQ-3) — runs in semi-auto mode: the system prepares each posting for one-click publish.
              </p>
            ) : (
              <form action={setIntegrationAction.bind(null, m.category)} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select name="providerKey" defaultValue={state.providerKey} style={inputStyle}>
                  {m.providers.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
                </select>
                {m.providers.filter((p) => p.key !== "mock").flatMap((p) => p.fields).filter((f, i, arr) => arr.indexOf(f) === i).map((f) => (
                  <input key={f} name={f} placeholder={f} style={{ ...inputStyle, minWidth: 160 }} autoComplete="off" />
                ))}
                <button type="submit" style={{ padding: "8px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>Save</button>
              </form>
            )}
          </section>
        );
      })}
    </div>
  );
}
