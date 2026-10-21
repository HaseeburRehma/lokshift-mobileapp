/**
 * Building blocks of the Wochenplanung grid (app/dashboard) — mobile
 * replica of the webapp's app/dashboard/plans/week/page.tsx cells:
 * absence chip (Urlaub / Krank / Urlaub beantragt), "↳ bis 06:00"
 * continuation chips for night shifts from the previous day, one
 * <WeekPlanCard /> per shift and a "+" on empty cells.
 *
 * Row heights are computed from the data (`weekCellHeight`) so the
 * employee column — pinned outside the horizontal ScrollView — and the
 * scrolling day columns always line up without measuring.
 */

import React from 'react'
import { Platform, Pressable, Text, View } from 'react-native'
import { Plus } from 'lucide-react-native'

import type { Plan } from '@/lib/types'
import type { WeekAbsence } from '@/lib/plans/week'
import { formatTimeOfDay } from '@/lib/time/format'
import { ABSENCE_CHIP_H, CONT_CHIP_H, WeekPlanCard, weekPlanCardHeight } from '@/components/plans/WeekPlanCard'
import { Chip, absenceLabel, absenceStyle } from '@/components/plans/planStatus'

export const DAY_COL_W = 136
export const EMP_COL_W = 120
export const ROW_MIN_H = 84
export const HEADER_H = 46
export const TOTALS_H = 40
const CELL_PAD = 4
const GAP = 4
const BORDER_B = 1

export const GRID = {
  border: '#E2E8F0',
  borderSoft: '#F1F5F9',
  chrome: '#F8FAFC',
  today: '#EFF6FF',
  todayCell: '#F5F9FF',
  dropBg: '#DBEAFE',
  dropBorder: '#93C5FD',
}

export interface WeekCellModel {
  day: string
  plans: Plan[]
  conts: Plan[]
  absence?: WeekAbsence
}

export interface WeekRowModel {
  /** Employee id, or the unassigned-row key. */
  key: string
  employeeId: string | null
  cells: WeekCellModel[]
  height: number
  weekCount: number
  inactive?: boolean
}

export interface WeekGridHandlers {
  onPlanPress: (plan: Plan) => void
  onPlanLongPress: (plan: Plan) => void
  onEmptyPress: (employeeId: string | null, day: string) => void
  onDragStart: (planId: string, rowKey: string, day: string) => void
  onDragOver: (rowKey: string, day: string) => void
  onDragEnd: () => void
  onDrop: (rowKey: string, day: string) => void
}

export function weekCellHeight(cell: Pick<WeekCellModel, 'plans' | 'conts' | 'absence'>): number {
  const items: number[] = []
  if (cell.absence) items.push(ABSENCE_CHIP_H)
  for (let i = 0; i < cell.conts.length; i++) items.push(CONT_CHIP_H)
  for (const p of cell.plans) items.push(weekPlanCardHeight(p))
  if (items.length === 0) return ROW_MIN_H
  return items.reduce((s, h) => s + h, 0) + GAP * (items.length - 1) + CELL_PAD * 2 + BORDER_B
}

interface RowProps {
  row: WeekRowModel
  today: string
  locale: 'de' | 'en'
  /** Day the web drag cursor hovers in this row (null = none). */
  dragOverDay: string | null
  handlers: WeekGridHandlers
}

function WeekGridRowImpl({ row, today, locale, dragOverDay, handlers }: RowProps) {
  return (
    <View style={{ flexDirection: 'row', height: row.height, opacity: row.inactive ? 0.75 : 1 }}>
      {row.cells.map((cell) => (
        <WeekCell
          key={cell.day}
          rowKey={row.key}
          employeeId={row.employeeId}
          cell={cell}
          height={row.height}
          isToday={cell.day === today}
          isDropTarget={dragOverDay === cell.day}
          locale={locale}
          handlers={handlers}
        />
      ))}
    </View>
  )
}

export const WeekGridRow = React.memo(WeekGridRowImpl)

interface CellProps {
  rowKey: string
  employeeId: string | null
  cell: WeekCellModel
  height: number
  isToday: boolean
  isDropTarget: boolean
  locale: 'de' | 'en'
  handlers: WeekGridHandlers
}

function WeekCellImpl({ rowKey, employeeId, cell, height, isToday, isDropTarget, locale, handlers }: CellProps) {
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { plans, conts, absence, day } = cell
  const empty = plans.length === 0
  const abs = absence ? absenceStyle(absence.kind, absence.pending) : null

  // HTML5 drop target (web only). RNW forwards these to the DOM node.
  const dropProps =
    Platform.OS === 'web'
      ? {
          onDragOver: (e: any) => {
            e.preventDefault()
            handlers.onDragOver(rowKey, day)
          },
          onDrop: (e: any) => {
            e.preventDefault()
            handlers.onDrop(rowKey, day)
          },
        }
      : {}

  const bg = isDropTarget ? GRID.dropBg : abs ? abs.cellBg : isToday ? GRID.todayCell : '#FFFFFF'

  return (
    <Pressable
      onPress={() => {
        if (empty) handlers.onEmptyPress(employeeId, day)
      }}
      accessibilityLabel={empty ? L('Schicht anlegen', 'Add shift') : undefined}
      {...(dropProps as any)}
      style={{ width: DAY_COL_W, height }}
    >
      <View
        style={{
          flex: 1,
          padding: CELL_PAD,
          gap: GAP,
          backgroundColor: bg,
          borderLeftWidth: 1,
          borderBottomWidth: BORDER_B,
          borderColor: GRID.borderSoft,
          ...(isDropTarget ? { borderWidth: 2, borderStyle: 'dashed' as const, borderColor: GRID.dropBorder } : null),
        }}
      >
        {absence && abs ? (
          <View style={{ height: ABSENCE_CHIP_H, justifyContent: 'center' }}>
            <Chip label={absenceLabel(absence.kind, absence.pending, locale)} bg={abs.bg} fg={abs.fg} border={abs.border} dashed={absence.pending && absence.kind !== 'sick'} size="sm" />
          </View>
        ) : null}

        {conts.map((p) => (
          <Pressable key={`c-${p.id}`} onPress={() => handlers.onPlanPress(p)} onLongPress={() => handlers.onPlanLongPress(p)} delayLongPress={350}>
            <View
              style={{
                height: CONT_CHIP_H,
                borderRadius: 6,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: '#C7D2FE',
                backgroundColor: '#EEF2FF',
                paddingHorizontal: 5,
                justifyContent: 'center',
              }}
            >
              <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 10, lineHeight: 13, fontWeight: '800', color: '#4338CA' }}>
                ↳ {L('bis', 'until')} {formatTimeOfDay(p.end_time)}
                {p.shift_name ? ` · ${p.shift_name}` : ''}
              </Text>
            </View>
          </Pressable>
        ))}

        {plans.map((p) => (
          <WeekPlanCard
            key={p.id}
            plan={p}
            locale={locale}
            onPress={handlers.onPlanPress}
            onLongPress={handlers.onPlanLongPress}
            dragProps={
              Platform.OS === 'web'
                ? {
                    draggable: true,
                    onDragStart: (e: any) => {
                      e.dataTransfer?.setData('text/plain', p.id)
                      handlers.onDragStart(p.id, rowKey, day)
                    },
                    onDragEnd: handlers.onDragEnd,
                  }
                : undefined
            }
          />
        ))}

        {empty && !absence ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={15} color="#CBD5E1" />
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const WeekCell = React.memo(WeekCellImpl)
