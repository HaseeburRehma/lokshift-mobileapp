/**
 * Compact horizontal chip-row that doubles as a single- OR multi-select
 * employee picker. Used by both the single-plan and bulk-plan forms so
 * the picker UX stays identical between them.
 *
 * Pass `mode="single"` for create-plan; the value is the selected id.
 * Pass `mode="multi"` for bulk-create; the value is a string[] of ids.
 *
 * Loads employees from the caller's organization on mount; the list is
 * stable across the dialog lifetime so re-renders don't drop selections.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { Users } from 'lucide-react-native'

import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import type { Profile } from '@/lib/types'

interface CommonProps {
  /** Show all employees, including the caller themselves. */
  includeSelf?: boolean
}

type SingleProps = CommonProps & {
  mode: 'single'
  value: string
  onChange: (id: string) => void
}

type MultiProps = CommonProps & {
  mode: 'multi'
  value: string[]
  onChange: (ids: string[]) => void
}

type Props = SingleProps | MultiProps

export function EmployeePicker(props: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, session } = useUser()

  const [employees, setEmployees] = useState<Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.organization_id) return
    getSupabase()
      .from('profiles')
      .select('id, full_name, avatar_url, role, is_active')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .eq('role', 'employee') // server-side filter — only employees can be assignees
      .order('full_name')
      .then(({ data }: any) => {
        const list = (data ?? [])
          // `includeSelf` is mostly a no-op since admin/dispatcher are
          // already filtered out by role above, but kept for the case
          // where an employee picker reuses this component for self-edits.
          .filter((p: any) => props.includeSelf || p.id !== session?.user?.id)
          .map((p: any) => ({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url }))
        setEmployees(list)
        setLoading(false)
      })
  }, [profile?.organization_id, session?.user?.id, props.includeSelf])

  const selectedIds = useMemo<string[]>(
    () => (props.mode === 'multi' ? props.value : props.value ? [props.value] : []),
    [props],
  )

  const toggle = (id: string) => {
    if (props.mode === 'single') {
      props.onChange(props.value === id ? '' : id)
      return
    }
    const next = props.value.includes(id)
      ? props.value.filter((x) => x !== id)
      : [...props.value, id]
    props.onChange(next)
  }

  const allOn = props.mode === 'multi' && employees.length > 0 && employees.every((e) => props.value.includes(e.id))
  const toggleAll = () => {
    if (props.mode !== 'multi') return
    props.onChange(allOn ? [] : employees.map((e) => e.id))
  }

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400">
          {L('Mitarbeiter', 'Employee')}{props.mode === 'multi' ? ` (${selectedIds.length}/${employees.length})` : ''}
        </Text>
        {props.mode === 'multi' && employees.length > 0 && (
          <Pressable onPress={toggleAll}>
            <Text className="text-[11px] font-bold text-brand">
              {allOn ? L('Alle abwählen', 'Deselect all') : L('Alle auswählen', 'Select all')}
            </Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View className="bg-gray-50 dark:bg-slate-950 border-2 border-gray-100 dark:border-slate-800 rounded-2xl h-14 px-4 justify-center">
          <Text className="text-[13px] text-gray-400 dark:text-slate-500">{L('Lädt…', 'Loading…')}</Text>
        </View>
      ) : employees.length === 0 ? (
        <View className="bg-gray-50 dark:bg-slate-950 border-2 border-gray-100 dark:border-slate-800 rounded-2xl py-6 items-center">
          <Users size={20} color="#D1D5DB" />
          <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-2">
            {L('Keine aktiven Mitarbeiter', 'No active employees')}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal={props.mode === 'single'}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={props.mode === 'single' ? { gap: 8, paddingRight: 8 } : { gap: 8 }}
          style={props.mode === 'multi' ? { maxHeight: 280 } : undefined}
        >
          <View className={props.mode === 'multi' ? 'flex-row flex-wrap gap-2' : 'flex-row gap-2'}>
            {employees.map((emp) => {
              const selected = selectedIds.includes(emp.id)
              return (
                <Pressable
                  key={emp.id}
                  onPress={() => toggle(emp.id)}
                  className={`px-4 py-2 rounded-full border-2 ${selected ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'}`}
                >
                  <Text className={`text-[12px] font-bold ${selected ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>
                    {emp.full_name ?? '—'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </ScrollView>
      )}
    </View>
  )
}
