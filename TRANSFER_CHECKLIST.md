# Transfer Checklist (Owner Handover)

Date created: 2026-03-24  
Project: `zito-aplikacija`  
Current git remote: `https://github.com/nastevg/zito-aplikacija.git`  
Current branch/head: `main` @ `986dd5f`

## Goal
Transfer full technical ownership from current owner to new owner with minimal downtime and no data loss.

## Rules (must follow)
1. Do not delete old accounts until cutover is complete and verified.
2. Add new owner as admin first, then transfer ownership.
3. Rotate all secrets after transfer.
4. Keep one rollback window (24-48h) before final shutdown of old infra.

## Phase 1: Inventory and access matrix (Start now)
Status: COMPLETED

### 1.0 Observed in repository (confirmed)
- [x] Render blueprint exists: `backend/render.yaml`
- [x] Backend env template exists: `backend/.env.example`
- [x] Expo/EAS config exists: `zito-app/app.json`, `zito-app/app.config.js`, `zito-app/eas.json`
- [x] Git remote confirmed: `origin = https://github.com/nastevg/zito-aplikacija.git`
- [ ] `google-services.json` / `GoogleService-Info.plist` not found in repo (expected, should be managed in secure owner channels)

### 1.1 Services to transfer
- [x] GitHub repo (`nastevg/zito-aplikacija`)
- [x] Render access established for new owner workspace (new services created)
- [ ] Expo/EAS project (`@gnastev/zito-app`, projectId `bdc208da-9d97-4d04-92bc-792c38d0637c`)
- [ ] Google OAuth client
- [ ] Facebook OAuth app
- [ ] Firebase project (Android push credentials / `google-services.json`)
- [ ] Google Play Console app ownership
- [ ] Apple App Store Connect app ownership
- [ ] Any DNS/domain used by backend URL
- [ ] Any external integrations:
  - [ ] External prices API (`EXTERNAL_PRICES_API_BASE`, `EXTERNAL_PRICES_API_PATH`)
  - [ ] Loyalty SOAP service (`LOYALTY_SOAP_URL`, verify templates)

### 1.2 Backend environment variables (must exist on new infra)
- [ ] `PORT`
- [ ] `JWT_SECRET`
- [ ] `ADMIN_TOKEN`
- [ ] `BACKEND_PUBLIC_URL`
- [ ] `DATABASE_URL` (if Postgres is used)
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GOOGLE_CLIENT_SECRET`
- [ ] `FACEBOOK_APP_ID`
- [ ] `FACEBOOK_APP_SECRET`
- [ ] `EXTERNAL_PRICES_API_BASE`
- [ ] `EXTERNAL_PRICES_API_PATH`
- [ ] `EXTERNAL_PRICES_TIMEOUT_MS`
- [ ] `PRICE_REFRESH_HOUR_LOCAL`
- [ ] `PRICE_REFRESH_TIMEZONE`
- [ ] `LOYALTY_SOAP_URL`
- [ ] `LOYALTY_SOAP_STRICT_VERIFY`
- [ ] `LOYALTY_VERIFY_USERNAME_TEMPLATE`
- [ ] `LOYALTY_VERIFY_PASSWORD_TEMPLATE`

### 1.3 App identity values (must remain identical)
- [x] Scheme: `zitoapp`
- [x] Android package: `com.anonymous.zitoapp`
- [x] iOS bundleIdentifier: `com.anonymous.zitoapp`

### 1.4 Endpoint consistency check (must align before cutover)
- [ ] API domain mismatch found in configs:
  - `zito-app/eas.json` uses `https://zito-backend.onrender.com`
  - `backend/render.yaml` and fallback config reference `https://zito-cms-backend.onrender.com`
- [ ] Decide final production domain and standardize all configs before ownership transfer.

## Phase 2: Prepare new owner accounts
Status: PENDING

1. New owner creates org-level accounts:
- [ ] GitHub (org/account)
- [ ] Render
- [ ] Expo account + EAS access
- [ ] Firebase
- [ ] Google Cloud (OAuth)
- [ ] Meta Developer (Facebook OAuth)
- [ ] Play Console developer
- [ ] Apple Developer + App Store Connect

2. Temporary dual-admin setup:
- [ ] Add new owner as Admin/Owner on all existing services.
- [ ] Verify new owner can log in and view project/billing/settings.

## Phase 3: Git and CI transfer
Status: IN PROGRESS

1. GitHub:
- [x] Transfer repo ownership to new account/org. (`zitomarketi`)
- [x] Reconfirm branch protection on `main`. (temporarily disabled for emergency push, then restored)
- [ ] Reconfigure secrets/actions/webhooks/deploy keys.
- [ ] Verify `git clone`, `git push` from new owner account.
- [x] Local `origin` updated to `https://github.com/zitomarketi/zito-aplikacija.git`.

## Phase 4: Backend infra migration (Render + DB)
Status: IN PROGRESS

1. New Render setup:
- [x] Create service from transferred repo (or render blueprint).
- [x] Add all env vars from Phase 1.2. (core envs applied; rotate pending)
- [x] Ensure `/health` returns OK on new URL.

2. Data migration:
- [x] Backup current production DB.
- [ ] Restore DB on new owner infra. (blocked by Render Postgres provisioning/support)
- [ ] Validate critical tables (users, push_tokens, product_prices, vouchers if active, cms assets).

3. Storage/assets:
- [ ] Migrate uploaded CMS assets if stored outside DB.
- [x] Validate `/cms/apk-gallery` returns expected items.

## Phase 5: Identity and mobile ownership transfer
Status: IN PROGRESS

1. Expo/EAS:
- [ ] Transfer Expo project ownership to new account/org.
- [ ] Confirm EAS builds run under new owner.

2. OAuth/Firebase:
- [x] Recreate Google OAuth credentials on new owner Google Cloud project (`zito-production`).
- [ ] Recreate or transfer Facebook OAuth credentials.
- [ ] Transfer/recreate Firebase project and app credentials.
- [ ] Update redirect URIs to new backend domain:
  - [x] `/auth/oauth/google/callback`
  - [ ] `/auth/oauth/facebook/callback`

3. Stores:
- [ ] Start Google Play app transfer.
- [ ] Start App Store Connect app transfer.
- [ ] Confirm signing/certificates/keystore access is available to new owner.

## Phase 6: Cutover (planned maintenance window)
Status: PENDING

1. Freeze:
- [ ] Announce short release freeze (30-60 min).
- [ ] Stop config changes on old infra.

2. Final migration:
- [ ] Final DB backup and sync.
- [ ] Point production backend URL/domain to new Render service.
- [ ] Deploy latest `main` on new owner infra.

3. Smoke QA (must pass):
- [ ] Login/register
- [ ] Home/flyers/analysis content
- [ ] Loyalty card
- [ ] Price check
- [ ] Notifications + push
- [ ] Vouchers (if active)
- [ ] Admin panel upload/delete flows

## Phase 7: Post-cutover and closure
Status: PENDING

1. Observe 24-48h:
- [ ] Monitor errors/logs/push delivery.
- [ ] Confirm no critical regressions.

2. Security closure:
- [ ] Rotate all old secrets/tokens again.
- [ ] Remove old owner admin access from every service.
- [ ] Archive old infra (do not hard-delete immediately).

## Execution Log
- 2026-03-24: Checklist created and Phase 1 started.
- 2026-03-24: Confirmed current repo remote/branch/head and app identity values.
- 2026-03-24: Detected production API domain mismatch (`zito-backend.onrender.com` vs `zito-cms-backend.onrender.com`).
- 2026-03-24: GitHub repo transferred to `zitomarketi`; local origin retargeted to new URL.
- 2026-03-24: Fail-safe backups created (`repo bundle`, DB dump/schema, env snapshots).
- 2026-03-24: New services deployed under new owner: `zito-backend-new` and `zito-cms-backend-new` (health OK).
- 2026-03-24: Added backend SSL fix for Render Postgres and deployed (`474c8c9`).
- 2026-03-24: Google OAuth migration started on new owner project `zito-production`; new callback configured for `zito-cms-backend-new`.
