# Zito Aplikacija MVP

This workspace now contains:
- Mobile app (`Expo React Native`)
- Local API backend (`Express`)
- Database layer: SQLite (default) or PostgreSQL (`DATABASE_URL`)
- Versioned SQL migrations (`backend/migrations`)
- JWT auth (register/login)
- Loyalty card with barcode number + QR
- Push registration flow (`expo-notifications`)
- Admin mini panel (flyers, notifications, push broadcast)

## 1) Start backend

```powershell
cd "C:\Users\ZITO\Desktop\zito aplikacija\backend"
npm install
npm run migrate
npm run dev
```

Backend:
- API base: `http://localhost:8000`
- Admin panel: `http://localhost:8000/admin.html`
- Admin token: from `.env` (`ADMIN_TOKEN`)
- DB engine: SQLite file `backend/zito.db` (default)

Default demo user:
- Email: `korisnik@zito.mk`
- Password: `password123`

PostgreSQL option:
```powershell
$env:ADMIN_TOKEN="your-admin-token"
$env:JWT_SECRET="your-jwt-secret"
$env:DATABASE_URL="postgres://user:pass@localhost:5432/zito"
npm run migrate
npm run dev
```
If `DATABASE_URL` is present, backend auto-switches from SQLite to PostgreSQL.

Environment file:
- Copy `backend/.env.example` to `backend/.env` and set values.

## 2) Start mobile app

```powershell
cd "C:\Users\ZITO\Desktop\zito aplikacija\zito-app"
npm install
npm run android
```

Alternative:
- `npm run web`
- `npm run ios`

## 3) API host inside app

The app API base is taken from Expo config:
- `expo.extra.apiBase` (or env override `EXPO_PUBLIC_API_BASE`)
- Default in this repo is local dev: `http://localhost:8000`

If backend is down, app keeps fallback UI data.

## 4) Production (one-time team setup, not client setup)

End users should only install APK. They should not enter backend URLs or secrets.

1. Deploy backend publicly (HTTPS), e.g. Render:
   - Use `backend/render.yaml`
   - Set env vars on host:
     - `BACKEND_PUBLIC_URL`
     - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
     - `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
2. Configure Google/Facebook OAuth apps:
   - Callback URL:
     - `https://<YOUR_BACKEND_DOMAIN>/auth/oauth/google/callback`
     - `https://<YOUR_BACKEND_DOMAIN>/auth/oauth/facebook/callback`
3. Build release APK with fixed production API base:
```powershell
cd "C:\Users\ZITO\Desktop\zito aplikacija\zito-app\android"
$env:EXPO_PUBLIC_API_BASE="https://<YOUR_BACKEND_DOMAIN>"
cmd /c gradlew.bat assembleRelease
```
4. Distribute resulting APK from:
   - `zito-app/android/app/build/outputs/apk/release/app-release.apk`

## 5) Admin panel actions

Open `http://localhost:8000/admin.html` and use:
- `Add Flyer` -> creates new flyer item
- `Add Notification` -> creates in-app notification
- `Push Broadcast` -> sends Expo push to registered tokens
