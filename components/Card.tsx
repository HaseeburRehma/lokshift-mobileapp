import React from 'react'
import { View, type ViewProps } from 'react-native'

/** Plain white card with rounded corners + slate-100 border — matches the
 *  webapp's `bg-white border border-slate-100 rounded-2xl shadow-sm` pattern. */
export function Card({ children, className = '', ...rest }: ViewProps & { className?: string }) {
  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#F1F5F9', // slate-100, matches webapp
        borderRadius: 16,
        padding: 20,
      }}
      className={className}
      {...rest}
    >
      {children}
    </View>
  )
}
