-- ──────────────────────────────────────────────────────────────────────────
-- Absence approval workflow
--
-- Adds a real status track to vacation / sick-leave entries so admins
-- and dispatchers can approve or reject them — and so employees see
-- the outcome instead of silent acceptance.
--
-- Prior design (May 2026) treated "the calendar_events row exists" as
-- implicit approval. That broke the German labor-law expectation that
-- Urlaubsantrag requires explicit acknowledgment.
--
-- Columns added are nullable + default-safe so existing rows (created
-- before this migration) read as 'approved' (= grandfathered) and new
-- absences enter with 'pending' via the BEFORE INSERT trigger.
--
-- Idempotent — safe to run multiple times.
-- ──────────────────────────────────────────────────────────────────────────

-- 1. Columns
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS request_status TEXT
    DEFAULT 'approved'
    CHECK (request_status IN ('pending', 'approved', 'rejected'));

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS decided_by UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS decision_reason TEXT;

-- 2. Index for the admin queue (pending absences)
CREATE INDEX IF NOT EXISTS idx_calendar_events_pending_absences
  ON public.calendar_events (organization_id, request_status, start_time DESC)
  WHERE event_type IN ('holiday', 'sick_leave') AND request_status = 'pending';

-- 3. Trigger — set sensible default status on new absence inserts.
--    Vacation requests require approval (pending).
--    Sick leaves are informational and auto-approved (acknowledged).
--    Other event types keep the existing default ('approved' = no-op).
CREATE OR REPLACE FUNCTION public.set_absence_default_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Caller may explicitly set a status; only override when NULL or the
  -- default value sneaks in for an absence row.
  IF NEW.event_type = 'holiday' THEN
    IF NEW.request_status IS NULL OR NEW.request_status = 'approved' THEN
      NEW.request_status := 'pending';
    END IF;
  ELSIF NEW.event_type = 'sick_leave' THEN
    IF NEW.request_status IS NULL THEN
      NEW.request_status := 'approved';
    END IF;
    IF NEW.decided_at IS NULL THEN
      NEW.decided_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calendar_events_set_absence_status ON public.calendar_events;
CREATE TRIGGER calendar_events_set_absence_status
  BEFORE INSERT ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_absence_default_status();

-- 4. RLS policy — let admins and dispatchers decide on absences inside
--    their org. Existing UPDATE policy (if any) is preserved; this one
--    is additive and names itself so re-running drops the prior copy.
DROP POLICY IF EXISTS "Admins decide on absences" ON public.calendar_events;
CREATE POLICY "Admins decide on absences"
  ON public.calendar_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = calendar_events.organization_id
        AND p.role IN ('admin', 'dispatcher', 'administrator', 'disponent')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.organization_id = calendar_events.organization_id
        AND p.role IN ('admin', 'dispatcher', 'administrator', 'disponent')
    )
  );

-- 5. Comment metadata so future audits know what these fields are for.
COMMENT ON COLUMN public.calendar_events.request_status IS
  'Approval state of a vacation/sick-leave request: pending | approved | rejected. Other event_types are auto-approved.';
COMMENT ON COLUMN public.calendar_events.decided_by IS
  'Admin/dispatcher who recorded the decision. NULL until decided.';
COMMENT ON COLUMN public.calendar_events.decided_at IS
  'Timestamp of the approval/rejection. NULL until decided.';
COMMENT ON COLUMN public.calendar_events.decision_reason IS
  'Free-form note from the deciding admin — usually required on rejection.';
