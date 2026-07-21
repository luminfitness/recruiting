"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { label: string; href: string; step?: number };
export type NavGroup = { header?: string; items: NavItem[] };

const groupHeader: React.CSSProperties = {
  padding: "14px 18px 6px",
  fontSize: 9,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "#8fa8ce",
};

function itemStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 18px",
    fontSize: 13.5,
    fontWeight: 600,
    borderLeft: `3px solid ${active ? "var(--usapt-brand-red)" : "transparent"}`,
    background: active ? "#0a3271" : "transparent",
    color: active ? "#fff" : "inherit",
    textDecoration: "none",
  };
}

export function Sidebar({
  groups,
  settingsGroup,
  identity,
  showSwitcher,
}: {
  groups: NavGroup[];
  settingsGroup: NavGroup | null;
  identity: { name: string; roleLabel: string; initials: string };
  showSwitcher: boolean;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    const base = href.split("?")[0];
    return pathname === base || pathname.startsWith(base + "/");
  };
  const settingsActive = !!settingsGroup?.items.some((i) => isActive(i.href));
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
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
        Recruiting Console
      </div>
      <div style={{ height: 2, background: "#0a3271" }} />

      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {groups.map((group, gi) => (
          <div key={group.header ?? `g${gi}`}>
            {group.header ? <div style={groupHeader}>{group.header}</div> : null}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} style={itemStyle(active)}>
                  {item.step != null ? (
                    <span
                      style={{
                        flex: "none",
                        width: 18,
                        height: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        color: active ? "#fff" : "#8fa8ce",
                        border: `1.5px solid ${active ? "var(--usapt-brand-red)" : "#3a5da0"}`,
                      }}
                    >
                      {item.step}
                    </span>
                  ) : null}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        {settingsGroup ? (
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              aria-expanded={settingsOpen}
              style={{
                ...itemStyle(settingsActive && !settingsOpen),
                width: "100%",
                justifyContent: "space-between",
                cursor: "pointer",
                fontFamily: "inherit",
                border: 0,
                borderLeft: `3px solid ${settingsActive && !settingsOpen ? "var(--usapt-brand-red)" : "transparent"}`,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden>⚙</span> Settings
              </span>
              <span aria-hidden style={{ fontSize: 10, color: "#8fa8ce" }}>{settingsOpen ? "▾" : "▸"}</span>
            </button>
            {settingsOpen
              ? settingsGroup.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href} style={{ ...itemStyle(active), padding: "8px 18px 8px 40px", fontSize: 12.5 }}>
                      {item.label}
                    </Link>
                  );
                })
              : null}
          </div>
        ) : null}

        {showSwitcher ? (
          <>
            <div style={{ ...groupHeader, marginTop: 10 }}>Demo</div>
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
          {identity.initials}
        </div>
        <div style={{ lineHeight: 1.15, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {identity.name}
          </div>
          <div style={{ fontSize: 10, color: "#8fa8ce" }}>{identity.roleLabel}</div>
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
  );
}
