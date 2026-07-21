"use client";

import { useActionState } from "react";
import { requestPlatformLinkAction, type PlatformLoginState } from "./actions";

const initial: PlatformLoginState = { status: "idle", message: "" };

export default function PlatformLoginPage() {
  const [state, formAction, pending] = useActionState(requestPlatformLinkAction, initial);
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--usapt-ink)", fontFamily: "var(--font-archivo), system-ui, sans-serif" }}>
      <div style={{ width: 360, maxWidth: "100%", padding: 32, borderRadius: "var(--usapt-radius-lg)", background: "var(--usapt-surface-raised)", border: "1px solid var(--usapt-border)" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--usapt-brand-red)" }}>Grounded Labs · Platform</div>
        <h1 style={{ fontSize: 24, margin: "6px 0 20px" }}>Platform admin</h1>
        <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input name="email" type="email" required placeholder="you@groundedlabs.example" style={{ padding: "10px 12px", fontSize: 14, border: "1px solid var(--usapt-border)", background: "var(--usapt-bg)" }} />
          <button type="submit" disabled={pending} style={{ padding: "12px 16px", fontWeight: 700, fontSize: 14, color: "#fff", background: "var(--usapt-ink)", border: 0, cursor: pending ? "default" : "pointer" }}>
            {pending ? "Sending…" : "Send platform link"}
          </button>
        </form>
        {state.message ? <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--usapt-text-muted)" }}>{state.message}</p> : null}
        {state.devLink ? (
          <a href={state.devLink} style={{ display: "block", marginTop: 8, fontSize: 12, color: "var(--usapt-brand-blue)", wordBreak: "break-all" }}>
            Dev shortcut: sign in →
          </a>
        ) : null}
      </div>
    </div>
  );
}
