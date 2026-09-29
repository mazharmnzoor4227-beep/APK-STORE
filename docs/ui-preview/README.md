# APK STORE — Play Store-style UI redesign (design proposal)

Status: **design proposal only — not implemented in the Android app yet.**
Final approval pending. Do not treat this as the shipped UI.

## What this is

`playstore-interactive.html` is a self-contained interactive mock of the
proposed APK STORE Android UI. Open it in any browser to click through it.
No build step, no backend — catalog data inside is illustrative.

Screens covered: Apps (home), Search, Updates, Library/Downloads, All apps,
app detail, Settings, About / Privacy / Terms, App-info bottom sheet,
screenshot fullscreen viewer.

## Key design decisions (approved direction)

- **Home is browse-only.** No Install buttons anywhere on the Home screen.
  The large Featured banner, Recommended rows, Trending cards and Top Charts
  all open the app-detail page when tapped.
- **Installation happens only on the app-detail page.** Tap Install →
  progress ring with cancel (✕) → Open. Installed state shows separate
  Uninstall and Open buttons.
- **Featured slot is backend-driven.** Production must read the backend
  `is_recommended` flag so the featured app is selectable from the admin panel.
- Category chips scroll and center correctly; "More" opens a full apps list.
- Detail page shows version, size, Android requirement, updated date,
  screenshots, category section and a horizontally scrolling recommendations shelf.

## Notes for implementation

- Android-version requirements must come from the release `min_sdk` backend
  field; the values in this mock are illustrative.
- This mock does not change any catalog, download, update, installation,
  security or integrity logic — those are preserved as-is when implementing.
