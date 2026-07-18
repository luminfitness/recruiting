import Link from "next/link";
import { requireUser, hasRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Lead dashboard" },
  { href: "/pipeline", label: "Pipeline · tracker" },
  { href: "/decisions", label: "Decision bundle" },
  { href: "/roster", label: "Interview roster" },
  { href: "/postings", label: "Job postings" },
  { href: "/cadence", label: "Posting cadence" },
  { href: "/cohorts", label: "Classes & cohorts" },
  { href: "/analytics", label: "Funnel analytics" },
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const showLocalQueue = hasRole(user, "local_manager");
  const showTmQueue = hasRole(user, "territory_manager");
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 720, background: "var(--usapt-bg)", color: "var(--usapt-ink)" }}>
      <aside
        style={{
          width: 236,
          flex: "none",
          display: "flex",
          flexDirection: "column",
          background: "var(--usapt-brand-blue)",
          color: "var(--usapt-bg)",
          borderRight: "2px solid #0a3271",
        }}
      >
        <div style={{ background: "#fff", padding: "14px 18px 12px" }}>
          <span style={{ fontFamily: "var(--font-archivo-black)", fontSize: 15, color: "var(--usapt-brand-blue)" }}>USA PT</span>
        </div>
        <div style={{ height: 3, background: "var(--usapt-brand-red)" }} />
        <div style={{ padding: "12px 18px 10px", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8fa8ce" }}>
          Recruiting Operations
        </div>
        <div style={{ height: 2, background: "#0a3271" }} />
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          <div style={{ padding: "14px 18px 6px", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8fa8ce" }}>
            Staff · Desktop
          </div>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                padding: "9px 18px",
                fontSize: 13.5,
                fontWeight: 600,
                borderLeft: "3px solid transparent",
                color: "inherit",
                textDecoration: "none",
              }}
            >
              {item.label}
            </Link>
          ))}
          {showLocalQueue ? (
            <>
              <div style={{ padding: "16px 18px 6px", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8fa8ce" }}>
                Field · Mobile
              </div>
              <Link
                href="/local"
                style={{ display: "block", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, color: "inherit", textDecoration: "none" }}
              >
                Local manager queue
              </Link>
            </>
          ) : null}
          {showTmQueue ? (
            <>
              <div style={{ padding: "16px 18px 6px", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8fa8ce" }}>
                Field · Mobile
              </div>
              <Link
                href="/tm"
                style={{ display: "block", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, color: "inherit", textDecoration: "none" }}
              >
                No-show outreach
              </Link>
            </>
          ) : null}
          {hasRole(user, "admin") ? (
            <>
              <div style={{ padding: "16px 18px 6px", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8fa8ce" }}>
                System
              </div>
              <Link
                href="/admin"
                style={{ display: "block", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, color: "inherit", textDecoration: "none" }}
              >
                Org admin
              </Link>
              <Link
                href="/settings/integrations"
                style={{ display: "block", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, color: "inherit", textDecoration: "none" }}
              >
                Integrations
              </Link>
              <Link
                href="/triage"
                style={{ display: "block", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, color: "inherit", textDecoration: "none" }}
              >
                Application triage
              </Link>
              <Link
                href="/audit"
                style={{ display: "block", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, color: "inherit", textDecoration: "none" }}
              >
                Audit log
              </Link>
              <Link
                href="/outbox"
                style={{ display: "block", padding: "9px 18px", fontSize: 13.5, fontWeight: 600, color: "inherit", textDecoration: "none" }}
              >
                Message outbox
              </Link>
            </>
          ) : null}
          {isDemoMode() ? (
            <>
              <div style={{ padding: "16px 18px 6px", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8fa8ce" }}>Demo</div>
              <Link href="/debug" style={{ display: "block", padding: "9px 18px", fontSize: 13.5, fontWeight: 700, color: "#ffd7d7", textDecoration: "none" }}>
                ⚡ Switch user
              </Link>
            </>
          ) : null}
        </nav>
        <div style={{ height: 2, background: "#0a3271" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px" }}>
          <div
            style={{
              width: 30,
              height: 30,
              flex: "none",
              background: "#0a3271",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {initials}
          </div>
          <div style={{ lineHeight: 1.15, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.name}
            </div>
            <div style={{ fontSize: 10, color: "#8fa8ce" }}>{user.roles.join(" · ") || "No roles"}</div>
          </div>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              style={{ background: "none", border: 0, color: "#8fa8ce", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
