---
name: project-rheinmaasrail-bugs
description: Rheinmaasrail client bug history — overnight shifts, Sunday allowance, dashboard
metadata:
  type: project
---

Bug 1 (FIXED 2026-06-09): Sonntagszuschlag not triggered for Saturday→Sunday overnight shifts.
Root cause: `zuschlag.ts` only checked `weekday === 0` (start date is Sunday). Fix: detect endWeekday === 0 for overnight shifts and calculate partial Sunday hours using `(endMin - 1440) / 60`.
Same fix applied to Sunday→Monday (only start→midnight counts as Sunday) and to public holiday crossings.
**Why:** German labor law requires Sunday/Feiertag Zuschlag for hours actually worked on those days, even if the shift started the day before.
**How to apply:** Always test Zuschlag calculations with Saturday 22:00→Sunday 06:00 and Sunday 22:00→Monday 06:00 examples.

Bug 2 (FIXED 2026-06-09): Overnight shift hours stored as 0 in DB; Arbeitszeitbericht showed 0.
Root cause: Old `addDays()` in `shift-hours.ts` used `toISOString()` which rolled dates back in CEST (UTC+2), causing `end_time` to be stored on the same calendar day as `start_time`. Duration = negative → clamped to 0.
Fixes:
1. `reports.ts` — added `recomputeNetHours()` fallback (same as Stundenzettel `enrich()`)
2. `stundenzettel.ts` — fixed `fmtHHMM()` to handle plain time strings like "HH:mm:ss"
3. `supabase/migrations/20260609000000_fix_overnight_net_hours.sql` — data migration: advance end_time +1 day for rows where end_time < start_time AND net_hours = 0; recalculate net_hours for all zero-hour entries

Dashboard (Issue 5): Already implemented at `/app/dashboard/index.tsx`. Wilson SaaS-style weekly grid, employees as rows × days as columns. Tap empty cell → new plan, tap filled → detail, long-press → move/reassign/delete.
