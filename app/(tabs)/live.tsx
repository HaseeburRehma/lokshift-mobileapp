/**
 * Live — mobile port of the webapp's /dashboard/live.
 *
 * Admin / Dispatcher → PersonnelMonitor:
 *   - dark "LIVE-PERSONALSTATUS" card (N aktiv) + "Im Einsatz" and
 *     "In Bereitschaft / Pause" counters
 *   - map with active (green/amber) and upcoming (grey) pins (mobile
 *     keeps the map the web shows on its dashboard)
 *   - "Personal-Monitor" cards: name, status, "Im Einsatz seit",
 *     "Aktiver Einsatzort", Kontakt (chat) + Protokoll (time entry)
 *
 * Employee → mission clock-in:
 *   - "Live-Einsatz" header + date pill
 *   - ClockInOutCard
 *   - today's mission card (or "Heute kein geplanter Einsatz")
 *   - "Einsatzvorgaben" note
 */

import React, { useMemo } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import {
  Activity,
  ArrowRight,
  ChevronRight,
  Clock,
  Coffee,
  MapPin,
  Navigation,
  PlayCircle,
  TrendingUp,
  Users as UsersIcon,
} from 'lucide-react-native'
import { format, formatDistanceToNow } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { ClockInOutCard } from '@/components/ClockInOutCard'
import { LiveOpsMap, type LiveMapPin } from '@/components/LiveOpsMap'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans } from '@/lib/rbac/permissions'
import { useActiveShifts, type ActiveShift } from '@/hooks/useActiveShifts'
import { useTimeTracking } from '@/hooks/useTimeTracking'
import { localDateKey } from '@/lib/time/shift-hours'

// Germany-centered fallback when there's nothing to plot.
const DEFAULT_REGION = {
  latitude: 51.1657,
  longitude: 10.4515,
  latitudeDelta: 8,
  longitudeDelta: 8,
}

const PLAN_STATUS_LABEL: Record<string, { de: string; en: string }> = {
  draft: { de: 'Entwurf', en: 'Draft' },
  assigned: { de: 'Offen', en: 'Open' },
  confirmed: { de: 'Bestätigt', en: 'Confirmed' },
  rejected: { de: 'Abgelehnt', en: 'Rejected' },
  cancelled: { de: 'Storniert', en: 'Cancelled' },
}

function pinsFromShifts(shifts: ActiveShift[]): LiveMapPin[] {
  const pins: LiveMapPin[] = []
  for (const s of shifts) {
    // Prefer the entry's own captured coords; fall back to the employee's
    // last known location; finally to the linked plan customer.
    const lat =
      s.latitude ?? s.employee?.last_lat ?? s.plan?.customer?.latitude ?? null
    const lng =
      s.longitude ?? s.employee?.last_lng ?? s.plan?.customer?.longitude ?? null
    if (lat == null || lng == null) continue
    pins.push({
      id: `active-${s.id}`,
      latitude: lat,
      longitude: lng,
      title: s.employee?.full_name ?? '—',
      description: s.plan?.customer?.name
        ? `Aktiv · ${s.plan.customer.name}`
        : 'Aktiv',
      color: s.is_on_break ? '#F59E0B' : '#10B981',
    })
  }
  return pins
}

function pinsFromUpcoming(
  upcoming: ReturnType<typeof useActiveShifts>['upcoming'],
): LiveMapPin[] {
  const out: LiveMapPin[] = []
  for (const p of upcoming) {
    if (!p.customer?.latitude || !p.customer?.longitude) continue
    out.push({
      id: `upcoming-${p.id}`,
      latitude: p.customer.latitude,
      longitude: p.customer.longitude,
      title: p.employee?.full_name ?? '—',
      description: `${p.customer.name} · ${format(new Date(p.start_time), 'HH:mm')}`,
      color: '#94A3B8',
    })
  }
  return out
}

export default function LiveScreen() {
  const { role } = useUser()
  const managerial = canCreatePlans(role)
  // Called for every role (as before) — RLS filters server-side.
  const live = useActiveShifts()

  if (!managerial) return <EmployeeLive />
  return <PersonnelMonitor live={live} />
}

// ─────────────────────────────────────────────────────────────────────────
// Admin / dispatcher — PersonnelMonitor
// ─────────────────────────────────────────────────────────────────────────

function PersonnelMonitor({ live }: { live: ReturnType<typeof useActiveShifts> }) {
  const router = useRouter()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const { activeShifts, upcoming, stats, loading, refresh } = live

  const activePins = useMemo(() => pinsFromShifts(activeShifts), [activeShifts])
  const upcomingPins = useMemo(() => pinsFromUpcoming(upcoming), [upcoming])
  const initialRegion = useMemo(() => {
    const first = activePins[0] ?? upcomingPins[0]
    if (!first) return DEFAULT_REGION
    return { latitude: first.latitude, longitude: first.longitude, latitudeDelta: 0.5, longitudeDelta: 0.5 }
  }, [activePins, upcomingPins])

  const firstLoad = loading && activeShifts.length === 0

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refresh()} tintColor="#0064E0" />}
      >
        {firstLoad ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
            <Activity size={32} color="#2563EB" />
            <Text style={{ marginTop: 14, fontSize: 10, fontWeight: '900', letterSpacing: 3, color: '#94A3B8', textTransform: 'uppercase' }}>
              {L('Personalstatus wird synchronisiert…', 'Syncing Personnel Status...')}
            </Text>
          </View>
        ) : (
          <>
            {/* Live HUD summary */}
            <View style={{ backgroundColor: '#0F172A', borderRadius: 32, padding: 24, marginBottom: 12, overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', right: -24, top: -16, opacity: 0.1 }}>
                <Activity size={150} color="#3B82F6" />
              </View>
              <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 3, color: '#60A5FA' }}>
                {L('LIVE-PERSONALSTATUS', 'LIVE PERSONNEL STATUS')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 16 }}>
                <Text style={{ fontSize: 64, fontWeight: '900', color: '#FFFFFF', lineHeight: 64, letterSpacing: -2 }}>
                  {String(stats.total)}
                </Text>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#94A3B8', marginLeft: 10, marginBottom: 6, letterSpacing: 2, textTransform: 'uppercase' }}>
                  {L('Aktiv', 'Active')}
                </Text>
              </View>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#94A3B8', marginTop: 14, lineHeight: 19 }}>
                {L(
                  'Echtzeit-Übersicht aller Mitarbeiter in aktiven einsatzkritischen Schichten.',
                  'Current synchronized view of all personnel engaged in mission-critical shifts.',
                )}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
              <CounterCard
                title={L('IM EINSATZ', 'ON MISSION')}
                value={stats.onMission}
                color="#059669"
                chipBg="#ECFDF5"
                icon={<TrendingUp size={16} color="#059669" />}
                footer={L('Einsatzkapazität', 'Operational Capacity')}
              />
              <CounterCard
                title={L('IN BEREITSCHAFT / PAUSE', 'ON STANDBY / BREAK')}
                value={stats.onBreak}
                color="#F59E0B"
                chipBg="#FFFBEB"
                icon={<Coffee size={16} color="#F59E0B" />}
                footer={L('Ressourcenpuffer', 'Resource Buffer')}
              />
            </View>

            {/* Map (platform-aware — react-native-maps on iOS/Android,
                placeholder on web; the import lives in LiveOpsMap). */}
            <LiveOpsMap
              activePins={activePins}
              upcomingPins={upcomingPins}
              initialRegion={initialRegion}
              emptyLabel={L('Keine aktiven Einsätze', 'No active shifts')}
            />

            {/* Personnel monitor */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 3, textTransform: 'uppercase' }}>
                {L('Personal-Monitor', 'Personnel Monitor Hub')}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#2563EB', marginRight: 6 }} />
                <Text style={{ fontSize: 9, fontWeight: '900', color: '#2563EB', letterSpacing: 1, textTransform: 'uppercase' }}>
                  {L('Live-Einsatzsynchronisation', 'Live Operational Sync')}
                </Text>
              </View>
            </View>

            {activeShifts.length === 0 ? (
              <View style={{
                paddingVertical: 48, paddingHorizontal: 20, borderRadius: 32, borderWidth: 2, borderStyle: 'dashed',
                borderColor: '#F1F5F9', backgroundColor: '#FBFCFD', alignItems: 'center',
              }}>
                <View style={{ width: 72, height: 72, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={36} color="#E2E8F0" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A', marginTop: 16 }}>
                  {L('Keine aktiven Einsätze', 'No Active Missions')}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center', marginTop: 6 }}>
                  {L('Das Einsatzpersonal befindet sich aktuell im Bereitschaftsmodus.', 'Operational workforce is currently in standby mode.')}
                </Text>
                <Pressable onPress={() => router.push(`/dashboard?date=${localDateKey()}` as any)} hitSlop={8} style={{ marginTop: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#2563EB', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                      {L('Tageseinsatzplan öffnen', 'Access Daily Deployment')}
                    </Text>
                    <ArrowRight size={12} color="#2563EB" style={{ marginLeft: 6 }} />
                  </View>
                </Pressable>
              </View>
            ) : (
              activeShifts.map((s) => {
                const onBreak = !!s.is_on_break
                const since = formatDistanceToNow(new Date(s.start_time), { locale: dateLocale })
                const site = s.plan?.customer?.name || s.plan?.location || s.location || L('Zentrale', 'Operational Hub')
                const employeeId = s.employee?.id ?? s.employee_id ?? null
                return (
                  <View
                    key={s.id}
                    style={{
                      backgroundColor: '#FFFFFF', borderRadius: 28, borderWidth: 1, borderColor: '#F1F5F9',
                      borderTopWidth: 6, borderTopColor: '#2563EB', padding: 20, marginBottom: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{
                        width: 52, height: 52, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F1F5F9',
                        alignItems: 'center', justifyContent: 'center', marginRight: 14,
                      }}>
                        <UsersIcon size={26} color="#94A3B8" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A', letterSpacing: -0.3 }} numberOfLines={1}>
                          {s.employee?.full_name ?? '—'}
                        </Text>
                        <View style={{
                          alignSelf: 'flex-start', marginTop: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2,
                          backgroundColor: onBreak ? '#FEF3C7' : '#D1FAE5',
                        }}>
                          <Text style={{ fontSize: 9, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: onBreak ? '#D97706' : '#059669' }}>
                            {onBreak ? L('In Pause', 'On Break') : L('Im Einsatz', 'On Mission')}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={{ backgroundColor: '#FBFCFD', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16, padding: 16, marginTop: 16, gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Clock size={14} color="#94A3B8" />
                          <Text style={{ marginLeft: 6, fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                            {L('Im Einsatz seit', 'Engaged For')}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F172A' }}>{since}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <MapPin size={14} color="#94A3B8" />
                          <Text style={{ marginLeft: 6, fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                            {L('Aktiver Einsatzort', 'Active Site')}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F172A', maxWidth: 150 }} numberOfLines={1}>{site}</Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                      <Pressable
                        style={{ flex: 1 }}
                        disabled={!employeeId}
                        onPress={() => employeeId && router.push(`/chat/new?with=${employeeId}` as any)}
                      >
                        <View style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 0.4, textTransform: 'uppercase' }} numberOfLines={1}>
                            {L('Kontakt', 'Contact')}
                          </Text>
                        </View>
                      </Pressable>
                      <Pressable style={{ flex: 1 }} onPress={() => router.push(`/times/${s.id}` as any)}>
                        <View style={{ height: 44, borderRadius: 12, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 10, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.4, textTransform: 'uppercase' }} numberOfLines={1}>
                            {L('Protokoll', 'Protocol')}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  </View>
                )
              })
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}

function CounterCard({
  title, value, color, chipBg, icon, footer,
}: {
  title: string
  value: number
  color: string
  chipBg: string
  icon: React.ReactNode
  footer: string
}) {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 28, borderWidth: 1, borderColor: '#F1F5F9', padding: 18, justifyContent: 'space-between' }}>
      <View>
        <Text style={{ fontSize: 9, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.8 }} numberOfLines={2}>{title}</Text>
        <Text style={{ fontSize: 40, fontWeight: '900', color, letterSpacing: -1, marginTop: 10, lineHeight: 42 }}>{String(value)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
        <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: chipBg, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
          {icon}
        </View>
        <Text style={{ flex: 1, fontSize: 9, fontWeight: '900', color: '#94A3B8', letterSpacing: 1, textTransform: 'uppercase' }} numberOfLines={2}>
          {footer}
        </Text>
      </View>
    </View>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Employee — mission clock-in
// ─────────────────────────────────────────────────────────────────────────

function EmployeeLive() {
  const router = useRouter()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const { activeEntry, todayPlans, loading, refresh } = useTimeTracking()

  const activePlan = todayPlans.find((p) => p.id === activeEntry?.plan_id) ?? todayPlans[0] ?? null
  const badge = activeEntry
    ? activeEntry.is_on_break
      ? { label: L('In Bereitschaft', 'On Standby'), bg: '#D1FAE5', fg: '#059669' }
      : { label: L('Einsatz aktiv', 'Mission Active'), bg: '#D1FAE5', fg: '#059669' }
    : { label: L('Einsatzbereit', 'Mission Ready'), bg: '#DBEAFE', fg: '#2563EB' }
  const statusLabel = activePlan?.status
    ? (locale === 'de' ? PLAN_STATUS_LABEL[activePlan.status]?.de : PLAN_STATUS_LABEL[activePlan.status]?.en) ?? activePlan.status
    : null

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => refresh()} tintColor="#0064E0" />}
      >
        {/* Page header */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Activity size={22} color="#FFFFFF" />
            </View>
            <Text style={{ fontSize: 30, fontWeight: '700', color: '#0064E0', letterSpacing: -0.5 }}>
              {L('Live-Einsatz', 'Live Mission')}
            </Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 3, textTransform: 'uppercase', marginTop: 8 }}>
            {L('Einsatzzentrale in Echtzeit', 'Real-time operational center')}
          </Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 12, borderRadius: 999, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#EFF6FF', paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: '#2563EB', letterSpacing: 1.2, textTransform: 'uppercase' }}>
              {format(new Date(), locale === 'de' ? 'EEEE, d. MMMM yyyy' : 'EEEE, MMMM d, yyyy', { locale: dateLocale })}
            </Text>
          </View>
        </View>

        <ClockInOutCard />

        <View style={{ marginTop: 24 }}>
          {!activePlan ? (
            <View style={{
              paddingVertical: 48, paddingHorizontal: 20, borderRadius: 40, borderWidth: 2, borderStyle: 'dashed',
              borderColor: '#F1F5F9', backgroundColor: '#FBFCFD', alignItems: 'center',
            }}>
              <View style={{ width: 64, height: 64, borderRadius: 28, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Navigation size={30} color="#E2E8F0" />
              </View>
              <Text style={{ fontSize: 19, fontWeight: '700', color: '#0F172A', marginTop: 18, textAlign: 'center' }}>
                {L('Heute kein geplanter Einsatz', 'No Scheduled Mission Today')}
              </Text>
              <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.5, textTransform: 'uppercase', textAlign: 'center', marginTop: 8, maxWidth: 240, lineHeight: 15 }}>
                {L('Sehen Sie im Einsatzkalender kommende Einsätze ein.', 'Check your operational calendar for future deployment details.')}
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 40, borderWidth: 1, borderColor: '#F1F5F9', padding: 24, overflow: 'hidden' }}>
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, width: 140, height: 140, borderBottomLeftRadius: 90, backgroundColor: 'rgba(239,246,255,0.5)' }} />

              <View style={{ alignSelf: 'flex-start', borderRadius: 999, backgroundColor: badge.bg, paddingHorizontal: 14, paddingVertical: 5 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: badge.fg, letterSpacing: 2, textTransform: 'uppercase' }}>{badge.label}</Text>
              </View>

              <View style={{ flexDirection: 'row', marginTop: 20 }}>
                <View style={{ width: 56, height: 56, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
                  <Navigation size={26} color="#2563EB" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 24, fontWeight: '900', color: '#0F172A', letterSpacing: -1 }} numberOfLines={2}>
                    {activePlan.route || activePlan.shift_name || L('Einsatzzentrale', 'Operational Hub')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Clock size={12} color="#94A3B8" />
                      <Text style={{ marginLeft: 4, fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.2 }}>
                        {format(new Date(activePlan.start_time), 'HH:mm')} – {format(new Date(activePlan.end_time), 'HH:mm')}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#2563EB', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                      {L('Einsatz-ID', 'Mission ID')}: {activePlan.id.slice(0, 8)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ height: 1, backgroundColor: '#F8FAFC', marginVertical: 20 }} />

              <MissionRow
                icon={<MapPin size={18} color="#94A3B8" />}
                label={L('Aktueller Einsatzort', 'Current Work Site')}
                value={activePlan.location || activePlan.customer?.name || L('Hauptzentrale', 'Main Deployment Center')}
              />
              <MissionRow
                icon={<PlayCircle size={18} color="#94A3B8" />}
                label={L('Einsatzstatus', 'Assignment Context')}
                value={statusLabel ?? L('Einsatzbereit', 'Operational')}
              />

              <Pressable onPress={() => router.push(`/plans/${activePlan.id}` as any)} style={{ marginTop: 12 }}>
                <View style={{ height: 56, borderRadius: 28, backgroundColor: '#0F172A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFFFFF', letterSpacing: 2, textTransform: 'uppercase' }}>
                    {L('Einsatzauswertung', 'Mission Analytics')}
                  </Text>
                  <ChevronRight size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </View>
              </Pressable>
            </View>
          )}

          {/* Guidelines mini-card */}
          <View style={{ marginTop: 20, backgroundColor: '#0F172A', borderRadius: 40, borderWidth: 1, borderColor: '#1E293B', padding: 28, overflow: 'hidden' }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: 12, right: 12, opacity: 0.1 }}>
              <Navigation size={110} color="#3B82F6" />
            </View>
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#60A5FA', letterSpacing: 3, textTransform: 'uppercase' }}>
              {L('Einsatzvorgaben', 'Operational Directives')}
            </Text>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', lineHeight: 18, fontStyle: 'italic', marginTop: 12, maxWidth: '88%' }}>
              {L(
                'Der Einsatzabschluss erfordert die Bestätigung aller organisatorischen Kontrollpunkte. Pausen werden live von der Disposition überwacht.',
                'Mission completion mandates verification of all organizational checkpoints. Break durations are live-monitored by dispatch.',
              )}
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

function MissionRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
        <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          {icon}
        </View>
        <Text style={{ fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.6, textTransform: 'uppercase', flexShrink: 1 }}>{label}</Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: '900', color: '#0F172A', marginLeft: 8, maxWidth: '45%', textAlign: 'right' }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}
