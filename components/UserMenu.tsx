/**
 * User menu — dropdown that opens below the avatar in the AppHeader.
 * Shows the user's identity card (avatar/initials + name + email),
 * a link to settings, and a sign-out action.
 *
 * Mirrors the webapp's DropdownMenu in `components/dashboard/header.tsx`.
 */

import React from 'react'
import { Modal, View, Text, Pressable } from 'react-native'
import { useRouter } from 'expo-router'
import { Settings, LogOut } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'

interface UserMenuProps {
  visible: boolean
  onClose: () => void
}

export function UserMenu({ visible, onClose }: UserMenuProps) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const { profile, signOut } = useUser()

  if (!profile) return null

  const initials = (profile.full_name ?? profile.email ?? 'U')
    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  const handleSignOut = async () => {
    onClose()
    await signOut()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.20)' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: 92, right: 12, width: 260,
            backgroundColor: '#FFFFFF', borderRadius: 16,
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 6 },
            elevation: 12, overflow: 'hidden',
          }}
        >
          {/* Identity row */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{
              width: 40, height: 40, borderRadius: 999,
              backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: '#0064E0', fontWeight: '900', fontSize: 14 }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#0F172A' }} numberOfLines={1}>
                {profile.full_name ?? '—'}
              </Text>
              <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }} numberOfLines={1}>
                {profile.email ?? ''}
              </Text>
            </View>
          </View>

          {/* Settings */}
          <Pressable
            onPress={() => { onClose(); router.push('/(tabs)/settings') }}
            style={({ pressed }: { pressed: boolean }) => ({
              paddingHorizontal: 16, paddingVertical: 14,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: pressed ? '#F8FAFC' : 'transparent',
            })}
          >
            <Settings size={16} color="#64748B" />
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#0F172A', letterSpacing: 1, textTransform: 'uppercase' }}>
              {L('Einstellungen', 'Settings')}
            </Text>
          </Pressable>

          {/* Sign out */}
          <Pressable
            onPress={handleSignOut}
            style={({ pressed }: { pressed: boolean }) => ({
              paddingHorizontal: 16, paddingVertical: 14,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              backgroundColor: pressed ? '#FEF2F2' : 'transparent',
              borderTopWidth: 1, borderTopColor: '#F1F5F9',
            })}
          >
            <LogOut size={16} color="#DC2626" />
            <Text style={{ fontSize: 12, fontWeight: '900', color: '#DC2626', letterSpacing: 1, textTransform: 'uppercase' }}>
              {L('Abmelden', 'Sign out')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
