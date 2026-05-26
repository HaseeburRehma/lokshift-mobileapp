/**
 * Shared types mirroring the webapp's `lib/types.ts`. Optional fields
 * remain optional so existing mobile code that constructs sparse objects
 * (e.g. picker results, list rows) keeps compiling.
 *
 * The shape is intentionally permissive on the role and joined-entity
 * fields — Supabase responses are narrowed at the hook layer (see
 * `lib/rbac/permissions.ts` normalization).
 */

// ──────────────────────────────────────────────────────────
// Roles
// ──────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'dispatcher' | 'employee'

// ──────────────────────────────────────────────────────────
// Calendar event colors (shared with web)
// ──────────────────────────────────────────────────────────

export const EVENT_COLORS = {
  birthday: '#A78BFA',
  meeting: '#60A5FA',
  shift: '#F472B6',
  sick_leave: '#10B981',
  event: '#0064E0',
  holiday: '#F59E0B',
  other: '#94A3B8',
} as const

// ──────────────────────────────────────────────────────────
// Core entities
// ──────────────────────────────────────────────────────────

export interface Profile {
  id: string
  organization_id: string | null
  full_name: string | null
  email: string | null
  role: UserRole
  avatar_url: string | null
  is_active: boolean
  onboarding_completed: boolean
  must_change_password?: boolean
  target_hours: number
  working_time_model_id?: string | null
  // Stammdaten — populated by the personal-data editor. The web app
  // keeps full_name in sync (= first_name + ' ' + last_name) so old
  // consumers don't break.
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  gender?: 'male' | 'female' | 'other' | string | null
  bio?: string | null
  // Live map (Phase 3+)
  last_lat?: number | null
  last_lng?: number | null
  last_location_update?: string | null
  created_at: string
  updated_at: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  legal_name?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  tax_id?: string | null
  currency?: string | null
  timezone?: string | null
  settings?: Record<string, unknown>
  spesen_rate_partial?: number | null
  spesen_rate_full?: number | null
  created_at: string
  updated_at: string
}

export interface WorkingTimeModel {
  id: string
  organization_id: string
  name: string
  description: string | null
  target_hours_per_week: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  organization_id: string
  name: string
  address?: string | null
  contact_person?: string | null
  contact_info?: string | null
  email?: string | null
  phone?: string | null
  notes?: string | null
  latitude?: number | null
  longitude?: number | null
  is_active: boolean
  created_at?: string
  updated_at?: string
}

// ──────────────────────────────────────────────────────────
// Betriebsstellen (operational locations)
// ──────────────────────────────────────────────────────────

export type OperationalLocationType =
  | 'depot'
  | 'station'
  | 'yard'
  | 'workshop'
  | 'office'
  | 'other'

export interface OperationalLocation {
  id: string
  organization_id: string
  name: string
  short_code: string | null
  type: OperationalLocationType
  address: string | null
  latitude: number | null
  longitude: number | null
  is_active: boolean
  notes: string | null
  phone_number?: string | null
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────────────────
// Plans & shift templates
// ──────────────────────────────────────────────────────────

export type PlanStatus =
  | 'draft'
  | 'assigned'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'

export interface Plan {
  id: string
  organization_id: string
  employee_id: string
  creator_id?: string
  customer_id: string | null
  start_time: string
  end_time: string
  status: PlanStatus
  route?: string | null
  location: string | null
  notes: string | null
  rejection_reason?: string | null
  // Phase 2 #11 — overnight stay + hotel
  overnight_stay?: boolean
  hotel_address?: string | null
  // Phase 3 #1 — start / destination Betriebsstellen
  start_location_id?: string | null
  destination_location_id?: string | null
  // Phase 3 #10 — Gastfahrt
  is_gastfahrt?: boolean
  created_at: string
  updated_at: string
  // Joined
  employee?: { id: string; full_name: string | null; avatar_url: string | null }
  customer?: { id: string; name: string } | null
  start_location?: OperationalLocation | null
  destination_location?: OperationalLocation | null
}

export interface ShiftTemplate {
  id: string
  organization_id: string
  creator_id: string
  name: string
  customer_id: string | null
  start_time: string // "HH:mm"
  end_time: string // "HH:mm"
  duration_days: number
  route: string | null
  location: string | null
  overnight_stay: boolean
  hotel_address: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  customer?: { id: string; name: string }
}

// ──────────────────────────────────────────────────────────
// Time entries
// ──────────────────────────────────────────────────────────

export interface TimeEntry {
  id: string
  organization_id: string
  employee_id: string
  plan_id?: string | null
  customer_id: string | null
  date: string
  start_time: string
  end_time: string | null
  break_minutes: number
  net_hours: number | null
  location: string | null
  latitude?: number | null
  longitude?: number | null
  notes: string | null
  is_verified: boolean
  verified_by?: string | null
  is_on_break?: boolean
  current_break_start?: string | null
  total_break_seconds?: number
  is_planned: boolean
  overnight_stay: boolean
  hotel_address: string | null
  meal_allowance: number | null
  // Phase 3 #1 — Betriebsstellen
  start_location_id?: string | null
  destination_location_id?: string | null
  // Phase 3 #10 — Gastfahrt
  is_gastfahrt?: boolean
  created_at: string
  updated_at: string
  // Joined
  employee?: { id: string; full_name: string | null; avatar_url: string | null }
  customer?: { id: string; name: string } | null
  verifier?: { id: string; full_name: string | null }
  plan?: { location?: string | null; customer?: { id: string; name: string } | null }
  start_location?: OperationalLocation | null
  destination_location?: OperationalLocation | null
}

export interface TimeEntryFormData {
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  customerId?: string
  location?: string
  notes?: string
  overnightStay?: boolean
  hotelAddress?: string
  isPlanned?: boolean
  startLocationId?: string | null
  destinationLocationId?: string | null
  isGastfahrt?: boolean
  /** Admin/Dispatcher entry on behalf of another employee. */
  employeeId?: string
}

export interface TimeAccount {
  employee_id: string
  full_name: string
  target_hours: number
  actual_hours: number
  balance: number
}

export interface MonthlyTimeData {
  key: string // "YYYY-MM"
  year: number
  month: number
  workingDays: number
  scheduledHours: number
  actualHours: number
  difference: number
  entries: TimeEntry[]
}

// ──────────────────────────────────────────────────────────
// Per-diem & bonuses
// ──────────────────────────────────────────────────────────

export type PerDiemStatus = 'submitted' | 'approved' | 'rejected'

export interface PerDiem {
  id: string
  organization_id: string
  employee_id: string
  plan_id?: string | null
  date: string
  task: string | null
  start_date: string | null
  end_date: string | null
  num_days: number
  rate: number
  hourly_rate?: number | null
  working_hours?: number | null
  departure_time?: string | null
  return_time?: string | null
  country: string
  amount: number
  status: PerDiemStatus
  notes: string | null
  created_at: string
  updated_at: string
  // Joined
  employee?: { id: string; full_name: string | null; avatar_url: string | null }
  plan?: Plan
}

export type HolidayBonusType =
  | 'holiday_pay'
  | 'christmas'
  | 'vacation'
  | 'performance'
  | 'other'

export interface HolidayBonus {
  id: string
  organization_id: string
  employee_id: string
  amount: number
  bonus_type: HolidayBonusType
  period_start: string | null
  period_end: string | null
  notes: string | null
  created_at: string
  // Joined
  employee?: { id: string; full_name: string | null }
}

// ──────────────────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────────────────

export interface NotificationRow {
  id: string
  user_id: string
  title: string
  body: string | null
  type: string
  is_read: boolean
  created_at: string
}

// ──────────────────────────────────────────────────────────
// Chat
// ──────────────────────────────────────────────────────────

export interface ChatConversation {
  id: string
  organization_id: string
  name: string | null
  avatar_url?: string | null
  is_group: boolean
  created_by: string
  created_at: string
  updated_at: string
  // Joined
  members?: ChatMember[]
  last_message?: ChatMessage
  messages?: ChatMessage[]
  unread_count?: number
}

export interface ChatMember {
  conversation_id: string
  user_id: string
  role: 'admin' | 'member'
  joined_at: string
  last_read_at: string
  profile?: Profile
}

export type ChatAttachmentType = 'image' | 'file' | 'audio'

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  attachment_url: string | null
  attachment_type?: ChatAttachmentType | null
  attachment_name?: string | null
  is_deleted?: boolean
  created_at: string
  // Joined
  sender?: Profile
}

// ──────────────────────────────────────────────────────────
// Calendar events (vacation, sick leave, meetings, etc.)
// ──────────────────────────────────────────────────────────

export type CalendarEventType =
  | 'event'
  | 'shift'
  | 'birthday'
  | 'meeting'
  | 'sick_leave'
  | 'holiday'
  | 'other'

export interface CalendarEvent {
  id: string
  organization_id: string
  creator_id: string
  title: string
  description: string | null
  event_type: CalendarEventType
  start_time: string
  end_time: string
  is_all_day: boolean
  color: string
  location: string | null
  reminder_minutes_before?: number | null
  reminder_sent_at?: string | null
  created_at: string
  updated_at: string
  // Joined
  creator?: Profile
  members?: { user: Profile }[]
}

export interface CalendarEventMember {
  event_id: string
  user_id: string
  profile?: Profile
}

export interface CalendarEventFormData {
  title: string
  description?: string
  event_type: CalendarEventType
  start_time: string
  end_time: string
  is_all_day: boolean
  color: string
  location?: string
  member_ids: string[]
  reminder_minutes_before?: number | null
}

export const REMINDER_OPTIONS: {
  value: number | null
  label_de: string
  label_en: string
}[] = [
  { value: null, label_de: 'Keine Erinnerung', label_en: 'No reminder' },
  { value: 15, label_de: '15 Min. vorher', label_en: '15 min before' },
  { value: 30, label_de: '30 Min. vorher', label_en: '30 min before' },
  { value: 60, label_de: '1 Stunde vorher', label_en: '1 hour before' },
  { value: 1440, label_de: '1 Tag vorher', label_en: '1 day before' },
  { value: 10080, label_de: '1 Woche vorher', label_en: '1 week before' },
]

// ──────────────────────────────────────────────────────────
// Absence requests (vacation, sick leave workflow)
// ──────────────────────────────────────────────────────────

export type AbsenceType = 'vacation' | 'sick_leave'
export type AbsenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface AbsenceRequest {
  id: string
  organization_id: string
  employee_id: string
  absence_type: AbsenceType
  start_date: string
  end_date: string
  reason: string | null
  status: AbsenceStatus
  reviewed_by?: string | null
  reviewed_at?: string | null
  review_notes?: string | null
  created_at: string
  updated_at: string
  // Joined
  employee?: { id: string; full_name: string | null; avatar_url: string | null }
  reviewer?: { id: string; full_name: string | null }
}

// ──────────────────────────────────────────────────────────
// Qualifications (employee certifications)
// ──────────────────────────────────────────────────────────

export interface Qualification {
  id: string
  user_id: string
  organization_id: string
  name: string
  issuer: string | null
  issued_at: string | null // YYYY-MM-DD
  expires_at: string | null // YYYY-MM-DD
  reference: string | null
  is_verified: boolean
  document_url: string | null
  created_at: string
  updated_at: string
  // Joined
  user?: { id: string; full_name: string | null; avatar_url: string | null }
}
