# Client demo script — USAPT Recruiting Platform

Pairs with the **guided walkthrough** in the app: `/debug` → **Start demo**. The
on-screen panel mirrors these steps, so you can present from the screen alone and
use this for the words around it.

**Runs in ~12 minutes.** Every step is the real product — a real prospect moving
through the real state machine. Nothing is mocked.

---

## Before you start (2 min)

- Open `/debug`, click **Become Marc** (recruiting lead + admin — sees everything).
- Click **Start demo**. This creates a fresh prospect and drops you on Sourcing.
- Have a second browser tab ready — two steps show the *candidate's* experience.
- Optional: **Settings → Appearance → Dark** if the room's projector is dim.

**Frame it up front, in one line:**
> "Today this runs on a spreadsheet and a lot of people remembering things.
I want to show you the same week, run by a system — and I'll follow one real applicant 
all the way from the ad to a graduate."

---

## 1 · The week starts itself — *Sourcing*

- The Sunday/Tuesday/Thursday posting ritual is **encoded, not remembered**.
- The cadence engine has already prepared this week's postings and the ad copy.
- The lead's job is approve-and-publish, not remember-and-retype.

> "Nobody has to remember it's Tuesday."

**Watch for:** they'll recognise the ritual — it's theirs. That's the hook.

## 2 · A prospect lands, and the invite is already out — *Pipeline*

- Applicant arrives from Indeed and lands in one tracker, **source attached**.
- The group-interview invitation went out **automatically, on arrival** — which is why they're 
already at *Invited*, not sitting in a queue.
- One board, both tracks (manager + trainer), filterable by brand, market, source, cohort.

> "That's the difference between a tracker and a system — nobody had to remember to send it."

## 3 · The candidate books themselves — *candidate link (new tab)*

- Click the link in the demo panel — **this is what the applicant receives**.
- Branded to the hiring brand, mobile-first, **no account, no phone tag**.
- They pick a slot; the tracker updates the instant they do.

> "This is the bit that kills your speed-to-contact problem. No one is playing phone tag on a Saturday."

**Close the tab and come back.**

## 4 · Interview day — *Interviews*

- Live roster, one-click check-in.
- **No-shows are a status, not a note** — which is precisely what makes automated no-show outreach possible.

> "The no-show isn't lost — it's a queue somebody owns."

## 5 · Score against the rubric — *Score*

- Same criteria, every candidate, every time.
- The rubric is **versioned**: change it next quarter and past candidates are never silently re-graded.

> "Two interviewers, one standard."

## 6 · The candidate's half — *candidate quiz link (new tab)*

- The other half of the bundle comes from the applicant: knowledge quiz + intake, **auto-scored**.
- The decision doesn't unlock until **both halves** are in.

> "You're never deciding on half the picture."

## 7 · Decide, with a recommendation — *Decisions* ⭐

**This is the moment. Slow down here.**

- Grade and quiz land side by side.
- The platform shows a **suggested disposition** — from *their* policy (Settings → Grading), with the reasoning attached.
- It is a **recommendation, never an action**. A person always decides, and the system records both the suggestion and what the human chose.

> "It tells you what it thinks and why — and then it gets out of the way. You can see how often you overrule it before you'd ever let it act on its own."

- Choose **Offer**.

**If they ask about disclosures:** the candidate has to answer the background question explicitly — nothing is pre-filled on their behalf, so what's on file is a statement they actually made. It's shown to the decision-maker, access-logged, and **never scores and never generates a suggestion** — those go to a person to decide directly. Deliberate: automating that decision is exactly what regulators warn against.

## 8 · Offer out, answer in — *Candidate record*

- Offer goes out; the clock starts.
- No reply? They **age into the follow-up queue automatically** rather than going quiet.
- Record the acceptance.

> "Nobody falls through a crack because someone was on holiday."

## 9 · Into a class — *Classes*

- Hiring isn't the finish line. Group into an orientation class, start it, track to graduation.
- Class-over-class comparison is what tells you whether the *hiring bar* is working.

> "You'll find out which classes produce, not just which ones filled."

## 10 · What it actually cost — *Analytics* ⭐

**The closing argument.**

- The funnel and the numbers **just moved because of what we did in the last ten minutes**.
- Cost per applicant / offer / start / graduate — tied to **real ad spend**, not a guess.
- Weekly trend of offers and starts.

> "This is the question you can't answer today: what does a graduate actually cost us, and where in the funnel are we losing them?"

---

## Closing

> "Same week, same ritual — except the system remembers, the candidate books themselves, the decision is consistent and recorded, and at the end you know what it cost. Nothing you saw was a mock-up; that applicant is in the database."

**Then stop talking.**

---

## Handling the likely questions

| They ask | Say |
|---|---|
| "Can we change the stages / wording?" | Stage labels and the grading policy are configurable; the underlying tracking stays fixed so history and reports never break. |
| "Does it decide who to hire?" | No. It recommends and records; a person decides. That's a deliberate design choice, and it's what keeps you defensible. |
| "What about multiple locations/brands?" | Built in from day one — brands, markets, and per-market access scoping. A territory manager only sees their territory. |
| "Can trainers go through a different path?" | Yes — trainers route to a local manager for a working interview. Different path, same tracker. (Offer to show the field app.) |
| "Where does the data come from?" | Four ways in: the public application form your ads link to, job boards, inbound email parsing, and CSV import (plus manual entry). All land in the same tracker with the source attached. |
| "Is this live?" | It's a working demo on real infrastructure — real database, real application form. Production hardening is the next phase. |

## Don't demo

- **Settings/admin** — except a 15-second peek at Settings → Grading in step 7 if they push on the recommendation.
- The **platform/vendor console** — that's our side, not theirs.
- Anything you haven't run once yourself that morning.

## If something breaks

- The walkthrough panel has **Back/Next** — skip a step rather than debugging live.
- Worst case: **✕** to end, then `/debug` → **Start demo** for a clean prospect.
- The pipeline already has seeded candidates at every stage, so you can always show the board even if a step misbehaves.
