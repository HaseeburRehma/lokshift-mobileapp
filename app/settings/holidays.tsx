/**
 * Feiertage — admin-managed list of public holidays that the
 * Stundenzettel Zuschlag engine treats as holiday hours. Styled like the
 * webapp settings sub-pages.
 *
 * Storage is AsyncStorage today (see lib/holidays/storage.ts); when the
 * web app exposes a shared `org_holidays` table this screen can swap
 * the persistence layer without changing its shape.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native'
import { CalendarCheck, Plus, Trash2, RotateCcw, ShieldCheck } from 'lucide-react-native'

import { Button } from '@/components/Button'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { loadHolidays, saveHolidays, resetHolidays, type HolidayEntry } from '@/lib/holidays/storage'
import {
  SettingsShell,
  SettingsPageHeader,
  SectionCard,
  FieldLabel,
  SettingsInput,
  FootNote,
  SC,
} from '@/components/settings/SettingsUI'

export default function HolidaysScreen() {
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const allowed = canManageUsers(role)

  const [rows, setRows] = useState<HolidayEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [newLabel, setNewLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    loadHolidays()
      .then((r) => {
        if (!cancelled) setRows(Array.isArray(r) ? r : [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    const next = [...rows, { date: newDate, label: newLabel.trim() }].sort((a, b) => a.date.localeCompare(b.date))
    await persist(next)
    setNewDate('')
    setNewLabel('')
    toast.success(L('Feiertag hinzugefügt', 'Holiday added'))
  }

  const onDelete = (date: string) => {
    Alert.alert(L('Feiertag entfernen?', 'Remove holiday?'), L(`Datum: ${date}`, `Date: ${date}`), [
      { text: t('times.cancel'), style: 'cancel' },
      {
        text: L('Entfernen', 'Remove'),
        style: 'destructive',
        onPress: () => persist(rows.filter((r) => r.date !== date)),
      },
    ])
  }

  const onReset = () => {
    Alert.alert(
      L('Auf Standard zurücksetzen?', 'Reset to defaults?'),
      L('Lädt die deutschen gesetzlichen Feiertage 2025.', 'Loads the German public holidays for 2025.'),
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

  if (!allowed) {
    return (
      <SettingsShell>
        <SettingsPageHeader
          backLabel={L('Einstellungen', 'Settings')}
          icon={CalendarCheck}
          tileColor={SC.amber500}
          title={L('Feiertage', 'Public holidays')}
        />
        <SectionCard padded>
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <ShieldCheck size={28} color={SC.slate300} />
            <Text style={{ marginTop: 10, fontSize: 13, color: SC.slate500, textAlign: 'center' }}>
              {L('Nur Administratoren können Feiertage verwalten.', 'Only administrators can manage holidays.')}
            </Text>
          </View>
        </SectionCard>
      </SettingsShell>
    )
  }

  const resetButton = (
    <Pressable
      onPress={onReset}
      accessibilityRole="button"
      accessibilityLabel={L('Auf Standard zurücksetzen', 'Reset to defaults')}
      style={{
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: SC.slate200,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RotateCcw size={18} color={SC.slate600} />
    </Pressable>
  )

  return (
    <SettingsShell>
      <SettingsPageHeader
        backLabel={L('Einstellungen', 'Settings')}
        icon={CalendarCheck}
        tileColor={SC.amber500}
        title={L('Feiertage', 'Public holidays')}
        subtitle={L(
          'Wird vom Stundenzettel für Feiertagszuschläge verwendet.',
          'Used by the Stundenzettel for holiday premium hours.',
        )}
        right={resetButton}
      />

      {/* Add row */}
      <SectionCard title={L('Feiertag hinzufügen', 'Add a holiday')} padded>
        <View style={{ gap: 14, marginTop: 4 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <FieldLabel>{L('Datum', 'Date')}</FieldLabel>
              <SettingsInput
                value={newDate}
                onChangeText={setNewDate}
                placeholder="2026-12-25"
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
            </View>
            <View style={{ flex: 1.4 }}>
              <FieldLabel>{L('Bezeichnung', 'Label')}</FieldLabel>
              <SettingsInput
                value={newLabel}
                onChangeText={setNewLabel}
                placeholder={L('z. B. 1. Weihnachtstag', 'e.g. Christmas Day')}
              />
            </View>
          </View>
          <Button label={L('Hinzufügen', 'Add')} onPress={onAdd} leftIcon={<Plus size={16} color="#FFFFFF" />} />
        </View>
      </SectionCard>

      <SectionCard title={L(`Eingetragene Tage (${rows.length})`, `Configured days (${rows.length})`)}>
        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={SC.blue600} />
          </View>
        ) : rows.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <CalendarCheck size={28} color={SC.slate300} />
            <Text style={{ marginTop: 10, fontSize: 13, color: SC.slate500 }}>
              {L('Keine Feiertage eingetragen.', 'No holidays configured.')}
            </Text>
          </View>
        ) : (
          rows.map((r, i) => (
            <View
              key={r.date}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderBottomWidth: i === rows.length - 1 ? 0 : 1,
                borderBottomColor: SC.slate50,
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: SC.slate900 }}>{r.date}</Text>
                {r.label ? (
                  <Text style={{ fontSize: 12, color: SC.slate500, marginTop: 2 }}>{r.label}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => onDelete(r.date)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={L('Entfernen', 'Remove')}
                style={{ padding: 6 }}
              >
                <Trash2 size={18} color={SC.red600} />
              </Pressable>
            </View>
          ))
        )}
      </SectionCard>

      <FootNote>
        {L(
          'Hinweis: Weihnachten (25.12.) und 2. Weihnachtstag (26.12.) werden bei Rheinmaasrail über das Weihnachtsgeld separat abgerechnet — sie zählen daher nicht als Feiertagszuschlag.',
          'Note: Christmas Day and Boxing Day are paid via Rheinmaasrail’s Weihnachtsgeld scheme — they are intentionally excluded from the Feiertag column.',
        )}
      </FootNote>
    </SettingsShell>
  )
}
