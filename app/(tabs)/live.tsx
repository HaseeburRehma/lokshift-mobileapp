/**
 * Live operations dashboard — mirrors the webapp's /dashboard/live.
 *
 * Admin / Dispatcher view:
 *   - KPI strip: Total active · On mission · On break
 *   - Map (react-native-maps) with two layers:
 *       • blue pins at profiles.last_lat/last_lng for currently clocked-in
 *         employees (status color follows is_on_break)
 *       • gray pins at customer.lat/lng for confirmed plans starting today
 *   - Personnel list under the map showing every active shift with name,
 *     status pill, started-at timer, plan/customer
 *
 * Employee view:
 *   - Friendly gating message + ClockInOutCard so the same tab is useful
 *     to non-managerial roles.
 */

import React, { useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native'
import {
  Activity,
  Briefcase,
  Coffee,
  Users as UsersIcon,
} from 'lucide-react-native'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { ClockInOutCard } from '@/components/ClockInOutCard'
import { LiveOpsMap, type LiveMapPin } from '@/components/LiveOpsMap'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canCreatePlans, ROLE_COLORS } from '@/lib/rbac/permissions'
import { useActiveShifts, type ActiveShift } from '@/hooks/useActiveShifts'

// Germany-centered fallback when there's nothing to plot.
const DEFAULT_REGION = {
  latitude: 51.1657,
  longitude: 10.4515,
  latitudeDelta: 8,
  longitudeDelta: 8,
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
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS
  const { role } = useUser()
  const managerial = canCreatePlans(role)
  const { activeShifts, upcoming, stats, loading, refresh } = useActiveShifts()

  const activePins = useMemo(() => pinsFromShifts(activeShifts), [activeShifts])
  const upcomingPins = useMemo(() => pinsFromUpcoming(upcoming), [upcoming])

  const initialRegion = useMemo(() => {
    const first = activePins[0] ?? upcomingPins[0]
    if (!first) return DEFAULT_REGION
    return {
      latitude: first.latitude,
      longitude: first.longitude,
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    }
  }, [activePins, upcomingPins])

  // Employee view: clock-in card + gating message. We still subscribe to
  // useActiveShifts so RLS quietly filters server-side; the map is hidden.
  if (!managerial) {
    return (
      <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        >
          <Text className="text-[28px] font-black text-brand tracking-tight mb-1">
            {L('Live', 'Live')}
          </Text>
          <Text className="text-[13px] text-gray-400 dark:text-slate-500 mb-6">
            {L(
              'Schicht starten und Pause verwalten',
              'Begin a shift and manage breaks',
            )}
          </Text>
          <ClockInOutCard />
          <View className="mt-6">
            <Card>
              <View className="flex-row items-start">
                <Activity size={18} color="#0064E0" style={{ marginTop: 2, marginRight: 10 }} />
                <View className="flex-1">
                  <Text className="text-[13px] font-black text-gray-900 dark:text-white">
                    {L('Live-Ansicht', 'Live overview')}
                  </Text>
                  <Text className="text-[12px] text-gray-500 dark:text-slate-400 mt-1">
                    {L(
                      'Die Einsatzkarte mit Team-Status ist für Admins und Disposition reserviert.',
                      'The team status map is reserved for admins and dispatchers.',
                    )}
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        </ScrollView>
      </Screen>
    )
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => refresh()}
            tintColor="#0064E0"
          />
        }
      >
        <Text className="text-[28px] font-black text-brand tracking-tight mb-1">
          {L('Live-Einsatz', 'Live operations')}
        </Text>
        <Text className="text-[13px] text-gray-400 dark:text-slate-500 mb-4">
          {L(
            'Wer ist gerade im Einsatz und wo',
            'Who is on a shift right now and where',
          )}
        </Text>

        {/* KPI strip */}
        <View className="flex-row gap-2 mb-4">
          <KpiCard
            label={L('Aktiv', 'Active')}
            value={stats.total}
            color="#0064E0"
            bg="#EFF6FF"
            icon={<Activity size={18} color="#0064E0" />}
          />
          <KpiCard
            label={L('Im Einsatz', 'On mission')}
            value={stats.onMission}
            color="#10B981"
            bg="#ECFDF5"
            icon={<Briefcase size={18} color="#10B981" />}
          />
          <KpiCard
            label={L('Pause', 'On break')}
            value={stats.onBreak}
            color="#F59E0B"
            bg="#FFFBEB"
            icon={<Coffee size={18} color="#F59E0B" />}
          />
        </View>

        {/* Map (platform-aware — react-native-maps on iOS/Android,
            placeholder on web). The MapView import lives in
            components/LiveOpsMap.tsx with a .web.tsx fallback so the
            web bundle never resolves react-native-maps. */}
        <LiveOpsMap
          activePins={activePins}
          upcomingPins={upcomingPins}
          initialRegion={initialRegion}
          emptyLabel={L('Keine aktiven Einsätze', 'No active shifts')}
        />

        {/* Personnel list */}
        <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
          {L('Personal', 'Personnel')}
        </Text>

        {activeShifts.length === 0 ? (
          <Card>
            <View className="items-center py-8">
              <UsersIcon size={28} color="#D1D5DB" />
              <Text className="text-[13px] text-gray-500 dark:text-slate-400 mt-3">
                {L('Niemand ist gerade im Einsatz.', 'Nobody is on a shift right now.')}
              </Text>
            </View>
          </Card>
        ) : (
          <View className="space-y-2">
            {activeShifts.map((s) => {
              const onBreak = !!s.is_on_break
              const status = onBreak ? '#F59E0B' : '#10B981'
              const since = formatDistanceToNowStrict(new Date(s.start_time), {
                locale: dateLocale,
              })
              const initials = (s.employee?.full_name ?? '?')
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()
              const roleColor =
                s.employee?.role && s.employee.role in ROLE_COLORS
                  ? ROLE_COLORS[s.employee.role]
                  : '#0064E0'
              return (
                <View
                  key={s.id}
                  className="flex-row items-center bg-white dark:bg-slate-900 rounded-2xl px-3 py-3 border border-gray-100 dark:border-slate-800"
                >
                  <View className="relative mr-3">
                    {s.employee?.avatar_url ? (
                      <Image
                        source={{ uri: s.employee.avatar_url }}
                        style={{ width: 40, height: 40, borderRadius: 999 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 999,
                          backgroundColor: '#EEF2FF',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: '#0064E0', fontWeight: '900' }}>{initials}</Text>
                      </View>
                    )}
                    <View
                      style={{
                        position: 'absolute',
                        right: -2,
                        bottom: -2,
                        width: 12,
                        height: 12,
                        borderRadius: 999,
                        backgroundColor: status,
                        borderColor: '#fff',
                        borderWidth: 2,
                      }}
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14px] font-black text-gray-900 dark:text-white" numberOfLines={1}>
                      {s.employee?.full_name ?? '—'}
                    </Text>
                    <Text
                      className="text-[11px] mt-0.5"
                      style={{ color: '#64748B' }}
                      numberOfLines={1}
                    >
                      {s.plan?.customer?.name ?? s.plan?.location ?? L('Einsatz', 'Shift')}
                      {' · '}
                      {L('seit', 'since')} {since}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: `${status}1F`,
                    }}
                  >
                    <Text
                      className="text-[9px] font-black uppercase tracking-widest"
                      style={{ color: status }}
                    >
                      {onBreak ? L('Pause', 'On break') : L('Aktiv', 'Active')}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </Screen>
  )
}

function KpiCard({
  label,
  value,
  color,
  bg,
  icon,
}: {
  label: string
  value: number
  color: string
  bg: string
  icon: React.ReactNode
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bg,
        borderRadius: 16,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        {icon}
        <Text
          style={{
            fontSize: 9,
            fontWeight: '900',
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color,
            marginLeft: 6,
          }}
        >
          {label}
        </Text>
      </View>
      <Text style={{ fontSize: 22, fontWeight: '900', color }}>{value}</Text>
    </View>
  )
}
