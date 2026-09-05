# RKD Log — Project Knowledge

## Core Repo / App Facts
- Live at `https://dkr-fitness.github.io/rkd-log/`
- Repo: `dkr-fitness/rkd-log`
- Core file: `index.html` — has been `index.html` since the repo's first commit (3e45811); never named `Block_Log_RKD.html` in this repo's history (confirmed via `git log --follow`, 2026-07-06). Content originally came from a local file `RKD_Log.html` in Documents, copied in at the filesystem level before `git add`, so no rename event exists in git.
- Single self-contained file (~2,000 lines, no build step) — that's deliberate: deploy is `git push`, and it works offline in Bluefy. Don't split it.
- Git auth via `gh` CLI
- Rollback via `git revert`

## Scoring Model
- Metric is branded **RKD** in all user-facing labels — internal variable names (`pxi*`) and localStorage keys stay unchanged for backward compatibility
- **Curves** (`PTS`) — only three exist: **cardio** `[0,1,2,3,4,5]` (straight ramp), **strength** `[1,2,4,3,1.5,0.8]` (inverted-U peaking at Z2, collapsing at Z4/Z5 so time in 80s/90s HR is penalized), **summit** `[0,1,2,3,4.35,5]` (cardio family with a Z4 boost)
- **Curve selection** (`curModel()`): `cardio` on Sat, `strength` on every other day — unless overridden in RKD → Scoring settings
- **Medal tiers** (`medalFor(value,target)`): Gold ≤5% deviation, Silver ≤10%, Bronze ≤15%, else `OFF TARGET`. Note it returns `OFF TARGET` rather than null, so a badly-off session still shows a pill.
- **Mon/Wed/Fri (strength):** strength curve, RKD accrues live. Medal on **RKD vs `pxiSet.target`** (default 105).
- **Tue/Thu (Zone 2):** *also* scores on the strength curve, accruing live — same as lifting days. Medal on **% of session time in Z2 vs a 100% target**, reusing the same tiers (`zone2MedalFor` → `medalFor(pctZ2, 100)`). The 25–35 min Z2 / ≤5 min Z3 / zero Z4–Z5 green-amber-red compliance card is **retained alongside** the score, but is now display-only and no longer the grade. "Log full rest day" button available.
- **Sat:** capped conditioning, effort cap 7/10. Cardio ramp, reference only — not in `LIFT_DAYS`, so no medal.
- **Sun:** active recovery. Never scored: `pxi=null`, `medal="Done ✓"`. CS4 by default; Meso 01 substituted gentle yoga, and that swap is date-gated to the Meso 01 window only.
- **Rest days** (`logRest`): `pxi=0`, `medal="Rest ✓"`.
- *Not implemented:* a "Strength Endurance" format was previously documented here but has never existed in `PTS`/`MODEL_DESC`. If it's wanted, it needs building.

## Training Blocks (block/week identity)
- **`weekSel` is not the source of truth for the week.** It numbers the original 8-week program (start Mon Jul 6 2026, clamped at 8), so it stopped advancing Aug 24 and tagged everything after as "week 8". It survives only as Block 1's load picker (`DL[w-1]`, `OHP(w)`, `ROW(w)`, the `w<=2` rehab variants, the `w<8` finisher) and is hidden unless a legacy day is selected.
- **`blockFor(date)` → `{id,label,week}`** is the source of truth, derived from the calendar. `BLOCKS` tile with no gaps:
  | id | label | window |
  |---|---|---|
  | `legacy` | Block 1 | Jul 6 – Aug 16 |
  | `meso01` | Meso 1 | Aug 17 – Sep 6 |
  | `meso02` | Meso 2 | Sep 7 – Oct 18 |
- Past the last block, weeks keep counting as **`Off-block · Wk N`** so totals never re-freeze into one bucket. Before Block 1 is `Pre-block`.
- **Two display forms:** `blockTag` compact (`M1·W3`) for the top bar and history rows; `blockText` verbose (`Meso 1 · Wk 3`) for the weekly-totals list and copy-summary.
- Entries are stamped `block` / `blockLabel` / `blockWeek` at save. `week: w` is kept **vestigially** for backward compat with pre-existing logs. `blockOf(log)` trusts the stamp, else re-derives from `log.date` — so old logs regroup correctly with no migration.
- `weeklyTotals()` keys on **block + week-within-block**, so unrelated blocks never share a bucket.
- Mesocycle reference docs: `RKD_Mesocycle_01.md`, `RKD_Mesocycle_02.md`. Day templates are calendar-driven via `mesoPhase()` / `mesoPhase2()` and ignore `w` entirely.
- **Day selector** groups by block with the current block floated to top (`orderDaySel()`); Tue/Thu/Sat/Sun are shared by every block and fold into the current block's group in weekday order, so the list opens on one complete Mon–Sun week.
- **Adding a Meso 03** means: a `BLOCKS` row, a `MESO03_*` window + phases, day templates, a `BLOCK_LIFTS` entry, a `BLOCK_OG` entry, and an `<optgroup id="ogMeso03">`.

## Workflow Rules
- **Chat** for design, strategy, and one-shot decisions
- **Claude Code** for anything ending in a commit to the repo
- Claude Code does **not** retain memory between sessions — point it at things concretely (file + symptom), state outcomes not implementation details, let it show diffs before committing
- Keep initial asks single-purpose
- Say **"don't edit anything yet"** explicitly when the intent is to stay in strategy/discussion mode
- Default rhythm: **show the diff → commit → push as separate steps.** Don't chain commit+push.
- UI must work on touch (Bluefy/iPad) — no hover-only interactions
- No build step and no test runner. Pure-logic changes (`blockFor`, medal tiers, draft lifecycle) can be exercised with macOS JavaScriptCore: `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`

## localStorage / GitHub Pages Facts
- Data persists by **URL origin**, not file contents — redeploying to the same Pages URL never risks saved data
- Real data-loss risks: opening via `file://`, clearing browser/site data, switching devices
- JSON export is the portability net for moving data across devices
- Keys in use: `dtp-logs` (sessions), `dtp-pxi` (scoring settings), `dtp-ivt` (interval-timer config), `hep_<date>` / `hepDetail_<date>` (daily HEP), `dtp-draft_<date>_<day>` (unfinished sessions)
- Every writer degrades to an in-memory fallback when `storageOK` is false (private browsing) — match that pattern for anything new

## Session Logging
- Finish flow captures **WHOOP strain** (0–21, manual entry) and reuses the existing pre-save **notes** textarea (no separate field)
- History rows: block/week tag, strain pill, tappable note icon (toggles full text inline — works on touch; `title` attr gives hover on desktop too)
- **Copy summary** button per History row exports a fixed-format text block (date, **block/week**, RKD score/medal, zone minutes, strain, prescribed-vs-actual per exercise with PR flags, notes) for pasting into chat to drive programming feedback
- Prescribed reps/weight (`rx`) persisted onto each log entry at save time — keeps historical accuracy even after program numbers change later
- PR flag = beat the best prior value from **chronologically earlier** sessions only (not all-time/future-aware)

## In-Progress Session Drafts (autosave)
- A session is written to `dtp-draft_<YYYY-MM-DD>_<day>` **as sets are logged**, not only on FINISH — so a killed background tab or a forgotten FINISH doesn't lose the workout.
- Triggers: every set/RPE/note/strain/activity edit (400ms throttle), live zone accrual (10s), and a flush on `pagehide` + `visibilitychange:hidden`. **`beforeunload` is deliberately not used** — unreliable on iOS/Bluefy.
- Captures the whole session, not just typed sets: `zoneSecs`, `pxi`, `secs`, `duration`, `freeformNames`. A resumed session keeps its RKD score and clock.
- Reopening the **same day** adopts the draft silently. Only **previous-day** drafts raise the amber banner (date, weekday, exercise count, duration) with Resume / two-tap Discard.
- Drafts **never auto-expire and are never auto-discarded** — a stale prompt is preferred over silent loss.
- Resumed sessions are stamped with `startedAt`, so `blockFor()` files them in the block/week they were *trained* in, not when they were closed out.
- Entries carry `draftId`; a second Finish for the same draft is refused, so resume-then-finish can't duplicate.
- `logRest()` sets `draftHold` so a rest day logged over a draft neither deletes it nor hides it — the banner reports the conflict and leaves the call to you.
- `sessionDraft` (in-memory) is a **re-render buffer only** and is a separate thing from the durable draft. Don't conflate them.

## Other Features
- **Interval timer** — standalone programmable work/rest/rounds timer behind the ⏱ control on the bottom dock. Colour-coded work/rest, audio + vibration on transitions, persistent mute, pause/resume. Deliberately **logs nothing**; runs independently alongside a workout. Shares the block timer's `setInterval` + Web Audio + wake-lock approach, and its backgrounding limitation is flagged in its own UI.
- **Wake lock** is reference-counted — the block timer and interval timer can both hold it independently.

## Known Gaps (as of 2026-09-06)
- **Form Reference is badly out of date** — `FORM_GLOSSARY` covers 7 exercises, only 2 of Meso 02's 12. Missing: Rack Pull, Chest Press, Neutral-Grip Row, Triceps Extension, Scapular Wall Slide, Prone Y-Raises, Bulgarian SS, Pallof, Bird Dog, RDL. Source of record is `RKD_Exercise_Glossary_v1.md`.
- **PR grid has 7 orphan tiles** (Back Squat, Weighted Pull-Up, Bench Press, OHP, BB Row, Dead Hang, Hip Thrust) that no current template can produce — several are on the named-exclusion list, so they render a permanent dash.
- **`Wall Push-Up Progression` key vs `Floor Push-Ups` label** — the key was kept for PR-history continuity, but the wall ladder is retired. Needs resolving.
- **Block 1 retirement is deferred, not decided.** `weekSel`, `DL`/`OHP`/`ROW`, and the `upper`/`lower`/`mixed` templates stay until it's called closed.
- No committed tests.
