/**
 * Grouped bar chart drawn with plain Views — the phone version of the
 * webapp's recharts ChartCard in the Mehrmonatsreport (same titles,
 * series colours and legend). Scrolls horizontally when there are more
 * months than fit on screen.
 */

import React from 'react'
import { View, Text, ScrollView } from 'react-native'

export interface BarSeries {
  label: string
  color: string
  values: number[]
}

interface BarChartProps {
  title: string
  categories: string[]
  series: BarSeries[]
  /** Integer axis (days) instead of hours. */
  integer?: boolean
}

const PLOT_H = 150
const LABEL_H = 14
const BAR_W = 16
const BAR_GAP = 4
const AXIS_W = 30

function niceMax(v: number, integer: boolean): number {
  if (!(v > 0)) return integer ? 2 : 1
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  let m = nf * exp
  if (integer) {
    m = Math.max(2, Math.ceil(m))
    if (m % 2 !== 0) m += 1
  }
  return m
}

function tickLabel(v: number): string {
  return String(Math.round(v))
}

export function BarChart({ title, categories, series, integer = false }: BarChartProps) {
  const rawMax = Math.max(0, ...series.flatMap((s) => s.values.map((x) => Number(x) || 0)))
  const max = niceMax(rawMax, integer)
  const ticks = [max, max / 2, 0]
  const groupMinW = series.length * BAR_W + (series.length - 1) * BAR_GAP + 20

  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 16,
        padding: 16,
      }}
    >
      <Text className="text-[11px] font-black uppercase tracking-widest text-slate-500 mb-3">{title}</Text>

      <View style={{ flexDirection: 'row' }}>
        {/* Y axis */}
        <View style={{ width: AXIS_W, height: PLOT_H + LABEL_H }}>
          {ticks.map((t, i) => (
            <Text
              key={`tick-${i}`}
              style={{
                position: 'absolute',
                right: 6,
                bottom: (t / max) * PLOT_H - 6,
                fontSize: 9,
                fontWeight: '700',
                color: '#94A3B8',
              }}
            >
              {tickLabel(t)}
            </Text>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flex: 1 }}>
            <View style={{ height: PLOT_H + LABEL_H, flexDirection: 'row', alignItems: 'flex-end' }}>
              {/* Grid lines */}
              {ticks.map((t, i) => (
                <View
                  key={`grid-${i}`}
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: (t / max) * PLOT_H,
                    height: 1,
                    backgroundColor: t === 0 ? '#CBD5E1' : '#E2E8F0',
                  }}
                />
              ))}
              {categories.map((cat, ci) => (
                <View
                  key={`grp-${cat}-${ci}`}
                  style={{ flex: 1, minWidth: groupMinW, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end' }}
                >
                  {series.map((s, si) => {
                    const v = Number(s.values[ci]) || 0
                    const barH = v > 0 ? Math.max(2, (v / max) * PLOT_H) : 0
                    return (
                      <View
                        key={`bar-${si}`}
                        style={{ width: BAR_W, marginLeft: si === 0 ? 0 : BAR_GAP, alignItems: 'center', justifyContent: 'flex-end' }}
                      >
                        {v > 0 ? (
                          <Text numberOfLines={1} style={{ fontSize: 8, fontWeight: '800', color: '#475569', marginBottom: 2, width: BAR_W + 12, textAlign: 'center' }}>
                            {tickLabel(v)}
                          </Text>
                        ) : null}
                        <View
                          style={{
                            width: BAR_W,
                            height: barH,
                            backgroundColor: s.color,
                            borderTopLeftRadius: 4,
                            borderTopRightRadius: 4,
                          }}
                        />
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>

            {/* X labels */}
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              {categories.map((cat, ci) => (
                <View key={`lbl-${cat}-${ci}`} style={{ flex: 1, minWidth: groupMinW, alignItems: 'center' }}>
                  <Text numberOfLines={1} style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>
                    {cat}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 }}>
        {series.map((s) => (
          <View key={`key-${s.label}`} style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginTop: 2 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: s.color, marginRight: 6 }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
