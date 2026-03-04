# Project Changes Log

Last updated: 2026-03-04

## 1) Initial project setup
- Created mobile app in `zito-app` with Expo + TypeScript.
- Installed navigation stack and bottom tabs.
- Built core screens:
  - Login
  - Home
  - Flyers
  - Loyalty Card
  - Notifications
  - Profile

## 2) UI implementation from PDF
- Reviewed and extracted visuals from `Clean and Modern App Portfolio Mockup Presentation.pdf`.
- Generated image assets under `zito-app/assets/images`:
  - `zito_logo.png`
  - `home_banner.png`
  - `flyers_grid.png`
  - page reference images (`page_04.png`, `page_05.png`, `page_06.png`)
- Applied visual theme close to provided concept:
  - light gray background
  - green brand accents
  - rounded cards
  - bottom navigation

## 3) Backend API (Express)
- Created backend app in `backend`.
- Added endpoints:
  - `POST /auth/register`
  - `POST /auth/login`
  - `GET /me`
  - `GET /loyalty/card`
  - `GET /flyers`
  - `GET /notifications`
  - `POST /push/register`
  - `POST /admin/flyers`
  - `POST /admin/notifications`
  - `POST /admin/push-broadcast`
  - `GET /health`

## 4) Authentication and security
- Implemented JWT auth for protected user routes.
- Added password hashing with `bcryptjs`.
- Added admin middleware with `x-admin-token`.

## 5) Database upgrade
- Replaced JSON runtime storage with DB engine abstraction in `backend/db.js`.
- Added support for:
  - SQLite (default, local file `backend/zito.db`)
  - PostgreSQL (when `DATABASE_URL` exists)
- Added auto schema creation and initial seed data for:
  - users
  - flyers
  - notifications
  - push_tokens

## 6) Loyalty card improvements
- Added real QR code rendering in mobile app using `react-native-qrcode-svg`.
- Card payload now includes:
  - `cardNumber`
  - `barcode`
  - `qrValue`

## 7) Push notifications
- Added Expo push registration flow in app.
- Stored push tokens in backend DB.
- Added admin broadcast endpoint using Expo push API.

## 8) Admin mini panel
- Added `backend/public/admin.html`.
- Capabilities:
  - Add flyer
  - Add in-app notification
  - Send push broadcast

## 9) Verification done
- Mobile TypeScript check passed (`npx tsc --noEmit`).
- Backend smoke tests passed (`/health`, `/auth/login`, `/me`, `/loyalty/card`).

## 10) Current default credentials/config
- Demo user:
  - Email: `korisnik@zito.mk`
  - Password: `password123`
- Admin token: `zito-admin-123`
- API base:
  - `http://localhost:8000`
- Admin panel:
  - `http://localhost:8000/admin.html`

## 11) Migrations and env config
- Added versioned SQL migrations:
  - `backend/migrations/sqlite/001_init.sql`
  - `backend/migrations/postgres/001_init.sql`
- Added migration runner command:
  - `npm run migrate` (script: `backend/scripts/migrate.js`)
- Added `.env` based config:
  - `PORT`
  - `JWT_SECRET`
  - `ADMIN_TOKEN`
  - `DATABASE_URL` (optional, for PostgreSQL)
- Added:
  - `backend/.env.example`
  - `backend/.env`
  - `backend/.gitignore` (ignores `.env`, `zito.db`)

## 12) Mobile UX fixes (March 3, 2026)
- Updated mobile login/register UI texts to Cyrillic where requested.
- Improved bottom tab visibility with safe area spacing so it is not clipped by phone system navigation.
- Switched startup/auth logo to provided `logo.png`.
- Registration form:
  - first field placeholder set to `Име и Презиме`.
- Social buttons text alignment normalized (Google/Facebook centered).
- Password field fix:
  - removed show/hide eye toggle to avoid accidental plain-text mode.
  - password input is now always secure (`******` masking enabled).
  - tightened autofill behavior (`autoComplete="off"`, `textContentType="none"`, `importantForAutofill="noExcludeDescendants"`).
- Built and installed updated Android release APK:
  - Build: `zito-app/android` -> `gradlew.bat assembleRelease`
  - APK: `zito-app/android/app/build/outputs/apk/release/app-release.apk`
  - Install: `adb install -r ...app-release.apk`

## 13) Password field hardening (March 4, 2026)
- Reinforced Android password behavior in login/register:
  - `secureTextEntry={true}` enforced.
  - `keyboardType="default"` and `multiline={false}` to keep standard password input behavior.
  - Password autofill semantics set with:
    - `autoComplete` (`password` / `new-password` by mode)
    - `textContentType` (`password` / `newPassword` by mode)
    - `importantForAutofill="yes"`
  - Added sanitization of hidden bidi control characters on input change to prevent cursor/start-position glitches.
- Rebuilt and clean reinstalled APK:
  - Uninstall old package: `com.zito.ippingmonitor.mobile.market`
  - Install fresh release APK.
  - Current launcher package/activity used: `com.zito.ippingmonitor.mobile/.MainActivity`

## 14) Password mask visibility fix (March 4, 2026)
- Added explicit visual props to password `TextInput` to ensure mask bullets are visible:
  - `cursorColor="#111111"`
  - `selectionColor="#111111"`
  - explicit dark text color and font size on input styles.
- Kept secure mode active:
  - `secureTextEntry={true}`
- Rebuilt release APK and reinstalled to connected device.

## 15) Password eye toggle (March 4, 2026)
- Added password visibility toggle icon (`eye` / `eye-off`) in login/register password field.
- Behavior:
  - default: password hidden
  - tap eye: reveal typed characters
  - tap again: hide characters
- Updated field layout to reserve right-side space for the icon (`paddingRight`) and positioned icon absolutely in input wrapper.
- Rebuilt and reinstalled Android release APK on device.

## 16) New tilted PNG above logo (March 4, 2026)
- Added new image asset:
  - `zito-app/assets/images/sekogasverninavas_upscaled-removebg-preview.png`
- Login/Register screen update:
  - inserted the new PNG above the main logo.
  - applied tilt rotation `25deg` as requested.
- Rebuilt release APK and installed on connected Android device.

## 17) Tilt direction update (March 4, 2026)
- Updated the same PNG tilt from `25deg` to `-25deg` (opposite direction), while keeping it above the logo.
- Rebuilt and installed fresh Android release APK.

## 18) Position and tilt fine-tuning (March 4, 2026)
- Moved the PNG higher on login/register by increasing upward offset (about 5mm visual shift).
- Updated tilt angle from `-25deg` to `-15deg`.
- Rebuilt and reinstalled Android release APK.

## 19) Dynamic top-middle positioning for PNG (March 4, 2026)
- Updated PNG angle to `-10deg`.
- Implemented dynamic placement logic:
  - PNG is positioned at the vertical midpoint between the top of the login screen and the logo position.
  - logo position is read on layout and PNG top offset is computed automatically.
- Rebuilt and reinstalled Android release APK on device.

## 20) Google/Facebook buttons now open provider login flow (March 4, 2026)
- Updated social buttons behavior in login screen:
  - `Најава со Google` now attempts to open Google app login deep-link, then Chrome deep-link, then web login fallback.
  - `Најава со Facebook` now attempts Facebook app login deep-link, then app root deep-link, then web login fallback.
- Removed previous social fallback that auto-logged into offline demo mode.
- Added user-facing error if provider login cannot be opened on the device.
- Rebuilt and reinstalled Android release APK.

## 21) End-to-end OAuth callback + backend token flow (March 4, 2026)
- Backend (`backend/index.js`):
  - Added OAuth start endpoint:
    - `GET /auth/oauth/:provider/start?redirect_uri=...`
  - Added OAuth callback endpoint:
    - `GET /auth/oauth/:provider/callback`
  - Added provider support for Google and Facebook authorization code flow.
  - Added state validation and mobile deep-link redirect back to app with JWT token.
  - Added userinfo fetch and auto user creation (or reuse existing by email), then JWT issue.
- Mobile app (`zito-app/App.tsx`):
  - Social login now starts backend OAuth flow instead of provider-only deep links.
  - Added deep-link callback handling:
    - `zitoapp://oauth/callback?token=...`
  - On callback token, app logs user in and loads `/me`, `/flyers`, `/notifications`, `/loyalty/card`.
- Deep-link configuration:
  - Added Expo scheme in `zito-app/app.json` (`scheme: zitoapp`).
  - Added Android intent-filter for `zitoapp://oauth/callback` in `AndroidManifest.xml`.
- Config updates:
  - Added OAuth env placeholders in `backend/.env.example` and `backend/.env`:
    - `BACKEND_PUBLIC_URL`
    - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
    - `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- Added app-side configurable API base in `app.json`:
  - `expo.extra.apiBase`

## 22) Universal Android readiness updates (March 4, 2026)
- Added runtime-editable backend URL field on login screen:
  - app can point to any reachable backend URL on any Android phone without rebuilding APK.
  - URL is sanitized (trailing slash removed).
- Refactored mobile API helpers to use dynamic `apiBase` instead of fixed compile-time URL.
- Social OAuth start now uses runtime backend URL (`{apiBase}/auth/oauth/:provider/start`).
- Added basic URL validation before starting OAuth (requires `http://` or `https://`).
- Built and installed final release APK and verified app launch for package:
  - `com.anonymous.zitoapp/.MainActivity`

## 23) Client-facing simplification (March 4, 2026)
- Removed runtime backend URL input from login UI so end users are not asked to configure anything.
- App now uses fixed app configuration path only (no client-side setup fields shown).
- Built and reinstalled updated release APK.

## 24) Production prep hardening (March 4, 2026)
- Backend OAuth improvements:
  - backend public URL now supports proxy-aware auto-detection when `BACKEND_PUBLIC_URL` is not set.
  - OAuth state TTL added (`10 min`) to prevent stale callback reuse.
- Mobile build config:
  - added `zito-app/app.config.js` so `EXPO_PUBLIC_API_BASE` can be injected at build time (one-time team setup).
- Deployment assets:
  - added `backend/render.yaml` template for quick Render deployment with required env vars.
- Documentation:
  - updated root `README.md` with production one-time setup flow (server deploy + OAuth callbacks + release build).

## 25) Production OAuth and APK stabilization (March 4, 2026)
- Render deployment fixed and running live (`zito-backend.onrender.com`).
- Google OAuth configured end-to-end:
  - Google consent + web client created.
  - Backend env configured:
    - `GOOGLE_CLIENT_ID`
    - `GOOGLE_CLIENT_SECRET`
- Facebook OAuth configured end-to-end:
  - Facebook Login use case enabled.
  - Valid redirect URI configured:
    - `https://zito-backend.onrender.com/auth/oauth/facebook/callback`
  - Backend env configured:
    - `FACEBOOK_APP_ID`
    - `FACEBOOK_APP_SECRET`
- Verified on phone:
  - `Најава со Google` opens provider login and returns to app.
  - `Најава со Facebook` opens provider login and returns to app.

## 26) Localhost fallback removal + release backup (March 4, 2026)
- Fixed mobile config defaults to prevent accidental `localhost` OAuth/API usage in release:
  - `zito-app/app.config.js` default API base changed to:
    - `https://zito-backend.onrender.com`
  - `zito-app/App.tsx` now ignores local API values (`localhost`, `127.0.0.1`, `10.0.2.2`) and falls back to Render URL.
- Rebuilt and reinstalled release APK after fix.
- Created release backup folder and archived final APK:
  - `releases/zito-app-release-2026-03-04.apk`
