/**
 * Notification preferences — org-wide toggles. Mirrors the webapp's
 * /dashboard/settings/notifications page exactly: three channel cards
 * (Email, WhatsApp, In-app) and an event-triggers list. Writes go to
 * the same `company_settings` row, so changes on either side are
 * reflected instantly.
 *
 * Admin only. Dispatcher / employee see a friendly gate.
 */

import React from 'react'
import { View, Text, ScrollView, Pressable, Switch } from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Bell, Mail, MessageSquare, Zap } from 'lucide-react-native'

import { Screen } from '@/components/Screen'
import { Card } from '@/components/Card'
import { toast } from '@/components/Toast'
import { useTranslation } from '@/lib/i18n'
import { useUser } from '@/lib/user-context'
import { canManageUsers } from '@/lib/rbac/permissions'
import { useCompanySettings, type CompanySettings } from '@/hooks/useCompanySettings'
import { useSafeBack } from '@/lib/use-safe-back'

interface ChannelDef {
  key: keyof CompanySettings
  icon: React.ReactNode
  color: string
  bg: string
  label_de: string
  label_en: string
  desc_de: string
  desc_en: string
}

interface AlertDef {
  key: keyof CompanySettings
  label_de: string
  label_en: string
  desc_de: string
  desc_en: string
}

const CHANNELS: ChannelDef[] = [
  {
    key: 'email_enabled',
    icon: <Mail size={20} color="#0064E0" />,
    color: '#0064E0',
    bg: '#EFF6FF',
    label_de: 'E-Mail-Benachrichtigungen',
    label_en: 'Email notifications',
    desc_de: 'Updates per Firmen-E-Mail erhalten.',
    desc_en: 'Receive updates via company email.',
  },
  {
    key: 'whatsapp_enabled',
    icon: <MessageSquare size={20} color="#10B981" />,
    color: '#10B981',
    bg: '#ECFDF5',
    label_de: 'WhatsApp-Hinweise',
    label_en: 'WhatsApp alerts',
    desc_de: 'Echtzeit-Updates via Twilio WhatsApp.',
    desc_en: 'Real-time updates via Twilio WhatsApp.',
  },
  {
    key: 'push_enabled',
    icon: <Bell size={20} color="#F59E0B" />,
    color: '#F59E0B',
    bg: '#FFFBEB',
    label_de: 'Push & In-App',
    label_en: 'Push & in-app',
    desc_de: 'Mobile Push und Benachrichtigungs-Glocke.',
    desc_en: 'Mobile push and notification bell.',
  },
]

const ALERTS: AlertDef[] = [
  {
    key: 'alert_shift_assigned',
    label_de: 'Schicht zugewiesen',
    label_en: 'Shift assigned',
    desc_de: 'Wenn der/die Disposition einem Mitarbeiter eine Schicht zuweist.',
    desc_en: 'When dispatch assigns a shift to an employee.',
  },
  {
    key: 'alert_shift_rejected',
    label_de: 'Schicht abgelehnt',
    label_en: 'Shift rejected',
    desc_de: 'Wenn ein Mitarbeiter eine zugewiesene Schicht ablehnt.',
    desc_en: 'When an employee rejects an assigned shift.',
  },
  {
    key: 'alert_absence_submitted',
    label_de: 'Urlaubs- oder Krankmeldung',
    label_en: 'Vacation / sick-leave submitted',
    desc_de: 'Wenn ein Mitarbeiter eine Abwesenheit beantragt.',
    desc_en: 'When an employee submits an absence request.',
  },
  {
    key: 'alert_job_completed',
    label_de: 'Auftrag abgeschlossen',
    label_en: 'Job completed',
    desc_de: 'Wenn ein Mitarbeiter einen Einsatz abschließt.',
    desc_en: 'When an employee completes a shift.',
  },
]

export default function NotificationSettingsScreen() {
  const router = useRouter()
  const goBack = useSafeBack('/(tabs)/settings')
  const { t, locale } = useTranslation()
  const L = (de: string, en: string) => (locale === 'de' ? de : en)
  const { role } = useUser()
  const { settings, loading, update } = useCompanySettings()

  if (!canManageUsers(role)) {
    return (
      <Screen className="px-6 items-center justify-center" noTapToDismiss>
        <Text className="text-gray-400 dark:text-slate-500 text-center">
          {L(
            'Nur Administratoren können Benachrichtigungen verwalten.',
            'Only administrators can manage notifications.',
          )}
        </Text>
      </Screen>
    )
  }

  const onToggle = async (key: keyof CompanySettings) => {
    if (!settings) return
    try {
      await update({ [key]: !settings[key] } as Partial<CompanySettings>)
      toast.success(L('Gespeichert', 'Saved'))
    } catch (err: any) {
      toast.error(err?.message ?? t('common.error'))
    }
  }

  return (
    <Screen background="#F9FAFB" className="bg-gray-50 dark:bg-slate-950" noTapToDismiss>
      <View className="flex-row items-center px-5 pt-4 pb-2">
        <Pressable onPress={goBack} className="p-2 -ml-2">
          <ChevronLeft size={26} color="#0064E0" />
        </Pressable>
        <Text className="text-[17px] font-black text-gray-900 dark:text-white ml-2">
          {L('Benachrichtigungen', 'Notifications')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 80 }}>
        <View className="flex-row items-center mb-4">
          <View className="w-14 h-14 rounded-3xl bg-brand items-center justify-center mr-3">
            <Bell size={26} color="#fff" />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-black text-gray-900 dark:text-white">
              {L('Kanäle und Auslöser', 'Channels and triggers')}
            </Text>
            <Text className="text-[12px] text-gray-400 dark:text-slate-500 mt-0.5">
              {L(
                'Gilt für die gesamte Organisation.',
                'Applies to the whole organisation.',
              )}
            </Text>
          </View>
        </View>

        {loading || !settings ? (
          <Card>
            <Text className="text-gray-400 dark:text-slate-500 text-center py-4">{L('Lädt…', 'Loading…')}</Text>
          </Card>
        ) : (
          <>
            {/* Channels */}
            <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 mb-2 ml-1">
              {L('Kanäle', 'Channels')}
            </Text>
            <View className="space-y-3 mb-6">
              {CHANNELS.map((ch) => (
                <Card key={ch.key as string}>
                  <View className="flex-row items-center">
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        backgroundColor: ch.bg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      {ch.icon}
                    </View>
                    <View className="flex-1 pr-2">
                      <Text className="text-[14px] font-black text-gray-900 dark:text-white">
                        {L(ch.label_de, ch.label_en)}
                      </Text>
                      <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                        {L(ch.desc_de, ch.desc_en)}
                      </Text>
                    </View>
                    <Switch
                      value={!!settings[ch.key]}
                      onValueChange={() => onToggle(ch.key)}
                      trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
                    />
                  </View>
                </Card>
              ))}
            </View>

            {/* Event triggers */}
            <View className="flex-row items-center mb-2 ml-1">
              <Zap size={14} color="#6B7280" />
              <Text className="text-[11px] font-black uppercase tracking-widest text-gray-400 dark:text-slate-500 ml-1.5">
                {L('Ereignisauslöser', 'Event triggers')}
              </Text>
            </View>
            <Card style={{ padding: 0 } as any}>
              {ALERTS.map((alert, i) => (
                <View
                  key={alert.key as string}
                  className="flex-row items-center px-4 py-3"
                  style={{
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: '#F1F5F9',
                  }}
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-[13px] font-bold text-gray-900 dark:text-white">
                      {L(alert.label_de, alert.label_en)}
                    </Text>
                    <Text className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                      {L(alert.desc_de, alert.desc_en)}
                    </Text>
                  </View>
                  <Switch
                    value={!!settings[alert.key]}
                    onValueChange={() => onToggle(alert.key)}
                    trackColor={{ true: '#0064E0', false: '#D1D5DB' }}
                  />
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  )
}
