/**
 * Shift card inside a week-grid cell — mobile replica of the webapp's
 * components/plans/PlanCard.tsx: time range with a "+1" (Moon) marker
 * when the shift ends on a later day, a lock when it already started,
 * the shift name (blue), the customer, start → destination Betriebsstelle
 * (or the free-text location), the status chip and a Gastfahrt chip.
 *
 * Every line has a fixed line height and the card an explicit height
 * (`weekPlanCardHeight`). The week grid pins the employee column outside
 * the horizontal ScrollView, so both sides must agree on row heights
 * without measuring.
 */

import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { Lock, Moon } from 'lucide-react-native'

import type { Plan } from '@/lib/types'
import { formatTimeOfDay } from '@/lib/time/format'
import { endDayOffset } from '@/lib/time/shift-hours'
import { hasStarted } from '@/lib/plans/week'
import { Chip, PlanStatusChip, planCardBorder } from '@/components/plans/planStatus'

const PAD_Y = 5
const BORDER = 1
const LINE_TIME = 15
const LINE_NAME = 14
const LINE_SUB = 13
const CHIP_ROW = 16 // marginTop 2 + chip (12 + 2 border)

export const CONT_CHIP_H = 18
export const ABSENCE_CHIP_H = 16

function placeLine(plan: Plan): string | null {
  const from = plan.start_location?.short_code || plan.start_location?.name || null
  const to = plan.destination_location?.short_code || plan.destination_location?.name || null
  if (from || to) return `${from ?? '?'} → ${to ?? '?'}`
  return plan.location || null
}

/** Exact rendered height of a <WeekPlanCard /> for `plan`. */
export function weekPlanCardHeight(plan: Plan): number {
  let h = BORDER * 2 + PAD_Y * 2 + LINE_TIME + CHIP_ROW
  if (plan.shift_name || plan.route) h += LINE_NAME
  if (plan.customer?.name) h += LINE_SUB
  if (placeLine(plan)) h += LINE_SUB
  return h
}

interface Props {
  plan: Plan
  locale: 'de' | 'en'
  onPress: (plan: Plan) => void
  onLongPress: (plan: Plan) => void
  /** react-native-web HTML5 drag props (web only). */
  dragProps?: Record<string, unknown>
}

function WeekPlanCardImpl({ plan, locale, onPress, onLongPress, dragProps }: Props) {
  const offset = endDayOffset(plan.start_time, plan.end_time)
  const started = hasStarted(plan)
  const name = plan.shift_name || plan.route || null
  const customer = plan.customer?.name ?? null
  const place = placeLine(plan)

  return (
    <Pressable
      onPress={() => onPress(plan)}
      onLongPress={() => onLongPress(plan)}
      delayLongPress={350}
      accessibilityRole="button"
      {...(dragProps as any)}
    >
      <View
        style={{
          height: weekPlanCardHeight(plan),
          borderRadius: 10,
          borderWidth: BORDER,
          borderColor: planCardBorder(plan.status),
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 7,
          paddingVertical: PAD_Y,
          overflow: 'hidden',
          shadowColor: '#0F172A',
          shadowOpacity: 0.04,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', height: LINE_TIME }}>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{ fontSize: 12, lineHeight: LINE_TIME, fontWeight: '900', color: '#0F172A', fontVariant: ['tabular-nums'] }}
          >
            {formatTimeOfDay(plan.start_time)}–{formatTimeOfDay(plan.end_time)}
          </Text>
          {offset > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginLeft: 3,
                borderRadius: 4,
                backgroundColor: '#EEF2FF',
                paddingHorizontal: 3,
              }}
              accessibilityLabel={locale === 'de' ? 'Ende am Folgetag' : 'Ends next day'}
            >
              <Moon size={8} color="#4338CA" />
              <Text allowFontScaling={false} style={{ fontSize: 9, lineHeight: 12, fontWeight: '900', color: '#4338CA', marginLeft: 1 }}>
                +{offset}
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {started ? <Lock size={11} color="#94A3B8" accessibilityLabel={locale === 'de' ? 'Bereits begonnen' : 'Already started'} /> : null}
        </View>

        {name ? (
          <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 11, lineHeight: LINE_NAME, fontWeight: '800', color: '#0064E0' }}>
            {name}
          </Text>
        ) : null}
        {customer ? (
          <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 10, lineHeight: LINE_SUB, fontWeight: '600', color: '#64748B' }}>
            {customer}
          </Text>
        ) : null}
        {place ? (
          <Text allowFontScaling={false} numberOfLines={1} style={{ fontSize: 10, lineHeight: LINE_SUB, fontWeight: '600', color: '#64748B' }}>
            {place}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', marginTop: 2, gap: 3, overflow: 'hidden' }}>
          <PlanStatusChip status={plan.status} locale={locale} size="sm" />
          {plan.is_gastfahrt ? <Chip label="Gastfahrt" bg="#F5F3FF" fg="#6D28D9" border="#DDD6FE" size="sm" /> : null}
        </View>
      </View>
    </Pressable>
  )
}

export const WeekPlanCard = React.memo(WeekPlanCardImpl)
