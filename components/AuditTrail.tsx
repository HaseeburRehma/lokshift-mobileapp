/**
 * Lightweight audit-trail panel. The web doesn't ship a dedicated
 * audit_logs table, but the row itself carries the essentials:
 *   - created_at + creator_id
 *   - updated_at
 *   - status / verification flags
 *   - rejection_reason / review_notes (free text)
 *
 * This component takes a small set of `events` and renders them as a
 * vertical timeline. Hosts (plan detail, time entry sheet, etc.)
 * derive the events from whatever fields they have on hand.
 *
 * When a dedicated audit_logs table ships on the web, replace the
 * derivation with a hook that reads from it; the visual contract stays
 * the same.
 */

import React from 'react'
import { View, Text } from 'react-native'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { de as deLocale, enUS } from 'date-fns/locale'
import { Check, Plus, Edit2, ShieldCheck, X, Clock } from 'lucide-react-native'

import { Card } from '@/components/Card'
import { useTranslation } from '@/lib/i18n'

export type AuditKind = 'created' | 'updated' | 'verified' | 'rejected' | 'status'

export interface AuditEvent {
  kind: AuditKind
  at: string // ISO timestamp
  /** Person who performed the action. */
  by?: string | null
  /** One-line summary shown next to the dot. */
  label: string
  /** Optional detail / note. */
  detail?: string | null
}

interface Props {
  events: AuditEvent[]
  /** Header label override; defaults to "Verlauf" / "History". */
  title?: string
}

function iconFor(kind: AuditKind) {
  switch (kind) {
    case 'created':
      return Plus
    case 'verified':
      return ShieldCheck
    case 'rejected':
      return X
    case 'status':
      return Check
    case 'updated':
    default:
      return Edit2
  }
}

function colorFor(kind: AuditKind): string {
  switch (kind) {
    case 'created':
      return '#0064E0'
    case 'verified':
      return '#10B981'
    case 'rejected':
      return '#DC2626'
    case 'status':
      return '#F59E0B'
    case 'updated':
    default:
      return '#94A3B8'
  }
}

export function AuditTrail({ events, title }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const dateLocale = locale === 'de' ? deLocale : enUS

  if (events.length === 0) return null

  // Most-recent first.
  const sorted = [...events].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )

  return (
    <Card>
      <View className="flex-row items-center mb-3">
        <Clock size={16} color="#0064E0" />
        <Text className="text-[14px] font-black text-gray-900 dark:text-white ml-2">
          {title ?? L('Verlauf', 'History')}
        </Text>
      </View>

      <View>
        {sorted.map((e, i) => {
          const Icon = iconFor(e.kind)
          const color = colorFor(e.kind)
          const isLast = i === sorted.length - 1
          const at = (() => {
            try {
              return parseISO(e.at)
            } catch {
              return new Date(e.at)
            }
          })()
          return (
            <View key={`${e.at}-${i}`} style={{ flexDirection: 'row' }}>
              {/* Spine */}
              <View style={{ alignItems: 'center', marginRight: 10 }}>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    backgroundColor: `${color}1F`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={12} color={color} />
                </View>
                {!isLast && (
                  <View
                    style={{
                      width: 1.5,
                      flex: 1,
                      backgroundColor: '#E2E8F0',
                      marginTop: 2,
                    }}
                  />
                )}
              </View>
              <View style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
                <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
                  {e.label}
                </Text>
                <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                  {format(at, 'dd.MM.yyyy HH:mm', { locale: dateLocale })}
                  {' · '}
                  {formatDistanceToNow(at, { addSuffix: true, locale: dateLocale })}
                  {e.by ? ` · ${e.by}` : ''}
                </Text>
                {e.detail ? (
                  <Text className="text-[12px] text-gray-700 dark:text-slate-300 mt-1.5 italic">
                    “{e.detail}”
                  </Text>
                ) : null}
              </View>
            </View>
          )
        })}
      </View>
    </Card>
  )
}
