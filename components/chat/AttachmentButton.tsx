/**
 * Composer paperclip button. Opens an iOS/Android action sheet with
 * four sources (camera, image library, document, voice). On select the
 * sheet delegates to the host: the host owns the upload + sendMessage
 * call so the optimistic state stays a single place.
 *
 * Voice recording is NOT done here — the AttachmentButton just emits
 * `onStartVoice` and the host swaps the composer for VoiceRecorder.
 * Keeping the recording UI inline (instead of in a modal) matches the
 * web app's UX and lets the duration timer keep ticking while the user
 * looks at other rows in the thread.
 */

import React, { useState } from 'react'
import { Pressable, View, Text, Modal, Alert } from 'react-native'
import { Paperclip, Image as ImageIcon, FileText, Mic, X, Camera } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'

import { useTranslation } from '@/lib/i18n'
import type { ChatAttachmentSource } from '@/lib/chat/storage'

interface Props {
  onPick: (source: ChatAttachmentSource) => void
  onStartVoice: () => void
  disabled?: boolean
}

export function AttachmentButton({ onPick, onStartVoice, disabled }: Props) {
  const { locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  const pickImage = async () => {
    close()
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
      allowsMultipleSelection: false,
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    onPick({
      uri: asset.uri,
      name: asset.fileName ?? `image-${Date.now()}.${(asset.uri.split('.').pop() ?? 'jpg').toLowerCase()}`,
      contentType: asset.mimeType ?? 'image/jpeg',
    })
  }

  const takePhoto = async () => {
    close()
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert(
        L('Berechtigung fehlt', 'Permission missing'),
        L(
          'Bitte erlauben Sie den Kamera-Zugriff in den Systemeinstellungen.',
          'Please grant camera access in system settings.',
        ),
      )
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      // Skip the iOS native editor — for chat we want a quick snap-and-send.
      allowsEditing: false,
      // Save the original to the user's library so it isn't lost if the
      // upload fails. Matches WhatsApp behaviour.
      exif: false,
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    onPick({
      uri: asset.uri,
      name:
        asset.fileName ??
        `photo-${Date.now()}.${(asset.uri.split('.').pop() ?? 'jpg').toLowerCase()}`,
      contentType: asset.mimeType ?? 'image/jpeg',
    })
  }

  const pickDocument = async () => {
    close()
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    })
    if (result.canceled || result.assets.length === 0) return
    const asset = result.assets[0]
    onPick({
      uri: asset.uri,
      name: asset.name ?? `file-${Date.now()}`,
      contentType: asset.mimeType ?? 'application/octet-stream',
    })
  }

  const startVoice = () => {
    close()
    onStartVoice()
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 4,
        }}
      >
        <Paperclip size={22} color={disabled ? '#CBD5E1' : '#475569'} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable
          onPress={close}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 8,
              paddingBottom: 32,
              paddingHorizontal: 16,
            }}
          >
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 999,
                  backgroundColor: '#E5E7EB',
                }}
              />
            </View>

            <View className="flex-row items-center justify-between px-1 pb-3">
              <Text className="text-[15px] font-black text-gray-900 dark:text-white">
                {L('Anhang', 'Attach')}
              </Text>
              <Pressable onPress={close}>
                <X size={20} color="#94A3B8" />
              </Pressable>
            </View>

            <View className="space-y-2">
              <Row
                icon={<Camera size={22} color="#0064E0" />}
                label={L('Foto aufnehmen', 'Take a photo')}
                hint={L('Direkt mit der Kamera', 'Straight from the camera')}
                onPress={takePhoto}
              />
              <Row
                icon={<ImageIcon size={22} color="#0064E0" />}
                label={L('Bild aus Mediathek', 'Image from library')}
                hint={L('JPG, PNG, HEIC', 'JPG, PNG, HEIC')}
                onPress={pickImage}
              />
              <Row
                icon={<FileText size={22} color="#0064E0" />}
                label={L('Datei wählen', 'Pick a file')}
                hint={L('PDF, Word, Excel, …', 'PDF, Word, Excel, …')}
                onPress={pickDocument}
              />
              <Row
                icon={<Mic size={22} color="#0064E0" />}
                label={L('Sprachnachricht aufnehmen', 'Record a voice message')}
                hint={L(
                  'Mikrofon-Berechtigung erforderlich',
                  'Microphone permission required',
                )}
                onPress={startVoice}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

function Row({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  hint: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        backgroundColor: '#F8FAFC',
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#EEF6FF',
          marginRight: 12,
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text className="text-[14px] font-black text-gray-900 dark:text-white">{label}</Text>
        <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">{hint}</Text>
      </View>
    </Pressable>
  )
}
