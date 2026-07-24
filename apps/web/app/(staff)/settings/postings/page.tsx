import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { brandRoleSettings, brands, copyTemplates, markets } from "@usapt/db/schema";
import { defaultPostingCopy, renderPostingCopy } from "@usapt/db";
import { requireUser, hasRole } from "@/lib/auth";
import { withUser } from "@/lib/db-context";
import { resolveRolePackage } from "@/lib/cadence";
import { savePostingCopyAction } from "./actions";

const ROLES = [
  { key: "manager" as const, label: "Assistant Fitness Manager" },
  { key: "trainer" as const, label: "Certified Personal Trainer" },
];

/**
 * Settings → Postings. The default ad language per brand per role, plus the
 * scheduling link and contact number that go out with it.
 */
export default async function PostingsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string }>;
}) {
  const authed = await requireUser();
  if (!hasRole(authed, "admin")) redirect("/settings/appearance");
  const sp = await searchParams;

  const data = await withUser(async (tx, _client, user) => {
    const brandRows = await tx.select().from(brands).where(eq(brands.orgId, user.orgId));
    const selected = brandRows.find((b) => b.id === sp.brand) ?? brandRows[0];
    if (!selected) return { brandRows, selected: null, roles: [] };

    const [sampleMarket] = await tx.select().from(markets).where(eq(markets.brandId, selected.id));

    const roles = await Promise.all(
      ROLES.map(async (role) => {
        const [tpl] = await tx
          .select()
          .from(copyTemplates)
          .where(
            and(
              eq(copyTemplates.orgId, user.orgId),
              eq(copyTemplates.brandId, selected.id),
              eq(copyTemplates.roleType, role.key),
            ),
          )
          .orderBy(desc(copyTemplates.version));
        const [cfg] = await tx
          .select()
          .from(brandRoleSettings)
          .where(and(eq(brandRoleSettings.brandId, selected.id), eq(brandRoleSettings.roleType, role.key)));
        const pkg = await resolveRolePackage(tx, selected.id, selected.slug, role.key);
        const body = tpl?.body ?? defaultPostingCopy(role.key);
        return {
          ...role,
          body,
          isDefault: !tpl,
          version: tpl?.version ?? null,
          contactNumber: cfg?.contactNumber ?? "",
          schedulingLink: cfg?.schedulingLink ?? "",
          resolved: pkg,
          preview: renderPostingCopy(body, {
            brand: selected.name,
            market: sampleMarket?.name ?? "Your market",
            schedulingLink: pkg.schedulingLink,
            contactNumber: pkg.contactNumber,
          }),
        };
      }),
    );

    return { brandRows, selected, roles };
  });

  const { brandRows, selected, roles } = data;

  const input: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    fontFamily: "inherit",
    border: "1px solid var(--usapt-border)",
    borderRadius: "var(--usapt-radius-sm)",
    background: "var(--usapt-surface-raised)",
    color: "var(--usapt-ink)",
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, display: "block", marginBottom: 5 };

  return (
    <div style={{ padding: "34px 40px 60px" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)", fontWeight: 700 }}>
        Sourcing
      </div>
      <h1 style={{ fontSize: 30, margin: "4px 0 8px", fontWeight: 800 }}>Postings</h1>
      <p style={{ color: "var(--usapt-text-muted)", fontSize: 13.5, marginBottom: 20, maxWidth: 680, lineHeight: 1.5 }}>
        The default ad language for each role, per brand — this is what the cadence engine publishes. Editing here
        saves a new version; postings already scheduled keep the copy they were created with.
      </p>

      {brandRows.length > 1 ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {brandRows.map((b) => (
            <a
              key={b.id}
              href={`/settings/postings?brand=${b.id}`}
              style={{
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: "none",
                borderRadius: "var(--usapt-radius-pill)",
                background: b.id === selected?.id ? "var(--usapt-brand-blue)" : "var(--usapt-surface)",
                color: b.id === selected?.id ? "#fff" : "var(--usapt-text-muted)",
              }}
            >
              {b.name}
            </a>
          ))}
        </div>
      ) : null}

      {!selected ? (
        <p style={{ fontSize: 13.5, color: "var(--usapt-text-muted)" }}>No brands configured yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 820 }}>
          <div style={{ fontSize: 12, color: "var(--usapt-text-muted)", background: "var(--usapt-surface)", padding: "10px 12px", borderRadius: "var(--usapt-radius-sm)", lineHeight: 1.5 }}>
            Placeholders you can use in the body:{" "}
            <code style={{ fontFamily: "var(--usapt-font-mono)" }}>
              {"{{brand}} {{market}} {{scheduling_link}} {{contact_number}}"}
            </code>
            . The link and number are per brand + role — they&rsquo;re filled in when the ad is published, so a trainer
            ad can never go out carrying the manager line.
          </div>

          {roles.map((role) => (
            <form
              key={role.key}
              action={savePostingCopyAction}
              style={{ border: "1px solid var(--usapt-border)", borderRadius: "var(--usapt-radius-lg)", padding: 18, background: "var(--usapt-surface-raised)" }}
            >
              <input type="hidden" name="brandId" value={selected.id} />
              <input type="hidden" name="roleType" value={role.key} />

              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                <h3 style={{ fontSize: 17, margin: 0, fontWeight: 800 }}>{role.label}</h3>
                <span style={{ fontSize: 11.5, color: "var(--usapt-text-faint)" }}>
                  {role.isDefault ? "Using the shipped default" : `Saved · v${role.version}`}
                </span>
              </div>

              <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 240px" }}>
                  <label style={label} htmlFor={`link-${role.key}`}>Scheduling link</label>
                  <input
                    id={`link-${role.key}`}
                    name="schedulingLink"
                    defaultValue={role.schedulingLink}
                    placeholder={role.resolved.schedulingLink}
                    style={input}
                  />
                  <div style={{ fontSize: 11, color: "var(--usapt-text-faint)", marginTop: 4 }}>
                    Blank uses the built-in application form.
                  </div>
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <label style={label} htmlFor={`phone-${role.key}`}>Contact number</label>
                  <input
                    id={`phone-${role.key}`}
                    name="contactNumber"
                    defaultValue={role.contactNumber}
                    placeholder={role.resolved.contactNumber}
                    style={input}
                  />
                  <div style={{ fontSize: 11, color: "var(--usapt-text-faint)", marginTop: 4 }}>
                    The line printed on this role&rsquo;s ads.
                  </div>
                </div>
              </div>

              <label style={label} htmlFor={`body-${role.key}`}>Ad body</label>
              <textarea
                id={`body-${role.key}`}
                name="body"
                defaultValue={role.body}
                rows={16}
                style={{ ...input, fontSize: 12.5, lineHeight: 1.5, resize: "vertical" }}
              />

              <details style={{ marginTop: 12 }}>
                <summary style={{ fontSize: 12.5, fontWeight: 700, cursor: "pointer", color: "var(--usapt-brand-ink)" }}>
                  Preview as it will post
                </summary>
                <pre
                  style={{
                    marginTop: 10,
                    padding: 14,
                    background: "var(--usapt-surface)",
                    border: "1px solid var(--usapt-border)",
                    borderRadius: "var(--usapt-radius-sm)",
                    fontSize: 12,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    overflowX: "auto",
                  }}
                >
                  {role.preview}
                </pre>
                <div style={{ fontSize: 11, color: "var(--usapt-text-faint)", marginTop: 6 }}>
                  Reflects what&rsquo;s saved. Save to refresh after editing.
                </div>
              </details>

              <button
                type="submit"
                style={{ marginTop: 14, padding: "10px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 13.5, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, borderRadius: "var(--usapt-radius-sm)", cursor: "pointer" }}
              >
                Save {role.label}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
