/**
 * Avatar dropdown of the AppHeader — mobile port of the webapp header's
 * DropdownMenu: identity card (avatar, name, email), "Einstellungen",
 * "Abmelden". The identity card opens the own profile (Stammdaten).
 */

import React from 'react'
import { Modal, View, Text, Pressable, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronRight, LogOut, Settings, User as UserIcon } from 'lucide-react-native'

import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'

interface Props {
  visible: boolean
  onClose: () => void
}

export function HeaderUserMenu({ visible, onClose }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { profile, session, signOut } = useUser()

  if (!profile) return null

  const go = (href: string) => {
    onClose()
    router.push(href as any)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.15)' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: insets.top + 60, right: 12, width: 264,
            backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: '#F1F5F9', padding: 8,
            shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 10 },
            elevation: 14,
          }}
        >
          {/* Identity */}
          <Pressable onPress={() => go('/profile')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <View style={{
                width: 44, height: 44, borderRadius: 16, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE',
                alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 14,
              }}>
                {profile.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: 44, height: 44 }} />
                ) : (
                  <UserIcon size={20} color="#2563EB" />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                  {profile.full_name ?? L('Benutzer', 'User')}
                </Text>
                <Text style={{ fontSize: 10, fontWeight: '500', color: '#94A3B8', marginTop: 3 }} numberOfLines={1}>
                  {profile.email ?? session?.user?.email ?? ''}
                </Text>
              </View>
              <ChevronRight size={14} color="#CBD5E1" />
            </View>
          </Pressable>

          <View style={{ height: 1, backgroundColor: '#F8FAFC', marginHorizontal: 8 }} />

          <Pressable onPress={() => go('/(tabs)/settings')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12 }}>
              <Settings size={16} color="#94A3B8" />
              <Text style={{ marginLeft: 12, fontSize: 12, fontWeight: '700', color: '#475569', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                {L('Einstellungen', 'Settings')}
              </Text>
            </View>
          </Pressable>

          <View style={{ height: 1, backgroundColor: '#F8FAFC', marginHorizontal: 8 }} />

          <Pressable
            onPress={async () => {
              onClose()
              await signOut()
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12 }}>
              <LogOut size={16} color="#F87171" />
              <Text style={{ marginLeft: 12, fontSize: 12, fontWeight: '900', color: '#EF4444', letterSpacing: 1.2, textTransform: 'uppercase' }}>
                {L('Abmelden', 'Sign out')}
              </Text>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
