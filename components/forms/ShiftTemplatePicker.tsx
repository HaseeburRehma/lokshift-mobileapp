/**
 * Shift-Template picker — mobile replica of the webapp's
 * components/shared/ShiftTemplatePicker.tsx: "Schichtvorlage" label,
 * a "Vorlage auswählen …" select (bottom sheet on mobile), optional
 * "Als Vorlage speichern" (snapshot of the current form values) and a
 * link to the templates management screen ("Vorlagen verwalten").
 *
 * Picking a template fires onSelect with the full row; the host screen
 * copies the fields into its own form state.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable, Modal, TextInput, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { BookMarked, ChevronDown, Hotel, Save, X } from 'lucide-react-native'

import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useShiftTemplates, type ShiftTemplateInput } from '@/hooks/useShiftTemplates'
import type { ShiftTemplate } from '@/lib/types'

interface Props {
  onSelect: (template: ShiftTemplate) => void
  /** Show a link to the templates management screen. */
  showManageLink?: boolean
  /** Current form values (without name) — enables "Als Vorlage speichern". */
  getCurrentPayload?: () => Omit<ShiftTemplateInput, 'name'>
}

export function ShiftTemplatePicker({ onSelect, showManageLink = true, getCurrentPayload }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const { templates, loading, createTemplate } = useShiftTemplates()
  const [listOpen, setListOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = selectedId ? templates.find((t) => t.id === selectedId) : undefined
  const placeholder = loading
    ? L('Lade Vorlagen …', 'Loading templates …')
    : templates.length === 0
      ? L('Keine Vorlagen vorhanden', 'No templates yet')
      : L('Vorlage auswählen …', 'Pick a template …')

  const save = async () => {
    const n = name.trim()
    if (!n || !getCurrentPayload) return
    setSaving(true)
    try {
      await createTemplate({ ...getCurrentPayload(), name: n })
      toast.success(L(`Vorlage „${n}" gespeichert`, `Template "${n}" saved`))
      setSaveOpen(false)
      setName('')
    } catch (err: any) {
      toast.error(err?.message ?? L('Vorlage konnte nicht gespeichert werden', 'Could not save template'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <BookMarked size={15} color="#0064E0" />
          <Text style={{ marginLeft: 6, fontSize: 10, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: '#6B7280' }}>
            {L('Schichtvorlage', 'Shift template')}
          </Text>
        </View>
        {getCurrentPayload ? (
          <Pressable onPress={() => setSaveOpen(true)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Save size={13} color="#0064E0" />
            <Text style={{ marginLeft: 4, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', color: '#0064E0' }}>
              {L('Als Vorlage speichern', 'Save as template')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable onPress={() => setListOpen(true)} disabled={loading || templates.length === 0}>
        <View
          style={{
            height: 48,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#F1F5F9',
            backgroundColor: '#FFFFFF',
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {loading ? <ActivityIndicator size="small" color="#94A3B8" style={{ marginRight: 8 }} /> : null}
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: selected ? '#0F172A' : '#94A3B8' }} numberOfLines={1}>
            {selected ? `${selected.name} · ${selected.start_time}–${selected.end_time}` : placeholder}
          </Text>
          <ChevronDown size={16} color="#94A3B8" />
        </View>
      </Pressable>

      {showManageLink ? (
        <Pressable onPress={() => router.push('/shift-templates')} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: '#6B7280' }}>
            {L('Vorlagen verwalten', 'Manage templates')} ›
          </Text>
        </Pressable>
      ) : null}

      {/* Template list */}
      <Modal visible={listOpen} transparent animationType="slide" onRequestClose={() => setListOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setListOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, paddingBottom: 28, maxHeight: '75%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>{L('Schichtvorlage', 'Shift template')}</Text>
              <Pressable onPress={() => setListOpen(false)} hitSlop={8}>
                <X size={20} color="#94A3B8" />
              </Pressable>
            </View>
            <ScrollView>
              {templates.map((tpl) => (
                <Pressable
                  key={tpl.id}
                  onPress={() => {
                    setSelectedId(tpl.id)
                    setListOpen(false)
                    onSelect(tpl)
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 10, borderRadius: 12, backgroundColor: selectedId === tpl.id ? '#EFF6FF' : 'transparent' }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>{tpl.name}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#94A3B8' }}>
                      {tpl.start_time}–{tpl.end_time}
                    </Text>
                    {tpl.overnight_stay ? <Hotel size={13} color="#94A3B8" style={{ marginLeft: 6 }} /> : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Save as template */}
      <Modal visible={saveOpen} transparent animationType="fade" onRequestClose={() => setSaveOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20 }}>
            <Text style={{ fontSize: 17, fontWeight: '900', color: '#0F172A' }}>{L('Neue Vorlage speichern', 'Save new template')}</Text>
            <Text style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
              {L(
                'Speichert die aktuellen Felder (Kunde, Route, Zeiten, Übernachtung) als wiederverwendbare Vorlage.',
                'Saves the current form values (customer, route, times, overnight stay) as a reusable template.',
              )}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', color: '#6B7280', marginTop: 14, marginBottom: 6 }}>
              {L('Vorlagenname', 'Template name')}
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={L('z. B. „Frankfurt Nachtdienst"', 'e.g. "Frankfurt night shift"')}
              placeholderTextColor="#9CA3AF"
              autoFocus
              style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, fontSize: 14, color: '#0F172A' }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Pressable onPress={() => setSaveOpen(false)}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#64748B', padding: 10 }}>{L('Abbrechen', 'Cancel')}</Text>
              </Pressable>
              <Pressable onPress={save} disabled={!name.trim() || saving}>
                <View style={{ borderRadius: 12, backgroundColor: '#0064E0', paddingHorizontal: 18, paddingVertical: 10, opacity: !name.trim() || saving ? 0.5 : 1 }}>
                  {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ fontSize: 13, fontWeight: '900', color: '#FFFFFF' }}>{L('Speichern', 'Save')}</Text>}
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}
