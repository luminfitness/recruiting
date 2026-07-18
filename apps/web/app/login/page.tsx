"use client";

import { useActionState } from "react";
import { requestMagicLinkAction, type MagicLinkFormState } from "./actions";

const initialState: MagicLinkFormState = { status: "idle", message: "" };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(requestMagicLinkAction, initialState);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--usapt-bg)",
        fontFamily: "var(--font-archivo), system-ui, sans-serif",
        color: "var(--usapt-ink)",
      }}
    >
      <div style={{ width: 360, maxWidth: "100%", padding: 32, background: "#fff", border: "2px solid var(--usapt-border-strong)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-blue)" }}>
          USAPT Recruiting Platform
        </div>
        <h1 style={{ fontSize: 24, margin: "6px 0 20px" }}>Sign in</h1>
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Work email
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.com"
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
                padding: "10px 12px",
                fontSize: 14,
                border: "1px solid var(--usapt-border)",
                background: "var(--usapt-bg)",
              }}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            style={{
              marginTop: 4,
              padding: "12px 16px",
              fontFamily: "inherit",
              fontWeight: 700,
              fontSize: 14,
              color: "#fff",
              background: "var(--usapt-brand-blue)",
              border: 0,
              cursor: pending ? "default" : "pointer",
              opacity: pending ? 0.7 : 1,
            }}
          >
            {pending ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
        {state.message ? (
          <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--usapt-text-muted)" }}>{state.message}</p>
        ) : null}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--usapt-border)" }}>
          <a href="/debug" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--usapt-brand-blue)", textDecoration: "none" }}>
            ⚡ Demo — switch user without a password →
          </a>
        </div>
      </div>
    </div>
  );
}
