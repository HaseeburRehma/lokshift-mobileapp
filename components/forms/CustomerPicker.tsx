/**
 * Compact horizontal customer picker. Loads `customers` for the current
 * organisation and offers a sentinel "No customer" pill so the caller
 * can express null.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'

import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'
import { useTranslation } from '@/lib/i18n'
import type { Customer } from '@/lib/types'

interface Props {
  /** Empty string means "no customer". */
  value: string
  onChange: (id: string) => void
  label?: string
}

export function CustomerPicker({ value, onChange, label }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile } = useUser()

  const [customers, setCustomers] = useState<Customer[]>([])

  useEffect(() => {
    if (!profile?.organization_id) return
    getSupabase()
      .from('customers')
      .select('id, organization_id, name, is_active')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }: any) => setCustomers((data ?? []) as Customer[]))
  }, [profile?.organization_id])

  return (
    <View>
      <Text className="text-[12px] font-semibold uppercase tracking-wider ml-1 text-gray-500 dark:text-slate-400 mb-1.5">
        {label ?? L('Kunde', 'Customer')}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Pressable
          onPress={() => onChange('')}
          className={`px-4 py-2 rounded-full border-2 ${value === '' ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'}`}
        >
          <Text className={`text-[12px] font-bold ${value === '' ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>
            {L('Kein Kunde', 'No customer')}
          </Text>
        </Pressable>
        {customers.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onChange(c.id)}
            className={`px-4 py-2 rounded-full border-2 ${value === c.id ? 'bg-brand border-brand' : 'bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700'}`}
          >
            <Text className={`text-[12px] font-bold ${value === c.id ? 'text-white' : 'text-gray-600 dark:text-slate-400'}`}>
              {c.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}
