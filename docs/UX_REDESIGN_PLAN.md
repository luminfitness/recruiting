# USAPT — UX Redesign Plan (role-first, process-ordered)

## The problem (why it feels confusing now)

The app was built **feature-first**: one flat sidebar tab per capability (Dashboard, Pipeline, Decisions, Roster, Job postings, Posting cadence, Classes, Analytics, Local queue, No-show outreach, Org admin, Integrations, Triage, Audit, Outbox, Switch user). ~15 items, no grouping, no order that maps to how the work actually flows. Two concrete symptoms the client named:

1. **Too many tabs, not in process order.** The nav is an inventory of screens, not a workflow. Nothing tells you "do this, then this."
2. **Every role looks the same.** All roles share one shell; role only hides/shows a few items. And the demo drives everything as Marc (who holds every role), so the distinctions never show.

The functional doc is explicit about the intended model (Section 3–4): *"Role-scoped dashboards. Each role sees a queue of exactly the work that belongs to them. Statuses are side effects of actions."* And the key validator is the **recruiting lead** — if their daily ritual isn't obviously faster than the spreadsheet, adoption fails.

The backend already models all of this correctly (RLS market scoping, the state machine, per-role data). **This is a pure frontend / information-architecture re-org — no schema, RLS, state-machine, or service-layer changes.**

## Principles

1. **Role-first.** Each role lands in *their* work, not a shared dashboard. The app is shaped differently per role.
2. **Process-ordered.** For the power roles, navigation follows the funnel left-to-right: Source → Interview → Decide → Hire → Train → Measure. The nav teaches the process.
3. **Progressive disclosure.** Daily work is front-and-center; configuration/admin is tucked into Settings. Dev/demo tools (outbox, switcher) are clearly separate.
4. **Consolidate.** Merge screens that are one job (postings + cadence + intake = "Sourcing"). Cut the top-level count roughly in half.
5. **One clear "what needs me now."** The operator home is a prioritized action list that beats the spreadsheet on day one.

## Role-first structure — what each role's app is

| Role | Their app is… | Home screen |
|---|---|---|
| **Recruiting lead** (Marc) | The full funnel operator console | **Today** — prioritized actions across the whole funnel |
| **Trainer coordinator** (Maddy) | Same operator console, trainer-scoped, owns the local handoff | **Today** (trainer slice) + referral oversight |
| **Territory manager** (Tanya) | A single focused queue app (mobile-first) | **No-show outreach** queue — that's basically the whole app |
| **Local manager** (Diego) | A single focused queue app (mobile-first) | **My working-interview queue** — that's basically the whole app |
| **Admin** (if admin-only) | A setup/configuration console | **Settings** landing |
| **Candidate** | Unchanged — tokenized, brand-themed, zero-nav | Booking / quiz (already clean) |
| **Platform admin** | Unchanged — separate `/platform` vendor console | Org health |

A user with multiple roles (Marc = admin + recruiting_lead) gets the **union**: the operator console plus a Settings section. They land on Today.

## Operator console — the new navigation (recruiting lead / trainer coordinator)

Grouped and ordered by the funnel. ~6 daily items + a collapsed Settings, versus 15 flat tabs today.

```
▸ Today                        ← home: what needs me now (the anti-spreadsheet)

  THE FUNNEL  (in process order)
  ▸ Sourcing                   ← postings to publish + this week's cadence + application intake/triage
  ▸ Interviews                 ← sessions + live roster + attendance
  ▸ Decisions                  ← the bundle queue (the pairing-killer, the headline)
  ▸ Offers & hiring            ← manager offers awaiting reply + trainer local-referral status
  ▸ Classes                    ← cohorts, class start, graduation

  INSIGHT
  ▸ Pipeline                   ← full master-tracker: search, filter, kanban/table, export, import
  ▸ Analytics                  ← the live funnel

  ⚙ Settings  (admin only, collapsed by default)
      Organization · Brands & markets · Users & roles · Cadence rules · Integrations · Activity log
```

Key moves:
- **Merge** "Job postings" + "Posting cadence" (+ "Application triage") → one **Sourcing** screen with sections/tabs. The *cadence rules editor* moves to Settings (it's config); *what to publish this week* stays in Sourcing (it's the daily action).
- **New "Offers & hiring"** screen: today offers only appear buried on a candidate page and there's no lead-facing view of trainer referrals in flight. This screen aggregates both hire paths' in-flight work + aging.
- **Rename** for clarity: "Decision bundle" → **Decisions**; "Pipeline · tracker" → **Pipeline**.
- **Move to Settings/collapsed**: Org admin, Integrations, Cadence rules, Audit log (→ "Activity log"), Message outbox (dev-only, hide unless demo mode).
- **Remove field items from the operator nav** — TM/local queues are their own apps (below), not tabs here.

## Field-role apps (territory manager, local manager)

These roles do **one thing**. Their app should be that one thing — no funnel nav, no settings. Mobile-first single-column (they're on phones per the doc). A minimal top bar (brand, their market, sign out) and the queue. Optional secondary: a read-only "my candidates" list. Becoming Tanya or Diego via the switcher should feel like a *different, simpler product* than Marc's console — that's the role differentiation made real.

## Screen-by-screen intent (what each screen is for + layout)

- **Today (operator home):** A prioritized, actionable list — "Tuesday: switch ads to trainer mode → [do it]", "3 bundles ready to decide → [review]", "2 offers aging → [nudge]", "1 referral stale → [reassign]". Plus the 6 funnel stat tiles (already built) and today's cadence. Every item links straight to the action. This is the screen that has to beat the spreadsheet.
- **Sourcing:** Tabs — *Publish* (semi-auto postings ready for one-click), *This week* (cadence calendar view of the Sun/Tue/Thu ritual), *Intake* (triage of unparseable/manual applications). One place to "get candidates in."
- **Interviews:** Upcoming/live sessions list → open a session's live roster (attendance auto-flag + unmatched confirm). Scheduling a session lives here.
- **Decisions:** The queue of complete bundles → the full bundle screen (grade + quiz + written + availability + disclosure-on-demand). The headline auto-pairing. Mostly built; just re-home it.
- **Offers & hiring:** Split view — manager offers (awaiting reply / aging / accept-decline) and trainer referrals (with local managers, aging, outcomes). The lead's window into the two hire paths.
- **Classes:** Cohorts, assign confirmed hires, start class, graduation. Built; re-home.
- **Pipeline:** The "see/search everything" master-tracker (kanban + table + filters + export + import). Positioned as reference/search, not the daily driver.
- **Analytics:** Live funnel, cost-per-stage, class comparison. Built; re-home.
- **Settings (admin):** Sectioned config console — Organization, Brands & markets, Users & roles (with market-scope assignment), Cadence rules, Integrations, Activity log. Setup work, visually distinct from daily work.

## Current → new mapping (nothing is deleted, just re-homed)

| Current route | Goes to |
|---|---|
| `/dashboard` | **Today** (role-aware home) |
| `/postings`, `/cadence`, `/triage` | **Sourcing** (tabs); cadence *rules* editor → Settings |
| `/roster`, `/roster/[id]` | **Interviews** |
| `/decisions`, `/decisions/[id]` | **Decisions** (rename only) |
| candidate offer panel + `/local` (lead's view) | **Offers & hiring** (new aggregate) |
| `/cohorts` | **Classes** |
| `/pipeline` (+import) | **Pipeline** |
| `/analytics` | **Analytics** |
| `/admin`, `/settings/integrations`, `/audit`, `/outbox` | **Settings** (sections) |
| `/local`, `/tm` | Field-role standalone apps (their whole UI) |
| `/candidates/[id]`, `/score/[id]` | unchanged (drill-ins) |
| `/platform/*`, `/t /q /join` | unchanged |

## Role differentiation (so roles stop looking identical)

- **Different home + different nav per role** (the biggest lever — done via the structure above).
- **Prominent role identity in the header:** name the active role clearly ("Recruiting Lead"), and give each role-area a subtle accent so the field apps *look* different from the console.
- **Field roles get the mobile-card app**, not the desktop console — instantly recognizable as a different experience.
- The **/debug switcher** already gives each persona one role; after this, switching personas will visibly change the whole app shape.

## Suggested build sequence (incremental, always shippable)

1. **Nav/shell re-architecture** — role-aware sidebar with the grouped/ordered structure + Settings collapse; route redirects so old URLs still work. (Biggest perceived win.)
2. **Today home** — make it the genuine action hub (it's ~70% there).
3. **Sourcing** — merge postings + cadence-week + triage into one screen with tabs.
4. **Offers & hiring** — new aggregate screen for both hire paths.
5. **Field-role apps** — strip TM/local to focused single-purpose apps with their own minimal chrome.
6. **Settings console** — group admin/integrations/cadence-rules/audit/outbox.
7. **Polish pass** — role accents, empty states, naming, breadcrumbs, and a re-run of the design-fidelity check against the mockup.

Each step is independently demoable; verify per-role via `/debug` after each.

## Guardrails (do NOT change)

- No changes to: Drizzle schema, RLS policies, the candidate state machine + trigger, the provider abstraction, or any `lib/*` service logic. This is IA/frontend only. If a new screen needs data, compose existing `lib/*` functions.
- Keep the design tokens (`@usapt/design-tokens`) and Modernist styling; match the mockup.
- Keep all 57 tests green; keep `next build` passing. Verify each phase in-browser through `/debug` personas.
- Old routes should redirect (not 404) so nothing breaks mid-migration.

## Open questions to settle with the next agent

1. **Nav labels:** process-verb ("Source / Interview / Decide / Hire") vs. plain nouns ("Sourcing / Interviews / Decisions / Offers"). Nouns are clearer; verbs reinforce the process. Recommendation: nouns.
2. **Multi-role users:** is the union-nav enough, or do you want an explicit "view as [role]" toggle inside the app (beyond the demo switcher)?
3. **Today home scope:** one adaptive home that changes per role, vs. a distinct home component per role. Recommendation: one adaptive home that renders the sections relevant to the viewer's roles.
