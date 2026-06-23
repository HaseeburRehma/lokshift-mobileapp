# LokShift Mobile — Store Submission Checklist

Every box must be ticked before submitting to App Store Connect or
Google Play Console.

## 0. Before you start

- [ ] `pnpm install` clean (no `--force` required)
- [ ] `pnpm typecheck` → exit 0
- [ ] `pnpm doctor` → no errors
- [ ] Tested on a real iOS device + a real Android device
- [ ] All four golden flows verified:
  - [ ] Sign in → home → clock in → break → clock out
  - [ ] Admin creates a plan → assigns to employee → employee confirms
  - [ ] Generate monthly Stundenzettel PDF (matches reference)
  - [ ] Chat: send text + image + voice message in a DM and a group

## 1. Identity & metadata

- [ ] `app.json` `name` = "LokShift"
- [ ] `app.json` `version` = production version (semver, no `-alpha`)
- [ ] `ios.buildNumber` strictly greater than previous TestFlight build
- [ ] `android.versionCode` strictly greater than previous Play build
- [ ] `ios.bundleIdentifier` matches App Store Connect record
- [ ] `android.package` matches Play Console record
- [ ] `extra.eas.projectId` filled in (NOT `REPLACE-WITH-...`)
- [ ] `updates.url` filled in (NOT `REPLACE-WITH-...`)

## 2. Environment & secrets

- [ ] `.env.production` contains the **production** Supabase URL + anon key
- [ ] `EXPO_PUBLIC_WEBAPP_URL` points to the production web app domain
- [ ] `EXPO_PUBLIC_SENTRY_DSN` set (or intentionally left blank if Sentry is off)
- [ ] EAS secrets pushed: `eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value …`
- [ ] No `.env` files committed to git

## 3. Assets

- [ ] `assets/icon.png` is 1024×1024 PNG with no alpha
- [ ] `assets/adaptive-icon.png` is at least 1024×1024 with 18% safe zone
- [ ] `assets/splash.png` looks correct on small phones AND tablets
- [ ] `assets/notification-icon.png` is white-on-transparent (Android quirk)
- [ ] App icon DOES NOT use the LokShift wordmark — a square mark or
      logomark only (App Store rejects wordmark icons). **Replace the
      generated placeholder before launch.**

## 4. iOS — Apple-specific

- [ ] `Apple Developer` account active + Apple Developer Program enrolled
- [ ] App Store Connect record created with the same bundle identifier
- [ ] Privacy Manifest declared in `app.json` (`ios.privacyManifests`) — done in repo
- [ ] All `NS*UsageDescription` strings filled in DE — done in repo
- [ ] `ITSAppUsesNonExemptEncryption` = false (no custom crypto)
- [ ] Capabilities matched in App Store Connect:
  - [ ] Background Modes (location + remote notifications + fetch)
  - [ ] Push Notifications
  - [ ] Sign in with Apple — N/A (we use email/password)
- [ ] App icon NOT transparent and NOT rounded by us (Apple masks)
- [ ] Screenshots prepared (6.7", 6.5", 5.5") — see `docs/store-listings/`
- [ ] App Privacy section filled in App Store Connect (matches PrivacyInfo)
- [ ] Export Compliance answered correctly (we declare `false`)
- [ ] Age rating set: 4+
- [ ] Category: Business
- [ ] Localizations: German (Primary) + English

## 5. Android — Google-specific

- [ ] Google Play Console account active + payment verified
- [ ] App listing created with the package name `app.lokshift.mobile`
- [ ] Signing key managed by Play (recommended) OR locally with credentials backed up
- [ ] `google-play-service-account.json` set up for EAS submit (see eas.json `submit.production.android`)
- [ ] Data Safety form filled in Play Console (see DATA_SAFETY.md for the answers)
- [ ] Permissions justified:
  - [ ] Background location: foreground service notification shown
  - [ ] Sensitive permissions form submitted
- [ ] Screenshots prepared (phone + tablet, min 2 each) — see `docs/store-listings/`
- [ ] Content rating questionnaire submitted: Rated for ages 3+
- [ ] Target API level 35 (compileSdkVersion 35) — set in repo
- [ ] Min SDK 24 (Android 7.0 Nougat) — set in repo
- [ ] App Bundle (AAB) built, not APK

## 6. Privacy & legal

- [ ] Privacy Policy URL live and reachable from outside the app
- [ ] Terms of Service URL live
- [ ] Impressum URL live (German law requirement)
- [ ] Privacy policy URL entered in App Store Connect
- [ ] Privacy policy URL entered in Play Console
- [ ] In-app legal screens (`/legal/datenschutz`, `/legal/impressum`,
      `/legal/agb`) have all `[PLATZHALTER]` tokens replaced
- [ ] GDPR data processing agreement signed with the customer
- [ ] List of subprocessors maintained (Supabase, Sentry, Apple/Google,
      Twilio if used)

## 7. Build & submit

```bash
# Bump version + buildNumber in app.json (or use EAS autoIncrement)
# Then:

# iOS — staging first
pnpm build:staging

# After staging acceptance:
pnpm build:ios          # production profile, EAS Build
pnpm submit:ios         # uploads to App Store Connect

# Android — same flow
pnpm build:android      # AAB to Play Console (Internal track first)
pnpm submit:android
```

## 8. Post-submit (first 24h)

- [ ] Verify the build is processing in App Store Connect
- [ ] Verify the build is processing in Play Console (Internal track)
- [ ] Install from TestFlight on a clean device — verify cold start, login,
      clock-in works
- [ ] Install from Play Internal track — same checks
- [ ] Monitor Sentry for any new release errors
- [ ] Once stable: promote to Production track in Play Console and submit
      for App Store review

## 9. Post-launch monitoring

- [ ] Sentry release-health dashboard configured
- [ ] On-call rotation in place
- [ ] Customer support email monitored (support@lokshift.app)
- [ ] Crash-free user rate ≥ 99% before promoting beyond Internal/TestFlight
