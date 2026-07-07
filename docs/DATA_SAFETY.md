# Google Play — Data Safety Form

Answers ready to paste into Play Console → App content → Data safety.

## Data collection & sharing

**Does your app collect or share any of the required user data types?**
✅ Yes

**Is all of the user data collected by your app encrypted in transit?**
✅ Yes (TLS to Supabase; HTTPS for OpenStreetMap tiles; APNs/FCM for push)

**Do you provide a way for users to request that their data be deleted?**
✅ Yes — via the in-app data export, and at any time via lokshiftapp@gmail.com

## Data types collected

| Category | Type | Collected | Shared | Optional | Purpose |
|---|---|---|---|---|---|
| Personal info | Name | ✅ | ❌ | ❌ | App functionality |
| Personal info | Email address | ✅ | ❌ | ❌ | Account management, app functionality |
| Personal info | Phone number | ✅ | ❌ | ✅ | App functionality |
| Personal info | User IDs | ✅ | ❌ | ❌ | App functionality, fraud prevention |
| Personal info | Other info (Bio, Gender) | ✅ | ❌ | ✅ | App functionality |
| Location | Approximate location | ✅ | ❌ | ✅ | App functionality (clock-in fallback) |
| Location | Precise location | ✅ | ❌ | ✅ | App functionality (live ops map, clock-in) |
| Photos and videos | Photos | ✅ | ❌ | ✅ | App functionality (chat attachments, avatar) |
| Audio files | Voice or sound recordings | ✅ | ❌ | ✅ | App functionality (voice messages) |
| Files and docs | Files and docs | ✅ | ❌ | ✅ | App functionality (chat attachments) |
| Messages | Other in-app messages | ✅ | ❌ | ❌ | App functionality |
| App activity | App interactions | ✅ | ❌ | ✅ | Analytics, app functionality |
| App activity | In-app search history | ❌ | – | – | – |
| App info and performance | Crash logs | ✅ | ✅ | ✅ | Analytics (Sentry) |
| App info and performance | Diagnostics | ✅ | ✅ | ✅ | Analytics (Sentry) |
| Device or other IDs | Device ID | ✅ | ❌ | ❌ | App functionality (push registration) |

## "Shared" details

For each row marked Shared = ✅:

### Crash logs / Diagnostics

- **Shared with:** Sentry (Functional Software, Inc.)
- **Purpose:** Analytics, app functionality
- **Data type:** Stack traces, device model, OS version, app version, anonymised user ID
- **Linked:** No
- **User control:** Crash reporting is enabled by default and can be disabled by clearing the EXPO_PUBLIC_SENTRY_DSN at build time. Future client builds may expose a per-user opt-out toggle.

## Security practices

- ✅ Data is encrypted in transit
- ✅ Users can request that data be deleted
- ✅ App follows Google Play Families Policy: N/A (not aimed at children)
- ✅ Independent security review: planned for Q3 2026

## Permissions used

| Permission | Justification shown to user (DE) |
|---|---|
| `POST_NOTIFICATIONS` | "Push-Benachrichtigungen für neue Schichten, Anträge und Chatnachrichten." |
| `RECORD_AUDIO` | "LokShift verwendet das Mikrofon, um Sprachnachrichten im Team-Chat aufzunehmen." |
| `CAMERA` | "LokShift verwendet die Kamera, um Fotos direkt aus dem Chat aufzunehmen." |
| `READ_MEDIA_IMAGES` | "LokShift braucht Zugriff auf Ihre Mediathek, damit Sie Bilder im Chat senden können." |
| `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` | "LokShift erfasst Ihren Standort beim Ein-/Ausstempeln und für die Live-Einsatzkarte." |
| `ACCESS_BACKGROUND_LOCATION` | "Während einer aktiven Schicht aktualisiert LokShift Ihren Standort regelmäßig im Hintergrund, damit die Disposition Sie auf der Live-Karte sehen kann." |
| `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_LOCATION` | Required by Android 14+ for background location |
| `USE_BIOMETRIC` / `USE_FINGERPRINT` | Used by the optional biometric lock |
| `WAKE_LOCK` | Used briefly when receiving push notifications |
| `VIBRATE` | Used for notification vibration |

## Sensitive permissions declaration

When Play asks about sensitive / restricted permissions:

### Background Location

- **Why we need it:** To track active shift positions every 5 minutes so the
  dispatcher can see crews on the live operations map. This is critical for
  rail crews assigned to remote sites where visual confirmation is required.
- **User control:** The behaviour is opt-in via Settings → Security →
  "Standort während Schicht". A foreground service notification is shown for
  the entire duration. The collection ends automatically when the user
  clocks out.
- **Data minimisation:** Only the most recent position is retained (latitude,
  longitude, timestamp). No path history is stored.

### All Files Access

❌ Not requested. App uses scoped storage and the user-mediated SAF flow
via expo-document-picker / expo-image-picker.

### SMS / Call Log

❌ Not requested.

### Accessibility Service

❌ Not requested.
