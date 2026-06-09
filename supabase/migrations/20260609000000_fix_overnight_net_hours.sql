-- Fix overnight time entries that were stored with net_hours = 0 due to a
-- UTC-offset bug in the original addDays() implementation (Issue 3 / Bug 2).
--
-- The bug: on CEST (UTC+2) devices, `new Date(date).toISOString().split('T')[0]`
-- rolled the date back by one day, so the overnight end_time was stored on the
-- SAME calendar date as start_time.  Because end_time < start_time in UTC terms,
-- the duration was negative → clamped to 0.
--
-- Fix 1: Overnight entries where end_time < start_time
--   → advance end_time by exactly 1 day (the correct next-day end) and
--     recalculate net_hours from the corrected duration.
UPDATE time_entries
SET
  end_time   = end_time + INTERVAL '1 day',
  net_hours  = GREATEST(0,
                 EXTRACT(EPOCH FROM (end_time + INTERVAL '1 day' - start_time)) / 3600.0
                 - COALESCE(break_minutes, 0) / 60.0
               )
WHERE end_time  IS NOT NULL
  AND end_time  < start_time
  AND (net_hours IS NULL OR net_hours = 0);

-- Fix 2: Regular (non-overnight) entries where end_time > start_time but
--   net_hours is 0 or null — recalculate from the stored timestamps.
UPDATE time_entries
SET
  net_hours = GREATEST(0,
                EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
                - COALESCE(break_minutes, 0) / 60.0
              )
WHERE end_time  IS NOT NULL
  AND end_time  > start_time
  AND (net_hours IS NULL OR net_hours = 0);
