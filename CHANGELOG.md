# Changelog

All notable changes to LokShift Mobile are tracked here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the version numbers follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] – Initial release

First production release for App Store and Google Play.

### Features

#### Authentication & onboarding
- Email/password login with "remember me"
- 3-step registration: email → OTP verification → password setup with strength meter
- 4-step forgot-password flow (email → OTP → new password → success)
- Forced password change on first login
- Onboarding carousel + permissions screen
- Biometric unlock (Face ID / Touch ID) with 30 second background grace

#### Time tracking
- Clock-in / clock-out with foreground geolocation
- Breaks with accumulated total
- Planned vs. actual entries
- Auto-calculated Spesen (€14 partial / €28 overnight)
- Betriebsstellen start + destination, Gastfahrt switch, overnight + hotel address
- Admin "log on behalf of" picker
- Admin verification queue
- Background location updates every 5 minutes during active shifts (opt-in)

#### Shifts & plans
- Plans list grouped by date with full detail page
- Confirm / reject with reason modal
- Shift templates with picker integrated into new + bulk creation
- Bulk plan creation (multi-date × multi-employee)
- CSV import with row preview and per-row error reporting

#### Live operations
- KPI strip (Total / On mission / On break)
- Real-time map with active employee + upcoming-shift pins
- Personnel list with avatar, status pill, "seit X min" timer
- Compact embedded version on the home dashboard

#### Reports
- Stundenzettel PDF export (per employee + multi-employee combined)
- Excel export (.xlsx) with same layout
- 12-column timesheet matching the existing Excel template
- Generated on device and shared via the system share sheet

#### Communication
- Full chat: DMs and group chats
- Text + image + file + voice message attachments
- Camera capture in chat
- Real-time delivery via Postgres + broadcast channels with polling fallback
- Typing indicators and online presence dots
- WhatsApp-style read receipts (single ✓ → double ✓ grey → double ✓ blue)

#### Requests
- Vacation (Urlaubsantrag) and sick-leave (Krankmeldung) submission
- Reminder picker (15 min / 30 min / 1h / 1d / 1w)
- Dispatcher / admin notifications on submission

#### Calendar
- Full month grid with day filter + per-day list
- Plans and generic events shown side-by-side
- Generic calendar event creation with color, location, member multi-picker, reminder

#### Master data (admin / dispatcher)
- Customers (CRUD + map location picker)
- Betriebsstellen (CRUD with type chips)
- Shift templates (CRUD)
- Members / Users (list, role chips, active toggle, password reset, admin avatar upload)
- Working time models (CRUD)
- Qualifications with expiry traffic-light and admin verification
- Company profile

#### Settings
- Personal data editor matching web Stammdaten exactly
- Notification preferences (per-channel + per-event)
- Security (password change, sign-out everywhere, biometric toggle, background-location toggle)
- Holidays config
- Localization (language + timezone + date format)
- Appearance (system / light / dark theme picker)
- Data export (own + org-wide as JSON)

#### Legal
- In-app Impressum, Datenschutzerklärung, Nutzungsbedingungen

#### Platform & polish
- iOS, Android, and web (read-only admin view) builds
- Full German + English localisation
- Dark mode across 42 screens
- Pull-to-refresh on every list
- Offline cache for plans + time entries (instant cold start)
- Crash reporting via Sentry (when DSN configured)
- Global error boundary with friendly recovery screen

### Native dependencies
- expo-print, expo-sharing, expo-file-system (reports)
- expo-audio (voice messages)
- expo-image-picker, expo-document-picker (chat + avatar)
- react-native-maps (native live ops map)
- Leaflet via CDN (web live ops map)
- expo-location + expo-task-manager (foreground + background tracking)
- expo-local-authentication (Face ID / Touch ID)
- expo-notifications (push registration; server dispatch separate)
- xlsx via SheetJS

### Known limitations
- Push notification dispatcher lives on the web repository
- Calendar reminder cron lives on the web repository
- Stripe billing UI not available on mobile (handled via App Store / Play Store)
- Multi-org switching not supported (assumes one organisation per user)

---

[1.0.0]: https://github.com/lokshift/locshift-mobile/releases/tag/v1.0.0
