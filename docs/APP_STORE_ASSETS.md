# App Store / Play Store assets

Visual assets for shipping ClientReady as iOS/Android apps (Capacitor wrapper, owned by Dev).

## Icons (already in repo)
| File | Size | Use |
|---|---|---|
| `public/icons/icon-1024.png` | 1024×1024, no transparency | App Store Connect icon, Play Store (resize to 512) |
| `public/icons/icon-512.png` / `icon-192.png` | 512 / 192 | Web manifest, Android launcher |
| `public/icons/icon-maskable-512.png` | 512, full-bleed | Android adaptive / maskable |
| `public/apple-touch-icon.png`, `src/app/apple-icon.png` | 180 | iOS home screen |
| `src/app/icon.png` | 32 | Favicon |
| `public/icons/mark.svg`, `mark-maskable.svg` | vector | Sources; re-render with sharp |

Android adaptive icon: foreground = the C mark from `mark-maskable.svg` (keep within the 66% safe zone), background = `#14b8a6`.
Splash: background `#061418`, centered `icon-512.png` at ~30% width.

## Screenshot sizes
**iOS (App Store Connect)**
- 6.9" iPhone: 1320×2868 (required)
- 6.5" iPhone: 1284×2778 (or 1242×2688)
- 5.5" iPhone: 1242×2208 (only if supporting older devices)
- 13" iPad: 2064×2752 (required if the iPad build ships)

**Android (Play Console)**
- Phone: 1080×1920 or 1080×2400 (2–8 screenshots, 16:9 or 9:16)
- 7" and 10" tablet: 1200×1920 / 1600×2560 (if listing tablets)
- Feature graphic: 1024×500 (required)

## Pages to capture (dark mode, seeded demo account, phone width)
1. `/dashboard`: stats tiles, chart, recent documents
2. `/invoice`: editor with line items and Your costs panel
3. `/invoice-view`: customer-ready invoice with balance due
4. `/calendar`: phone agenda view, Week
5. `/today`: today's jobs with Call / Map / Confirm done
6. `/clients/[id]`: client record with totals and activity
7. `/approve` (customer link): pay options and Approve button
8. `/year` or `/reports`: year log / tax lines

Optional light-mode set: dashboard and invoice-view.
Capture tip: run in standalone mode (installed PWA or Capacitor build) so safe areas and the bottom tab bar match the store app; hide the sync dot if it shows "offline".
