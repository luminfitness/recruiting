"use client";

import { useActionState } from "react";
import { submitApplicationAction, type ApplyState } from "./actions";

const initial: ApplyState = { ok: null };

export function ApplyForm({
  brandSlug,
  roleType,
  roleLabel,
  source,
  markets,
}: {
  brandSlug: string;
  roleType: "manager" | "trainer";
  roleLabel: string;
  source: string;
  markets: { id: string; name: string }[];
}) {
  const action = submitApplicationAction.bind(null, brandSlug);
  const [state, formAction, pending] = useActionState(action, initial);

  if (state.ok === true) {
    return (
      <div style={{ padding: "28px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 30, marginBottom: 8 }} aria-hidden>
          ✓
        </div>
        <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>Application received</h2>
        <p style={{ fontSize: 14, color: "var(--usapt-text-muted)", lineHeight: 1.5, margin: 0 }}>
          Check your email — we&rsquo;ll send you a link to pick an interview time. It usually arrives within a few
          minutes.
        </p>
      </div>
    );
  }

  const field: React.CSSProperties = {
    width: "100%",
    padding: "11px 12px",
    fontSize: 15,
    fontFamily: "inherit",
    border: "1px solid var(--usapt-border)",
    borderRadius: "var(--usapt-radius-sm)",
    background: "var(--usapt-surface-raised)",
    color: "var(--usapt-ink)",
  };
  const label: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, display: "block", marginBottom: 5 };

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input type="hidden" name="roleType" value={roleType} />
      <input type="hidden" name="source" value={source} />

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div aria-hidden style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" required autoComplete="given-name" maxLength={80} style={field} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" required autoComplete="family-name" maxLength={80} style={field} />
        </div>
      </div>

      <div>
        <label style={label} htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" maxLength={254} style={field} />
      </div>

      <div>
        <label style={label} htmlFor="phone">Phone <span style={{ fontWeight: 400, color: "var(--usapt-text-faint)" }}>(optional)</span></label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" maxLength={40} style={field} />
      </div>

      <div>
        <label style={label} htmlFor="marketId">Location</label>
        <select id="marketId" name="marketId" required defaultValue={markets.length === 1 ? markets[0].id : ""} style={field}>
          {markets.length === 1 ? null : <option value="">Choose a location…</option>}
          {markets.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {state.ok === false ? (
        <p role="alert" style={{ fontSize: 13, color: "var(--status-risk-text)", background: "var(--status-risk-fill)", padding: "9px 12px", borderRadius: "var(--usapt-radius-sm)", margin: 0 }}>
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 4,
          padding: "13px 18px",
          fontFamily: "inherit",
          fontWeight: 700,
          fontSize: 15,
          color: "#fff",
          background: "var(--brand-primary)",
          border: 0,
          borderRadius: "var(--usapt-radius-sm)",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Sending…" : `Apply for ${roleLabel}`}
      </button>

      <p style={{ fontSize: 11.5, color: "var(--usapt-text-faint)", textAlign: "center", margin: 0, lineHeight: 1.45 }}>
        We&rsquo;ll only use your details to contact you about this role.
      </p>
    </form>
  );
}
