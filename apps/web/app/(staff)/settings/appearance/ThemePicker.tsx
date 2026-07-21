"use client";

import { useState, useTransition } from "react";
import { setThemeAction } from "./actions";
import type { ThemePref } from "@/lib/theme";

type Option = {
  value: ThemePref;
  label: string;
  hint: string;
  /** [page, surface, ink, accent] preview swatch colors. */
  swatch: [string, string, string, string];
};

const OPTIONS: Option[] = [
  { value: "light", label: "Light", hint: "Warm cream — the default flat look.", swatch: ["#f3ede1", "#fbf8f1", "#1c1a15", "#2c5be0"] },
  { value: "dark", label: "Dark", hint: "Flat dark — opaque dark surfaces, easy at night.", swatch: ["#17140d", "#2a251b", "#f3eee2", "#4f74ec"] },
  { value: "system", label: "System", hint: "Match your device's light or dark setting.", swatch: ["#8b8578", "#c8c2b6", "#1c1a15", "#2c5be0"] },
];

export function ThemePicker({ initial }: { initial: ThemePref }) {
  const [value, setValue] = useState<ThemePref>(initial);
  const [isPending, startTransition] = useTransition();

  function apply(next: ThemePref) {
    if (next === value) return;
    setValue(next);
    // Instant feedback: retheme the console shell without waiting on the server.
    // (The shell also re-renders with the persisted cookie on the next load.)
    document.getElementById("staff-shell")?.setAttribute("data-theme", next);
    startTransition(() => setThemeAction(next));
  }

  return (
    <div role="radiogroup" aria-label="Appearance" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, maxWidth: 620 }}>
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        const [page, surface, ink, accent] = opt.swatch;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => apply(opt.value)}
            style={{
              textAlign: "left",
              cursor: "pointer",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              background: "var(--usapt-surface-raised)",
              border: `1.5px solid ${selected ? "var(--usapt-brand-blue)" : "var(--usapt-border)"}`,
              borderRadius: "var(--usapt-radius-lg)",
              boxShadow: selected ? "var(--usapt-shadow-md)" : "var(--usapt-shadow-sm)",
              fontFamily: "inherit",
              color: "var(--usapt-ink)",
            }}
          >
            {/* Miniature theme preview */}
            <div style={{ height: 60, borderRadius: "var(--usapt-radius)", background: page, border: "1px solid var(--usapt-border)", padding: 8, display: "flex", gap: 6, overflow: "hidden" }} aria-hidden>
              <div style={{ width: 24, borderRadius: 5, background: surface }} />
              <div style={{ flex: 1, borderRadius: 5, background: surface, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ height: 5, width: "70%", borderRadius: 3, background: ink, opacity: 0.85 }} />
                <div style={{ height: 5, width: "45%", borderRadius: 3, background: ink, opacity: 0.35 }} />
                <div style={{ marginTop: "auto", height: 10, width: 34, borderRadius: 4, background: accent }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{opt.label}</span>
              <span
                aria-hidden
                style={{
                  width: 17,
                  height: 17,
                  flex: "none",
                  borderRadius: 999,
                  border: `1.5px solid ${selected ? "var(--usapt-brand-blue)" : "var(--usapt-border-strong)"}`,
                  background: selected ? "var(--usapt-brand-blue)" : "transparent",
                  color: "#fff",
                  fontSize: 11,
                  lineHeight: "14px",
                  textAlign: "center",
                }}
              >
                {selected ? "✓" : ""}
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--usapt-text-muted)", lineHeight: 1.35 }}>{opt.hint}</span>
          </button>
        );
      })}
      <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {isPending ? "Saving appearance…" : ""}
      </span>
    </div>
  );
}
