/**
 * Holidays config — admin-managed list of Feiertage that the
 * Stundenzettel Zuschlag engine treats as holiday hours.
 *
 * Storage is AsyncStorage today (see lib/holidays/storage.ts); when the
 * web app exposes a shared `org_holidays` table this screen can swap
 * the persistence layer without changing its shape.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  CalendarCheck,
  Plus,
  Trash2,
  RotateCcw,
} from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import {
  loadHolidays,
  saveHolidays,
  resetHolidays,
  type HolidayEntry,
} from '@/lib/holidays/storage'
import { useSafeBack } from '@/lib/use-safe-back'

export default function HolidaysScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()

  const [rows, setRows] = useState<HolidayEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => {
    loadHolidays().then((r) => {
      setRows(r)
      setLoading(false)
    })
  }, [])

  if (!canManageUsers(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Administratoren können Feiertage verwalten.',
            'Only administrators can manage holidays.',
          )}
        </Text>
      </Screen>
    )
  }

  const persist = async (next: HolidayEntry[]) => {
    setRows(next)
    try {
      await saveHolidays(next)
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    }
  }

  const onAdd = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      toast.error(L('Datum muss YYYY-MM-DD sein.', 'Date must be YYYY-MM-DD.'))
      return
    }
    if (rows.some((r) => r.date === newDate)) {
      toast.error(L('Dieser Tag ist bereits eingetragen.', 'That date is already listed.'))
      return
    }
    const next = [...rows, { date: newDate, label: newLabel.trim() }].sort((a, b) =>
      a.date.localeCompare(b.date),
    )
    await persist(next)
    setNewDate('')
    setNewLabel('')
    toast.success(L('Feiertag hinzugefügt', 'Holiday added'))
  }

  const onDelete = (date: string) => {
    Alert.alert(
      L('Feiertag entfernen?', 'Remove holiday?'),
      L(`Datum: ${date}`, `Date: ${date}`),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: L('Entfernen', 'Remove'),
          style: 'destructive',
          onPress: () => persist(rows.filter((r) => r.date !== date)),
        },
      ],
    )
  }

  const onReset = () => {
    Alert.alert(
      L('Auf Standard zurücksetzen?', 'Reset to defaults?'),
      L(
        'Lädt die deutschen gesetzlichen Feiertage 2025.',
        'Loads the German public holidays for 2025.',
      ),
      [
        { text: t('times.cancel'), style: 'cancel' },
        {
          text: L('Zurücksetzen', 'Reset'),
          onPress: async () => {
            const next = await resetHolidays()
            setRows(next)
            toast.success(L('Liste zurückgesetzt', 'List reset'))
          },
        },
      ],
    )
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Pressable onPress={onReset} className="p-2 -mr-2">
          <RotateCcw size={20} color="#0064E0" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <CalendarCheck size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Feiertage', 'Public holidays')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Wird vom Stundenzettel für Feiertagszuschläge verwendet.',
                'Used by the Stundenzettel for holiday premium hours.',
              )}
            </Text>
          </View>
        </View>

        {/* Add row */}
        <Card className="mb-3 space-y-3">
          <Text className="text-[14px] font-black text-gray-900 dark:text-white">
            {L('Feiertag hinzufügen', 'Add a holiday')}
          </Text>
          <View className="flex-row gap-3">
            <View style={{ flex: 1 }}>
              <FormField
                label={L('Datum', 'Date')}
                value={newDate}
                onChangeText={setNewDate}
                placeholder="2026-12-25"
                autoCapitalize="none"
              />
            </View>
            <View style={{ flex: 1.4 }}>
              <FormField
                label={L('Bezeichnung', 'Label')}
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder={L('z. B. 1. Weihnachtstag', 'e.g. Christmas Day')}
              />
            </View>
          </View>
          <Button
            label={L('Hinzufügen', 'Add')}
            onPress={onAdd}
            leftIcon={<Plus size={16} color="#fff" />}
          />
        </Card>

        <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
          {L(`Eingetragene Tage (${rows.length})`, `Configured days (${rows.length})`)}
        </Text>

        {loading ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <View className="items-center py-8">
              <CalendarCheck size={28} color="#D1D5DB" />
              <Text className="text-[13px] text-gray-500 dark:text-slate-400 mt-3">
                {L('Keine Feiertage eingetragen.', 'No holidays configured.')}
              </Text>
            </View>
          </Card>
        ) : (
          <Card style={{ padding: 0 } as any}>
            {rows.map((r, i) => (
              <View
                key={r.date}
                className="flex-row items-center px-4 py-3"
                style={{
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: '#F1F5F9',
                }}
              >
                <View className="flex-1 pr-3">
                  <Text className="text-[13px] font-black text-gray-900 dark:text-white">{r.date}</Text>
                  {r.label ? (
                    <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{r.label}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => onDelete(r.date)} className="p-1">
                  <Trash2 size={18} color="#DC2626" />
                </Pressable>
              </View>
            ))}
          </Card>
        )}

        <Text className="text-[10px] text-gray-400 dark:text-slate-500 mt-4 text-center">
          {L(
            'Hinweis: Weihnachten (25.12.) und 2. Weihnachtstag (26.12.) werden bei Rheinmaasrail über das Weihnachtsgeld separat abgerechnet — sie zählen daher nicht als Feiertagszuschlag.',
            'Note: Christmas Day and Boxing Day are paid via Rheinmaasrail’s Weihnachtsgeld scheme — they are intentionally excluded from the Feiertag column.',
          )}
        </Text>
      </ScrollView>
    </Screen>
  )
}
