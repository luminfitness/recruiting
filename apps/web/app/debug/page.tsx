import { notFound } from "next/navigation";
import { StatusPill } from "@usapt/design-tokens";
import { isDemoMode, listDemoUsers } from "@/lib/demo";
import { becomeUserAction } from "./actions";

const ROLE_BLURB: Record<string, string> = {
  admin: "Everything — org config, users, integrations, audit",
  recruiting_lead: "Full pipeline, cadence, decisions, offers, analytics",
  trainer_coordinator: "Trainer pipeline, decision queue, local handoff",
  territory_manager: "No-show outreach queue for their territory",
  local_manager: "Their market's trainer working-interview queue",
};

export default async function DebugPage() {
  if (!isDemoMode()) notFound();
  const users = await listDemoUsers();

  const card: React.CSSProperties = { border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)", padding: 18, display: "flex", flexDirection: "column", gap: 10 };

  return (
    <div style={{ minHeight: "100vh", background: "var(--usapt-bg)", fontFamily: "var(--font-archivo), system-ui, sans-serif", color: "var(--usapt-ink)" }}>
      <div style={{ background: "var(--usapt-ink)", color: "#fff", padding: "12px 24px", borderBottom: "3px solid var(--usapt-brand-red)", display: "flex", alignItems: "center", gap: 12 }}>
        <strong style={{ fontFamily: "var(--font-archivo-black)" }}>Demo mode</strong>
        <span style={{ fontSize: 12, color: "var(--usapt-neutral-400)" }}>Switch user — no password needed</span>
      </div>

      <div style={{ padding: "32px 24px", maxWidth: 1000, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, margin: "0 0 4px" }}>Who do you want to be?</h1>
        <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 24, maxWidth: 640 }}>
          Pick a persona to jump straight into their role-scoped view. Each sees a different queue and access level — this
          is the fastest way to walk through the whole product. (Demo-only; disabled in production.)
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {users.map((u) => (
            <form key={u.id} action={becomeUserAction.bind(null, u.id)} style={card}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{u.name}</div>
                <div style={{ fontSize: 12, color: "var(--usapt-text-muted)" }}>{u.email}</div>
                <div style={{ fontSize: 11, color: "var(--usapt-text-faint)", marginTop: 2 }}>{u.orgName}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {u.roles.map((r) => (
                  <StatusPill key={r} status="motion" label={r.replace(/_/g, " ")} />
                ))}
                {u.roles.length === 0 ? <span style={{ fontSize: 12, color: "var(--usapt-text-faint)" }}>no roles</span> : null}
              </div>
              {u.markets.length ? (
                <div style={{ fontSize: 11.5, color: "var(--usapt-text-muted)" }}>Markets: {u.markets.join(", ")}</div>
              ) : u.roles.some((r) => ["admin", "recruiting_lead", "trainer_coordinator"].includes(r)) ? (
                <div style={{ fontSize: 11.5, color: "var(--usapt-text-muted)" }}>Org-wide access</div>
              ) : null}
              <div style={{ fontSize: 11.5, color: "var(--usapt-text-faint)", flex: 1 }}>{ROLE_BLURB[u.roles[0]] ?? ""}</div>
              <button type="submit" style={{ marginTop: 4, padding: "10px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>
                Become {u.name.split(" ")[0]} →
              </button>
            </form>
          ))}
        </div>

        <div style={{ marginTop: 28, fontSize: 12.5, color: "var(--usapt-text-muted)" }}>
          Platform (vendor) console:{" "}
          <a href="/platform/login" style={{ color: "var(--usapt-brand-blue)" }}>/platform/login</a> — sign in as ops@groundedlabs.example.
        </div>
      </div>
    </div>
  );
}
