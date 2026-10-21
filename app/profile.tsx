/**
 * Stammdaten / Personal Data — own-profile editor.
 *
 * Pixel-parity port of the webapp's /dashboard/settings/personal-data
 * page. Layout:
 *   - blue-50 back circle + "Stammdaten" title (brand blue, text-2xl)
 *   - white rounded-3xl card containing:
 *       • 112px avatar (white ring, blue-500 initial fallback) +
 *         "Profilbild ändern" link
 *       • Vorname / Nachname / E-Mail (disabled) / Telefon /
 *         Geschlecht (segmented, replaces the web <select>) / Über mich
 *   - "Abmelden" (red outline) + "Profil speichern" (blue) — web mobile order
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
      <Screen background="#F8FAFC" noTapToDismiss>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header — web: w-9 h-9 bg-blue-50 back circle + text-2xl brand title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24, gap: 12 }}>
            <Pressable
              onPress={goBack}
              accessibilityRole="button"
              accessibilityLabel={L('Zurück', 'Back')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: '#EFF6FF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color="#2563EB" />
            </Pressable>
            <Text style={{ fontSize: 24, fontWeight: '700', color: '#0064E0', letterSpacing: -0.3 }}>
              {L('Stammdaten', 'Personal Data')}
            </Text>
          </View>

          {loading ? (
            <View style={[CARD, { alignItems: 'center', paddingVertical: 48 }]}>
              <ActivityIndicator color="#3B82F6" />
            </View>
          ) : (
            <View style={CARD}>
              {/* Avatar — web: w-28 h-28 border-[3px] border-white shadow-md ring-1 ring-slate-100 */}
              <View style={{ alignItems: 'center', marginBottom: 24 }}>
                <View
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: 56,
                    marginBottom: 12,
                    backgroundColor: '#FFFFFF',
                    shadowColor: '#0F172A',
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 4,
                  }}
                >
                  <View
                    style={{
                      width: 112,
                      height: 112,
                      borderRadius: 56,
                      overflow: 'hidden',
                      borderWidth: 3,
                      borderColor: '#FFFFFF',
                      backgroundColor: '#3B82F6',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    ) : (
                      <Text style={{ color: '#FFFFFF', fontWeight: '900', fontSize: 30 }}>{initial.toUpperCase()}</Text>
                    )}
                    {uploadingAvatar ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <ActivityIndicator color="#FFFFFF" />
                      </View>
                    ) : null}
                  </View>
                </View>
                <Pressable
                  onPress={onChangeAvatar}
                  disabled={uploadingAvatar}
                  accessibilityRole="button"
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    opacity: uploadingAvatar ? 0.5 : 1,
                  }}
                >
                  <Camera size={16} color="#2563EB" />
                  <Text style={{ color: '#2563EB', fontSize: 14, fontWeight: '600' }}>
                    {L('Profilbild ändern', 'Edit profile picture')}
                  </Text>
                </Pressable>
              </View>

              {/* Fields — web: label above input on mobile, border-b slate-100 rows */}
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
                <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                  <Text style={LABEL}>{L('Geschlecht', 'Gender')}</Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
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
                          // Tapping the active option clears it (web: "Bitte wählen").
                          onPress={() => setForm((p) => ({ ...p, gender: sel ? '' : opt.value }))}
                          accessibilityRole="button"
                          accessibilityState={{ selected: sel }}
                          style={{
                            flex: 1,
                            height: 40,
                            borderRadius: 8,
                            borderWidth: 1,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: sel ? '#EFF6FF' : '#F8FAFC',
                            borderColor: sel ? '#2563EB' : '#E2E8F0',
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: sel ? '700' : '500', color: sel ? '#2563EB' : '#334155' }}>
                            {locale === 'de' ? opt.label_de : opt.label_en}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>

                <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                  <Text style={LABEL}>{L('Über mich', 'Bio')}</Text>
                  <TextInput
                    value={form.bio}
                    onChangeText={(v) => setForm((p) => ({ ...p, bio: v }))}
                    placeholder={L('Kurze Beschreibung', 'Short description')}
                    placeholderTextColor="#CBD5E1"
                    multiline
                    numberOfLines={3}
                    style={[INPUT, { minHeight: 84, paddingVertical: 10, textAlignVertical: 'top' }]}
                  />
                </View>
              </View>

              {/* Buttons — web mobile order: Abmelden (red outline), then Profil speichern */}
              <View style={{ marginTop: 28, gap: 12 }}>
                <Pressable
                  onPress={signOut}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    height: 44,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#FECACA',
                    backgroundColor: pressed ? '#FEF2F2' : '#FFFFFF',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  })}
                >
                  <LogOut size={16} color="#DC2626" />
                  <Text style={{ color: '#DC2626', fontSize: 14, fontWeight: '600' }}>{L('Abmelden', 'Logout')}</Text>
                </Pressable>
                <Pressable
                  onPress={save}
                  disabled={saving}
                  accessibilityRole="button"
                  style={({ pressed }) => ({
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: pressed ? '#1D4ED8' : '#2563EB',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: saving ? 0.6 : 1,
                  })}
                >
                  {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>
                    {saving ? L('Speichert…', 'Saving…') : L('Profil speichern', 'Save profile')}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </Screen>
    </View>
  )
}

// Web card: bg-white rounded-3xl border border-slate-100 shadow-sm p-6
const CARD = {
  backgroundColor: '#FFFFFF',
  borderRadius: 24,
  borderWidth: 1,
  borderColor: '#F1F5F9',
  padding: 24,
} as const

// Web label: text-sm font-semibold text-slate-700
const LABEL = { fontSize: 14, fontWeight: '600' as const, color: '#334155', marginBottom: 8 }

// Web input: text-sm bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-slate-700 font-medium
const INPUT = {
  backgroundColor: '#F8FAFC',
  borderWidth: 1,
  borderColor: '#E2E8F0',
  borderRadius: 8,
  paddingHorizontal: 12,
  fontSize: 14,
  fontWeight: '500' as const,
  color: '#334155',
}

// Per-row input. Disabled rows render with the muted slate-100 background
// the web uses for read-only fields like email.
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
    <View style={{ paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
      <Text style={LABEL}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#CBD5E1"
        editable={!disabled}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[
          INPUT,
          { height: 40 },
          disabled ? { backgroundColor: '#F1F5F9', color: '#64748B' } : null,
        ]}
      />
    </View>
  )
}
