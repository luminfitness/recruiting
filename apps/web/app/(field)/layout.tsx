import { inArray } from "drizzle-orm";
import { markets } from "@usapt/db/schema";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db-context";
import { primaryRoleLabel } from "@/lib/roles";

/**
 * Minimal, mobile-first shell for field roles (territory + local manager).
 * Deliberately NOT the operator console: no sidebar, one focused queue, a red
 * top accent so becoming a field persona reads as a different, simpler product.
 */
export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const roleLabel = primaryRoleLabel(user.roles);

  // Resolve the user's scoped market name(s) for the header — the field app is
  // "their market", so name it.
  const marketNames = await withUser(async (tx, _client, u) => {
    if (u.marketIds === "*" || u.marketIds.length === 0) return [] as string[];
    const rows = await tx.select({ name: markets.name }).from(markets).where(inArray(markets.id, u.marketIds));
    return rows.map((r) => r.name);
  });
  const marketLabel = marketNames.join(" · ");

  return (
    <div style={{ minHeight: "100vh", background: "var(--usapt-bg)", color: "var(--usapt-ink)", display: "flex", flexDirection: "column" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--usapt-surface-raised)", borderBottom: "1px solid var(--usapt-border)" }}>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/usa-pt-logo.webp" alt="USA Personal Training" style={{ height: 26, width: "auto", flex: "none", display: "block" }} />
            <span style={{ fontSize: 11, letterSpacing: "0.07em", textTransform: "uppercase", fontWeight: 700, color: "var(--usapt-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {roleLabel}
              {marketLabel ? <span style={{ color: "var(--usapt-brand-ink)" }}> · {marketLabel}</span> : null}
            </span>
          </div>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              style={{ background: "none", border: 0, color: "var(--usapt-text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main style={{ flex: 1, width: "100%", maxWidth: 460, margin: "0 auto", padding: "0 0 40px" }}>{children}</main>
    </div>
  );
}
