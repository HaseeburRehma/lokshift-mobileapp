/**
 * Nachweis hinzufügen / bearbeiten / erneuern (Kundenfeedback Punkt 11) —
 * same fields, order, labels and checks as the webapp's DocumentForm. On
 * renewal the old record is archived and its open reminders are closed.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, ScrollView, Pressable, Switch, Platform, TextInput, type TextInputProps } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { X, FileUp, Lock, Save, AlertTriangle } from 'lucide-react-native'

import { Button } from '@/components/Button'
import { EmployeePicker } from '@/components/forms/EmployeePicker'
import { SelectField } from '@/components/personnel/SelectField'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { isValidDate } from '@/lib/time/shift-hours'
import { DEFAULT_REMINDER_DAYS, DOC_TYPES, docTypeLabel, reminderLabel, type DocType, type PersonnelDocument } from '@/lib/personnel/documents'
import { MAX_FILE_BYTES, type DocumentInput, type PickedFile } from '@/hooks/usePersonnelDocuments'

const REMINDER_OPTIONS = [56, 28, 14, 7, 0]

export type DocumentSheetMode = { mode: 'new'; employeeId?: string } | { mode: 'edit'; doc: PersonnelDocument } | { mode: 'renew'; doc: PersonnelDocument }

interface Props {
  state: DocumentSheetMode | null
  onClose: () => void
  onSubmit: (input: DocumentInput, file: PickedFile | null) => Promise<boolean>
  /** Employees for the "Mitarbeiter" select (web: active profiles of the org). */
  employees?: { id: string; full_name: string | null }[]
}

const LABEL = 'text-[10px] font-black uppercase tracking-widest text-slate-400'

export function DocumentSheet({ state, onClose, onSubmit, employees }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { isAdmin } = useUser()
  const open = !!state
  const initial = state?.mode === 'edit' ? state.doc : null
  const renewOf = state?.mode === 'renew' ? state.doc : null
  const base = initial ?? renewOf

  const [userId, setUserId] = useState('')
  const [docType, setDocType] = useState<string>('fitness')
  const [name, setName] = useState('')
  const [issuer, setIssuer] = useState('')
  const [reference, setReference] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [remark, setRemark] = useState('')
  const [reminders, setReminders] = useState<number[]>(DEFAULT_REMINDER_DAYS)
  const [confidential, setConfidential] = useState(false)
  const [required, setRequired] = useState(true)
  const [file, setFile] = useState<PickedFile | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!state) return
    setUserId(base?.user_id ?? (state.mode === 'new' ? state.employeeId ?? '' : ''))
    setDocType(base?.doc_type ?? 'fitness')
    setName(base?.name ?? docTypeLabel('fitness', 'de'))
    setIssuer(base?.issuer ?? '')
    setReference(initial?.reference ?? '')
    setIssuedAt(initial?.issued_at ?? '')
    setExpiresAt(initial?.expires_at ?? '')
    setRemark(initial?.remark ?? '')
    setReminders(base?.reminder_days?.length ? base.reminder_days : DEFAULT_REMINDER_DAYS)
    setConfidential(base?.is_confidential ?? false)
    setRequired(base?.is_required ?? (base?.doc_type ?? 'fitness') === 'fitness')
    setFile(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // "Mitarbeiter" options — always include the record's own employee
  // (edit / renew), even if that profile is no longer in the active list.
  const employeeOptions = useMemo(() => {
    const list = (employees ?? []).map((e) => ({ value: e.id, label: e.full_name ?? '—' }))
    if (base?.user_id && !list.some((o) => o.value === base.user_id)) {
      list.unshift({ value: base.user_id, label: base.employee?.full_name ?? '—' })
    }
    return [{ value: '', label: L('Bitte wählen …', 'Please choose …') }, ...list]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, base?.user_id, base?.employee?.full_name, locale])

  const typeOptions = useMemo(
    () => (Object.keys(DOC_TYPES) as DocType[]).map((t) => ({ value: t, label: docTypeLabel(t, locale) })),
    [locale],
  )

  const pickType = (t: string) => {
    // Keep a hand-written title; replace the auto-filled default.
    if (!name.trim() || name === docTypeLabel(docType, 'de')) setName(docTypeLabel(t, 'de'))
    if (!base) setRequired(t === 'fitness')
    setDocType(t)
  }

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (res.canceled || !res.assets?.[0]) return
    const a = res.assets[0]
    setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? null, size: a.size ?? null, file: (a as any).file ?? null })
  }

  let error: string | null = null
  if (!userId) error = L('Bitte einen Mitarbeiter wählen.', 'Please choose an employee.')
  else if (!name.trim()) error = L('Bitte eine Bezeichnung angeben.', 'Please enter a title.')
  else if (issuedAt && !isValidDate(issuedAt)) error = L('Ausstellungsdatum als JJJJ-MM-TT angeben.', 'Enter the issue date as YYYY-MM-DD.')
  else if (expiresAt && !isValidDate(expiresAt)) error = L('Ablaufdatum als JJJJ-MM-TT angeben.', 'Enter the expiry date as YYYY-MM-DD.')
  else if (issuedAt && expiresAt && expiresAt < issuedAt) error = L('Das Ablaufdatum liegt vor dem Ausstellungsdatum.', 'Expiry date is before the issue date.')
  else if (file?.size && file.size > MAX_FILE_BYTES) error = L('Die Datei ist größer als 20 MB.', 'File is larger than 20 MB.')
  else if (renewOf && !expiresAt) error = L('Bitte das neue Ablaufdatum angeben.', 'Please enter the new expiry date.')

  const submit = async () => {
    if (error) return
    setSaving(true)
    const ok = await onSubmit(
      {
        user_id: userId,
        name: name.trim(),
        doc_type: docType,
        issuer: issuer.trim() || null,
        reference: reference.trim() || null,
        issued_at: issuedAt || null,
        expires_at: expiresAt || null,
        remark: remark.trim() || null,
        reminder_days: [...reminders].sort((a, b) => b - a),
        is_confidential: confidential,
        is_required: required,
      },
      file,
    )
    setSaving(false)
    if (ok) onClose()
  }

  const title = renewOf ? L('Nachweis erneuern', 'Renew document') : initial ? L('Nachweis bearbeiten', 'Edit document') : L('Nachweis hinzufügen', 'Add document')
  const lockEmployee = !!initial || !!renewOf
  const useSelect = lockEmployee || (employees?.length ?? 0) > 0

  return (
    <Modal visible={open} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={L('Abbrechen', 'Cancel')}>
            <X size={24} color="#0064E0" />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A' }}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={{ gap: 16 }}>
            {renewOf ? (
              <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#1E40AF' }}>
                  {L(
                    'Erneuerung: Der bisherige Nachweis wird archiviert, seine Erinnerungen sind damit erledigt.',
                    'Renewal: the previous record is archived and its reminders are closed.',
                  )}
                </Text>
              </View>
            ) : null}

            {/* Mitarbeiter * / Dokumentart * */}
            <View style={{ gap: 6 }}>
              <Text className={LABEL}>{`${L('Mitarbeiter', 'Employee')} *`}</Text>
              {useSelect ? (
                <SelectField value={userId} options={employeeOptions} onChange={setUserId} disabled={lockEmployee} />
              ) : (
                <EmployeePicker mode="single" value={userId} onChange={setUserId} includeSelf />
              )}
            </View>
            <View style={{ gap: 6 }}>
              <Text className={LABEL}>{`${L('Dokumentart', 'Document type')} *`}</Text>
              <SelectField value={docType} options={typeOptions} onChange={pickType} />
            </View>

            <Field label={`${L('Bezeichnung', 'Title')} *`} value={name} onChangeText={setName} />

            <Field label={L('Ausgestellt von (optional)', 'Issued by (optional)')} value={issuer} onChangeText={setIssuer} />
            <Field label={L('Nummer / Aktenzeichen (optional)', 'Number / reference (optional)')} value={reference} onChangeText={setReference} />
            <Field
              label={L('Ausstellungsdatum', 'Issue date')}
              value={issuedAt}
              onChangeText={setIssuedAt}
              placeholder={L('JJJJ-MM-TT', 'YYYY-MM-DD')}
              autoCapitalize="none"
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            />
            <Field
              label={`${L('Gültig bis (Ablaufdatum)', 'Valid until (expiry)')}${renewOf ? ' *' : ''}`}
              value={expiresAt}
              onChangeText={setExpiresAt}
              placeholder={L('JJJJ-MM-TT', 'YYYY-MM-DD')}
              autoCapitalize="none"
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            />

            {/* Erinnerungen */}
            <View style={{ gap: 6 }}>
              <Text className={LABEL}>{L('Erinnerungen an Admin & Disposition', 'Reminders to admin & dispatch')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REMINDER_OPTIONS.map((d) => {
                  const on = reminders.includes(d)
                  return (
                    <Pressable key={d} onPress={() => setReminders((r) => (on ? r.filter((x) => x !== d) : [...r, d]))} hitSlop={4}>
                      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: on ? '#0064E0' : '#E2E8F0', backgroundColor: on ? '#EFF6FF' : '#FFFFFF', paddingHorizontal: 10, paddingVertical: 7 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#0064E0' : '#64748B' }}>{reminderLabel(d, locale)}</Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            </View>

            {/* Datei */}
            <View style={{ gap: 6 }}>
              <Text className={LABEL}>{L('Datei (PDF oder Foto, max. 20 MB)', 'File (PDF or photo, max 20 MB)')}</Text>
              <Pressable onPress={pickFile}>
                {({ pressed }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: pressed ? '#F8FAFC' : '#FFFFFF' }}>
                    <FileUp size={20} color="#2563EB" />
                    <Text style={{ marginLeft: 12, fontSize: 14, fontWeight: '600', color: '#475569', flex: 1 }} numberOfLines={1}>
                      {file ? file.name : initial?.file_name ? `${initial.file_name} (${L('ersetzen', 'replace')})` : L('Datei auswählen …', 'Choose file …')}
                    </Text>
                  </View>
                )}
              </Pressable>
            </View>

            {/* Bemerkung */}
            <View style={{ gap: 6 }}>
              <Text className={LABEL}>{L('Bemerkung (optional)', 'Remark (optional)')}</Text>
              <TextInput
                value={remark}
                onChangeText={setRemark}
                placeholder={L('z. B. Auflagen, Hinweise zur Erneuerung', 'e.g. conditions, notes on renewal')}
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
                style={{ minHeight: 80, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, fontSize: 14, color: '#0F172A' }}
              />
            </View>

            {/* Pflicht / Vertraulich */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#334155', flex: 1 }}>{L('Pflicht für Einsätze', 'Required for shifts')}</Text>
              <Switch value={required} onValueChange={setRequired} trackColor={{ false: '#D1D5DB', true: '#0064E0' }} thumbColor={Platform.OS === 'android' ? '#fff' : undefined} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, opacity: isAdmin ? 1 : 0.5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Lock size={14} color="#334155" />
                <Text style={{ marginLeft: 6, fontSize: 14, fontWeight: '700', color: '#334155' }}>{L('Vertraulich (nur Admin)', 'Confidential (admin only)')}</Text>
              </View>
              <Switch value={confidential} onValueChange={setConfidential} disabled={!isAdmin} trackColor={{ false: '#D1D5DB', true: '#0064E0' }} thumbColor={Platform.OS === 'android' ? '#fff' : undefined} />
            </View>

            {error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <AlertTriangle size={16} color="#DC2626" />
                <Text style={{ marginLeft: 8, fontSize: 14, fontWeight: '600', color: '#DC2626', flex: 1 }}>{error}</Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 12, paddingTop: 4 }}>
              <View style={{ flex: 1 }}>
                <Button label={L('Abbrechen', 'Cancel')} variant="ghost" onPress={onClose} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={renewOf ? L('Erneuerung speichern', 'Save renewal') : initial ? L('Änderung speichern', 'Save changes') : L('Nachweis speichern', 'Save document')}
                  onPress={submit}
                  loading={saving}
                  disabled={!!error || saving}
                  leftIcon={<Save size={16} color="#fff" />}
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

/** Web: label `text-[10px] font-black uppercase tracking-widest text-slate-400` + `h-11 rounded-xl` input. */
function Field({ label, ...rest }: { label: string } & Omit<TextInputProps, 'style'>) {
  return (
    <View style={{ gap: 6 }}>
      <Text className={LABEL}>{label}</Text>
      <TextInput
        placeholderTextColor="#94A3B8"
        style={{ height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12, fontSize: 14, fontWeight: '600', color: '#0F172A' }}
        {...rest}
      />
    </View>
  )
}
