"use client";

import { useActionState, useState } from "react";
import { bookSessionAction, type BookingActionState } from "./actions";

export interface SessionOption {
  id: string;
  dayLabel: string;
  timeLabel: string;
  spotsLabel: string;
  full: boolean;
}

const initialState: BookingActionState = { status: "idle", message: "" };

export function BookingForm({ token, sessions }: { token: string; sessions: SessionOption[] }) {
  const action = bookSessionAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);
  const [selected, setSelected] = useState<string>("");

  return (
    <form action={formAction} style={{ padding: "20px 22px 24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sessions.map((s) => {
          const isSel = selected === s.id;
          return (
            <label
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 14,
                border: `2px solid ${isSel ? "var(--brand-primary)" : "var(--usapt-border)"}`,
                background: isSel ? "var(--brand-tint)" : "var(--usapt-surface-raised)",
                cursor: s.full ? "not-allowed" : "pointer",
                opacity: s.full ? 0.5 : 1,
              }}
            >
              <input
                type="radio"
                name="sessionId"
                value={s.id}
                disabled={s.full}
                checked={isSel}
                onChange={() => setSelected(s.id)}
                style={{ display: "none" }}
              />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{s.dayLabel}</div>
                <div style={{ fontSize: 13, color: "var(--usapt-neutral-800)", marginTop: 2 }}>{s.timeLabel}</div>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--usapt-neutral-600)", textAlign: "right" }}>{s.spotsLabel}</div>
            </label>
          );
        })}
      </div>

      {state.status === "error" ? (
        <p style={{ fontSize: 12.5, color: "var(--status-risk-text)", marginTop: 12 }}>{state.message}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !selected}
        style={{
          width: "100%",
          marginTop: 18,
          minHeight: 52,
          cursor: pending || !selected ? "default" : "pointer",
          fontFamily: "var(--font-archivo-black), sans-serif",
          fontSize: 15,
          letterSpacing: "0.02em",
          color: "#fff",
          background: "var(--brand-primary)",
          border: 0,
          opacity: pending || !selected ? 0.55 : 1,
        }}
      >
        {pending ? "BOOKING…" : "CONFIRM MY SESSION"}
      </button>
      <p style={{ fontSize: 11, color: "var(--usapt-neutral-500)", textAlign: "center", margin: "14px 0 0" }}>
        Need help? Call our scheduling line: (555) 720-4180
      </p>
    </form>
  );
}
