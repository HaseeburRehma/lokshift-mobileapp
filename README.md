# Lokshift Mobile

React Native (Expo SDK 51) companion app for the Lokshift platform.
Shares the same Supabase backend and RLS policies as the webapp at
`../locshift` — same login, same data, same RBAC.

## Stack

| Concern                | Choice                                |
|------------------------|---------------------------------------|
| Framework              | Expo SDK 51                           |
| Language               | TypeScript (strict)                   |
| Navigation             | Expo Router (file-based)              |
| Styling                | NativeWind (Tailwind for RN)          |
| Backend                | Supabase (shared with webapp)         |
| Auth storage           | expo-secure-store (Keychain/Keystore) |
| Icons                  | lucide-react-native                   |
| Push notifications     | expo-notifications (scaffold only)    |

## Quick start

```bash
pnpm install
cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL + ANON_KEY
pnpm start             # then press i for iOS or a for Android
```

Open it in **Expo Go** on your phone, or in a simulator. The Supabase
client reuses whatever account already exists in the webapp.

## Project map

```
app/
  _layout.tsx           Providers + auth guard
  index.tsx             Entry redirect
  (auth)/
    login.tsx           Email + password + remember me + forgot link
    forgot-password.tsx Two-step flow (request → OTP)
  (tabs)/
    _layout.tsx         Bottom tabs (5 tabs)
    dashboard.tsx       Role-branched home
    times.tsx           Time-entry list + floating add
    plans.tsx           Plan list grouped by date
    notifications.tsx   Live feed via Supabase realtime
    profile.tsx         Personal data + language + sign out
  change-password.tsx   First-login & post-reset forced flow
  plans/
    [id].tsx            Plan detail w/ employee confirm/reject

lib/
  supabase/client.ts    Singleton w/ SecureStore-chunked session storage
  user-context.tsx      Session + profile + role provider
  i18n/index.tsx        EN + DE dictionary with AsyncStorage persistence
  rbac/permissions.ts   Role normalisation + can*() helpers
  time-utils.ts         Shift math (handles overnight crossing midnight)
  types/index.ts        Profile / Plan / TimeEntry / NotificationRow
  notifications/push.ts Expo push registration scaffold

hooks/
  useDashboardStats.ts  KPIs + upcoming + recent for the home screen
  useTimeEntries.ts     CRUD + grouped-by-date selector
  usePlans.ts           List + status update with notification side-effect
  useNotifications.ts   Live feed via supabase.realtime channels

components/
  Screen, Button, Card, FormField, StatusBadge, Toast, TimeEntrySheet
```

## Features completed (v1)

- ✅ Email + password sign-in with "Remember me" (signs out on background
      when unchecked)
- ✅ Forgot password — reuses the webapp's `/api/auth/send-recovery`
      endpoint so the user gets the same email (link **and** 6-digit
      OTP); both flows verified into a recovery session.
- ✅ First-login forced password change (driven by
      `profiles.must_change_password`)
- ✅ Role-aware dashboard:
      Admin/Dispatcher → KPIs + upcoming shifts + quick actions
      Employee        → today's plan + weekly hours + balance
- ✅ Times: list grouped by date, add/edit modal, delete (managerial),
      live net-hours preview, overnight + hotel address fields
- ✅ Plans: grouped list, detail screen, employee confirm/reject with
      side-effect notification
- ✅ Notifications: live feed via Supabase realtime, mark all read
- ✅ German + English with persistent locale, in-app toggle
- ✅ Supabase session stored in SecureStore (Keychain on iOS, Keystore
      on Android), chunked to bypass the 2KB-per-key limit

## What's left for v2

- Push notifications dispatch (registration scaffold is in
  `lib/notifications/push.ts`; the `device_tokens` table + server-side
  dispatcher still need to be added)
- Bulk plan operations (managerial only — copy across days/employees)
- Per-diem, holiday-bonus, reports — only the highest-traffic modules
  are in v1; the rest can be added with the same pattern as Times/Plans
- Branded icons + splash (see `assets/README.md`)

## Backend assumptions (already applied for the webapp)

- `profiles.must_change_password BOOLEAN DEFAULT false`
- `holiday_bonuses.bonus_type` enum
- `time_entries.overnight_stay BOOLEAN DEFAULT false` + `hotel_address TEXT`
- RLS policies that restrict employees to own rows on
  `time_entries` / `plans`, and allow admin/dispatcher to see all rows
  in their organization

## Building for stores

```bash
pnpm dlx eas-cli login

# iOS — needs an Apple Developer account configured in EAS
pnpm build:ios

# Android — EAS generates a keystore on first build
pnpm build:android
```

The `app.json` is set up with bundle ID `app.lokshift.mobile`. Bump
`version` (and `ios.buildNumber` / `android.versionCode`) for each
release.

## Common issues

- **"Missing EXPO_PUBLIC_SUPABASE_URL" at startup**: copy `.env.example`
  to `.env` and fill it in.
- **Forgot-password says "Failed to send"**: `EXPO_PUBLIC_WEBAPP_URL`
  isn't set, so the recovery email falls back to Supabase's default
  template (which only ships ONE of {link, OTP}). Set it to your Vercel
  deployment URL.
- **Login succeeds but the dashboard never loads**: the user has no
  `profiles` row — create one via the webapp's user management screen.
