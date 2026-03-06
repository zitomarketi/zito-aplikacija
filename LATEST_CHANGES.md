# Latest Changes

## March 5, 2026 - Login language selector on first screen
- Added language switch buttons (flag chips) at the bottom of the Login/Register screen.
- Supported quick language switch: Macedonian (`🇲🇰`), English (`🇬🇧`), Albanian (`🇦🇱`), Turkish (`🇹🇷`).
- Login screen now updates language immediately when user taps a flag.
- Added translated `email_placeholder` in all supported languages and connected email input to i18n key.
- Wired `LoginScreen` props with global language state:
  - `language`
  - `onSetLanguage`
- Built and installed updated release APK on device.

## Build and install details
- TypeScript check: `npx tsc --noEmit` -> OK
- Build: `zito-app/android` -> `./gradlew.bat app:assembleRelease` -> SUCCESS
- APK installed: `zito-app/android/app/build/outputs/apk/release/app-release.apk`
- Package: `com.anonymous.zitoapp`

## March 5, 2026 - Push notifications test flow
- Backend: added authenticated endpoint `POST /push/test` in `backend/index.js`.
  - Requires auth token + Expo push token.
  - Sends a push message through Expo Push API.
  - Saves a notification item to backend notifications list.
- Mobile app (`zito-app/App.tsx`):
  - Added profile action button: "Test push notification".
  - Added i18n labels for MK/EN/SQ/TR.
  - Added state messages for:
    - test sent
    - register push token first.
  - Connected button to backend endpoint `/push/test`.
- Built and installed updated release APK.
## March 5, 2026 - Silent auto push registration
- Added silent automatic push registration right after successful login/session restore.
- App now requests notification permission and registers Expo push token automatically once per logged-in session.
- Token is auto-sent to backend via `/push/register`.
- Manual "Register push" button remains as fallback.
- Auto-register attempt resets on logout.
## March 5, 2026 - EAS project linked for push
- Logged Expo account and initialized EAS project for app `@gnastev/zito-app`.
- Added Expo owner and EAS project ID in app config:
  - owner: `gnastev`
  - projectId: `bdc208da-9d97-4d04-92bc-792c38d0637c`
- Rebuilt and installed new release APK.

## March 5, 2026 - Push delivery diagnostics and sound enabled
- Backend push diagnostics improved:
  - `/push/test` now surfaces Expo ticket errors instead of returning false-success.
  - auth middleware now returns JWT verify `detail` for easier token debugging.
- Mobile push diagnostics improved:
  - push registration now surfaces specific reasons (`missing_eas_project_id`, `missing_firebase_config`, API error details).
  - test push action now shows concrete backend/Expo error details in UI state.
- Resolved Android push registration `InvalidCredentials` by completing Expo/Firebase credential linkage.
- Enabled audible notifications on Android:
  - `shouldPlaySound` set to `true` in notification handler.
  - default Android notification channel now explicitly sets `sound: "default"` and vibration pattern.
- Rebuilt and installed updated Android release APK on connected device; push test confirmed working with sound.

## March 5, 2026 - Home layout fixes (flyers and best deals)
- Fixed `NAJDOBRI AKCII` grid to render exactly 3 cards per row on all screen widths.
  - Switched from pixel-based card width calculation to fixed percentage layout (`31.8%` + `space-between`).
  - Kept square card ratio with `aspectRatio: 1`.
- Kept `TEKOVNI LETOCI` cards visually larger inside the same section height (no section expansion).
- Confirmed separation of mock sources:
  - `assets/images/letoci/*` used only for current flyers.
  - `assets/images/akcii/*` used only for best deals.
- Final validation:
  - Built Android release APK successfully (`app:assembleRelease`).
  - Installed on physical device via ADB.
  - User-confirmed UI result is now correct.

## March 6, 2026 - Shopping List module added
- Added a new bottom tab: `Листа` / `Shopping`.
- Implemented full shopping list screen:
  - add item (`name`, `quantity`, `note`)
  - mark item as purchased (checkbox toggle)
  - remove single item
  - clear all purchased items
- Added quick shortcuts to open shopping list from:
  - Home screen
  - Flyers screen
  - Profile screen
- Added i18n keys for MK/EN/SQ/TR for the whole shopping list flow.
- Added local persistence with AsyncStorage (`zito.shopping.items`) so list stays saved between app restarts.
- TypeScript validation: `npx tsc --noEmit` passed.

## March 6, 2026 - Production strategy notes (discussion log)
- Agreed strategic direction for Play Store production:
  - Use managed cloud stack instead of self-hosted server.
  - Keep architecture API-first (mobile app -> backend API -> DB/storage).
- Confirmed current app architecture is cloud-ready and can continue with managed hosting.
- Ownership transfer feasibility confirmed:
  - App can be moved to a new owner cloud account (Render/Firebase/etc.).
  - Requires transfer/rotation of repo access, secrets, DB/storage, and credentials.
  - Special care required for Play Console ownership/signing continuity.
- Admin panel clarification:
  - No automatic custom admin panel is provided by cloud.
  - Need to build custom admin panel, or use temporary ready-made admin tools first.

## March 6, 2026 - Card screen barcode scan (camera) + backend card update
- Added barcode scanning to `Картичка` screen using phone camera (`expo-camera` flow).
  - New scan action on card screen: "Скенирај баркод со камера".
  - Scanner supports: `ean13`, `ean8`, `code128`, `code39`, `upc_a`, `upc_e`, `itf14`.
- Added backend endpoint for card update:
  - `POST /me/card` (auth required)
  - Validates card number format and duplicate ownership.
  - Returns refreshed card payload (`cardNumber`, `barcode`, `qrValue`).
- Added DB update methods for both SQLite and Postgres stores:
  - `updateUserCardNumber(id, cardNumber)`
- Added localized status messages (MK/EN/SQ/TR) for card update result.
- Validation and delivery:
  - TypeScript check passed (`npx tsc --noEmit`).
  - Android release build passed.
  - APK installed on physical device via ADB.

## March 6, 2026 - Locations GPS data fix from Excel C/D
- Reprocessed location import from Excel source:
  - Column `C` -> GPS coordinates (`lat`, `lng`)
  - Column `D` -> settlement/city value for grouping
- Fixed `market_locations.json` text encoding issues (removed mojibake/corrupted Cyrillic values).
- Confirmed key entries now carry coordinates in app data (including `Битола`, `Битола 2`, `Битола 3`, `Валандово`).
- Forced fresh JS rebundle in release build to ensure updated JSON is packaged.
- Installed updated APK on physical device; user confirmed locations now display correctly.

## March 6, 2026 - Login language switcher modernization
- Replaced emoji-flag language buttons on the login screen with a cleaner segmented switcher (`MK | EN | SQ | TR`).
- Updated visual states for better production look:
  - active language: filled green
  - inactive language: subtle outlined surface
  - pressed feedback: opacity state on tap
- Improved readability/contrast and shape consistency for light and dark themes.
- Built and installed updated APK on physical device for validation.
