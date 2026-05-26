# App assets

Before submitting to App Store / Play Store you need to drop branded
PNG assets in this folder:

| File                  | Size       | Used for                          |
|-----------------------|------------|-----------------------------------|
| `icon.png`            | 1024×1024  | iOS app icon                      |
| `splash.png`          | 1284×2778  | Splash screen                     |
| `adaptive-icon.png`   | 1024×1024  | Android adaptive icon foreground  |
| `notification-icon.png`| 96×96     | Android notification glyph (mono) |
| `favicon.png`         | 48×48      | Web build                         |

Then add them back to `app.json` (search for `// asset refs removed`).

EAS Build will use Expo's default placeholder icons until you do.
