/**
 * Compact horizontal Betriebsstelle (operational location) picker.
 * Loads `operational_locations` for the current organisation. Used in:
 *   - plans/new + plans/[id]  (start_location_id, destination_location_id)
 *   - TimeEntrySheet          (same pair)
 *   - shift-templates form    (start/destination location)
 *
 * The "None" sentinel pill returns an empty string so callers can express
 * NULL without a tri-state widget.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'

import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import type { OperationalLocation } from '@/lib/types'

interface Props {
  /** Empty string means "no location". */
  value: string
  onChange: (id: string) => void
  /** Defaults to "Betriebsstelle" — pass a custom label for start/destination distinction. */
  label?: string
}

export function OperationalLocationPicker({ value, onChange, label }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile } = useUser()

  const [locations, setLocations] = useState<OperationalLocation[]>([])

  useEffect(() => {
    if (!profile?.organization_id) return
    getSupabase()
      .from('operational_locations')
      .select('id, organization_id, name, short_code, type, is_active')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }: any) => setLocations((data ?? []) as OperationalLocation[]))
  }, [profile?.organization_id])

  return (
    <View>
      <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400 mb-1.5">
        {label ?? L('Betriebsstelle', 'Location')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pressable
          onPress={() => onChange('')}
          className={`px-4 py-2 rounded-full border-2 ${value === '' ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'}`}
        >
          <Text className={`text-[12px] font-bold ${value === '' ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>
            {L('Keine', 'None')}
          </Text>
        </Pressable>
        {locations.map((loc) => {
          const selected = value === loc.id
          const display = loc.short_code ? `${loc.short_code} · ${loc.name}` : loc.name
          return (
            <Pressable
              key={loc.id}
              onPress={() => onChange(loc.id)}
              className={`px-4 py-2 rounded-full border-2 ${selected ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'}`}
            >
              <Text className={`text-[12px] font-bold ${selected ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>
                {display}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
