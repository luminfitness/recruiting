# USAPT — Competitive scope (vs. the "lumin ATS" internal build)

A second internal build of a recruiting platform was reviewed (12 screenshots, July 2026).
This doc records the **feature/UX** differential — aesthetics were explicitly out of scope —
and the decision on what to adopt.

## How the two map

| Their nav | Our equivalent | State |
|---|---|---|
| Pipeline | `/pipeline` (kanban + table + filters) | Parity |
| Grade + Quiz | `/decisions` + `/decisions/[candidateId]` | Parity, different ergonomics |
| Classes | `/classes` | Parity |
| Ad Cadence | `/sourcing` → "This week" + Settings → Cadence rules | We're ahead (automation vs. checklist) |
| Candidates | Pipeline table view | **Gap: no free-text search** |
| Jobs | `/sourcing` → Publish | Different model (posting instances vs. role definitions) |
| Reports | `/analytics` | Near parity + two small gaps |
| Admin | `/settings/*` | Parity |
| **View Application Form** | — | **Real gap: no public apply route** |

## What we deliberately do NOT copy

- **Drag-and-drop between pipeline stages.** Our transitions run through a guarded state
  machine with side effects (offers, referrals, reminders, audit). Free-form dragging invites
  illegal, unaudited transitions. If ever added, it must offer *only legal* transitions — a
  shortcut, never a bypass.
- **Their Grade+Quiz layout as-is.** It shows recruiter grade and quiz score simultaneously,
  which defeats blind grading. We keep `RevealDisclosure`. We borrow only the batch ergonomics.
- **Trash-delete on team members.** We deactivate (preserving historical attribution on
  decisions and outcomes). Ours is correct.
- **External Calendly-style group-interview links.** We book into sessions we own. Adopting
  external links is a step backwards; only the role-level phone/scheduling *metadata* is useful.

## Where we are already ahead

Multi-tenant RLS + market scoping; field-role mobile apps (TM no-show, local-manager working
interview); candidate identity thread + tokens; guarded state machine + audit log; multi-brand
theming; inbound-email/job-board provider abstraction + Zoom webhooks; cron reminders/aging/
no-show; CSV import/export; trainer→local-manager referral workflow; versioned scorecard/quiz
definitions (never re-graded retroactively); platform (vendor) console. Their build appears
single-org.

---

## Items

### A. Candidate search — S (~0.5d) — no schema
Free-text `q` on name/email in `lib/pipeline.ts` + a search input in the pipeline filter bar.
Inherits market scoping via RLS automatically. **Open: include phone?**

### B. Reports — weekly trend + cost-per-outcome tiles — M (~1–1.5d) — no schema
`weeklyTrend()` in `lib/analytics.ts` counting transitions into `offer` / `in_class` per ISO week
off the **existing** `candidate_status_history` table; inline SVG chart (`chartPalette`, no chart
lib). KPI tiles for $/applicant, $/start, $/graduate, $/producer from existing `totalSpend` +
funnel counts.
⚠️ Cost-per-outcome inherits the existing "approximate — allocated spend" caveat; label honestly.
Trends read short until history accumulates.

### C. Disposition defaults — M (~1.5–2d) — **migration**
Extend `threshold_settings` with `min_pass_pct`, `auto_backup_at_or_below_pct`, `quiz_pass_score`.
Compute `suggestedOutcome` in `lib/decisions.ts` (the queue already returns `gradeTotal`,
`gradeMax`, `quizScore`). UI pre-highlights the suggested disposition with a reason line; a new
Settings → Grading page edits the policy.
**Never auto-commits** — advisory only, so the state machine and audit trail stay intact.
**Decision: thresholds as % of rubric max** (survives rubric changes) rather than absolute points.

### D. Per-track stage visibility — S–M (~1d) — no schema (v1)
Which statuses show for manager vs. trainer (e.g. `working_interview` is trainer-only). Ship as a
constant in `@usapt/core`; org-configurable table later.
⚠️ **Design catch:** hiding a stage must not hide *candidates sitting in it* — they would silently
vanish. Either add an "off-track" bucket or only hide columns that are non-applicable **and** empty.

### E. Cadence owner + done-state — M (~1–1.5d) — **migration**
`cadence_rules` models automation actions; the *human* steps aren't modeled at all. Needs new
`cadence_checklist_items` (org-editable) + `cadence_task_completions` (item + ISO week +
completed_by). UI: owner chip, checkbox, n/total per day in Sourcing → This week.
**Decision: editable table** so ops can change the ritual without a deploy.

### F. Batch triage on Decisions — M (~1–1.5d) — no schema
List view to grade + disposition several candidates inline instead of drilling into each.
⚠️ **Highest risk of weakening an integrity control.** Must preserve `RevealDisclosure` ordering
per candidate and the felony-detail safe view.

### G. Minor polish — S (~0.5d) — no schema
Source chip on kanban cards; Classes status chips (Completed / In Progress / Upcoming) and the
In-Class vs Graduated split; inline role dropdown on Team. (Per-track phone/scheduling metadata
needs a small migration — split out.)

### H. Public application form — ✅ SHIPPED (pulled ahead of Wave 3)

Pulled forward because the ads we already publish pointed at `/apply/{brandSlug}`,
which did not exist — every live posting linked to a 404. Built as
`/apply/[brandSlug]?role=…&src=…`: brand-themed, mobile-first, no account.
Runs through `withServiceTransaction` (no session ⇒ no RLS), so the guarantees
live in `lib/public-apply.ts`: orgId is derived from the brand slug and never
taken from the request, the market is verified to belong to that brand, input is
length-capped and shape-checked, a honeypot submission is accepted silently, and
the response is identical whether or not the person already exists (no
"is this email in your system" oracle). Rate limiting is in-memory — a speed
bump, not a defence; a shared store or edge rule is the durable answer.

Also shipped alongside: **Settings → Postings** — per-brand, per-role default ad
language with `{{brand}} {{market}} {{scheduling_link}} {{contact_number}}`
placeholders, plus the scheduling link and contact number moved out of hardcoded
constants into `brand_role_settings`. The role-correct pairing invariant is
preserved: `resolveRolePackage()` looks link and number up together keyed on
role, so a trainer ad still cannot carry the manager line.

Still open from the original scope: resume upload, and a `career_site` source
value (public applications currently record `source = other` unless the ad link
carries `?src=`).

<details><summary>Original estimate</summary>

L (~3–5d + design pass) — **migration + RLS**
The only strategically important gap. Public unauthenticated route → shared
`createOrMergeCandidate` extracted from `lib/ingestion.ts` (dedupe by email/phone within org) →
the same downstream automation as an ingested applicant. Also needs a **job/role entity**: today
`jobPostings` are posting *instances*, not role definitions to hang a form on.
⚠️ **Highest risk overall** — an unauthenticated write path into a multi-tenant DB. Needs a
service-role insert with strict validation, a deliberate RLS carve-out, and spam controls
(honeypot + rate limit; optional captcha widget).
**Open: resume upload y/n; one form per job or per org; behaviour on duplicate application.**
**Should get a short design doc before code.**

</details>

---

### I. Guided demo mode + client demo script — M–L (~2–3d)
Not from the competitive review — a client-demo need. A `DEMO_MODE`-gated guided
walkthrough that steps through the funnel (apply → invite/book → attend → grade +
quiz → decision → offer/referral → class → graduate) moving one scripted prospect
all the way through, plus a bullet-point script to talk over it.
**Design intent: it drives the REAL state machine and the REAL screens** — a
scripted fake would demo nothing. Skips settings/admin entirely. Needs a reset so
the demo can be run repeatedly.
⚠️ Sequencing: this serves a client demo far more directly than H does. If a demo
is imminent, run I before H.

## Sequencing

| Wave | Items | Effort | Schema? |
|---|---|---|---|
| 1 — quick wins | A, B, G | ~2d | No |
| 2 | C, D | ~3d | C only |
| 3 | E, F | ~2.5d | E only |
| 4 — own project | H | ~3–5d | Yes + RLS |

**Total ≈ 11–14 working days.**

## Guardrail note

The role-first redesign was deliberately **frontend-only** (no schema, RLS, state-machine, or
service-layer changes — see `UX_REDESIGN_PLAN.md`). Wave 1 preserves that. **Waves 2–4 break it**
(C, E, H need migrations; H needs RLS work). That is a conscious, accepted trade — these are
product features, not UI re-organisation.
