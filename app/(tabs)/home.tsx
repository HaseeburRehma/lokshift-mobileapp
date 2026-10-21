/**
 * Home dashboard — mobile port of the webapp's `app/dashboard/page.tsx`.
 *
 * Admin / dispatcher (Kundenfeedback Punkt 10: "Zuerst anzeigen: Laut
 * Planung aktuell im Einsatz und die aktuelle Wochenplanung"):
 *   1. Header — "Übersicht" + welcome line
 *   2. Laut Planung aktuell im Einsatz (OnDutyNow)
 *   3. Aktuelle Wochenplanung (WeekPlanningGlance — shifts of every day)
 *   4. Handlungsbedarf cards (AttentionCards)
 *   5. Schnellaktionen
 *   6. Own time tracking (ClockInOutCard — dispatchers also drive)
 *   7. Live-Betrieb card with map
 *   8. Aktuelle Zeiteinträge
 *   9. Anstehende Schichten
 *
 * Employees (Punkte 9 + 14 — own shifts first):
 *   1. Header — "Meine Übersicht"
 *   2. ClockInOutCard
 *   3. Meine Einsätze (EmployeeWeekGlance)
 *   4. Quick actions
 *   5. Letzte Schichten
 */

import React, { useMemo } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import {
  Calendar, Plus, Clock, ArrowUpRight, ArrowRight, TrendingUp, CheckCircle2,
  MessageSquare, Navigation,
} from 'lucide-react-native'
import { format } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { ClockInOutCard } from '@/components/ClockInOutCard'
import { OnDutyNow } from '@/components/home/OnDutyNow'
import { AttentionCards } from '@/components/home/AttentionCards'
import { EmployeeWeekGlance } from '@/components/home/EmployeeWeekGlance'
import { WeekPlanningGlance } from '@/components/home/WeekPlanningGlance'
import { LiveOpsMap, type LiveMapPin } from '@/components/LiveOpsMap'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useActiveShifts } from '@/hooks/useActiveShifts'
import { entryNetHours } from '@/lib/time/shift-hours'
import { formatHours } from '@/lib/time/format'
import { entryStatus, entryStatusLabel, type EntryStatus } from '@/lib/times/entry-status'
import type { TimeEntry } from '@/lib/types'

/** Native colours of the webapp's ENTRY_STATUS_STYLE badge classes. */
const ENTRY_BADGE: Record<EntryStatus, { bg: string; fg: string; border: string }> = {
  planned: { bg: '#F5F3FF', fg: '#6D28D9', border: '#DDD6FE' },
  running: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE' },
  draft: { bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A' },
  submitted: { bg: '#F0F9FF', fg: '#0369A1', border: '#BAE6FD' },
  approved: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
}

export default function HomeScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, isAdmin, isDispatcher, session, loading: userLoading } = useUser()
  const { stats, loading, refetch } = useDashboardStats()
  const router = useRouter()
  const dateLocale = locale === 'de' ? deLocale : enUS
  const hr = L('Std.', 'h')

  // IMPORTANT — hook order rule. Every hook this component calls MUST run
  // on every render, no matter what userLoading / !profile evaluate to.
  // Previously we bailed out with `if (userLoading) return ...` BEFORE
  // calling useActiveShifts + useMemo, which meant the hook count changed
  // between renders and React logged "Rendered fewer hooks than expected".
  // Keep all hook calls above the early returns.
  const { activeShifts, upcoming, stats: liveStats } = useActiveShifts()
  const livePins: LiveMapPin[] = useMemo(() => {
    const out: LiveMapPin[] = []
    for (const s of activeShifts) {
      const lat = s.latitude ?? s.employee?.last_lat ?? s.plan?.customer?.latitude ?? null
      const lng = s.longitude ?? s.employee?.last_lng ?? s.plan?.customer?.longitude ?? null
      if (lat == null || lng == null) continue
      out.push({
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
    return out
  }, [activeShifts])
  const upcomingPins: LiveMapPin[] = useMemo(() => {
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
  }, [upcoming])
  const liveInitialRegion = useMemo(() => {
    const first = livePins[0] ?? upcomingPins[0]
    if (!first) return { latitude: 51.1657, longitude: 10.4515, latitudeDelta: 8, longitudeDelta: 8 }
    return {
      latitude: first.latitude,
      longitude: first.longitude,
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    }
  }, [livePins, upcomingPins])

  // Now safe to short-circuit — every hook above ran unconditionally.
  if (userLoading) {
    return (
      <Screen background="#FFFFFF" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 dark:text-slate-500 text-[13px]">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  if (!profile) {
    return (
      <Screen background="#FFFFFF" noTapToDismiss>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-[20px] font-black text-gray-900 dark:text-white text-center mb-2">
            {L('Profil nicht gefunden', 'Profile not found')}
          </Text>
          <Text className="text-[13px] text-gray-500 dark:text-slate-400 text-center leading-relaxed">
            {L(
              'Ihr Konto ist angemeldet, aber wir konnten kein Profil finden. Bitte kontaktieren Sie Ihren Admin.',
              "You're signed in but no profile was found. Please ask your admin.",
            )}
          </Text>
          {session?.user?.email ? (
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-3 font-mono">{session.user.email}</Text>
          ) : null}
        </View>
      </Screen>
    )
  }

  const firstName = profile.full_name?.split(' ')[0] ?? profile.email?.split('@')[0] ?? ''
  const managerial = isAdmin || isDispatcher
  const recent = (stats.recentEntries ?? []).slice(0, 5)
  const fmtDate = (d: string | null | undefined) => (d ? d.split('-').reverse().join('.') : '—')

  const entryBadge = (entry: TimeEntry) => {
    const st = entryStatus(entry)
    const c = ENTRY_BADGE[st]
    return (
      <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: c.fg }}>{entryStatusLabel(st, locale === 'de' ? 'de' : 'en')}</Text>
      </View>
    )
  }

  const recentList = (opts: { title: string; linkLabel: string; empty: string; employeeView: boolean }) => (
    <View style={{ marginBottom: 28 }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 }}>{opts.title}</Text>
        <Pressable onPress={() => router.push('/times' as any)} hitSlop={8}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>{opts.linkLabel}</Text>
        </Pressable>
      </View>
      <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16, overflow: 'hidden' }}>
        {recent.length === 0 ? (
          <Text style={{ paddingHorizontal: 20, paddingVertical: 32, textAlign: 'center', color: '#CBD5E1', fontSize: 13, fontWeight: '500', fontStyle: 'italic' }}>
            {opts.empty}
          </Text>
        ) : (
          recent.map((entry, i) => (
            <Pressable key={entry.id} onPress={() => router.push(`/times/${entry.id}` as any)}>
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: i === recent.length - 1 ? 0 : 1, borderBottomColor: '#F8FAFC',
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                    {opts.employeeView
                      ? entry.customer?.name || L('Standardeinsatz', 'Standard Protocol')
                      : entry.employee?.full_name ?? '—'}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#64748B', marginTop: 2 }} numberOfLines={1}>
                    {fmtDate(entry.date)}
                    {!opts.employeeView ? ` · ${entry.customer?.name || '—'}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 4 }}>
                    {formatHours(entryNetHours(entry), locale === 'de' ? 'de' : 'en')} {hr}
                  </Text>
                  {entryBadge(entry)}
                </View>
                <ArrowRight size={16} color="#CBD5E1" style={{ marginLeft: 10 }} />
              </View>
            </Pressable>
          ))
        )}
      </View>
    </View>
  )

  // ── Employee ─────────────────────────────────────────────────────────
  if (!managerial) {
    return (
      <Screen background="#FFFFFF" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0064E0" />}
        >
          <PageTitle
            title={L('Meine Übersicht', 'Personal Dashboard')}
            subtitle={L(
              `Willkommen zurück, ${firstName}! Hier ist Ihre persönliche Übersicht.`,
              `Welcome back, ${firstName}! Here's your personal overview.`,
            )}
          />

          {/* Operations bar (unified clock) */}
          <View style={{ marginBottom: 28 }}>
            <ClockInOutCard />
          </View>

          {/* Kundenfeedback Punkte 9 + 14 — own shifts first */}
          <EmployeeWeekGlance />

          <View className="flex-row flex-wrap" style={{ marginHorizontal: -6, marginBottom: 20 }}>
            <QuickAction icon={<Calendar size={28} color="#4F46E5" />} bg="#EEF2FF" label={L('Meine Woche', 'My week')} onPress={() => router.push('/plans/my-week' as any)} />
            <QuickAction icon={<Clock size={28} color="#2563EB" />} bg="#EFF6FF" label={L('Meine Zeiten', 'My times')} onPress={() => router.push('/times' as any)} />
            <QuickAction icon={<TrendingUp size={28} color="#0284C7" />} bg="#F0F9FF" label={L('Monatsnachweis', 'Monthly statement')} onPress={() => router.push('/reports' as any)} />
            <QuickAction icon={<MessageSquare size={28} color="#0891B2" />} bg="#ECFEFF" label={L('Team-Chat', 'Team Chat')} onPress={() => router.push('/(tabs)/chat' as any)} />
          </View>

          {recentList({
            title: L('Letzte Schichten', 'Recent Shifts'),
            linkLabel: L('Gesamte Historie anzeigen', 'View All History'),
            empty: L('Keine erfassten Schichten in Ihrer Historie gefunden.', 'No recent recorded shifts found in your history.'),
            employeeView: true,
          })}
        </ScrollView>
      </Screen>
    )
  }

  // ── Admin / dispatcher ───────────────────────────────────────────────
  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0064E0" />}
      >
        <PageTitle
          title={L('Übersicht', 'Dashboard')}
          subtitle={L(
            `Willkommen zurück, ${firstName}! Hier ist Ihre heutige Übersicht.`,
            `Welcome back, ${firstName}! Here's your overview for today.`,
          )}
        />

        {/* Kundenfeedback Punkt 10 — current operations + this week first */}
        <OnDutyNow />
        <WeekPlanningGlance />
        <AttentionCards />

        {/* Quick actions — same five as the web */}
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2, marginBottom: 14 }}>
          {L('Schnellaktionen', 'Quick Actions')}
        </Text>
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -6, marginBottom: 16 }}>
          <QuickAction icon={<Calendar size={28} color="#4F46E5" />} bg="#EEF2FF" label={L('Wochenplanung', 'Weekly planning')} onPress={() => router.push('/dashboard' as any)} />
          <QuickAction icon={<Plus size={28} color="#9333EA" />} bg="#FAF5FF" label={L('Schicht anlegen', 'Add shift')} onPress={() => router.push('/plans/new' as any)} />
          <QuickAction icon={<Clock size={28} color="#2563EB" />} bg="#EFF6FF" label={L('Zeiten erfassen', 'Enter times')} onPress={() => router.push('/times' as any)} />
          <QuickAction icon={<CheckCircle2 size={28} color="#059669" />} bg="#ECFDF5" label={L('Freigaben', 'Approvals')} onPress={() => router.push('/times/verify' as any)} />
          <QuickAction icon={<ArrowUpRight size={28} color="#0284C7" />} bg="#F0F9FF" label={L('Auswertungen', 'Reports')} onPress={() => router.push('/reports' as any)} />
        </View>

        {/* Own time tracking (dispatchers also drive) */}
        <View style={{ marginBottom: 28 }}>
          <ClockInOutCard />
        </View>

        {/* Live operations map */}
        <Pressable
          onPress={() => router.push('/(tabs)/live')}
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#F1F5F9',
            borderRadius: 16,
            padding: 16,
            marginBottom: 28,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
            <Navigation size={18} color="#3B82F6" style={{ marginTop: 2, marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#0F172A' }}>
                {L('Live-Betrieb', 'Live operations')}
              </Text>
              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                {L(
                  'Echtzeit-Verfolgung aktiver Einsätze und anstehender Schichten',
                  'Real-time tracking of active shifts and upcoming work',
                )}
              </Text>
            </View>
            <ArrowRight size={16} color="#CBD5E1" style={{ marginLeft: 8, marginTop: 4 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <View style={{
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#BFDBFE',
              backgroundColor: '#EFF6FF', flexDirection: 'row', alignItems: 'center', gap: 5,
            }}>
              <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#3B82F6' }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#1D4ED8' }}>
                {liveStats.total} {L('Aktiv', 'Active')}
              </Text>
            </View>
            <View style={{
              paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#E2E8F0',
              backgroundColor: '#F8FAFC', flexDirection: 'row', alignItems: 'center', gap: 5,
            }}>
              <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#94A3B8' }} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>
                {upcoming.length} {L('Anstehend', 'Upcoming')}
              </Text>
            </View>
          </View>
          <LiveOpsMap
            activePins={livePins}
            upcomingPins={upcomingPins}
            initialRegion={liveInitialRegion}
            emptyLabel={L('Keine aktiven Einsätze', 'No active shifts')}
            height={200}
          />
        </Pressable>

        {recentList({
          title: L('Aktuelle Zeiteinträge', 'Recent Time Entries'),
          linkLabel: L('Alle anzeigen', 'View All'),
          empty: L('Keine aktuellen Zeiteinträge.', 'No recent time entries found.'),
          employeeView: false,
        })}

        {/* Upcoming shifts */}
        <View>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 }}>
              {L('Anstehende Schichten', 'Upcoming shifts')}
            </Text>
            <Pressable onPress={() => router.push('/plans')} hitSlop={8}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>{L('Alle anzeigen', 'View all')}</Text>
            </Pressable>
          </View>

          {stats.upcomingShifts.length === 0 ? (
            <View style={{
              paddingVertical: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: '#F1F5F9', borderStyle: 'dashed', borderRadius: 16,
            }}>
              <Text style={{ color: '#CBD5E1', fontWeight: '500', fontSize: 13, textAlign: 'center' }}>
                {L('Keine anstehenden Schichten geplant.', 'No upcoming shifts scheduled.')}
              </Text>
            </View>
          ) : (
            stats.upcomingShifts.slice(0, 3).map((shift) => (
              <Pressable key={shift.id} onPress={() => router.push(`/plans/${shift.id}` as any)}>
                <View style={{
                  backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16,
                  padding: 20, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#2563EB', gap: 12,
                }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                      {format(new Date(shift.start_time), locale === 'de' ? 'EEEE - d. MMM' : 'EEEE - MMM d', { locale: dateLocale })}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '500' }}>
                      {format(new Date(shift.start_time), 'HH:mm')} - {format(new Date(shift.end_time), 'HH:mm')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: -0.2 }} numberOfLines={1}>
                    {shift.customer?.name || L('Einsatzort', 'Mission site')} • {shift.location || L('Einsatzbasis', 'Ops base')}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

/** Web page H1: 32px bold #0064E0 + slate-400 subtitle. */
function PageTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ marginBottom: 28 }}>
      <Text style={{ color: '#0064E0', fontSize: 32, fontWeight: '700', letterSpacing: -0.5, lineHeight: 34 }}>
        {title}
      </Text>
      <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '500', marginTop: 4 }}>
        {subtitle}
      </Text>
    </View>
  )
}

function QuickAction({
  icon, bg, label, onPress,
}: {
  icon: React.ReactNode
  bg: string
  label: string
  onPress: () => void
}) {
  return (
    <View style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16,
          paddingVertical: 22, paddingHorizontal: 12, minHeight: 132,
          alignItems: 'center', justifyContent: 'center', gap: 14,
        }}
      >
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </View>
        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', textAlign: 'center', letterSpacing: -0.1 }}>
          {label}
        </Text>
      </Pressable>
    </View>
  )
}
