/**
 * Home dashboard — pixel-parity port of the webapp's `app/dashboard/page.tsx`
 * mobile (430px) layout.
 *
 * Sections (admin/dispatcher):
 *   1. Header — blue-600 32px title + slate-400 subtitle
 *   2. Stats grid — 2x2 white cards with blue value + slate-400 label
 *   3. Quick actions — 2x2 cards with coloured icon containers
 *   4. "On duty today" widget — only when there's anyone clocked in
 *   5. Recent time entries — card list (webapp uses a table at desktop;
 *      this is the mobile-responsive equivalent)
 *   6. Upcoming shifts — white cards with a blue left-bar accent
 *
 * Employees see a personal variant with today's plan + weekly hours +
 * balance + their own upcoming shifts.
 */

import React, { useMemo } from 'react'
import { View, Text, ScrollView, RefreshControl, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import {
  Calendar, Plus, Clock, ArrowUpRight, Users, ArrowRight, MapPin, TrendingUp, Wallet,
  Activity,
} from 'lucide-react-native'
import { format } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { StatusBadge } from '@/components/StatusBadge'
import { ClockInOutCard } from '@/components/ClockInOutCard'
import { LiveOpsMap, type LiveMapPin } from '@/components/LiveOpsMap'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useActiveShifts } from '@/hooks/useActiveShifts'
import { canCreatePlans, canManageUsers } from '@/lib/rbac/permissions'

export default function HomeScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, role, isAdmin, isDispatcher, isEmployee, session, loading: userLoading } = useUser()
  const { stats, loading, refetch } = useDashboardStats()
  const router = useRouter()
  const dateLocale = locale === 'de' ? deLocale : enUS
  const hr = L('Std.', 'h')

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
          {session?.user?.email && (
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-3 font-mono">{session.user.email}</Text>
          )}
        </View>
      </Screen>
    )
  }

  const firstName = profile.full_name?.split(' ')[0] ?? profile.email?.split('@')[0] ?? ''
  const managerial = isAdmin || isDispatcher

  // Live operations data — only used for managerial users; the hook is
  // cheap to mount unconditionally because RLS filters server-side.
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

  return (
    <Screen background="#FFFFFF" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor="#0064E0" />}
      >
        {/* Header */}
        <View className="mb-10">
          <Text style={{ color: '#0064E0', fontSize: 32, fontWeight: '700', letterSpacing: -0.5, lineHeight: 32 }}>
            {isEmployee ? L('Meine Übersicht', 'My Dashboard') : L('Übersicht', 'Dashboard')}
          </Text>
          <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '500', marginTop: 4 }}>
            {L(
              `Willkommen zurück, ${firstName}! Hier ist Ihre heutige Übersicht.`,
              `Welcome back, ${firstName}! Here's your overview for today.`,
            )}
          </Text>
        </View>

        {/* Clock in / out — matches the web's "Bereit / Schicht starten"
            card position at the top of the dashboard. */}
        <View style={{ marginBottom: 24 }}>
          <ClockInOutCard />
        </View>

        {/* Stats grid (2x2 on phone) */}
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, marginBottom: 32 }}>
          {managerial ? (
            <>
              <StatItem label={L('Aktive Mitarbeiter', 'Active Employees')} value={String(stats.activeEmployees)} />
              <StatItem label={L('Offene Einsatzpläne', 'Pending Plans')} value={String(stats.openPlans)} />
              <StatItem label={L('Stunden diese Woche', 'Hours this week')} value={`${stats.totalHoursThisWeek.toFixed(1)}${hr}`} />
              <StatItem label={L('Heutige Schichten', "Today's shifts")} value={String(stats.todaysShiftCount)} />
            </>
          ) : (
            <>
              <StatItem label={L('Stunden diese Woche', 'Hours this week')} value={`${stats.weeklyHoursMine.toFixed(1)}${hr}`} />
              <StatItem label={L('Saldo', 'Balance')} value={`${(stats.weeklyHoursMine - (profile.target_hours ?? 40)).toFixed(1)}${hr}`} />
              <StatItem label={L('Aktiver Einsatz', 'Active mission')} value={stats.todayPlan ? L('Aktiv', 'Active') : L('Keiner', 'None')} />
              <StatItem label={L('Heute geplant', 'Today planned')} value={stats.todayPlan ? '1' : '0'} />
            </>
          )}
        </View>

        {/* Live-Betrieb card with embedded map — managerial only.
            Mirrors the web's dashboard widget that shows active +
            upcoming shifts at a glance with a small Leaflet map. */}
        {managerial && (
          <Pressable
            onPress={() => router.push('/(tabs)/live')}
            style={{
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: '#F1F5F9',
              borderRadius: 16,
              padding: 16,
              marginBottom: 32,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
              <View
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  backgroundColor: '#EFF6FF',
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Activity size={18} color="#0064E0" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A' }}>
                  {L('Live-Betrieb', 'Live operations')}
                </Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
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
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                backgroundColor: '#EFF6FF', flexDirection: 'row', alignItems: 'center', gap: 5,
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#0064E0' }} />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#0064E0' }}>
                  {liveStats.total} {L('Aktiv', 'Active')}
                </Text>
              </View>
              <View style={{
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                backgroundColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', gap: 5,
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: '#94A3B8' }} />
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
        )}

        {/* Today's plan card (employee) */}
        {isEmployee && stats.todayPlan && (
          <View style={{
            backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16,
            padding: 24, borderLeftWidth: 4, borderLeftColor: '#0064E0', marginBottom: 32,
          }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.2 }}>
              {L('Heute', 'Today')}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A', marginTop: 6 }}>
              {stats.todayPlan.customer?.name ?? L('Einsatz', 'Shift')}
            </Text>
            <Text style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
              {format(new Date(stats.todayPlan.start_time), 'HH:mm')} – {format(new Date(stats.todayPlan.end_time), 'HH:mm')}
              {stats.todayPlan.location ? ` · ${stats.todayPlan.location}` : ''}
            </Text>
            <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
              <StatusBadge status={stats.todayPlan.status} />
            </View>
          </View>
        )}

        {/* Quick actions */}
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2, marginBottom: 16 }}>
          {L('Schnellaktionen', 'Quick Actions')}
        </Text>
        <View className="flex-row flex-wrap" style={{ marginHorizontal: -8, marginBottom: 32 }}>
          {managerial ? (
            <>
              <QuickAction
                icon={<Calendar size={28} color="#4F46E5" />}
                bg="#EEF2FF"
                label={L('Einsatzplan erstellen', 'Create Plan')}
                onPress={() => router.push('/plans/new')}
              />
              {canCreatePlans(role) && (
                <QuickAction
                  icon={<Plus size={28} color="#9333EA" />}
                  bg="#FAF5FF"
                  label={L('Mehrere Pläne', 'Bulk plans')}
                  onPress={() => router.push('/plans/bulk')}
                />
              )}
              <QuickAction
                icon={<Clock size={28} color="#0064E0" />}
                bg="#EFF6FF"
                label={L('Zeiten ansehen', 'View times')}
                onPress={() => router.push('/times' as any)}
              />
              <QuickAction
                icon={<ArrowUpRight size={28} color="#0284C7" />}
                bg="#E0F2FE"
                label={L('Bericht erstellen', 'Generate report')}
                onPress={() => router.push('/account' as any)}
              />
              {canManageUsers(role) && (
                <QuickAction
                  icon={<Users size={28} color="#0891B2" />}
                  bg="#ECFEFF"
                  label={L('Benutzer anlegen', 'Add user')}
                  onPress={() => router.push('/(tabs)/settings')}
                />
              )}
            </>
          ) : (
            <>
              <QuickAction
                icon={<Plus size={28} color="#0064E0" />}
                bg="#EFF6FF"
                label={L('Zeit erfassen', 'Add time')}
                onPress={() => router.push('/times?action=add' as any)}
              />
              <QuickAction
                icon={<Calendar size={28} color="#4F46E5" />}
                bg="#EEF2FF"
                label={L('Meine Pläne', 'My plans')}
                onPress={() => router.push('/plans')}
              />
              <QuickAction
                icon={<TrendingUp size={28} color="#0064E0" />}
                bg="#EFF6FF"
                label={L('Zeitkonto', 'Time account')}
                onPress={() => router.push('/account' as any)}
              />
              <QuickAction
                icon={<Wallet size={28} color="#0284C7" />}
                bg="#E0F2FE"
                label={L('Spesen', 'Per Diem')}
                onPress={() => router.push('/per-diem' as any)}
              />
            </>
          )}
        </View>

        {/* On-duty today (managerial only, and only if there's anyone) */}
        {managerial && stats.activeShifts.length > 0 && (
          <View style={{ marginBottom: 32 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                {L('Heute im Einsatz', 'On duty today')}
              </Text>
              <Pressable onPress={() => router.push('/(tabs)/live')}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0064E0' }}>
                  {L('Live-Ansicht', 'Live view')}
                </Text>
              </Pressable>
            </View>
            {stats.activeShifts.slice(0, 6).map((s) => (
              <View
                key={s.id ?? `${s.employee_id}-${s.start_time}`}
                style={{
                  backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16,
                  padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12,
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#10B981' }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                    {s.employee?.full_name ?? L('Mitarbeiter', 'Employee')}
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '500', color: '#94A3B8', marginTop: 2 }}>
                    {s.customer?.name ?? L('Kein Kunde', 'No customer')} · {L('seit', 'since')} {format(new Date(s.start_time), 'HH:mm')}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recent time entries */}
        {managerial && (
          <View style={{ marginBottom: 32 }}>
            <View className="flex-row items-center justify-between" style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
                {L('Aktuelle Zeiteinträge', 'Recent Time Entries')}
              </Text>
              <Pressable onPress={() => router.push('/times' as any)}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0064E0' }}>{L('Alle anzeigen', 'View all')}</Text>
              </Pressable>
            </View>

            <View style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16, overflow: 'hidden' }}>
              {(stats.recentEntries ?? []).length === 0 ? (
                <Text style={{ padding: 32, textAlign: 'center', color: '#CBD5E1', fontSize: 13, fontStyle: 'italic' }}>
                  {L('Keine aktuellen Einträge.', 'No recent time entries found.')}
                </Text>
              ) : (
                stats.recentEntries.slice(0, 5).map((entry, i) => (
                  <View
                    key={entry.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
                      borderBottomWidth: i === Math.min(stats.recentEntries.length, 5) - 1 ? 0 : 1,
                      borderBottomColor: '#F8FAFC',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                        {entry.employee?.full_name ?? '—'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                        {format(new Date(entry.date), 'dd. MMM yyyy', { locale: dateLocale })}
                        {entry.customer?.name ? ` · ${entry.customer.name}` : ''}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A', marginRight: 12 }}>
                      {(entry.net_hours ?? 0).toFixed(1)}{hr}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999,
                        backgroundColor: entry.is_verified ? '#ECFDF5' : '#FFFBEB',
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '700', color: entry.is_verified ? '#059669' : '#D97706' }}>
                        {entry.is_verified ? L('Genehmigt', 'Approved') : L('Ausstehend', 'Pending')}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* Upcoming shifts */}
        <View>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>
              {L('Anstehende Schichten', 'Upcoming shifts')}
            </Text>
            <Pressable onPress={() => router.push('/plans')}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0064E0' }}>{L('Alle anzeigen', 'View all')}</Text>
            </Pressable>
          </View>

          {stats.upcomingShifts.length === 0 ? (
            <View style={{
              paddingVertical: 40, alignItems: 'center', justifyContent: 'center',
              borderWidth: 2, borderColor: '#F1F5F9', borderStyle: 'dashed', borderRadius: 16,
            }}>
              <Text style={{ color: '#CBD5E1', fontWeight: '500', fontSize: 13 }}>
                {L('Keine anstehenden Schichten geplant.', 'No upcoming shifts scheduled.')}
              </Text>
            </View>
          ) : (
            stats.upcomingShifts.slice(0, 3).map((shift) => (
              <Pressable key={shift.id} onPress={() => router.push(`/plans/${shift.id}` as any)}>
                <View style={{
                  backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16,
                  padding: 20, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#0064E0', gap: 12,
                }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                      {format(new Date(shift.start_time), locale === 'de' ? 'EEEE - d. MMM' : 'EEEE - MMM d', { locale: dateLocale })}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '500' }}>
                      {format(new Date(shift.start_time), 'HH:mm')} – {format(new Date(shift.end_time), 'HH:mm')}
                    </Text>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 6 }}>
                    <MapPin size={12} color="#94A3B8" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.2, flex: 1 }} numberOfLines={1}>
                      {shift.customer?.name ?? L('Einsatzort', 'Mission site')}
                      {shift.location ? ` • ${shift.location}` : ''}
                    </Text>
                    <ArrowRight size={16} color="#CBD5E1" />
                  </View>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingHorizontal: 8, marginBottom: 16 }}>
      <View style={{
        backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16,
        padding: 20,
      }}>
        <Text style={{ color: '#0064E0', fontSize: 30, fontWeight: '700', letterSpacing: -0.5 }}>
          {value}
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 }}>
          {label}
        </Text>
      </View>
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
    <View style={{ width: '50%', paddingHorizontal: 8, marginBottom: 16 }}>
      <Pressable
        onPress={onPress}
        style={{
          backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F1F5F9', borderRadius: 16,
          paddingVertical: 24, paddingHorizontal: 16,
          alignItems: 'center', justifyContent: 'center', gap: 16,
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
