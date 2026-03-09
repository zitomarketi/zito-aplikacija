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

## March 6, 2026 - Notifications tab blink indicator + More header cleanup
- Removed the large `More` page title from the `Повеќе` screen header area while keeping the bottom tab item intact.
- Added unread visual indicator for `Известувања` tab icon:
  - icon now blinks when new notifications arrive
  - blinking stops when user opens the `Известувања` tab (marks as read in UI state)
- Added temporary dummy in-app notification trigger on login to quickly validate blinking behavior during testing.
- Validated TypeScript (`npx tsc --noEmit`), built release APK, and installed on physical device.

## March 6, 2026 - Release APK prepared for second device testing
- Built fresh Android release package for manual install on another phone.
- APK path:
  - `C:\Users\ZITO\Desktop\zito aplikacija\zito-app\android\app\build\outputs\apk\release\app-release.apk`

## March 9, 2026 - Workflow switch: iOS phase started
- Project is now entering iOS version work for the same app.
- Work mode agreement:
  - User will explicitly specify whether each next task is for iOS or Android.
- This note is saved as the active collaboration rule for upcoming tasks.

## March 9, 2026 - [iOS] Step 1 setup baseline
- Started iOS preparation phase for the same app parity with Android.
- Updated `zito-app/app.json` iOS config:
  - set `ios.bundleIdentifier`: `com.anonymous.zitoapp`
  - added iOS permission texts in `ios.infoPlist`:
    - `NSCameraUsageDescription`
    - `NSLocationWhenInUseUsageDescription`
- Confirmed dependencies include `expo-location` for nearest-market GPS feature.
- TypeScript check passed (`npx tsc --noEmit`).
- Note: actual iOS build/run requires macOS (Xcode/EAS build environment).

## March 9, 2026 - [iOS] Step 2 build pipeline setup
- Added EAS build configuration file: `zito-app/eas.json`.
- Configured build profiles:
  - `development` (internal, iOS simulator/dev client)
  - `preview` (internal, iOS device build)
  - `production` (store-ready profile)
- Added npm scripts in `zito-app/package.json`:
  - `ios:build:dev`
  - `ios:build:preview`
  - `ios:build:prod`
  - `ios:submit:prod`
- Validation:
  - `eas.json` JSON parse check passed.
  - TypeScript check passed (`npx tsc --noEmit`).
- Note: actual iOS build execution runs through EAS cloud (or macOS local environment).

## March 9, 2026 - [iOS] Step 3 location permission hardening
- Switched nearest-market GPS flow from generic `navigator.geolocation` to `expo-location` in `zito-app/App.tsx`.
- Added proper runtime permission flow compatible with iOS:
  - `Location.hasServicesEnabledAsync()`
  - `Location.requestForegroundPermissionsAsync()`
  - `Location.getCurrentPositionAsync()`
- Kept existing nearest-market UX (highlight + distance), now with more reliable permission handling for iPhone.
- Validation:
  - TypeScript check passed (`npx tsc --noEmit`).
  - iOS bundle identifier remains configured: `com.anonymous.zitoapp`.

## March 9, 2026 - [iOS] Step 4 status (EAS build initiation)
- Started iOS EAS preview build from CLI.
- Fixed required iOS/EAS config blockers:
  - Added `ios.infoPlist.ITSAppUsesNonExemptEncryption = false` in `zito-app/app.json`.
  - Added `cli.appVersionSource = "remote"` in `zito-app/eas.json`.
- Build now reaches credentials phase successfully.
- Current blocker:
  - EAS reports missing suitable iOS credentials for internal distribution in non-interactive mode.
  - Requires one-time interactive credentials setup (`Apple login / certificates / provisioning`).

## March 9, 2026 - [iOS] Step 4 completed (development simulator build)
- Installed missing `expo-dev-client` dependency required for `development` iOS EAS builds.
- Ran EAS iOS build successfully with profile `development` (simulator build, no paid Apple Developer required).
- Build completed and is ready for installation via Expo link/QR.
- Build details:
  - Build ID: `5707cf99-6e90-4652-ba44-39d3e199a3af`
  - URL: `https://expo.dev/accounts/gnastev/projects/zito-app/builds/5707cf99-6e90-4652-ba44-39d3e199a3af`

## March 9, 2026 - [iOS] Runtime testing handoff to macOS
- Confirmed iOS simulator build is created, but cannot be executed on Windows environment.
- Agreed to continue iOS runtime testing and installation flow from macOS.
- Next continuation point on macOS:
  - open existing EAS iOS build
  - run parity QA and fix remaining iOS-specific issues.

## March 9, 2026 - [Cleanup] Stabilization pass (1/2/3)
- Centralized repeated headline title style into shared constant (`HEADLINE_TEXT_STYLE`) in `zito-app/App.tsx`.
- Removed unused code paths:
  - deleted temporary/unused i18n keys `screen_more_title` (all languages)
  - removed unused `MainTabs` props and handlers for manual push register/test (`onRegisterPush`, `onSendTestPush`, related handlers)
- Hardening for source/build hygiene:
  - updated `zito-app/.gitignore` to ignore local cache and secret/data artifacts
  - added `zito-app/.easignore` to reduce EAS archive size and exclude local-only files
  - added root `.gitignore` for local working folders (`akcii/`, `flaeri/`)
- Validation: `npx tsc --noEmit` passed.

## March 9, 2026 - [iOS] Parity QA checklist prepared
- Added structured iOS parity verification checklist:
  - file: `IOS_PARITY_QA_CHECKLIST.md`
  - includes setup, screen-by-screen tests, iOS-specific checks, and defect reporting format.
- Purpose: execute parity QA on macOS/iPhone and fix issues in controlled batches.

## March 9, 2026 - [Backend/CMS] Admin CRUD readiness pass
- Extended DB layer (`backend/db.js`) with CMS management operations:
  - list product prices (`listProductPrices`)
  - delete flyer by id
  - delete notification by id
  - delete product price by barcode
  - implemented for both SQLite and Postgres stores
- Added admin API endpoints (`backend/index.js`):
  - `GET /admin/flyers`
  - `DELETE /admin/flyers/:id`
  - `GET /admin/notifications`
  - `DELETE /admin/notifications/:id`
  - `GET /admin/prices?limit=...`
  - `DELETE /admin/prices/:barcode`
- Upgraded admin panel UI (`backend/public/admin.html`):
  - added live lists for flyers/notifications/prices
  - added refresh and delete actions per item
  - preserved existing create actions and push broadcast
- Validation:
  - `node --check backend/index.js` passed
  - `node --check backend/db.js` passed

## March 9, 2026 - [Release Prep] Versioning + env profiles + release checklist
- Updated `zito-app/app.json`:
  - enabled `runtimeVersion.policy = appVersion`
  - added `ios.buildNumber` baseline
  - added `android.versionCode` baseline
- Updated `zito-app/eas.json` build profiles with explicit env config:
  - `EXPO_PUBLIC_APP_ENV` per profile (`development`, `preview`, `production`)
  - `EXPO_PUBLIC_API_BASE` per profile
- Updated `zito-app/app.config.js` to expose `extra.appEnv` at runtime.
- Added release operations guide:
  - `RELEASE_PREP_CHECKLIST.md`
- Validation:
  - `npx tsc --noEmit` passed
  - JSON parse checks for `app.json` and `eas.json` passed

## March 9, 2026 - Security hardening pass (auth + backend secrets)
- Removed hardcoded fallback login path from `zito-app/App.tsx`:
  - deleted demo bypass for `korisnik@zito.mk` / `password123` when backend login fails.
- Removed temporary dummy-notification injection effect from `zito-app/App.tsx`.
- Hardened backend secret handling in `backend/index.js`:
  - added production guard: backend now fails fast if `ADMIN_TOKEN` or `JWT_SECRET` are missing/weak (`change-me`).
  - removed startup log that printed admin token.
- Updated admin panel token input in `backend/public/admin.html`:
  - removed hardcoded default token value.
  - added neutral placeholder (`Enter admin token from environment`).
- Validation completed:
  - `npx tsc --noEmit` (app) passed.
  - `node --check backend/index.js` passed.
  - `node --check backend/db.js` passed.
- Git delivery:
  - commit: `577ddbf`
  - branch: `main`
  - pushed to `origin/main` (`https://github.com/nastevg/zito-aplikacija.git`).

## March 9, 2026 - [Backend/OAuth] Render domain switch + Google redirect fix
- Updated Render service base URL in infra config:
  - `backend/render.yaml` -> `BACKEND_PUBLIC_URL = https://zito-cms-backend.onrender.com`
- Git delivery for domain switch:
  - commit: `917b2b7`
  - branch: `main`
  - pushed to `origin/main`
- Diagnosed Google login error chain:
  - first error: `google OAuth is not configured on backend` (missing `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Render env)
  - second error: `Error 400: redirect_uri_mismatch`
- Confirmed required Google OAuth callback URI for current backend domain:
  - `https://zito-cms-backend.onrender.com/auth/oauth/google/callback`
- Operational note:
  - Render env must use `GOOGLE_CLIENT_ID` and an enabled `GOOGLE_CLIENT_SECRET` from the same Google OAuth client, followed by backend redeploy.

## March 9, 2026 - [Backend/CMS] PDF upload support hardening in Admin Visual Catalog
- Extended APK Visual Catalog backend and admin UI to support PDF assets in addition to images:
  - upload accepts `png/jpg/webp/pdf`
  - import by URL accepts direct `png/jpg/webp/pdf` links
  - PDF entries render as PDF tiles in admin gallery with open action
- Improved upload robustness:
  - fallback validation by filename extension and file signature when MIME type is missing/incorrect
  - avoids false rejections for browser-uploaded PDFs
- Increased upload limits for larger flyer files:
  - `MAX_UPLOAD_SIZE_BYTES` raised to `50MB` in `backend/index.js`
  - JSON body limit raised to `80mb` for base64 uploads
  - oversized payload now returns structured JSON error (`413`) instead of HTML stack
- Git delivery:
  - commits on `main`: `7314c65`, `3a8f235`, `6efade1`, `f01b825`

## March 9, 2026 - [Mobile/Home] In-app PDF popup + first-page visual preview
- Home screen (`Тековни летоци`) now consumes CMS gallery data and includes PDF flyers.
- Added in-app PDF viewing flow (no external browser redirect):
  - tapping a PDF flyer opens a fullscreen modal viewer inside the app.
- Added visual PDF card preview on Home carousel:
  - PDF cards now render embedded first-page preview in-card (instead of plain `PDF` text card).
- Added new mobile dependency:
  - `react-native-webview` (installed via Expo-compatible install).
- Validation:
  - `npx tsc --noEmit` passed.
