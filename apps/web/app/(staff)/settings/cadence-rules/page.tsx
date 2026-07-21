import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { brands, cadenceRules, copyTemplates } from "@usapt/db/schema";
import { requireUser, hasRole } from "@/lib/auth";
import { withUser } from "@/lib/db-context";
import { createRuleAction, createTemplateAction, seedDefaultCadenceAction, toggleRuleAction } from "./actions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ACTION_LABEL: Record<string, string> = { post: "Post ads", switch_mode: "Switch mode", end: "End ads", remind: "Send reminders" };

export default async function CadencePage() {
  // Org configuration — admin-only. (The settings layout no longer redirects,
  // so non-admins reaching this route directly land back on Appearance.)
  const authed = await requireUser();
  if (!hasRole(authed, "admin")) redirect("/settings/appearance");

  const { rules, templates, brandRows } = await withUser(async (tx, _client, user) => {
    const rules = await tx.select().from(cadenceRules).where(eq(cadenceRules.orgId, user.orgId)).orderBy(cadenceRules.dayOfWeek, cadenceRules.time);
    const templates = await tx.select().from(copyTemplates).where(eq(copyTemplates.orgId, user.orgId)).orderBy(desc(copyTemplates.version));
    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, user.orgId));
    return { rules, templates, brandRows };
  });

  const inputStyle: React.CSSProperties = { padding: "8px 10px", fontSize: 13, border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--usapt-text-muted)", padding: "8px 12px", borderBottom: "1px solid var(--usapt-border)" };
  const td: React.CSSProperties = { padding: 12, borderBottom: "1px solid var(--usapt-border)", fontSize: 13.5 };
  const brandName = (id: string | null) => brandRows.find((b) => b.id === id)?.name ?? "All brands";

  return (
    <div style={{ padding: "34px 40px 60px", maxWidth: 900 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
        Posting cadence engine
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 6px" }}>Weekly cadence</h1>
      <p style={{ fontSize: 13, color: "var(--usapt-text-muted)", marginBottom: 20, maxWidth: 620 }}>
        Encodes the Sunday/Tuesday/Thursday ritual as configuration. Rules fire in each market&apos;s timezone (or the org
        default) and prepare postings automatically — no one has to remember it&apos;s Tuesday.
      </p>

      {rules.length === 0 ? (
        <form action={seedDefaultCadenceAction} style={{ marginBottom: 24 }}>
          <button type="submit" style={{ padding: "10px 16px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>
            Seed the default USAPT ruleset
          </button>
        </form>
      ) : null}

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28 }}>
        <thead>
          <tr>
            {["Day", "Time", "Action", "Role", "Channel", "Brand", "Active"].map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td style={{ ...td, fontWeight: 600 }}>{DAYS[r.dayOfWeek]}</td>
              <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{r.time.slice(0, 5)}</td>
              <td style={td}>{ACTION_LABEL[r.action]}</td>
              <td style={{ ...td, textTransform: "capitalize" }}>{r.roleType}</td>
              <td style={{ ...td, textTransform: "capitalize" }}>{r.channel}</td>
              <td style={{ ...td, color: "var(--usapt-text-muted)" }}>{brandName(r.brandId)}</td>
              <td style={td}>
                <form action={toggleRuleAction.bind(null, r.id, !r.active)}>
                  <button type="submit" style={{ padding: "3px 10px", fontSize: 12, fontWeight: 600, border: "1px solid var(--usapt-border)", background: r.active ? "var(--status-positive-fill)" : "var(--usapt-neutral-200)", color: r.active ? "var(--status-positive-text)" : "var(--usapt-neutral-700)", cursor: "pointer" }}>
                    {r.active ? "Active" : "Paused"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "1px solid var(--usapt-border)", paddingBottom: 8 }}>Add a rule</h3>
      <form action={createRuleAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 32 }}>
        <select name="dayOfWeek" style={inputStyle} defaultValue="0">
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input name="time" type="time" defaultValue="09:00" style={inputStyle} />
        <select name="action" style={inputStyle} defaultValue="post">
          <option value="post">Post ads</option>
          <option value="switch_mode">Switch mode</option>
          <option value="end">End ads</option>
          <option value="remind">Send reminders</option>
        </select>
        <select name="roleType" style={inputStyle} defaultValue="manager">
          <option value="manager">Manager</option>
          <option value="trainer">Trainer</option>
        </select>
        <select name="channel" style={inputStyle} defaultValue="indeed">
          <option value="indeed">Indeed</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <select name="brandId" style={inputStyle} defaultValue="">
          <option value="">All brands</option>
          {brandRows.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button type="submit" style={{ padding: "8px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>
          Add rule
        </button>
      </form>

      <h3 style={{ fontSize: 15, margin: "0 0 10px", borderBottom: "1px solid var(--usapt-border)", paddingBottom: 8 }}>
        Copy templates {templates.length ? `(${templates.length})` : ""}
      </h3>
      {templates.length ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
          {templates.map((t) => (
            <li key={t.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--usapt-border)", fontSize: 13 }}>
              <strong>{t.name}</strong> <span style={{ color: "var(--usapt-text-muted)" }}>· {t.roleType} · {t.channel} · v{t.version}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: 13, color: "var(--usapt-text-muted)" }}>No templates yet — postings fall back to a default copy line.</p>
      )}
      <form action={createTemplateAction} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start", marginTop: 8 }}>
        <select name="brandId" required style={inputStyle}>
          <option value="">Brand…</option>
          {brandRows.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
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
        </select>
        <input name="name" placeholder="Template name" required style={inputStyle} />
        <textarea name="body" placeholder="Posting copy…" rows={2} required style={{ ...inputStyle, minWidth: 280, fontFamily: "inherit" }} />
        <button type="submit" style={{ padding: "8px 14px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: "pointer" }}>
          Save template
        </button>
      </form>
    </div>
  );
}
