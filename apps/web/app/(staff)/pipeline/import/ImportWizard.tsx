"use client";

import { useActionState, useMemo, useState } from "react";
import { runImportAction, type ImportActionState } from "./actions";

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "firstName", label: "First name", required: true },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", required: true },
  { key: "phone", label: "Phone" },
  { key: "roleType", label: "Role (manager/trainer)" },
  { key: "brand", label: "Brand (by name)" },
  { key: "market", label: "Market (by name)" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "appliedAt", label: "Applied date" },
];

const initial: ImportActionState = { status: "idle" };

function parseHeaders(csv: string): string[] {
  const firstLine = csv.replace(/\r\n?/g, "\n").split("\n")[0] ?? "";
  // Light header split (good enough for the mapping UI; server re-parses authoritatively).
  return firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
}

/** Auto-guesses a column index for a field from header names. */
function guess(headers: string[], field: string): number | "" {
  const aliases: Record<string, string[]> = {
    firstName: ["first", "first name", "fname"],
    lastName: ["last", "last name", "lname", "surname"],
    email: ["email", "e-mail"],
    phone: ["phone", "mobile", "cell"],
    roleType: ["role", "position", "type"],
    brand: ["brand", "company"],
    market: ["market", "location", "club", "city"],
    source: ["source", "channel"],
    status: ["status", "stage", "disposition"],
    appliedAt: ["applied", "date", "applied at", "applied date"],
  };
  const wants = aliases[field] ?? [field.toLowerCase()];
  const idx = headers.findIndex((h) => wants.some((w) => h.toLowerCase() === w || h.toLowerCase().includes(w)));
  return idx >= 0 ? idx : "";
}

export function ImportWizard() {
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, number | "">>({});
  const [state, formAction, pending] = useActionState(runImportAction, initial);
  const headers = useMemo(() => (csv.trim() ? parseHeaders(csv) : []), [csv]);

  function autoMap() {
    const m: Record<string, number | ""> = {};
    for (const f of FIELDS) m[f.key] = guess(headers, f.key);
    setMapping(m);
  }

  const cleanMapping = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
  const inputStyle: React.CSSProperties = { padding: "6px 8px", fontSize: 12, border: "1px solid var(--usapt-border)", background: "var(--usapt-surface-raised)" };

  if (state.status === "done" && state.result) {
    return (
      <div style={{ border: "1px solid var(--usapt-border)", padding: 16 }}>
        <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>Import complete</h3>
        <ul style={{ fontSize: 14, lineHeight: 1.7 }}>
          <li>Created: <strong>{state.result.created}</strong></li>
          <li>Skipped (active duplicates): <strong>{state.result.skippedDuplicates}</strong></li>
          <li>Errors: <strong>{state.result.errors.length}</strong></li>
        </ul>
        {state.result.errors.length ? (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--status-risk-text)" }}>
            {state.result.errors.slice(0, 8).map((e) => (
              <div key={e.rowIndex}>Row {e.rowIndex + 2}: {e.reason}</div>
            ))}
          </div>
        ) : null}
        <a href="/pipeline" style={{ display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 600, color: "var(--usapt-brand-blue)" }}>
          → Back to pipeline
        </a>
      </div>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="csv" value={csv} />
      <input type="hidden" name="mapping" value={JSON.stringify(cleanMapping)} />

      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>1. Paste the Master Tracker CSV (with a header row)</label>
      <textarea
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        rows={6}
        placeholder="First,Last,Email,Phone,Role,Brand,Market,Source,Status,Applied&#10;Jane,Doe,jane@x.com,555-0100,Trainer,Crunch Fitness,Dallas, TX,Indeed,graduated,2025-01-14"
        style={{ width: "100%", fontFamily: "monospace", fontSize: 12, padding: 10, border: "1px solid var(--usapt-border)" }}
      />

      {headers.length > 0 ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 10px" }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>2. Map columns</label>
            <button type="button" onClick={autoMap} style={{ ...inputStyle, cursor: "pointer", fontWeight: 600 }}>Auto-map by header</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {FIELDS.map((f) => (
              <label key={f.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                <span>
                  {f.label}
                  {f.required ? <span style={{ color: "var(--status-risk-text)" }}> *</span> : null}
                </span>
                <select value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? "" : Number(e.target.value) }))} style={inputStyle}>
                  <option value="">— none —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          {state.status === "error" ? <p style={{ fontSize: 12.5, color: "var(--status-risk-text)", marginTop: 10 }}>{state.message}</p> : null}

          <button
            type="submit"
            disabled={pending}
            style={{ marginTop: 16, padding: "10px 18px", fontFamily: "inherit", fontWeight: 700, fontSize: 14, color: "#fff", background: "var(--usapt-brand-blue)", border: 0, cursor: pending ? "default" : "pointer", opacity: pending ? 0.7 : 1 }}
          >
            {pending ? "Importing…" : "Import candidates"}
          </button>
        </>
      ) : null}
    </form>
  );
}
