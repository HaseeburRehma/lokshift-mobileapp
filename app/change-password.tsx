/**
 * Change password — pixel-parity port of the webapp's change-password/page.tsx.
 *
 * Same visual language as the login form state:
 *   - blue (#0064E0) background edge-to-edge
 *   - centered max-width column
 *   - white labels, white inputs (no card wrapper), white CTA
 *
 * Reached after first-login (must_change_password=true) or post-recovery.
 * Clears the must_change_password flag on success and lets AuthGuard
 * route the user to /(tabs)/dashboard.
 */

import React, { useState } from 'react'
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native'
import { Eye, EyeOff } from 'lucide-react-native'

import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { getSupabase } from '@/lib/supabase/client'
import { useUser } from '@/lib/user-context'

export default function ChangePasswordScreen() {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { refreshProfile } = useUser()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const onSubmit = async () => {
    if (loading) return

    if (password.length < 8) {
      toast.error(L('Passwort muss mindestens 8 Zeichen lang sein', 'Password must be at least 8 characters'))
      return
    }
    if (password !== confirm) {
      toast.error(L('Passwörter stimmen nicht überein', 'Passwords do not match'))
      return
    }

    setLoading(true)
    try {
      const supabase = getSupabase()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('profiles')
          .update({ must_change_password: false, updated_at: new Date().toISOString() } as any)
          .eq('id', user.id)
        await refreshProfile()
      }
      toast.success(L('Passwort erfolgreich geändert', 'Password updated'))
      // AuthGuard takes over from here.
    } catch (err: any) {
      toast.error(err?.message || L('Fehler beim Aktualisieren', 'Update failed'))
      setLoading(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0064E0' }}>
      {/* Background halos (subtle, matches webapp auth layout) */}
      <View pointerEvents="none" style={{ position: 'absolute', top: '-10%', left: '-10%', width: '50%', height: '40%', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999 }} />
      <View pointerEvents="none" style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '50%', height: '40%', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999 }} />

      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 384, alignSelf: 'center' }}>
          {/* Heading */}
          <View style={{ marginBottom: 32 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 26, fontWeight: '700', lineHeight: 32, marginBottom: 8 }}>
              {L('Initiales Passwort ändern', 'Set your password')}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.80)', fontSize: 14, lineHeight: 22 }}>
              {L(
                'Aus Sicherheitsgründen müssen Sie Ihr initiales Passwort ändern, bevor Sie fortfahren.',
                'For security, you must change your initial password before continuing.',
              )}
            </Text>
          </View>

          {/* Form */}
          <View style={{ gap: 20 }}>
            {/* New password */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '500', marginLeft: 4 }}>
                {L('Neues Passwort', 'New password')}
              </Text>
              <View style={{ position: 'relative', justifyContent: 'center' }}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder={L('Mindestens 8 Zeichen', 'At least 8 characters')}
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={{ height: 56, backgroundColor: '#FFFFFF', borderRadius: 12, paddingLeft: 16, paddingRight: 48, color: '#111827', fontSize: 16 }}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  style={{ position: 'absolute', right: 12, padding: 4 }}
                  accessibilityLabel={showPassword ? L('Passwort verbergen', 'Hide password') : L('Passwort anzeigen', 'Show password')}
                >
                  {showPassword ? <EyeOff size={20} color="#9CA3AF" /> : <Eye size={20} color="#9CA3AF" />}
                </Pressable>
              </View>
            </View>

            {/* Confirm */}
            <View style={{ gap: 6 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '500', marginLeft: 4 }}>
                {L('Passwort bestätigen', 'Confirm password')}
              </Text>
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder={L('Passwort wiederholen', 'Repeat password')}
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                style={{ height: 56, backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, color: '#111827', fontSize: 16 }}
              />
            </View>

            <Pressable
              onPress={onSubmit}
              disabled={loading || !password || !confirm}
              style={{
                height: 56, marginTop: 16, borderRadius: 12, backgroundColor: '#FFFFFF',
                alignItems: 'center', justifyContent: 'center',
                opacity: (loading || !password || !confirm) ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#0064E0', fontWeight: '700', fontSize: 16 }}>
                {loading ? L('Wird gespeichert…', 'Saving…') : L('Passwort speichern', 'Save password')}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}
