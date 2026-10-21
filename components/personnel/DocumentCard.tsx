/**
 * One personnel document — the mobile counterpart of a row in the
 * webapp's DocumentTable (Mitarbeiter · Nachweis · Ausgestellt · Gültig bis
 * · Status · Bemerkung · Aktionen), stacked as a card.
 */

import React from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { Edit2, FileText, Lock, RefreshCw, Trash2 } from 'lucide-react-native'

import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'
import { daysUntil, docStatus, docStatusLabel, docTypeLabel, type DocStatus, type PersonnelDocument } from '@/lib/personnel/documents'
import { formatDateDE } from '@/lib/time/format'

/** Same colours as the webapp's DOC_STATUS_STYLE (+ "Ersetzt" for archived records). */
export const DOC_STATUS_COLORS: Record<DocStatus | 'replaced', { bg: string; fg: string; border: string }> = {
  valid: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' }, // emerald-50 / 700 / 200
  expiring: { bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' }, // amber-50 / 800 / 200
  expired: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' }, // red-50 / 700 / 200
  no_expiry: { bg: '#F8FAFC', fg: '#475569', border: '#E2E8F0' }, // slate-50 / 600 / 200
  replaced: { bg: '#F8FAFC', fg: '#64748B', border: '#E2E8F0' }, // slate-50 / 500 / 200
}

interface Props {
  doc: PersonnelDocument
  showEmployee?: boolean
  onOpenFile: (d: PersonnelDocument) => void
  onEmployee?: (employeeId: string) => void
  onEdit?: (d: PersonnelDocument) => void
  onRenew?: (d: PersonnelDocument) => void
  onDelete?: (d: PersonnelDocument) => void
}

export function DocumentCard({ doc: d, showEmployee, onOpenFile, onEmployee, onEdit, onRenew, onDelete }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const status = docStatus(d)
  const archived = !!d.archived_at
  const c = DOC_STATUS_COLORS[archived ? 'replaced' : status]
  const left = d.expires_at ? daysUntil(d.expires_at) : null
  const hasFile = !!(d.file_path || d.document_url)
  const employeeName = d.employee?.full_name ?? '—'

  const canRenew = !!onRenew && !archived && !!d.expires_at
  const canEdit = !!onEdit && !archived
  const canDelete = !!onDelete
  const hasActions = hasFile || canRenew || canEdit || canDelete

  const confirmDelete = () =>
    Alert.alert(L('Löschen?', 'Delete?'), `${d.name}${d.employee?.full_name ? ` · ${d.employee.full_name}` : ''}`, [
      { text: L('Nein', 'No'), style: 'cancel' },
      { text: L('Ja', 'Yes'), style: 'destructive', onPress: () => onDelete?.(d) },
    ])

  const leftColor = left == null ? '#94A3B8' : left < 0 ? '#DC2626' : left <= 28 ? '#B45309' : '#94A3B8'
  const leftText =
    left == null
      ? ''
      : left < 0
        ? L(`seit ${-left} Tagen abgelaufen`, `expired ${-left} days ago`)
        : left === 0
          ? L('läuft heute ab', 'expires today')
          : L(`noch ${left} Tage`, `${left} days left`)

  return (
    <Card style={{ borderColor: status === 'expired' && !archived ? '#FECACA' : '#E2E8F0', padding: 16, opacity: archived ? 0.5 : 1 }}>
      {/* Nachweis + Status */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            {d.is_confidential ? (
              <View style={{ marginRight: 6 }}>
                <Lock size={14} color="#94A3B8" />
              </View>
            ) : null}
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#0F172A', flexShrink: 1 }}>{d.name}</Text>
            {d.is_required ? (
              <View style={{ marginLeft: 6, borderRadius: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 4, paddingVertical: 1 }}>
                <Text style={{ fontSize: 9, fontWeight: '900', textTransform: 'uppercase', color: '#1D4ED8' }}>{L('Pflicht', 'Required')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
            {docTypeLabel(d.doc_type, locale)}
            {d.reference ? ` · ${d.reference}` : ''}
          </Text>
        </View>
        <View className="rounded-md border px-2 py-0.5" style={{ marginLeft: 8, backgroundColor: c.bg, borderColor: c.border }}>
          <Text className="text-[10px] font-black uppercase tracking-wider" style={{ color: c.fg }}>
            {archived ? L('Ersetzt', 'Replaced') : docStatusLabel(status, locale)}
          </Text>
        </View>
      </View>

      {/* Columns */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, rowGap: 12 }}>
        {showEmployee ? (
          <View style={{ width: '50%', paddingRight: 8 }}>
            <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">{L('Mitarbeiter', 'Employee')}</Text>
            <Pressable onPress={() => onEmployee?.(d.user_id)} disabled={!onEmployee} hitSlop={8}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: onEmployee ? '#0064E0' : '#0F172A', marginTop: 2 }} numberOfLines={2}>
                {employeeName}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <View style={{ width: '50%', paddingRight: 8 }}>
          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">{L('Ausgestellt', 'Issued')}</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 2, fontVariant: ['tabular-nums'] }}>
            {d.issued_at ? formatDateDE(d.issued_at) : '—'}
          </Text>
        </View>
        <View style={{ width: '50%', paddingRight: 8 }}>
          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">{L('Gültig bis', 'Valid until')}</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', marginTop: 2, fontVariant: ['tabular-nums'] }}>
            {d.expires_at ? formatDateDE(d.expires_at) : L('unbefristet', 'no expiry')}
          </Text>
          {left != null && !archived ? (
            <Text style={{ fontSize: 12, fontWeight: '600', color: leftColor, marginTop: 1 }}>{leftText}</Text>
          ) : null}
        </View>
        <View style={{ width: showEmployee ? '50%' : '100%', paddingRight: 8 }}>
          <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400">{L('Bemerkung', 'Remark')}</Text>
          <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }} numberOfLines={3}>
            {d.remark || '—'}
          </Text>
        </View>
      </View>

      {/* Aktionen */}
      {hasActions ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
          {hasFile ? (
            <ActionButton
              icon={<FileText size={15} color="#2563EB" />}
              label={L('Datei öffnen', 'Open file')}
              color="#2563EB"
              onPress={() => onOpenFile(d)}
            />
          ) : null}
          {canRenew ? (
            <ActionButton
              icon={<RefreshCw size={14} color="#047857" />}
              label={L('Erneuern', 'Renew')}
              color="#047857"
              onPress={() => onRenew?.(d)}
            />
          ) : null}
          {canEdit ? (
            <ActionButton icon={<Edit2 size={16} color="#64748B" />} a11y={L('Bearbeiten', 'Edit')} color="#64748B" onPress={() => onEdit?.(d)} />
          ) : null}
          {canDelete ? (
            <ActionButton icon={<Trash2 size={16} color="#EF4444" />} a11y={L('Löschen', 'Delete')} color="#EF4444" onPress={confirmDelete} />
          ) : null}
        </View>
      ) : null}
    </Card>
  )
}

/** Web: ghost icon button `h-8 w-8 rounded-lg` / `h-8 rounded-lg text-xs font-bold`. */
function ActionButton({ icon, label, a11y, color, onPress }: { icon: React.ReactNode; label?: string; a11y?: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label ?? a11y}>
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            height: 34,
            minWidth: 34,
            paddingHorizontal: label ? 10 : 0,
            borderRadius: 8,
            backgroundColor: pressed ? '#F1F5F9' : '#F8FAFC',
          }}
        >
          {icon}
          {label ? <Text style={{ marginLeft: 5, fontSize: 12, fontWeight: '700', color }}>{label}</Text> : null}
        </View>
      )}
    </Pressable>
  )
}
