"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { label: string; href: string; step?: number };
export type NavGroup = { header?: string; items: NavItem[] };

const groupHeader: React.CSSProperties = {
  padding: "16px 14px 6px",
  fontSize: 10.5,
  fontWeight: 800,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--usapt-text-faint)",
};

function itemStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "1px 8px",
    padding: "8px 10px",
    fontSize: 13.5,
    fontWeight: 600,
    borderRadius: "var(--usapt-radius)",
    background: active ? "var(--usapt-brand-soft)" : "transparent",
    color: active ? "var(--usapt-brand-ink)" : "var(--usapt-text-muted)",
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
        width: 244,
        flex: "none",
        display: "flex",
        flexDirection: "column",
        background: "var(--usapt-surface-raised)",
        color: "var(--usapt-ink)",
        borderRight: "1px solid var(--usapt-border)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 18px 14px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/usa-pt-logo.webp" alt="USA Personal Training" style={{ height: 46, width: "auto", alignSelf: "flex-start", display: "block" }} />
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-text-faint)", paddingLeft: 2 }}>
          Recruiting
        </span>
      </div>

      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 0 8px" }}>
        {groups.map((group, gi) => (
          <div key={group.header ?? `g${gi}`}>
            {group.header ? <div style={groupHeader}>{group.header}</div> : <div style={{ height: 8 }} />}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href} style={itemStyle(active)}>
                  {item.step != null ? (
                    <span
                      style={{
                        flex: "none",
                        width: 19,
                        height: 19,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 800,
                        fontVariantNumeric: "tabular-nums",
                        color: active ? "#fff" : "var(--usapt-text-muted)",
                        background: active ? "var(--usapt-brand-blue)" : "var(--usapt-surface)",
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
                width: "calc(100% - 16px)",
                justifyContent: "space-between",
                cursor: "pointer",
                fontFamily: "inherit",
                border: 0,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden style={{ fontSize: 14 }}>⚙</span> Settings
              </span>
              <span aria-hidden style={{ fontSize: 10, color: "var(--usapt-text-faint)" }}>{settingsOpen ? "▾" : "▸"}</span>
            </button>
            {settingsOpen
              ? settingsGroup.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link key={item.href} href={item.href} style={{ ...itemStyle(active), padding: "7px 10px 7px 34px", fontSize: 12.5 }}>
                      {item.label}
                    </Link>
                  );
                })
              : null}
          </div>
        ) : null}

        {showSwitcher ? (
          <>
            <div style={groupHeader}>Demo</div>
            <Link href="/debug" style={{ ...itemStyle(false), color: "var(--usapt-brand-ink)", fontWeight: 700 }}>
              ⚡ Switch user
            </Link>
          </>
        ) : null}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderTop: "1px solid var(--usapt-border)" }}>
        <div
          style={{
            width: 32,
            height: 32,
            flex: "none",
            borderRadius: 999,
            background: "var(--usapt-brand-soft)",
            color: "var(--usapt-brand-ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {identity.initials}
        </div>
        <div style={{ lineHeight: 1.2, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {identity.name}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--usapt-text-faint)" }}>{identity.roleLabel}</div>
        </div>
        <form action="/auth/logout" method="post">
          <button
            type="submit"
            style={{ background: "none", border: 0, color: "var(--usapt-text-faint)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
