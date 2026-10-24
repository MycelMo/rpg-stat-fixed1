# RPG Stat — decisions & open questions

Source of truth: the notebook (`RPG_Stat_Original_Notes_Transcribed.docx` + scanned PDF) and
`RPG_Stat_Revisions_and_Additions.docx`. Where those leave a rule open, this file records what the
first version does. **Every item marked ❓ is a guess you should confirm or change.** Numbers in
brackets (R1…) match comments in the code. Constants live in Settings (✎ Settings → Quest rules)
or at the top of the relevant `src/logic/*.ts` file.

## Follows the notebook exactly
- Home = Weekly Quests board first, then Global Quests Progress (Main / Side bars with `done/total` on the right), Edit Quests top-left, Profile top-right, Completed Quests button.
- Weekly quests show their description always; global quests show title only and expand on click.
- Add/Edit Quest: title, description, Global and/or Weekly, Main **or** Side, hours (weekly), importance-rating dropdown sized by the number of weekly quests. Repeats allowed.
- Week = Mon–Sun; tick-box due 23:59 Sunday; Sunday 5 PM–midnight "Plan next week" banner.
- Free hours are chosen per day with a checkbox and a usable-minutes selector (default = full window, e.g. change 60 → 45). Only checked windows are ever scheduled or prompted. The class timetable is never used.
- Start prompt: "45-minute slot. Quest goal: …" with Accept / Reject. Reject asks for a reason ("The guild demands a reason") and logs it on **Rejections**. Accept → end-of-slot prompt Completed / Incomplete; incomplete leaves the quest on the board until the week ends, then it carries forward.
- Shop lives under Profile and is editable with the ✎ pen. XP and crystals are separate; levels get harder each level.

## Rules I had to choose
- **R1 ❓ Escalation (notebook p, q).** "Importance rating" is the point value. Each unfinished week adds +1 (setting), capped at +3 (setting) so it can't grow forever. Side quest becomes *Urgent* when points ≥ **p**; main quest becomes *MUST DO* at ≥ **p+2**. Default **p = 5**. Consequence: with a tiny board (ratings 1–3) low-rated quests never reach the thresholds. If you want p to follow the board size, say so.
- **R2 Deadlines are separate from rollover.** Deadline ≤2 days (or overdue) → "Deadline!" and these are scheduled before any random roll; ≤7 d +2 weight, ≤14 d +1. So a heavily deferred side quest can't outrank an imminent exam.
- **R3 Progress per quest** is explicit: manual %, counter (e.g. 9/1500 problems — my reading of the "CP 9/1500" sketch ❓), hours logged ÷ estimate, or milestones. Editing a quest never resets progress, logs or sessions. Reaching 100 % does **not** auto-complete; you press Complete.
- **R4 Global progress** = simple average of all global quests in the category (completed = 100 %), shown with `done/total` (notebook). Optional "weighted by estimated hours" in Settings.
- **R5 ❓ Rating scale:** weekly quests 1…(number of weekly quests); global-only quests 1…10 (notebook is silent). Higher = more important (matches "5 4 3 3 1").
- **R6 Rewards** are granted **per completed quest only** (no partial/milestone payouts in v1). Default XP = 60 main / 30 side + 10 per estimated hour + 5 per rating point; crystals = 3 main / 1 side + 1 per 5 h. Both are editable per quest. Each award has a unique ledger key, so processing twice, or reopening and re-completing, never pays twice. Balances are computed from the ledger; redemptions create history rows.
- **R7 Levels:** XP from level L → L+1 = round(100 × 1.2^(L−1)) (100, 120, 144, …).
- **R8 Which quest for a window:** weighted random (notebook) with weight = points + deadline boost, **+2 for main quests if the window is ≥ 90 min** (notebook's "1.5 h" rule, my reading ❓), × a fit factor (window ≥ preferred session, deep work prefers longer windows). Must-do and deadline quests are chosen first. Setting "Always highest score" removes the randomness. The choice is stored, so a refresh never re-rolls it; you can override any window by hand.
- **R9 Fit:** window usable time ≥ the quest's minimum session; quests that "can't be paused" also need ≥ their preferred session. A window holds at most one session. Session length = min(usable, preferred, weekly hours left).
- **R10 ❓ Swipe:** the notebook sketch shows swipe left/right but not where to. Swiping on touch screens moves Quests ⇄ Schedule ⇄ Profile.
- **Weekly + Global quests:** ticking the weekly box checks off *this week's commitment* only; the quest completes via "Complete quest". Weekly-only quests complete when ticked. ❓
- **Hours:** a weekly quest needs hours *for that week* (notebook); "total estimated effort" is optional and separate (revisions §2). Weekly budget over free time → warning; Plan-next-week needs an explicit "keep anyway" tick.
- **Rollover:** at the first load after Sunday 23:59 the week closes (kept in Archive → Past weeks), unfinished quests get +1 and are carried with their remaining hours (min 30 min), and the board is flagged "please review". You can pre-plan and confirm next week from Sunday evening via **Plan next week**. Missed weeks while the site was closed count one bump each.
- **Reschedule vs Defer (revisions §5):** both are offered. Only Defer (with optional reason) lands on Rejections. Unanswered sessions are recorded as "missed", never as failures. Reasons are editable in Settings.
- **Time zone:** the device's local time (so IST for you). ❓

## Technical decisions
- Plain Vite + React + TypeScript static site; hash URLs (`#/profile`), so Vercel needs no rewrites. No server, no database, no paid service, no PWA/service worker.
- **Persistence:** browser `localStorage` (single device). Survives refresh and restart, but is per browser and is wiped if you clear site data → Settings has Export / Import backup. Cross-device sync would need a hosted database (Vercel Postgres/KV free tiers or Supabase) — not in v1. ❓
- **Reminders:** prompts appear inside the app when it is open (checked every 15 s and when the tab regains focus). Optional browser notifications work **only while the tab is open**. Reminders with the site closed need push/service workers, which means a PWA — explicitly out of scope.
- Adjacent free windows are not merged into one "stretch"; define a 2-hour window if you want a 1.5 h+ block.

## Pre-deployment audit — open items (not changed)
- ❓ Handwritten notebook item 6 appears to define p/q as **XP values** (main = p exp, side = q exp, q<p; delayed quest bumped q→q+1; side urgent at p; main MUST at p+2). v1 bumps importance-rating points instead and leaves XP unchanged.
- ❓ Sessions are only planned when "Recommend sessions" is pressed (notebook implies automatic).
- ❓ Adjacent free windows are not merged, so the ≥1.5 h bonus needs a single window ≥ 90 min.
- ❓ A global+weekly quest ticked for the week is not put on next week's board automatically.
- ❓ A leftover smaller than the minimum session still becomes a short session.
