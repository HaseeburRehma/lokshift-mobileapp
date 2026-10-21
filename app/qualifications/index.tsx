/**
 * Personal & Fristen (Kundenfeedback Punkt 11) — mobile replica of the
 * webapp's /dashboard/personnel and /dashboard/personnel/[employeeId].
 *
 * Admin / dispatch: KPIs, deadline overview with filters, personnel files
 * per employee (`?employee=<id>`, replaced records on demand), add / edit /
 * renew / delete documents with file upload. Reminders are sent by the
 * daily cron job of the webapp.
 *
 * Employees: "Meine Nachweise" — read-only list of their own documents
 * (web: /dashboard/settings/qualifications).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, Pressable, RefreshControl, TextInput, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AlertTriangle, Check, ChevronRight, Clock, Plus, Search, ShieldCheck } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { AppHeader } from '@/components/AppHeader'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { DocumentTable } from '@/components/personnel/DocumentTable'
import { DocumentSheet, type DocumentSheetMode } from '@/components/personnel/DocumentSheet'
import { SelectField } from '@/components/personnel/SelectField'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { usePersonnelDocuments } from '@/hooks/usePersonnelDocuments'
import { DOC_TYPES, docStatus, docTypeLabel, type DocStatus, type DocType, type PersonnelDocument } from '@/lib/personnel/documents'

type StatusFilter = 'attention' | DocStatus | 'all'
type EmployeeRow = { id: string; full_name: string | null; role: string | null; email: string | null; phone: string | null }
const DRIVER_ROLES = ['employee', 'technician']

/** Sort like the web: by expiry (open-ended last); replaced records at the end. */
const byExpiry = (a: PersonnelDocument, b: PersonnelDocument) =>
  (a.archived_at ? 1 : 0) - (b.archived_at ? 1 : 0) || (a.expires_at ?? '9999').localeCompare(b.expires_at ?? '9999')

export default function PersonnelScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ employee?: string; action?: string; edit?: string }>()
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, session, isAdmin, isDispatcher } = useUser()
  const isManager = isAdmin || isDispatcher
  const myId = session?.user?.id

  const employeeParam = typeof params.employee === 'string' && params.employee ? params.employee : undefined
  const scopeEmployee = isManager ? employeeParam : myId
  const [showArchived, setShowArchived] = useState(false)
  const { documents, loading, refetch, createDocument, updateDocument, deleteDocument, openFile } = usePersonnelDocuments({
    employeeId: scopeEmployee,
    includeArchived: isManager && !!employeeParam && showArchived,
  })

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [tab, setTab] = useState<'deadlines' | 'files'>('deadlines')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('attention')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sheet, setSheet] = useState<DocumentSheetMode | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!isManager || !profile?.organization_id) return
    getSupabase()
      .from('profiles')
      .select('id, full_name, role, is_active, email, phone')
      .eq('organization_id', profile.organization_id)
      .order('full_name')
      .then(({ data }: { data: any[] | null }) => setEmployees((data ?? []).filter((p) => p.is_active !== false)))
  }, [isManager, profile?.organization_id])

  // Web: the archived toggle starts unchecked on every personnel file.
  useEffect(() => {
    setShowArchived(false)
  }, [employeeParam])

  // Deep links: ?action=new, ?edit=<documentId>
  useEffect(() => {
    if (!isManager) return
    if (params.action === 'new') {
      setSheet({ mode: 'new', employeeId: employeeParam })
      router.setParams({ action: undefined })
    }
  }, [params.action, isManager, employeeParam, router])
  useEffect(() => {
    if (!isManager || !params.edit || loading) return
    const doc = documents.find((d) => d.id === params.edit)
    if (doc) setSheet({ mode: 'edit', doc })
    router.setParams({ edit: undefined })
  }, [params.edit, isManager, loading, documents, router])

  const active = useMemo(() => documents.filter((d) => !d.archived_at), [documents])

  const counts = useMemo(() => {
    const c: Record<DocStatus, number> = { expired: 0, expiring: 0, valid: 0, no_expiry: 0 }
    for (const d of active) c[docStatus(d)] += 1
    return c
  }, [active])

  const fitnessMissing = useMemo(() => {
    if (!isManager || employeeParam) return []
    return employees
      .filter((e) => DRIVER_ROLES.includes(String(e.role ?? '').toLowerCase()))
      .filter((e) => !active.some((d) => d.user_id === e.id && d.doc_type === 'fitness' && docStatus(d) !== 'expired'))
  }, [isManager, employeeParam, employees, active])

  // Fristenübersicht (admin / dispatch overview)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return active
      .filter((d) => {
        const s = docStatus(d)
        if (statusFilter === 'attention' && s !== 'expired' && s !== 'expiring') return false
        if (statusFilter !== 'attention' && statusFilter !== 'all' && s !== statusFilter) return false
        if (typeFilter !== 'all' && d.doc_type !== typeFilter) return false
        if (q && !`${d.employee?.full_name ?? ''} ${d.name} ${d.reference ?? ''}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort(byExpiry)
  }, [active, statusFilter, typeFilter, search])

  // Personalakte / Meine Nachweise — all documents of one person, unfiltered.
  const fileDocs = useMemo(() => [...documents].sort(byExpiry), [documents])

  const perEmployee = useMemo(
    () =>
      employees.map((e) => {
        const docs = active.filter((d) => d.user_id === e.id)
        return {
          ...e,
          total: docs.length,
          expired: docs.filter((d) => docStatus(d) === 'expired').length,
          expiring: docs.filter((d) => docStatus(d) === 'expiring').length,
        }
      }),
    [employees, active],
  )

  const fileEmployee = employeeParam ? employees.find((e) => e.id === employeeParam) ?? null : null
  const employeeName = employeeParam ? fileEmployee?.full_name ?? documents[0]?.employee?.full_name ?? null : null

  // Web personnel file passes only that employee into the form.
  const sheetEmployees = useMemo(() => {
    if (!employeeParam) return employees
    const one = employees.filter((e) => e.id === employeeParam)
    return one.length ? one : [{ id: employeeParam, full_name: employeeName }]
  }, [employees, employeeParam, employeeName])

  const typeOptions = useMemo(
    () => [
      { value: 'all', label: L('Alle Dokumentarten', 'All types') },
      ...(Object.keys(DOC_TYPES) as DocType[]).map((t) => ({ value: t, label: docTypeLabel(t, locale) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  )

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }

  const managerActions = isManager
    ? {
        onEdit: (d: PersonnelDocument) => setSheet({ mode: 'edit', doc: d }),
        onRenew: (d: PersonnelDocument) => setSheet({ mode: 'renew', doc: d }),
        onDelete: (d: PersonnelDocument) => void deleteDocument(d),
      }
    : {}

  // Header copy — verbatim from the three web pages.
  const title = !isManager
    ? L('Meine Nachweise', 'My documents')
    : employeeParam
      ? `${L('Personalakte', 'Personnel file')}${employeeName ? ` · ${employeeName}` : ''}`
      : L('Personal & Fristen', 'Staff & deadlines')
  const subtitle = !isManager
    ? L('Tauglichkeit, Führerschein und weitere Nachweise mit Gültigkeit', 'Fitness certificate, licence and other documents with validity')
    : employeeParam
      ? [fileEmployee?.email, fileEmployee?.phone].filter(Boolean).join(' · ') || undefined
      : L('Digitale Personalakte mit Gültigkeiten – Erinnerungen an Admin und Disposition', 'Digital personnel files with validity dates – reminders to admin and dispatch')

  const filterBtn = (key: StatusFilter, label: string, count?: number, tone?: { bg: string; fg: string }) => {
    const on = statusFilter === key
    return (
      <Pressable key={key} onPress={() => setStatusFilter(key)} hitSlop={4}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 7,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: on ? '#0064E0' : '#E2E8F0',
            backgroundColor: on ? '#0064E0' : '#FFFFFF',
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#FFFFFF' : '#64748B' }}>{label}</Text>
          {count != null ? (
            <View style={{ marginLeft: 6, borderRadius: 999, paddingHorizontal: 6, backgroundColor: on ? 'rgba(255,255,255,0.2)' : tone?.bg ?? '#F1F5F9' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: on ? '#FFFFFF' : tone?.fg ?? '#64748B' }}>{count}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    )
  }

  const AMBER = { bg: '#FEF3C7', fg: '#92400E' }
  const RED = { bg: '#FEE2E2', fg: '#B91C1C' }
  const EMERALD = { bg: '#D1FAE5', fg: '#047857' }

  const spinner = (
    <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#0064E0" />
    </View>
  )

  return (
    <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <AppHeader />
      <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0064E0" />}
        >
          <PageHeader
            showBack
            title={title}
            subtitle={subtitle}
            onBack={isManager && employeeParam ? () => router.setParams({ employee: undefined }) : undefined}
          />

          {/* ── Admin / dispatch: Personal & Fristen ─────────────────── */}
          {isManager && !employeeParam ? (
            <View style={{ gap: 20 }}>
              <Button label={L('Nachweis hinzufügen', 'Add document')} leftIcon={<Plus size={18} color="#fff" />} onPress={() => setSheet({ mode: 'new' })} />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <Kpi icon={<AlertTriangle size={20} color="#DC2626" />} value={counts.expired} label={L('Abgelaufen', 'Expired')} tone="red" />
                <Kpi icon={<Clock size={20} color="#D97706" />} value={counts.expiring} label={L('Laufen bald ab', 'Expiring soon')} tone="amber" />
                <Kpi icon={<ShieldCheck size={20} color="#059669" />} value={counts.valid} label={L('Gültig', 'Valid')} tone="emerald" />
                <Kpi icon={<AlertTriangle size={20} color="#64748B" />} value={fitnessMissing.length} label={L('Ohne gültige Tauglichkeit', 'No valid fitness cert.')} tone="slate" />
              </View>

              <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 12, padding: 4 }}>
                {(['deadlines', 'files'] as const).map((k) => {
                  const on = tab === k
                  return (
                    <Pressable key={k} onPress={() => setTab(k)} style={{ flex: 1 }}>
                      <View
                        style={[
                          { height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? '#FFFFFF' : 'transparent' },
                          on ? { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : null,
                        ]}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '700', color: on ? '#0064E0' : '#64748B' }}>
                          {k === 'deadlines' ? L('Fristenübersicht', 'Deadlines') : L('Personalakten', 'Personnel files')}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </View>

              {tab === 'deadlines' ? (
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {filterBtn('attention', L('Handlungsbedarf', 'Needs action'), counts.expired + counts.expiring, AMBER)}
                    {filterBtn('expired', L('Abgelaufen', 'Expired'), counts.expired, RED)}
                    {filterBtn('expiring', L('Läuft bald ab', 'Expiring'), counts.expiring, AMBER)}
                    {filterBtn('valid', L('Gültig', 'Valid'), counts.valid, EMERALD)}
                    {filterBtn('all', L('Alle', 'All'))}
                  </View>
                  <SelectField variant="filter" value={typeFilter} options={typeOptions} onChange={setTypeFilter} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 12 }}>
                    <Search size={16} color="#94A3B8" />
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder={L('Suchen …', 'Search …')}
                      placeholderTextColor="#94A3B8"
                      style={{ flex: 1, marginLeft: 8, fontSize: 14, fontWeight: '700', color: '#334155' }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>

                  {loading ? (
                    spinner
                  ) : (
                    <DocumentTable
                      documents={filtered}
                      showEmployee
                      onOpenFile={openFile}
                      onEmployee={(id) => router.setParams({ employee: id })}
                      {...managerActions}
                    />
                  )}

                  {fitnessMissing.length > 0 ? (
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>
                      {`${L('Ohne gültige Tauglichkeit:', 'Without valid fitness certificate:')} ${fitnessMissing.map((e) => e.full_name ?? '—').join(', ')}`}
                    </Text>
                  ) : null}
                </View>
              ) : perEmployee.length > 0 ? (
                <Card style={{ borderColor: '#E2E8F0', padding: 0 }}>
                  {perEmployee.map((e, i) => (
                    <Pressable key={e.id} onPress={() => router.setParams({ employee: e.id })}>
                      {({ pressed }) => (
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderTopWidth: i ? 1 : 0,
                            borderTopColor: '#F1F5F9',
                            backgroundColor: pressed ? '#F8FAFC' : '#FFFFFF',
                          }}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }} numberOfLines={1}>
                              {e.full_name ?? '—'}
                            </Text>
                            <Text style={{ fontSize: 12, color: '#94A3B8' }}>{`${e.total} ${L('Nachweis(e)', 'document(s)')}`}</Text>
                          </View>
                          {e.expired > 0 ? <Tag text={`${e.expired} ${L('abgelaufen', 'expired')}`} bg="#FEF2F2" fg="#B91C1C" border="#FECACA" /> : null}
                          {e.expiring > 0 ? <Tag text={`${e.expiring} ${L('bald fällig', 'due soon')}`} bg="#FFFBEB" fg="#92400E" border="#FDE68A" /> : null}
                          <ChevronRight size={16} color="#CBD5E1" />
                        </View>
                      )}
                    </Pressable>
                  ))}
                </Card>
              ) : loading ? (
                spinner
              ) : null}
            </View>
          ) : null}

          {/* ── Admin / dispatch: Personalakte eines Mitarbeiters ────── */}
          {isManager && employeeParam ? (
            <View style={{ gap: 20 }}>
              <Button label={L('Nachweis', 'Document')} leftIcon={<Plus size={18} color="#fff" />} onPress={() => setSheet({ mode: 'new', employeeId: employeeParam })} />

              <Pressable onPress={() => setShowArchived((v) => !v)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: showArchived }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      borderWidth: 1.5,
                      borderColor: showArchived ? '#0064E0' : '#CBD5E1',
                      backgroundColor: showArchived ? '#0064E0' : '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {showArchived ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
                  </View>
                  <Text style={{ marginLeft: 8, flex: 1, fontSize: 14, fontWeight: '600', color: '#475569' }}>
                    {L('Ersetzte (archivierte) Nachweise anzeigen', 'Show replaced (archived) documents')}
                  </Text>
                </View>
              </Pressable>

              {loading ? spinner : <DocumentTable documents={fileDocs} onOpenFile={openFile} {...managerActions} />}
            </View>
          ) : null}

          {/* ── Employee: Meine Nachweise (read-only) ────────────────── */}
          {!isManager ? (
            <View style={{ gap: 20 }}>
              {loading ? spinner : <DocumentTable documents={fileDocs} onOpenFile={openFile} />}
              <Text style={{ fontSize: 12, color: '#94A3B8' }}>
                {L(
                  'Neue oder erneuerte Nachweise bitte bei der Disposition einreichen – sie werden dort in Ihrer Personalakte hinterlegt.',
                  'Please hand in new or renewed documents to dispatch – they are stored in your personnel file there.',
                )}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        <DocumentSheet
          state={sheet}
          employees={sheetEmployees}
          onClose={() => setSheet(null)}
          onSubmit={(input, file) =>
            sheet?.mode === 'edit'
              ? updateDocument(sheet.doc.id, input, file)
              : createDocument(input, file, sheet?.mode === 'renew' ? sheet.doc : null)
          }
        />
      </Screen>
    </View>
  )
}

/** Web Kpi: `rounded-2xl border bg-white p-4` — icon left, value right, label below. */
function Kpi({ icon, value, label, tone }: { icon: React.ReactNode; value: number; label: string; tone: 'red' | 'amber' | 'emerald' | 'slate' }) {
  const borderColor = tone === 'red' && value ? '#FECACA' : tone === 'amber' && value ? '#FDE68A' : '#E2E8F0'
  return (
    <Card style={{ flexBasis: '45%', flexGrow: 1, borderColor, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {icon}
        <Text style={{ fontSize: 24, fontWeight: '900', color: '#0F172A', fontVariant: ['tabular-nums'] }}>{value}</Text>
      </View>
      <Text style={{ marginTop: 4, fontSize: 12, fontWeight: '700', color: '#64748B' }}>{label}</Text>
    </Card>
  )
}

/** Web: `rounded-md border px-2 py-0.5 text-[10px] font-black uppercase`. */
function Tag({ text, bg, fg, border }: { text: string; bg: string; fg: string; border: string }) {
  return (
    <View style={{ borderRadius: 6, borderWidth: 1, borderColor: border, backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '900', textTransform: 'uppercase', color: fg }}>{text}</Text>
    </View>
  )
}
