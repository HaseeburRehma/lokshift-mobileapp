/**
 * Shared qualification form used by /qualifications/new + /qualifications/[id].
 * Document URL field accepts an external link (e.g. a PDF in shared
 * cloud storage); inline upload arrives in a follow-up.
 */

import React, { useState } from 'react'
import { ScrollView } from 'react-native'

import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { useTranslation } from '@/lib/i18n'
import type { Qualification } from '@/lib/types'
import type { QualificationInput } from '@/hooks/useQualifications'

interface Props {
  initial?: Partial<Qualification>
  submitting?: boolean
  submitLabel: string
  onSubmit: (input: QualificationInput) => void | Promise<void>
}

export function QualificationForm({ initial, submitting, submitLabel, onSubmit }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)

  const [name, setName] = useState(initial?.name ?? '')
  const [issuer, setIssuer] = useState(initial?.issuer ?? '')
  const [issuedAt, setIssuedAt] = useState(initial?.issued_at ?? '')
  const [expiresAt, setExpiresAt] = useState(initial?.expires_at ?? '')
  const [reference, setReference] = useState(initial?.reference ?? '')
  const [documentUrl, setDocumentUrl] = useState(initial?.document_url ?? '')

  const submit = () => {
    onSubmit({
      name: name.trim(),
      issuer: issuer.trim() || null,
      issued_at: issuedAt || null,
      expires_at: expiresAt || null,
      reference: reference.trim() || null,
      document_url: documentUrl.trim() || null,
    })
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
      <Card className="mb-3 space-y-4">
        <FormField
          label={L('Bezeichnung', 'Name')}
          value={name}
          onChangeText={setName}
          placeholder={L('z. B. Eisenbahn-Triebfahrzeugführer', 'e.g. Railway driver license')}
        />
        <FormField
          label={L('Aussteller', 'Issuer')}
          value={issuer}
          onChangeText={setIssuer}
          placeholder={L('z. B. DB Akademie', 'e.g. DB Academy')}
        />
        <FormField
          label={L('Referenz / Zertifikatsnummer', 'Reference / certificate number')}
          value={reference}
          onChangeText={setReference}
        />
      </Card>

      <Card className="mb-3 space-y-4">
        <FormField
          label={L('Ausgestellt am', 'Issued on')}
          value={issuedAt}
          onChangeText={setIssuedAt}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <FormField
          label={L('Gültig bis', 'Expires on')}
          value={expiresAt}
          onChangeText={setExpiresAt}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
      </Card>

      <Card className="mb-3">
        <FormField
          label={L('Dokument (URL)', 'Document URL')}
          value={documentUrl}
          onChangeText={setDocumentUrl}
          placeholder="https://…"
          autoCapitalize="none"
          keyboardType="url"
        />
      </Card>

      <Button label={submitLabel} loading={submitting} onPress={submit} size="lg" />
    </ScrollView>
  )
}
