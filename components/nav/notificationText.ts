/**
 * Notification display helpers — port of the webapp's NotificationPanel
 * helpers (components/notifications/NotificationPanel.tsx):
 *
 *   translateNotification — new rows are stored in German; historic rows
 *     may still be English. Flip known titles / bodies to the UI locale
 *     in both directions; anything unknown is shown as-is.
 *   timeAgo — "gerade eben", "vor 5 Min.", "vor 3 Std.", "vor 2 Tag(en)".
 */

type Locale = 'de' | 'en'

const EN_TO_DE_TITLES: Record<string, string> = {
  '🏢 New Customer Added': '🏢 Neuer Kunde angelegt',
  '🏢 New customer added': '🏢 Neuer Kunde angelegt',
  '✅ Plan Confirmed': '✅ Einsatzplan bestätigt',
  '✅ Plan confirmed': '✅ Einsatzplan bestätigt',
  '✅ Plan Confirmed by Employee': '✅ Einsatzplan vom Mitarbeiter bestätigt',
  '✅ Plan confirmed by employee': '✅ Einsatzplan vom Mitarbeiter bestätigt',
  '❌ Plan Rejected': '❌ Einsatzplan abgelehnt',
  '❌ Plan rejected': '❌ Einsatzplan abgelehnt',
  '✅ Deployment plan confirmed': '✅ Einsatzplan bestätigt',
  '✅ Deployment Plan Confirmed': '✅ Einsatzplan bestätigt',
  'Deployment plan confirmed': 'Einsatzplan bestätigt',
  'Deployment Plan Confirmed': 'Einsatzplan bestätigt',
  '❌ Deployment plan rejected': '❌ Einsatzplan abgelehnt',
  '❌ Deployment Plan Rejected': '❌ Einsatzplan abgelehnt',
  'Deployment plan rejected': 'Einsatzplan abgelehnt',
  '📋 New Shift Assigned': '📋 Neue Schicht zugewiesen',
  '📋 New shift assigned': '📋 Neue Schicht zugewiesen',
  '📋 Shift Updated': '📋 Schicht aktualisiert',
  '📋 Shift updated': '📋 Schicht aktualisiert',
  '✅ Time Entry Approved': '✅ Zeiteintrag genehmigt',
  '✅ Time entry approved': '✅ Zeiteintrag genehmigt',
  '❌ Time Entry Rejected': '❌ Zeiteintrag abgelehnt',
  '❌ Time entry rejected': '❌ Zeiteintrag abgelehnt',
  '✅ Per Diem Approved': '✅ Spesen genehmigt',
  '✅ Per diem approved': '✅ Spesen genehmigt',
  '❌ Per Diem Rejected': '❌ Spesen abgelehnt',
  '❌ Per diem rejected': '❌ Spesen abgelehnt',
  '🔄 Change Request': '🔄 Änderungsanfrage',
  '🔄 Change request': '🔄 Änderungsanfrage',
  '📅 Event Created Successfully': '📅 Termin erfolgreich erstellt',
  '📅 Event created successfully': '📅 Termin erfolgreich erstellt',
  '📅 Event Updated': '📅 Termin aktualisiert',
  '📅 Event updated': '📅 Termin aktualisiert',
  '📅 Event Deleted': '📅 Termin gelöscht',
  '📅 Event deleted': '📅 Termin gelöscht',
}

const DE_TO_EN_TITLES: Record<string, string> = {
  '🏢 Neuer Kunde angelegt': '🏢 New customer added',
  '✅ Einsatzplan bestätigt': '✅ Plan confirmed',
  '✅ Einsatzplan vom Mitarbeiter bestätigt': '✅ Plan confirmed by employee',
  '❌ Einsatzplan abgelehnt': '❌ Plan rejected',
  '📋 Neue Schicht zugewiesen': '📋 New shift assigned',
  '📋 Schicht aktualisiert': '📋 Shift updated',
  '✅ Zeiteintrag genehmigt': '✅ Time entry approved',
  '❌ Zeiteintrag abgelehnt': '❌ Time entry rejected',
  '✅ Spesen genehmigt': '✅ Per diem approved',
  '❌ Spesen abgelehnt': '❌ Per diem rejected',
  '🔄 Änderungsanfrage': '🔄 Change request',
  '📅 Termin erfolgreich erstellt': '📅 Event created successfully',
  '📅 Termin aktualisiert': '📅 Event updated',
  '📅 Termin gelöscht': '📅 Event deleted',
}

export function translateNotification(
  title: string,
  body: string | null | undefined,
  locale: Locale,
): { title: string; body: string } {
  const t = title ?? ''
  if (locale === 'de') {
    let nextTitle = EN_TO_DE_TITLES[t] ?? t
    if (t.startsWith('📅 Added to event:')) nextTitle = t.replace('📅 Added to event:', '📅 Hinzugefügt zu Termin:')
    else if (t.startsWith('⏰ Reminder:')) nextTitle = t.replace('⏰ Reminder:', '⏰ Erinnerung:')
    else if (t.startsWith('💬 New message from ')) nextTitle = t.replace('💬 New message from ', '💬 Neue Nachricht von ')

    const nextBody = (body ?? '')
      .replace(/^A new customer "([^"]+)" was added\.$/, 'Ein neuer Kunde „$1" wurde angelegt.')
      .replace(/^You have been assigned to: /, 'Sie wurden zugewiesen: ')
      .replace(/^You have been invited to /, 'Sie wurden zu ')
      .replace(/^You have been added to "([^"]+)" on (.+?)\.?$/, 'Sie wurden zu „$1" am $2 eingeladen.')
      .replace(/^Starts in /, 'Beginnt in ')
      .replace(/(\d+)\s*min\b/g, '$1 Min.')
      .replace(/hour\(s\)/g, 'Stunde(n)')
      .replace(/day\(s\)/g, 'Tag(e)')
      .replace(/week\(s\)/g, 'Woche(n)')
      .replace(/^You have been assigned a new shift on (.+?)\. Please confirm\.$/, 'Ihnen wurde eine neue Schicht am $1 zugewiesen. Bitte bestätigen.')
      .replace(/^Your shift starting (.+?) has been updated\.$/, 'Ihre Schicht ab $1 wurde aktualisiert.')
      .replace(
        /^(.+?) has (confirmed|rejected) the shift on (.+?)$/,
        (_m, who, what, when) => `${who} hat die Schicht am ${when} ${what === 'confirmed' ? 'bestätigt' : 'abgelehnt'}`,
      )
      .replace(/^Your time entry for (.+?) has been approved\.$/, 'Ihr Zeiteintrag vom $1 wurde genehmigt.')
      .replace(/^Your time entry has been approved\.$/, 'Ihr Zeiteintrag wurde genehmigt.')
      .replace(/^Your time entry for (.+?) has been rejected\.$/, 'Ihr Zeiteintrag vom $1 wurde abgelehnt.')
      .replace(/^Your per diem claim has been approved\.$/, 'Ihre Spesenabrechnung wurde genehmigt.')
      .replace(/^Your per diem claim has been rejected\.$/, 'Ihre Spesenabrechnung wurde abgelehnt.')
      .replace(
        /^(.+?) requests a change for the shift on (.+?): "(.+)"$/,
        (_m, who, when, msg) => `${who} bittet um eine Änderung der Schicht am ${when}: „${msg}"`,
      )
    return { title: nextTitle, body: nextBody }
  }

  let nextTitle = DE_TO_EN_TITLES[t] ?? t
  if (t.startsWith('📅 Hinzugefügt zu Termin:')) nextTitle = t.replace('📅 Hinzugefügt zu Termin:', '📅 Added to event:')
  else if (t.startsWith('⏰ Erinnerung:')) nextTitle = t.replace('⏰ Erinnerung:', '⏰ Reminder:')
  else if (t.startsWith('💬 Neue Nachricht von ')) nextTitle = t.replace('💬 Neue Nachricht von ', '💬 New message from ')

  const nextBody = (body ?? '')
    .replace(/^Ein neuer Kunde „([^"]+)" wurde angelegt\.$/, 'A new customer "$1" was added.')
    .replace(/^Sie wurden zugewiesen: /, 'You have been assigned to: ')
    .replace(/^Sie wurden zu /, 'You have been invited to ')
    .replace(/ am (.+?) eingeladen/, ' on $1')
    .replace(/ eingeladen$/, '')
    .replace(/^Beginnt in /, 'Starts in ')
    .replace(/Min\.\b/, 'min')
    .replace(/Stunde\(n\)/, 'hour(s)')
    .replace(/Tag\(e\)/, 'day(s)')
    .replace(/Woche\(n\)/, 'week(s)')
    .replace(/^Ihnen wurde eine neue Schicht am (.+?) zugewiesen\. Bitte bestätigen\.$/, 'You have been assigned a new shift on $1. Please confirm.')
    .replace(/^Ihre Schicht ab (.+?) wurde aktualisiert\.$/, 'Your shift starting $1 has been updated.')
    .replace(
      /^([^\s]+) hat die Schicht am (.+?) (bestätigt|abgelehnt)$/,
      (_m, who, when, what) => `${who} has ${what === 'bestätigt' ? 'confirmed' : 'rejected'} the shift on ${when}`,
    )
    .replace(/^Ihr Zeiteintrag vom (.+?) wurde genehmigt\.$/, 'Your time entry for $1 has been approved.')
    .replace(/^Ihr Zeiteintrag wurde genehmigt\.$/, 'Your time entry has been approved.')
    .replace(/^Ihr Zeiteintrag vom (.+?) wurde abgelehnt\.$/, 'Your time entry for $1 has been rejected.')
    .replace(/^Ihre Spesenabrechnung wurde genehmigt\.$/, 'Your per diem claim has been approved.')
    .replace(/^Ihre Spesenabrechnung wurde abgelehnt\.$/, 'Your per diem claim has been rejected.')
    .replace(
      /^(.+?) bittet um eine Änderung der Schicht am (.+?): „(.+)"$/,
      (_m, who, when, msg) => `${who} requests a change for the shift on ${when}: "${msg}"`,
    )
  return { title: nextTitle, body: nextBody }
}

export function timeAgo(dateStr: string | null | undefined, locale: Locale): string {
  const ts = dateStr ? new Date(dateStr).getTime() : NaN
  if (!Number.isFinite(ts)) return '—'
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000))
  if (locale === 'de') {
    if (mins < 1) return 'gerade eben'
    if (mins < 60) return `vor ${mins} Min.`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `vor ${hrs} Std.`
    return `vor ${Math.floor(hrs / 24)} Tag(en)`
  }
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
