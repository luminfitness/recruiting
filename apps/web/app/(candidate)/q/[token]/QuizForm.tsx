"use client";

import { useRef, useState, useTransition } from "react";
import type { QuizSchema } from "@usapt/db";
import { saveQuizProgressAction, submitQuizIntakeAction } from "./actions";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["AM", "PM"];

export interface QuizFormProps {
  token: string;
  quiz: QuizSchema;
  initialAnswers: Record<string, string>;
  initialWritten: string;
  initialAvailability: Record<string, boolean>;
  totalSteps: number;
}

export function QuizForm({ token, quiz, initialAnswers, initialWritten, initialAvailability }: QuizFormProps) {
  const steps = ["Knowledge check", "About you", "Availability", "Disclosures"];
  const [step, setStep] = useState(0);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const submit = submitQuizIntakeAction.bind(null, token);

  // Background draft save between steps — collects current form state and
  // persists it without navigating (so client step state survives).
  function saveAndAdvance() {
    if (formRef.current) {
      const fd = new FormData(formRef.current);
      startTransition(() => {
        void saveQuizProgressAction(token, fd);
      });
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  const pct = Math.round(((step + 1) / steps.length) * 100);
  const label = { display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 } as const;

  return (
    <form action={submit} ref={formRef}>
      <div style={{ background: "var(--brand-primary)", padding: "16px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff", opacity: 0.9 }}>
            Post-interview intake
          </span>
          <span style={{ fontSize: 11, color: "#fff", opacity: 0.9 }}>
            Step {step + 1} of {steps.length}
          </span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.3)", marginTop: 14 }}>
          <div style={{ height: "100%", background: "#fff", width: `${pct}%`, transition: "width 0.3s" }} />
        </div>
        <div style={{ fontSize: 11, color: "#fff", marginTop: 6, opacity: 0.9 }}>{steps[step]}</div>
      </div>

      <div style={{ padding: 22 }}>
        {/* Step 0 — quiz */}
        <div style={{ display: step === 0 ? "block" : "none" }}>
          <h3 style={{ fontSize: 18, margin: "0 0 4px" }}>Quick knowledge check</h3>
          <p style={{ fontSize: 13, color: "var(--usapt-neutral-700)", margin: "0 0 16px" }}>
            Auto-scored. Answer honestly — there&apos;s no penalty for learning on the job.
          </p>
          {quiz.questions.map((q) => (
            <div key={q.id} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{q.prompt}</div>
              {q.options.map((o) => (
                <label key={o.id} style={{ display: "flex", gap: 8, padding: "8px 0", fontSize: 13.5, alignItems: "center" }}>
                  <input type="radio" name={`q_${q.id}`} value={o.id} defaultChecked={initialAnswers[q.id] === o.id} />
                  {o.label}
                </label>
              ))}
            </div>
          ))}
        </div>

        {/* Step 1 — written */}
        <div style={{ display: step === 1 ? "block" : "none" }}>
          <label style={label}>{quiz.writtenPrompt}</label>
          <textarea
            name="writtenResponse"
            defaultValue={initialWritten}
            rows={6}
            style={{ width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid var(--usapt-border)", fontFamily: "inherit" }}
          />
        </div>

        {/* Step 2 — availability */}
        <div style={{ display: step === 2 ? "block" : "none" }}>
          <label style={label}>When can you work? Check all that apply.</label>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: 6, alignItems: "center" }}>
            <div />
            {SLOTS.map((s) => (
              <div key={s} style={{ fontSize: 11, fontWeight: 700, textAlign: "center", color: "var(--usapt-neutral-600)" }}>
                {s}
              </div>
            ))}
            {DAYS.map((d) => (
              <div key={d} style={{ display: "contents" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d}</div>
                {SLOTS.map((s) => {
                  const key = `${d}-${s}`;
                  return (
                    <label key={key} style={{ display: "flex", justifyContent: "center", padding: "8px 0", border: "1px solid var(--usapt-border)", cursor: "pointer" }}>
                      <input type="checkbox" name={`avail_${key}`} defaultChecked={initialAvailability[key]} />
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Step 3 — disclosure + submit */}
        <div style={{ display: step === 3 ? "block" : "none" }}>
          <label style={label}>Background disclosure</label>
          <p style={{ fontSize: 12.5, color: "var(--usapt-neutral-700)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Do you have any criminal convictions to disclose? A disclosure never automatically disqualifies you — every
            decision is made by a person, and this is reviewed confidentially.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", gap: 8, fontSize: 13.5, alignItems: "center" }}>
              <input type="radio" name="hasDisclosure" value="no" defaultChecked /> Nothing to disclose
            </label>
            <label style={{ display: "flex", gap: 8, fontSize: 13.5, alignItems: "center" }}>
              <input type="radio" name="hasDisclosure" value="yes" /> I have something to disclose
            </label>
          </div>
          <textarea
            name="disclosureDetail"
            placeholder="Optional detail / context"
            rows={3}
            style={{ width: "100%", marginTop: 10, padding: "10px 12px", fontSize: 14, border: "1px solid var(--usapt-border)", fontFamily: "inherit" }}
          />
        </div>

        {/* Nav */}
        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              style={{ padding: "12px 16px", fontFamily: "inherit", fontWeight: 700, fontSize: 14, border: "1px solid var(--usapt-border-strong)", background: "#fff", cursor: "pointer" }}
            >
              Back
            </button>
          ) : null}
          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={saveAndAdvance}
              style={{ flex: 1, minHeight: 50, fontFamily: "var(--font-archivo-black), sans-serif", fontSize: 15, color: "#fff", background: "var(--brand-primary)", border: 0, cursor: "pointer" }}
            >
              SAVE &amp; CONTINUE
            </button>
          ) : (
            <button
              type="submit"
              style={{ flex: 1, minHeight: 50, fontFamily: "var(--font-archivo-black), sans-serif", fontSize: 15, color: "#fff", background: "var(--brand-primary)", border: 0, cursor: "pointer" }}
            >
              SUBMIT
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
