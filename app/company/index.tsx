/**
 * Company profile — admin-only edit of organization fields. Mirrors the
 * webapp's /dashboard/settings/company page: brand name, legal name,
 * email, phone, website, address, tax id, currency, timezone, logo,
 * plus the Spesen rate overrides used by the Stundenzettel export.
 *
 * Logo upload uses expo-image-picker → Supabase storage `org-logos`
 * bucket (web reads the same path). If the bucket does not exist yet
 * the upload errors and we surface the message; the rest of the form
 * keeps working.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, Image, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  Building2,
  Camera,
  Loader,
} from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { FormField } from '@/components/FormField'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useOrganization } from '@/hooks/useOrganization'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'

export default function CompanyScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role, profile } = useUser()
  const { organization, loading, updateOrganization } = useOrganization()

  const [name, setName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [address, setAddress] = useState('')
  const [taxId, setTaxId] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [timezone, setTimezone] = useState('Europe/Berlin')
  const [spesenPartial, setSpesenPartial] = useState('14')
  const [spesenFull, setSpesenFull] = useState('28')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)

  useEffect(() => {
    if (!organization) return
    setName(organization.name ?? '')
    setLegalName(organization.legal_name ?? '')
    setEmail(organization.email ?? '')
    setPhone(organization.phone ?? '')
    setWebsite(organization.website ?? '')
    setAddress(organization.address ?? '')
    setTaxId(organization.tax_id ?? '')
    setCurrency(organization.currency ?? 'EUR')
    setTimezone(organization.timezone ?? 'Europe/Berlin')
    setSpesenPartial(String(organization.spesen_rate_partial ?? 14))
    setSpesenFull(String(organization.spesen_rate_full ?? 28))
    setLogoUrl(organization.logo_url ?? null)
  }, [organization])

  if (!canManageUsers(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Administratoren können das Unternehmensprofil bearbeiten.',
            'Only administrators can edit the company profile.',
          )}
        </Text>
      </Screen>
    )
  }

  if (loading) {
    return (
      <Screen background="#F9FAFB" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 dark:text-slate-500">{t('common.loading')}</Text>
        </View>
      </Screen>
    )
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error(L('Markenname ist erforderlich.', 'Brand name is required.'))
      return
    }
    const partial = parseFloat(spesenPartial.replace(',', '.'))
    const full = parseFloat(spesenFull.replace(',', '.'))
    if (!Number.isFinite(partial) || partial < 0 || !Number.isFinite(full) || full < 0) {
      toast.error(L('Ungültige Spesensätze.', 'Invalid per-diem rates.'))
      return
    }
    setSaving(true)
    try {
      await updateOrganization({
        name: name.trim(),
        legal_name: legalName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        website: website.trim() || null,
        address: address.trim() || null,
        tax_id: taxId.trim() || null,
        currency: currency.trim() || 'EUR',
        timezone: timezone.trim() || 'Europe/Berlin',
        spesen_rate_partial: partial,
        spesen_rate_full: full,
      })
      toast.success(L('Gespeichert', 'Saved'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const pickLogo = async () => {
    if (!profile?.organization_id) return
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        L('Berechtigung fehlt', 'Permission missing'),
        L(
          'Bitte erlauben Sie den Zugriff auf Ihre Mediathek in den Systemeinstellungen.',
          'Please grant photo library access in system settings.',
        ),
      )
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: false,
      allowsEditing: true,
      aspect: [1, 1],
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    setUploadingLogo(true)
    try {
      const supabase = getSupabase()
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase()
      const path = `${profile.organization_id}/logo-${Date.now()}.${ext}`
      const res = await fetch(asset.uri)
      if (!res.ok) throw new Error(`Cannot read file (${res.status})`)
      const arrayBuffer = await res.arrayBuffer()
      const { error: upErr } = await supabase.storage
        .from('org-logos')
        .upload(path, arrayBuffer, {
          contentType: asset.mimeType ?? 'image/jpeg',
          upsert: true,
          cacheControl: '3600',
        })
      if (upErr) throw upErr
      const {
        data: { publicUrl },
      } = supabase.storage.from('org-logos').getPublicUrl(path)
      await updateOrganization({ logo_url: publicUrl })
      setLogoUrl(publicUrl)
      toast.success(L('Logo aktualisiert', 'Logo updated'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setUploadingLogo(false)
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Unternehmensprofil', 'Company profile')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {/* Header / logo */}
        <View className="items-center mb-6">
          <Pressable
            onPress={pickLogo}
            disabled={uploadingLogo}
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              backgroundColor: '#EFF6FF',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={{ width: 96, height: 96 }} resizeMode="cover" />
            ) : (
              <Building2 size={36} color="#0064E0" />
            )}
            <View
              style={{
                position: 'absolute',
                right: -4,
                bottom: -4,
                width: 32,
                height: 32,
                borderRadius: 999,
                backgroundColor: '#0064E0',
                alignItems: 'center',
                justifyContent: 'center',
                borderColor: '#fff',
                borderWidth: 3,
              }}
            >
              {uploadingLogo ? (
                <Loader size={16} color="#fff" />
              ) : (
                <Camera size={16} color="#fff" />
              )}
            </View>
          </Pressable>
          <Text className="text-[11px] text-gray-400 dark:text-slate-500 mt-3">
            {uploadingLogo
              ? L('Wird hochgeladen…', 'Uploading…')
              : L('Tippen, um das Logo zu ändern', 'Tap to change the logo')}
          </Text>
        </View>

        <Card className="mb-3 space-y-4">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 ml-1 -mb-1">
            {L('Identität', 'Identity')}
          </Text>
          <FormField
            label={L('Markenname *', 'Brand name *')}
            value={name}
            onChangeText={setName}
            placeholder="LokShift"
          />
          <FormField
            label={L('Rechtlicher Name', 'Legal entity name')}
            value={legalName}
            onChangeText={setLegalName}
            placeholder="LokShift GmbH"
          />
          <FormField
            label={L('Steuernummer', 'Tax ID')}
            value={taxId}
            onChangeText={setTaxId}
            placeholder="DE…"
          />
        </Card>

        <Card className="mb-3 space-y-4">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 ml-1 -mb-1">
            {L('Kontakt', 'Contact')}
          </Text>
          <FormField
            label={L('E-Mail', 'Email')}
            value={email}
            onChangeText={setEmail}
            placeholder="kontakt@firma.de"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FormField
            label={L('Telefon', 'Phone')}
            value={phone}
            onChangeText={setPhone}
            placeholder="+49 …"
            keyboardType="phone-pad"
          />
          <FormField
            label={L('Webseite', 'Website')}
            value={website}
            onChangeText={setWebsite}
            placeholder="https://…"
            autoCapitalize="none"
          />
          <FormField
            label={L('Geschäftsadresse', 'Office address')}
            value={address}
            onChangeText={setAddress}
            placeholder={L('Straße, PLZ Ort, Land', 'Street, ZIP city, country')}
            multiline
          />
        </Card>

        <Card className="mb-3 space-y-4">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 ml-1 -mb-1">
            {L('Region', 'Region')}
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                label={L('Währung', 'Currency')}
                value={currency}
                onChangeText={setCurrency}
                placeholder="EUR"
                autoCapitalize="characters"
              />
            </View>
            <View className="flex-1">
              <FormField
                label={L('Zeitzone', 'Timezone')}
                value={timezone}
                onChangeText={setTimezone}
                placeholder="Europe/Berlin"
                autoCapitalize="none"
              />
            </View>
          </View>
        </Card>

        <Card className="mb-3 space-y-4">
          <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 ml-1 -mb-1">
            {L('Verpflegungspauschale (Spesen)', 'Per-diem rates')}
          </Text>
          <Text className="text-[12px] text-gray-500 dark:text-slate-400 -mt-1 ml-1">
            {L(
              'Wird beim Zeiterfassen automatisch berechnet und auf den Stundenzettel übernommen.',
              'Auto-calculated on time entry and applied to the Stundenzettel PDF.',
            )}
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <FormField
                label={L('Teilsatz (€)', 'Partial day (€)')}
                value={spesenPartial}
                onChangeText={setSpesenPartial}
                keyboardType="decimal-pad"
                placeholder="14"
              />
            </View>
            <View className="flex-1">
              <FormField
                label={L('Vollsatz (€)', 'Full day (€)')}
                value={spesenFull}
                onChangeText={setSpesenFull}
                keyboardType="decimal-pad"
                placeholder="28"
              />
            </View>
          </View>
        </Card>

        <Button
          label={saving ? t('common.loading') : L('Änderungen speichern', 'Save changes')}
          onPress={submit}
          loading={saving}
          size="lg"
        />
      </ScrollView>
    </Screen>
  )
}
