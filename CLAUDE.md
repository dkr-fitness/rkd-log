# RKD Log — Project Knowledge

## Core Repo / App Facts
- Live at `https://dkr-fitness.github.io/rkd-log/`
- Repo: `dkr-fitness/rkd-log`
- Core file: `index.html` — has been `index.html` since the repo's first commit (3e45811); never named `Block_Log_RKD.html` in this repo's history (confirmed via `git log --follow`, 2026-07-06). Content originally came from a local file `RKD_Log.html` in Documents, copied in at the filesystem level before `git add`, so no rename event exists in git.
- Git auth via `gh` CLI
- Rollback via `git revert`

## Scoring Model
- Metric is branded **RKD** in all user-facing labels — internal variable names and localStorage keys stay unchanged for backward compatibility
- **Mon/Wed/Fri (Strength):** strength curve scoring — Z0≈1, Z1≈2, Z2≈4 (peak), Z3≈3, Z4≈1.5, Z5≈0.8 pts/min. Medals apply.
- **Tue/Thu:** Zone 2 compliance tracking only — 25–35 min Z2, ≤5 min Z3, zero Z4/Z5. Green/amber/red live feedback. "Log full rest day" button available.
- **Sat:** Capped BFT/Equinox class day — effort cap 7/10, cardio ramp reference only, no medal.
- **Sun:** CS4 active recovery.
- **Cardio formats:** ramp model (0/1/2/3/4/5 pts/min by zone, monotonically increasing)
- **Strength/target formats:** inverted-U curve peaking at Z2 (~4 pts/min), collapsing near zero at Z4/Z5 — time in 80s/90s HR is penalized
- **Summit:** cardio-family with Z4 boost (~4.2–4.5 pts/min)
- **Strength Endurance:** uses cardio scoring (Z5 = max reward), unlike pure Strength

## Workflow Rules
- **Chat** for design, strategy, and one-shot decisions
- **Claude Code** for anything ending in a commit to the repo
- Claude Code does **not** retain memory between sessions — point it at things concretely (file + symptom), state outcomes not implementation details, let it show diffs before committing
- Keep initial asks single-purpose
- Say **"don't edit anything yet"** explicitly when the intent is to stay in strategy/discussion mode
- UI must work on touch (Bluefy/iPad) — no hover-only interactions

## localStorage / GitHub Pages Facts
- Data persists by **URL origin**, not file contents — redeploying to the same Pages URL never risks saved data
- Real data-loss risks: opening via `file://`, clearing browser/site data, switching devices
- JSON export is the portability net for moving data across devices

## Session Logging
- Finish flow captures **WHOOP strain** (0–21, manual entry) and reuses the existing pre-save **notes** textarea (no separate field)
- History rows: strain pill, tappable note icon (toggles full text inline — works on touch; `title` attr gives hover on desktop too)
- **Copy summary** button per History row exports a fixed-format text block (date, RKD score/medal, zone minutes, strain, prescribed-vs-actual per exercise with PR flags, notes) for pasting into chat to drive programming feedback
- Prescribed reps/weight (`rx`) persisted onto each log entry at save time — keeps historical accuracy even after program numbers change later
- PR flag = beat the best prior value from **chronologically earlier** sessions only (not all-time/future-aware)
