"use client";

import { useActionState } from "react";
import { revealDisclosureAction, type RevealState } from "../actions";

const initial: RevealState = { revealed: false };

/**
 * Detail-on-demand for the felony disclosure. Nothing sensitive is in the
 * initial page payload — the detail is fetched only when the reviewer clicks
 * Reveal, and that action writes an audit_log row before returning. This is
 * the client half of the "flag + audit-logged detail-on-demand" control.
 */
export function RevealDisclosure({ candidateId }: { candidateId: string }) {
  const action = revealDisclosureAction.bind(null, candidateId);
  const [state, formAction, pending] = useActionState(action, initial);

  if (state.revealed) {
    return (
      <div style={{ fontSize: 12.5, lineHeight: 1.55, background: "var(--status-action-fill)", padding: "10px 12px", borderLeft: "3px solid var(--status-action-marker)" }}>
        {state.hasDisclosure ? (
          <>
            <strong>Disclosed:</strong> {state.detail || "(no detail provided)"}
            <div style={{ marginTop: 6, color: "var(--status-action-text)" }}>
              Disposition is human-only — the system never auto-rejects. This view was access-logged.
            </div>
          </>
        ) : (
          "No disclosure on file for this candidate."
        )}
      </div>
    );
  }

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        style={{ width: "100%", textAlign: "left", padding: "10px 12px", fontFamily: "inherit", fontWeight: 600, fontSize: 13, border: "1px solid var(--usapt-border-strong)", background: "#fff", cursor: pending ? "default" : "pointer" }}
      >
        ◆ {pending ? "Logging access…" : "Reveal detail — logs access"}
      </button>
    </form>
  );
}
