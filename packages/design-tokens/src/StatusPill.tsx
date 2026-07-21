import type { StatusFamily } from "./tokens";

/**
 * Ported 1:1 from the Claude Design project's StatusPill.dc.html preview
 * component (family/shape/label tables and glyph paths copied verbatim).
 * This is the ONLY status-badge implementation in the app — every kanban
 * card, table row, candidate header, and timeline entry renders through
 * this component so status color/shape never drifts screen to screen.
 */

const FAMILY_BORDER: Record<StatusFamily, string> = {
  motion: "rgba(44,91,224,0.22)",
  action: "rgba(224,145,15,0.24)",
  positive: "rgba(22,163,74,0.22)",
  negative: "rgba(124,118,106,0.24)",
  risk: "rgba(239,68,68,0.26)",
};

const FAMILY_SHAPE: Record<StatusFamily, string> = {
  motion: "tri-right",
  action: "diamond",
  positive: "check",
  negative: "minus",
  risk: "tri-up",
};

/**
 * Maps every canonical Candidate.status value (Section 6 of the FRD) plus a
 * handful of presentation-only keys used outside the candidate record itself
 * (LocalReferral.outcome's "hired"/"confirmed", InterviewSession attendee
 * roster's "unmatched", and computed aging badges) to one of the five
 * families. Never add a sixth family — differentiate within a family by label.
 */
export const STATUS_FAMILY: Record<string, StatusFamily> = {
  // candidate lifecycle — in motion
  applied: "motion",
  invited: "motion",
  attended: "motion",
  evaluated: "motion",
  offer: "motion",
  backup: "motion",
  referred_local: "motion",
  working_interview: "motion",
  confirmed_orientation: "motion",
  in_class: "motion",
  awaiting_reply: "motion",
  // needs human action
  awaiting_review: "action",
  no_show: "action",
  unmatched: "action",
  aging: "action",
  // positive terminal (LocalReferral outcome / post-hire)
  graduated: "positive",
  hired: "positive",
  confirmed: "positive",
  // negative terminal — routine, not an error
  not_selected: "negative",
  declined: "negative",
  local_declined: "negative",
  quit_after_orientation: "negative",
  quit_during_class: "negative",
  never_started: "negative",
  graduated_inactive: "negative",
  // at risk
  mia: "risk",
  aging_offer: "risk",
  stale_pipeline: "risk",
};

export const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  invited: "Invited",
  attended: "Attended",
  evaluated: "Evaluated",
  offer: "Offer",
  backup: "Backup",
  awaiting_review: "Awaiting review",
  no_show: "No-show",
  unmatched: "Unmatched",
  referred_local: "Referred — local",
  working_interview: "Working interview",
  awaiting_reply: "Awaiting reply",
  confirmed_orientation: "Confirmed",
  in_class: "In class",
  graduated: "Graduated",
  hired: "Hired",
  confirmed: "Confirmed",
  not_selected: "Not selected",
  declined: "Declined",
  local_declined: "Declined — local",
  mia: "MIA",
  never_started: "Never started",
  quit_after_orientation: "Quit — post-orient.",
  quit_during_class: "Quit — in class",
  graduated_inactive: "Grad — inactive",
  aging_offer: "Aging offer",
  stale_pipeline: "Stale",
};

function Glyph({ shape, color }: { shape: string; color: string }) {
  const common = { width: 11, height: 11, viewBox: "0 0 10 10", "aria-hidden": true, style: { display: "block", flexShrink: 0 } };
  switch (shape) {
    case "tri-right":
      return (
        <svg {...common}>
          <path d="M2 1 L9 5 L2 9 Z" fill={color} />
        </svg>
      );
    case "tri-up":
      return (
        <svg {...common}>
          <path d="M5 1 L9.3 9 L0.7 9 Z" fill={color} />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill={color} />
        </svg>
      );
    case "minus":
      return (
        <svg {...common}>
          <rect x="1" y="4.1" width="8" height="1.8" fill={color} />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M1.3 5.4 L3.9 8 L8.8 2.2" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

export interface StatusPillProps {
  status: string;
  /** Override the default label for this status (e.g. a candidate-specific note). */
  label?: string;
}

export function StatusPill({ status, label }: StatusPillProps) {
  const family = STATUS_FAMILY[status] ?? "motion";
  // Read the family's colors from CSS custom properties (not the baked
  // tokens.json values) so pills adapt when the console flips to Flat-Dark.
  // The light values in tokens.css :root match tokens.json 1:1.
  const palette = {
    fill: `var(--status-${family}-fill)`,
    text: `var(--status-${family}-text)`,
    marker: `var(--status-${family}-marker)`,
  };
  const shape = FAMILY_SHAPE[family];
  const border = FAMILY_BORDER[family];
  const text = label ?? STATUS_LABEL[status] ?? status;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        fontSize: 11,
        lineHeight: 1.25,
        whiteSpace: "nowrap",
        fontWeight: 600,
        letterSpacing: "0.01em",
        borderRadius: 999,
        background: palette.fill,
        color: palette.text,
        boxShadow: `inset 0 0 0 1px ${border}`,
      }}
    >
      <Glyph shape={shape} color={palette.marker} />
      {text}
    </span>
  );
}
