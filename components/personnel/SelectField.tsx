/**
 * Select-style dropdown for the Personal & Fristen screens — the mobile
 * counterpart of the webapp's native <select> (`h-11 rounded-xl border
 * border-slate-200 bg-white px-3 text-sm font-semibold`). Options open
 * inline below the field (no nested vertical list).
 */

import React, { useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Check, ChevronDown } from 'lucide-react-native'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  /** Shown when no option matches `value` (web: first empty <option>). */
  placeholder?: string
  disabled?: boolean
  /** `filter` = compact toolbar select (h-9, text-xs); `form` = h-11 field. */
  variant?: 'form' | 'filter'
}

export function SelectField({ value, options, onChange, placeholder, disabled, variant = 'form' }: Props) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  const compact = variant === 'filter'

  return (
    <View>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        disabled={disabled}
        accessibilityRole="button"
        hitSlop={4}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: compact ? 36 : 44,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: open ? '#0064E0' : '#E2E8F0',
            backgroundColor: disabled ? '#F8FAFC' : '#FFFFFF',
            paddingHorizontal: 12,
            opacity: disabled ? 0.7 : 1,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: compact ? 12 : 14,
              fontWeight: compact ? '700' : '600',
              color: current ? (compact ? '#475569' : '#0F172A') : '#94A3B8',
            }}
          >
            {current?.label ?? placeholder ?? '—'}
          </Text>
          {!disabled ? (
            <View style={{ marginLeft: 6 }}>
              <ChevronDown size={compact ? 14 : 16} color="#94A3B8" />
            </View>
          ) : null}
        </View>
      </Pressable>

      {open && !disabled ? (
        <View
          style={{
            marginTop: 6,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            backgroundColor: '#FFFFFF',
            overflow: 'hidden',
          }}
        >
          {options.map((o, i) => {
            const on = o.value === value
            return (
              <Pressable
                key={o.value || `opt-${i}`}
                onPress={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                    borderTopWidth: i ? 1 : 0,
                    borderTopColor: '#F1F5F9',
                    backgroundColor: on ? '#EFF6FF' : '#FFFFFF',
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: on ? '800' : '600', color: on ? '#0064E0' : '#334155' }} numberOfLines={1}>
                    {o.label}
                  </Text>
                  {on ? <Check size={15} color="#0064E0" /> : null}
                </View>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}
