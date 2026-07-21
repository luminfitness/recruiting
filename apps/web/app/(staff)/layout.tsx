import { redirect } from "next/navigation";
import { requireUser, hasRole } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { isFieldOnly, landingPathForRoles, primaryRoleLabel } from "@/lib/roles";
import { Sidebar, type NavGroup } from "./Sidebar";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Field-only roles get their own (field) app — never the operator console.
  if (isFieldOnly(user.roles)) redirect(landingPathForRoles(user.roles));

  // Funnel items are numbered by position so the sequence stays contiguous as
  // screens land across build-steps. Bridge hrefs (→ existing routes) get
  // repointed to the merged screens in later steps.
  const funnelItems = [
    { label: "Sourcing", href: "/sourcing" },
    { label: "Interviews", href: "/interviews" },
    { label: "Decisions", href: "/decisions" },
    { label: "Classes", href: "/classes" },
  ].map((item, i) => ({ ...item, step: i + 1 }));

  const groups: NavGroup[] = [
    { items: [{ label: "Today", href: "/today" }] },
    { header: "The funnel", items: funnelItems },
    { header: "Insight", items: [
      { label: "Pipeline", href: "/pipeline" },
      { label: "Analytics", href: "/analytics" },
    ] },
  ];

  const settingsGroup: NavGroup | null = hasRole(user, "admin")
    ? {
        items: [
          { label: "Organization", href: "/admin" },
          { label: "Integrations", href: "/settings/integrations" },
          { label: "Cadence rules", href: "/cadence" },
          { label: "Activity log", href: "/audit" },
          ...(isDemoMode() ? [{ label: "Message outbox", href: "/outbox" }] : []),
        ],
      }
    : null;

  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 720, background: "var(--usapt-bg)", color: "var(--usapt-ink)" }}>
      <Sidebar
        groups={groups}
        settingsGroup={settingsGroup}
        identity={{ name: user.name, roleLabel: primaryRoleLabel(user.roles), initials }}
        showSwitcher={isDemoMode()}
      />
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>{children}</main>
    </div>
  );
}
