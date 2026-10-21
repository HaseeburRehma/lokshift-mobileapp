/**
 * Mobile counterpart of the webapp's DocumentTable: the empty state
 * ("Keine Nachweise vorhanden.") or one DocumentCard per table row.
 */

import React from 'react'
import { View, Text } from 'react-native'

import { DocumentCard } from '@/components/personnel/DocumentCard'
import { useTranslation } from '@/lib/i18n'
import type { PersonnelDocument } from '@/lib/personnel/documents'

interface Props {
  documents: PersonnelDocument[]
  showEmployee?: boolean
  onOpenFile: (d: PersonnelDocument) => void
  onEmployee?: (employeeId: string) => void
  onEdit?: (d: PersonnelDocument) => void
  onRenew?: (d: PersonnelDocument) => void
  onDelete?: (d: PersonnelDocument) => void
}

export function DocumentTable({ documents, showEmployee, onOpenFile, onEmployee, onEdit, onRenew, onDelete }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  if (documents.length === 0) {
    return (
      <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 32 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#94A3B8', textAlign: 'center' }}>{L('Keine Nachweise vorhanden.', 'No documents yet.')}</Text>
      </View>
    )
  }

  return (
    <View style={{ gap: 12 }}>
      {documents.map((d) => (
        <DocumentCard
          key={d.id}
          doc={d}
          showEmployee={showEmployee}
          onOpenFile={onOpenFile}
          onEmployee={onEmployee}
          onEdit={onEdit}
          onRenew={onRenew}
          onDelete={onDelete}
        />
      ))}
    </View>
  )
}
