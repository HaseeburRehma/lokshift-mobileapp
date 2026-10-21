/**
 * Company profile — admin-only edit of organization fields. Mirrors the
 * webapp's /dashboard/settings/company page: "Allgemeine Informationen"
 * (brand name, legal name, email, phone, website), "Adresse & Steuern"
 * (address, tax id), "Firmenlogo" and "Lokalisierung" (currency,
 * timezone), plus the mobile-only Spesen rate overrides used by the
 * Stundenzettel export.
 *
 * Logo upload uses expo-image-picker → Supabase storage `org-logos`
 * bucket. If the bucket does not exist yet the upload errors and we
 * surface the message; the rest of the form keeps working.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Alert,
  TextInput,
  ActivityIndicator,
  type TextInputProps,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  ChevronLeft,
  Building2,
  Camera,
  Mail,
  Phone,
  Globe,
  MapPin,
  Receipt,
  Save,
} from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useOrganization } from '@/hooks/useOrganization'
import { getSupabase } from '@/lib/supabase/client'
import { useSafeBack } from '@/lib/use-safe-back'

// Same option sets as the web <select>s.
const CURRENCIES: { value: string; label: string }[] = [
  { value: 'EUR', label: 'EUR · €' },
  { value: 'CHF', label: 'CHF · Fr.' },
  { value: 'USD', label: 'USD · $' },
  { value: 'GBP', label: 'GBP · £' },
]
const TIMEZONES = ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London', 'UTC']

const ICON_COLOR = '#94A3B8'

export default function CompanyScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
  const { locale } = useTranslation()
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
        <Text className="text-slate-400 text-center">
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
      <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0064E0" />
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
      toast.success(L('Unternehmensprofil gespeichert', 'Company profile saved'))
    } catch (err: any) {
      toast.error(err?.message || L('Speichern fehlgeschlagen', 'Save failed'))
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
      toast.error(err?.message || L('Upload fehlgeschlagen', 'Upload failed'))
    } finally {
      setUploadingLogo(false)
    }
  }

  // Keep a legacy value (e.g. "SEK") selectable even if it is not in the
  // web's option list, so saving never silently rewrites it.
  const currencyOptions = CURRENCIES.some((c) => c.value === currency)
    ? CURRENCIES
    : [{ value: currency, label: currency }, ...CURRENCIES]
  const timezoneOptions = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]

  return (
    <Screen background="#F8FAFC" className="bg-slate-50" noTapToDismiss>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Web: "‹ Einstellungen" back link above the H1 */}
        <Pressable
          onPress={goBack}
          hitSlop={12}
          className="flex-row items-center self-start mb-3"
          accessibilityRole="button"
          accessibilityLabel={L('Zurück', 'Back')}
        >
          <ChevronLeft size={12} color="#94A3B8" />
          <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
            {L('Einstellungen', 'Settings')}
          </Text>
        </Pressable>

        <PageHeader
          title={L('Unternehmensprofil', 'Company Profile')}
          subtitle={L(
            'Firmendaten, Branding und Kontaktinformationen.',
            'Company data, branding and contact information.',
          )}
        />

        <View style={{ gap: 16 }}>
          {/* Allgemeine Informationen */}
          <Card style={{ borderRadius: 24 }}>
            <Text className="text-[16px] font-bold text-slate-900 mb-5">
              {L('Allgemeine Informationen', 'General information')}
            </Text>
            <View style={{ gap: 16 }}>
              <Field label={L('Markenname', 'Brand name') + ' *'}>
                <WebInput value={name} onChangeText={setName} placeholder="LokShift" />
              </Field>
              <Field label={L('Rechtlicher Name', 'Legal entity name')}>
                <WebInput value={legalName} onChangeText={setLegalName} placeholder="LokShift GmbH" />
              </Field>
              <Field label={L('Geschäfts-E-Mail', 'Business email') + ' *'}>
                <WebInput
                  icon={<Mail size={16} color={ICON_COLOR} />}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="kontakt@firma.de"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
              <Field label={L('Telefon', 'Phone')}>
                <WebInput
                  icon={<Phone size={16} color={ICON_COLOR} />}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+49 …"
                  keyboardType="phone-pad"
                />
              </Field>
              <Field label={L('Website', 'Website')}>
                <WebInput
                  icon={<Globe size={16} color={ICON_COLOR} />}
                  value={website}
                  onChangeText={setWebsite}
                  placeholder="https://…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </Field>
            </View>
          </Card>

          {/* Adresse & Steuern */}
          <Card style={{ borderRadius: 24 }}>
            <Text className="text-[16px] font-bold text-slate-900 mb-5">
              {L('Adresse & Steuern', 'Address & taxation')}
            </Text>
            <View style={{ gap: 16 }}>
              <Field label={L('Geschäftsadresse', 'Office address') + ' *'}>
                <WebInput
                  icon={<MapPin size={16} color={ICON_COLOR} />}
                  value={address}
                  onChangeText={setAddress}
                  placeholder={L('Straße, PLZ Stadt', 'Street, ZIP City')}
                  multiline
                />
              </Field>
              <Field label={L('USt-IdNr. / Steuer-ID', 'VAT / Tax ID')}>
                <WebInput
                  icon={<Receipt size={16} color={ICON_COLOR} />}
                  value={taxId}
                  onChangeText={setTaxId}
                  placeholder="DE123456789"
                  autoCapitalize="characters"
                />
              </Field>
            </View>
          </Card>

          {/* Firmenlogo */}
          <Card style={{ borderRadius: 24, alignItems: 'center' }}>
            <Pressable
              onPress={pickLogo}
              disabled={uploadingLogo}
              className="w-28 h-28 rounded-3xl bg-slate-50 border-2 border-dashed border-slate-200 items-center justify-center overflow-hidden"
            >
              {logoUrl ? (
                <Image source={{ uri: logoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Building2 size={40} color="#CBD5E1" />
              )}
              {uploadingLogo ? (
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
            </Pressable>
            <Text className="text-[14px] font-bold text-slate-900 mt-4">
              {L('Firmenlogo', 'Company logo')}
            </Text>
            <Text className="text-[12px] text-slate-500 mt-1">PNG / JPG · max. 2 MB</Text>
            <Pressable
              onPress={pickLogo}
              disabled={uploadingLogo}
              className="mt-4 flex-row items-center px-4 py-2.5 rounded-xl border border-slate-200 bg-white"
              style={{ opacity: uploadingLogo ? 0.6 : 1 }}
            >
              <Camera size={16} color="#334155" />
              <Text className="text-[14px] font-semibold text-slate-700 ml-1.5">
                {uploadingLogo ? L('Wird hochgeladen…', 'Uploading…') : L('Logo ändern', 'Change logo')}
              </Text>
            </Pressable>
          </Card>

          {/* Lokalisierung */}
          <Card style={{ borderRadius: 24 }}>
            <Text className="text-[16px] font-bold text-slate-900 mb-5">
              {L('Lokalisierung', 'Localization')}
            </Text>
            <View style={{ gap: 16 }}>
              <Field label={L('Währung', 'Currency')}>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {currencyOptions.map((c) => (
                    <OptionChip
                      key={c.value}
                      label={c.label}
                      selected={currency === c.value}
                      onPress={() => setCurrency(c.value)}
                    />
                  ))}
                </View>
              </Field>
              <Field label={L('Zeitzone', 'Timezone')}>
                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {timezoneOptions.map((tz) => (
                    <OptionChip
                      key={tz}
                      label={tz}
                      selected={timezone === tz}
                      onPress={() => setTimezone(tz)}
                    />
                  ))}
                </View>
              </Field>
              <Pressable
                onPress={() => router.push('/settings/localization' as any)}
                hitSlop={8}
                className="items-center mt-1"
              >
                <Text className="text-[14px] font-semibold" style={{ color: '#2563EB' }}>
                  {L('Erweiterte Lokalisierung →', 'Advanced localization →')}
                </Text>
              </Pressable>
            </View>
          </Card>

          {/* Spesen (mobile extra — used by the Stundenzettel export) */}
          <Card style={{ borderRadius: 24 }}>
            <Text className="text-[16px] font-bold text-slate-900">
              {L('Verpflegungspauschale (Spesen)', 'Per-diem rates')}
            </Text>
            <Text className="text-[12px] text-slate-500 mt-1 mb-5">
              {L(
                'Wird beim Zeiterfassen automatisch berechnet und auf den Stundenzettel übernommen.',
                'Auto-calculated on time entry and applied to the Stundenzettel PDF.',
              )}
            </Text>
            <View className="flex-row" style={{ gap: 12 }}>
              <View className="flex-1">
                <Field label={L('Teilsatz (€)', 'Partial day (€)')}>
                  <WebInput
                    value={spesenPartial}
                    onChangeText={setSpesenPartial}
                    keyboardType="decimal-pad"
                    placeholder="14"
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label={L('Vollsatz (€)', 'Full day (€)')}>
                  <WebInput
                    value={spesenFull}
                    onChangeText={setSpesenFull}
                    keyboardType="decimal-pad"
                    placeholder="28"
                  />
                </Field>
              </View>
            </View>
          </Card>

          <Button
            label={L('Änderungen speichern', 'Save changes')}
            leftIcon={<Save size={18} color="#fff" />}
            onPress={submit}
            loading={saving}
            size="lg"
          />
        </View>
      </ScrollView>
    </Screen>
  )
}

// --- small helpers (kept local, like the web page) ---

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
      </Text>
      {children}
    </View>
  )
}

function WebInput({ icon, multiline, ...props }: TextInputProps & { icon?: React.ReactNode }) {
  return (
    <View
      className="flex-row rounded-lg border border-slate-200 bg-slate-50 px-3"
      style={{ minHeight: 44, alignItems: multiline ? 'flex-start' : 'center' }}
    >
      {icon ? <View style={{ marginRight: 8, marginTop: multiline ? 13 : 0 }}>{icon}</View> : null}
      <TextInput
        placeholderTextColor="#CBD5E1"
        multiline={multiline}
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: '500',
          color: '#334155',
          paddingVertical: 11,
          textAlignVertical: multiline ? 'top' : 'center',
          minHeight: multiline ? 64 : undefined,
        }}
        {...props}
      />
    </View>
  )
}

function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="px-3 py-2 rounded-lg border"
      style={{
        backgroundColor: selected ? '#EFF6FF' : '#F8FAFC',
        borderColor: selected ? '#0064E0' : '#E2E8F0',
      }}
    >
      <Text
        className="text-[13px] font-semibold"
        style={{ color: selected ? '#0064E0' : '#334155' }}
      >
        {label}
      </Text>
    </Pressable>
  )
}
