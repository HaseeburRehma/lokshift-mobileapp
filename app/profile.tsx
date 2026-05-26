/**
 * Stammdaten / Personal Data — own-profile editor.
 *
 * Pixel-parity port of the webapp's /dashboard/settings/personal-data
 * page. Layout:
 *   - Back chevron + "Stammdaten" title (brand blue)
 *   - White card with rounded corners containing:
 *       • Centered avatar + "Profilbild ändern" link
 *       • Vorname / Nachname / E-Mail (disabled) / Telefon /
 *         Geschlecht (chip row) / Über mich
 *   - "Profil speichern" CTA
 *
 * Writes back the new fields AND keeps `full_name` in sync as
 * `first_name + ' ' + last_name` so older consumers keep working.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, Camera, LogOut } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { AppHeader } from '@/components/AppHeader'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { getSupabase } from '@/lib/supabase/client'
import { uploadAvatar } from '@/lib/avatars/storage'

type Gender = '' | 'male' | 'female' | 'other'

interface FormState {
  first_name: string
  last_name: string
  email: string
  phone: string
  gender: Gender
  bio: string
}

export default function PersonalDataScreen() {
  const router = useRouter()
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { profile, session, refreshProfile, signOut } = useUser()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // expo-router throws "GO_BACK was not handled" if the user opened
  // this screen via a deep link (empty back stack). Fall through to
  // the settings tab in that case.
  const goBack = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/settings')
  }
  const [form, setForm] = useState<FormState>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    gender: '',
    bio: '',
  })

  // Hydrate from the DB row — same query shape the web uses, so we
  // pick up whatever the web user saved last.
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!profile?.id) return
      try {
        const { data } = await getSupabase()
          .from('profiles')
          .select('first_name, last_name, phone, gender, bio, email, avatar_url, full_name')
          .eq('id', profile.id)
          .maybeSingle()
        if (cancelled) return
        if (data) {
          const fallbackName = profile.full_name ?? data.full_name ?? ''
          const [fnGuess, ...lnRest] = fallbackName.split(' ')
          setForm({
            first_name: data.first_name ?? fnGuess ?? '',
            last_name: data.last_name ?? lnRest.join(' ') ?? '',
            email: data.email ?? profile.email ?? '',
            phone: data.phone ?? '',
            gender: (data.gender as Gender) ?? '',
            bio: data.bio ?? '',
          })
          setAvatarUrl(data.avatar_url ?? profile.avatar_url ?? null)
        } else {
          // No row yet — derive from auth+context.
          const [fn, ...lr] = (profile.full_name ?? '').split(' ')
          setForm({
            first_name: fn ?? '',
            last_name: lr.join(' '),
            email: profile.email ?? '',
            phone: '',
            gender: '',
            bio: '',
          })
          setAvatarUrl(profile.avatar_url ?? null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [profile?.id, profile?.full_name, profile?.email, profile?.avatar_url])

  const onChangeAvatar = async () => {
    if (!session?.user?.id) return
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
      quality: 0.8,
      aspect: [1, 1],
      allowsEditing: true,
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    setUploadingAvatar(true)
    try {
      const { publicUrl } = await uploadAvatar({
        userId: session.user.id,
        uri: asset.uri,
        contentType: asset.mimeType ?? 'image/jpeg',
      })
      await getSupabase()
        .from('profiles')
        .update({ avatar_url: publicUrl } as any)
        .eq('id', session.user.id)
      setAvatarUrl(publicUrl)
      await refreshProfile()
      toast.success(L('Profilbild aktualisiert', 'Profile picture updated'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const save = async () => {
    if (!profile?.id) return
    setSaving(true)
    try {
      const full_name = `${form.first_name} ${form.last_name}`.trim()
      const { error } = await getSupabase()
        .from('profiles')
        .update({
          first_name: form.first_name || null,
          last_name: form.last_name || null,
          phone: form.phone || null,
          gender: form.gender || null,
          bio: form.bio || null,
          full_name: full_name || null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', profile.id)
      if (error) throw error
      await refreshProfile()
      toast.success(L('Profil aktualisiert', 'Profile updated'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  const initial =
    form.first_name?.[0] ??
    profile?.full_name?.[0] ??
    profile?.email?.[0] ??
    '?'

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <AppHeader />
      <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header — back pill + brand title */}
          <View className="flex-row items-center mb-6" style={{ gap: 12 }}>
            <Pressable
              onPress={goBack}
              accessibilityLabel={L('Zurück', 'Back')}
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                backgroundColor: '#EFF6FF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#0064E0" />
            </Pressable>
            <Text className="text-[24px] font-black text-brand tracking-tight">
              {L('Stammdaten', 'Personal Data')}
            </Text>
          </View>

          {loading ? (
            <Card>
              <View className="items-center py-10">
                <ActivityIndicator color="#0064E0" />
              </View>
            </Card>
          ) : (
            <Card>
              {/* Avatar block */}
              <View className="items-center mb-6">
                <View
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 999,
                    overflow: 'hidden',
                    backgroundColor: '#EEF2FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 3,
                    borderColor: '#FFFFFF',
                    marginBottom: 10,
                    shadowColor: '#0F172A',
                    shadowOpacity: 0.08,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 4,
                  }}
                >
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={{ width: 112, height: 112 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 36 }}>
                      {initial.toUpperCase()}
                    </Text>
                  )}
                  {uploadingAvatar && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(15,23,42,0.45)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ActivityIndicator color="#FFFFFF" />
                    </View>
                  )}
                </View>
                <Pressable
                  onPress={onChangeAvatar}
                  disabled={uploadingAvatar}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                  }}
                >
                  <Camera size={14} color="#0064E0" />
                  <Text style={{ color: '#0064E0', fontSize: 13, fontWeight: '700' }}>
                    {L('Profilbild ändern', 'Edit profile picture')}
                  </Text>
                </Pressable>
              </View>

              {/* Fields */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                <Field
                  label={L('Vorname', 'First name')}
                  value={form.first_name}
                  onChangeText={(v) => setForm((p) => ({ ...p, first_name: v }))}
                  placeholder={L('Vorname', 'First name')}
                />
                <Field
                  label={L('Nachname', 'Last name')}
                  value={form.last_name}
                  onChangeText={(v) => setForm((p) => ({ ...p, last_name: v }))}
                  placeholder={L('Nachname', 'Last name')}
                />
                <Field
                  label={L('E-Mail', 'Email')}
                  value={form.email}
                  disabled
                  placeholder="email@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Field
                  label={L('Telefon', 'Phone')}
                  value={form.phone}
                  onChangeText={(v) => setForm((p) => ({ ...p, phone: v }))}
                  placeholder="0175..."
                  keyboardType="phone-pad"
                />
                <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                  <Text className="text-[13px] font-bold text-gray-700 dark:text-slate-300 mb-2">
                    {L('Geschlecht', 'Gender')}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(
                      [
                        { value: 'male', label_de: 'Männlich', label_en: 'Male' },
                        { value: 'female', label_de: 'Weiblich', label_en: 'Female' },
                        { value: 'other', label_de: 'Divers', label_en: 'Other' },
                      ] as { value: Gender; label_de: string; label_en: string }[]
                    ).map((opt) => {
                      const sel = form.gender === opt.value
                      return (
                        <Pressable
                          key={opt.value || 'none'}
                          onPress={() => setForm((p) => ({ ...p, gender: opt.value }))}
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 999,
                            borderWidth: 2,
                            backgroundColor: sel ? '#0064E0' : '#FFFFFF',
                            borderColor: sel ? '#0064E0' : '#E5E7EB',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '700',
                              color: sel ? '#FFFFFF' : '#475569',
                            }}
                          >
                            {locale === 'de' ? opt.label_de : opt.label_en}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>

                <View style={{ paddingVertical: 14 }}>
                  <Text className="text-[13px] font-bold text-gray-700 dark:text-slate-300 mb-2">
                    {L('Über mich', 'Bio')}
                  </Text>
                  <TextInput
                    value={form.bio}
                    onChangeText={(v) => setForm((p) => ({ ...p, bio: v }))}
                    placeholder={L('Kurze Beschreibung', 'Short description')}
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={3}
                    style={{
                      minHeight: 80,
                      backgroundColor: '#F8FAFC',
                      borderWidth: 1.5,
                      borderColor: '#E5E7EB',
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: '#0F172A',
                      textAlignVertical: 'top',
                    }}
                  />
                </View>
              </View>

              {/* CTAs */}
              <View style={{ marginTop: 16, gap: 10 }}>
                <Button
                  label={saving ? L('Speichert…', 'Saving…') : L('Profil speichern', 'Save profile')}
                  onPress={save}
                  loading={saving}
                  size="lg"
                />
                <Button
                  label={L('Abmelden', 'Logout')}
                  variant="secondary"
                  leftIcon={<LogOut size={16} color="#DC2626" />}
                  onPress={signOut}
                />
              </View>
            </Card>
          )}
        </ScrollView>
      </Screen>
    </View>
  )
}

// Per-row input. Disabled rows render with the muted backgroud used on
// the web for read-only fields like email.
function Field({
  label,
  value,
  onChangeText,
  placeholder,
  disabled,
  keyboardType,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText?: (v: string) => void
  placeholder?: string
  disabled?: boolean
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'numeric' | 'decimal-pad'
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
}) {
  return (
    <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
      <Text className="text-[13px] font-bold text-gray-700 dark:text-slate-300 mb-2">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#CBD5E1"
        editable={!disabled}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={{
          height: 44,
          backgroundColor: disabled ? '#F1F5F9' : '#F8FAFC',
          borderWidth: 1.5,
          borderColor: '#E5E7EB',
          borderRadius: 12,
          paddingHorizontal: 12,
          fontSize: 14,
          fontWeight: '500',
          color: disabled ? '#64748B' : '#0F172A',
        }}
      />
    </View>
  )
}
