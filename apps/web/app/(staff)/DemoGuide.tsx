"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { setDemoStepAction, endDemoAction } from "@/app/debug/demo-actions";
import type { DemoStep } from "@/lib/demo-walkthrough";

/**
 * The floating guide for the client walkthrough. Tells the presenter what this
 * screen proves and exactly what to click. Collapsible, because at some point
 * you want the screen to itself.
 */
export function DemoGuide({
  steps,
  step,
  total,
  hrefs,
  name,
}: {
  steps: DemoStep[];
  step: number;
  total: number;
  /** Resolved hrefs per step (ids/tokens already substituted, server-side). */
  hrefs: string[];
  name: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  const current = steps[step];
  const onRightScreen = current.external || pathname === hrefs[step] || pathname.startsWith(hrefs[step] + "/");

  const go = (n: number) => startTransition(() => setDemoStepAction(n));

  const shell: React.CSSProperties = {
    position: "fixed",
    right: 20,
    bottom: 20,
    zIndex: 60,
    width: collapsed ? "auto" : 380,
    maxWidth: "calc(100vw - 40px)",
    background: "var(--usapt-surface-raised)",
    border: "1px solid var(--usapt-border)",
    borderRadius: "var(--usapt-radius-lg)",
    boxShadow: "var(--usapt-shadow-lg)",
    color: "var(--usapt-ink)",
  };

  if (collapsed) {
    return (
      <div style={shell}>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "none", border: 0, cursor: "pointer", fontFamily: "inherit", color: "inherit", fontSize: 12.5, fontWeight: 700 }}
        >
          <span aria-hidden>▲</span> Demo · step {step + 1}/{total}
        </button>
      </div>
    );
  }

  return (
    <aside style={shell} aria-label="Guided demo">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--usapt-border)" }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--usapt-brand-ink)" }}>
          Guided demo · {step + 1} of {total}
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <button type="button" onClick={() => setCollapsed(true)} title="Collapse" style={iconBtn}>▾</button>
          <button type="button" onClick={() => startTransition(() => endDemoAction())} title="End demo" style={iconBtn}>✕</button>
        </div>
      </div>

      {/* progress */}
      <div style={{ display: "flex", gap: 3, padding: "10px 14px 0" }}>
        {steps.map((s, i) => (
          <span
            key={s.key}
            style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--usapt-brand-blue)" : "var(--usapt-border)" }}
          />
        ))}
      </div>

      <div style={{ padding: "12px 14px 14px" }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>{current.title}</div>
        <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--usapt-text-muted)", margin: "0 0 10px" }}>
          {current.narration}
        </p>

        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--usapt-text-faint)", marginBottom: 4 }}>
          Do this
        </div>
        <p style={{ fontSize: 12.5, lineHeight: 1.45, margin: "0 0 12px" }}>{current.action}</p>

        {current.external ? (
          <a
            href={hrefs[step]}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...primaryBtn, display: "inline-block", textDecoration: "none", marginBottom: 10 }}
          >
            Open {name}&rsquo;s link ↗
          </a>
        ) : !onRightScreen ? (
          <button type="button" onClick={() => go(step)} disabled={isPending} style={{ ...primaryBtn, marginBottom: 10 }}>
            Take me to this screen
          </button>
        ) : null}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => go(step - 1)} disabled={step === 0 || isPending} style={{ ...ghostBtn, opacity: step === 0 ? 0.4 : 1 }}>
            ← Back
          </button>
          {step < total - 1 ? (
            <button type="button" onClick={() => go(step + 1)} disabled={isPending} style={primaryBtn}>
              Next →
            </button>
          ) : (
            <button type="button" onClick={() => startTransition(() => endDemoAction())} disabled={isPending} style={primaryBtn}>
              Finish
            </button>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--usapt-text-faint)" }}>{name}</span>
        </div>
      </div>
    </aside>
  );
}

const iconBtn: React.CSSProperties = {
  background: "none",
  border: 0,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
  color: "var(--usapt-text-muted)",
  padding: "2px 6px",
};

const primaryBtn: React.CSSProperties = {
  padding: "7px 14px",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 12.5,
  color: "#fff",
  background: "var(--usapt-brand-blue)",
  border: 0,
  borderRadius: "var(--usapt-radius-sm)",
  cursor: "pointer",
};

const ghostBtn: React.CSSProperties = {
  padding: "7px 12px",
  fontFamily: "inherit",
  fontWeight: 700,
  fontSize: 12.5,
  color: "var(--usapt-ink)",
  background: "var(--usapt-surface)",
  border: "1px solid var(--usapt-border)",
  borderRadius: "var(--usapt-radius-sm)",
  cursor: "pointer",
};
