require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { dbFactory } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 8000);
const isProduction = process.env.NODE_ENV === "production";
const envAdminToken = String(process.env.ADMIN_TOKEN || "").trim();
const envJwtSecret = String(process.env.JWT_SECRET || "").trim();

if (
  isProduction &&
  (!envAdminToken || envAdminToken === "change-me" || !envJwtSecret || envJwtSecret === "change-me")
) {
  throw new Error("ADMIN_TOKEN and JWT_SECRET must be set to secure values in production.");
}

const ADMIN_TOKEN = envAdminToken && envAdminToken !== "change-me" ? envAdminToken : "local-dev-admin-token";
const JWT_SECRET = envJwtSecret && envJwtSecret !== "change-me" ? envJwtSecret : "local-dev-jwt-secret";
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
const APK_ASSET_GROUP_DIRS = {
  letoci: path.resolve(__dirname, "..", "zito-app", "assets", "images", "letoci"),
  akcii: path.resolve(__dirname, "..", "zito-app", "assets", "images", "akcii"),
};
const db = dbFactory();
const oauthStateStore = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_UPLOAD_SIZE_BYTES = 50 * 1024 * 1024;
const JSON_BODY_LIMIT = "80mb";
const ASSET_MIME_TO_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};
const ASSET_URL_EXT_TO_EXT = {
  ".png": ".png",
  ".jpg": ".jpg",
  ".jpeg": ".jpg",
  ".webp": ".webp",
  ".pdf": ".pdf",
};

app.use(cors());
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.static(path.join(__dirname, "public")));

function sanitizeUser(user) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function getTokenFromReq(req) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

function requireAuth(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    return next();
  } catch (error) {
    const message = error && typeof error.message === "string" ? error.message : "token_verify_failed";
    return res.status(401).json({ error: "Invalid token", detail: message });
  }
}

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (token !== ADMIN_TOKEN) return res.status(403).json({ error: "Admin token is invalid" });
  return next();
}

function issueToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });
}

function normalizeCardNumber(input) {
  return String(input || "").replace(/\D/g, "");
}

function isValidCardNumber(cardNumber) {
  return /^\d{6,16}$/.test(cardNumber);
}

function normalizeBarcode(input) {
  return String(input || "").replace(/\D/g, "").slice(0, 32);
}

function isValidBarcode(barcode) {
  return /^\d{6,32}$/.test(barcode);
}

function listApkAssetFiles(group) {
  const dir = APK_ASSET_GROUP_DIRS[group];
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(png|jpe?g|webp|pdf)$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
}

function sanitizeAssetFilename(name) {
  const base = String(name || "")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return path.basename(base);
}

function decodeBase64Image(data) {
  const normalized = String(data || "").trim();
  if (!normalized) return null;
  return Buffer.from(normalized, "base64");
}

function detectAssetExtFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return "";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return ".png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ".jpg";
  }
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return ".webp";
  }
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return ".pdf";
  }
  return "";
}

async function downloadImageFromUrl(imageUrl) {
  const normalized = String(imageUrl || "").trim();
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error("URL must start with http:// or https://");
  }

  const response = await fetch(normalized);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${response.status})`);
  }

  const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const extFromMime = ASSET_MIME_TO_EXT[contentType] || "";
  let extFromPath = "";
  try {
    const parsedUrl = new URL(normalized);
    extFromPath = ASSET_URL_EXT_TO_EXT[path.extname(parsedUrl.pathname).toLowerCase()] || "";
  } catch (_error) {
    extFromPath = "";
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("Remote file is too large (max 50MB)");
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (!buffer.length) throw new Error("Remote image is empty");
  if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("Remote file is too large (max 50MB)");
  }

  const extFromBuffer = detectAssetExtFromBuffer(buffer);
  const ext = extFromMime || extFromPath || extFromBuffer;
  if (!ext) {
    const contentTypeLabel = contentType || "unknown";
    throw new Error(`URL must point to a PNG, JPG, WEBP or PDF file (received: ${contentTypeLabel})`);
  }

  return { buffer, ext };
}

async function generateUniqueCardNumber() {
  for (let i = 0; i < 100; i += 1) {
    const candidate = String(Math.floor(1000000 + Math.random() * 8999999));
    // eslint-disable-next-line no-await-in-loop
    const existing = await db.getUserByCardNumber(candidate);
    if (!existing) return candidate;
  }
  throw new Error("card_number_generation_failed");
}

function getBackendBaseUrl(req) {
  if (BACKEND_PUBLIC_URL) return BACKEND_PUBLIC_URL;
  const protoHeader = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const hostHeader = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const proto = protoHeader || req.protocol || "http";
  const host = hostHeader || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function getOAuthProviderConfig(provider) {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scope: "openid email profile",
    };
  }
  if (provider === "facebook") {
    return {
      clientId: process.env.FACEBOOK_APP_ID || "",
      clientSecret: process.env.FACEBOOK_APP_SECRET || "",
      authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
      scope: "email,public_profile",
    };
  }
  return null;
}

async function getOAuthIdentity(provider, accessToken) {
  if (provider === "google") {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error("google_userinfo_failed");
    const profile = await res.json();
    return {
      email: String(profile.email || "").toLowerCase(),
      name: String(profile.name || "Google корисник"),
    };
  }

  const fbRes = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
  if (!fbRes.ok) throw new Error("facebook_userinfo_failed");
  const profile = await fbRes.json();
  const fbEmail = profile.email ? String(profile.email).toLowerCase() : `fb_${String(profile.id)}@facebook.local`;
  return {
    email: fbEmail,
    name: String(profile.name || "Facebook корисник"),
  };
}

async function findOrCreateOAuthUser(provider, identity) {
  const existing = await db.getUserByEmail(identity.email);
  if (existing) return existing;

  const user = {
    id: `u${Date.now()}`,
    name: identity.name || `${provider} корисник`,
    email: identity.email,
    passwordHash: await bcrypt.hash(crypto.randomUUID(), 10),
    points: 0,
    coupons: 0,
    cardNumber: await generateUniqueCardNumber(),
  };
  await db.createUser(user);
  return user;
}

async function sendExpoPush(tokens, title, body) {
  if (tokens.length === 0) return { sent: 0, errors: [] };
  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default",
  }));
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Expo push HTTP ${response.status}: ${JSON.stringify(data)}`);
  }

  const tickets = Array.isArray(data?.data) ? data.data : [];
  const errors = tickets
    .filter((ticket) => ticket?.status === "error")
    .map((ticket) => ticket?.details?.error || ticket?.message || "Unknown push ticket error");

  return {
    sent: tokens.length,
    accepted: tickets.length - errors.length,
    errors,
    data,
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "zito-backend", port: PORT });
});

app.get("/cms/apk-asset/:group/:file", (req, res) => {
  const group = String(req.params?.group || "").trim();
  const dir = APK_ASSET_GROUP_DIRS[group];
  if (!dir) return res.status(404).send("Unknown group");

  const file = path.basename(String(req.params?.file || ""));
  if (!file || !/\.(png|jpe?g|webp|pdf)$/i.test(file)) return res.status(400).send("Invalid file");

  const fullPath = path.join(dir, file);
  if (!fullPath.startsWith(dir)) return res.status(400).send("Invalid path");
  if (!fs.existsSync(fullPath)) return res.status(404).send("Not found");

  return res.sendFile(fullPath);
});

app.get("/admin/apk-gallery", requireAdmin, (req, res) => {
  const mkUrl = (group, file) => `${getBackendBaseUrl(req)}/cms/apk-asset/${group}/${encodeURIComponent(file)}`;
  const currentFlyers = listApkAssetFiles("letoci").map((file, idx) => ({
    id: `letok-${idx + 1}`,
    label: `Леток ${idx + 1}`,
    file,
    imageUrl: mkUrl("letoci", file),
  }));
  const bestDeals = listApkAssetFiles("akcii").map((file, idx) => ({
    id: `akcija-${idx + 1}`,
    label: `Акција ${idx + 1}`,
    file,
    imageUrl: mkUrl("akcii", file),
  }));
  return res.json({ currentFlyers, bestDeals });
});

app.post("/admin/apk-gallery/upload", requireAdmin, (req, res) => {
  const group = String(req.body?.group || "").trim();
  const dir = APK_ASSET_GROUP_DIRS[group];
  if (!dir) return res.status(400).json({ error: "Invalid group" });

  const rawName = sanitizeAssetFilename(req.body?.targetFile || req.body?.fileName || "");
  if (!rawName) return res.status(400).json({ error: "fileName is required" });
  const mimeType = String(req.body?.mimeType || "").trim().toLowerCase();
  const extFromMime = ASSET_MIME_TO_EXT[mimeType] || "";
  const extFromName = ASSET_URL_EXT_TO_EXT[path.extname(rawName).toLowerCase()] || "";

  const buffer = decodeBase64Image(req.body?.dataBase64);
  if (!buffer || buffer.length === 0) return res.status(400).json({ error: "File payload is empty" });
  if (buffer.length > MAX_UPLOAD_SIZE_BYTES) return res.status(400).json({ error: "File is too large (max 50MB)" });

  const extFromBuffer = detectAssetExtFromBuffer(buffer);
  const ext = extFromMime || extFromName || extFromBuffer;
  if (!ext) return res.status(400).json({ error: "Only png, jpg, webp, pdf are supported" });

  const finalName = rawName.toLowerCase().endsWith(ext) ? rawName : `${rawName}${ext}`;
  const fullPath = path.join(dir, finalName);
  if (!fullPath.startsWith(dir)) return res.status(400).json({ error: "Invalid file path" });

  fs.writeFileSync(fullPath, buffer);
  return res.json({ ok: true, group, file: finalName, bytes: buffer.length });
});

app.post("/admin/apk-gallery/import-url", requireAdmin, async (req, res) => {
  const group = String(req.body?.group || "").trim();
  const dir = APK_ASSET_GROUP_DIRS[group];
  if (!dir) return res.status(400).json({ error: "Invalid group" });

  const rawName = sanitizeAssetFilename(req.body?.targetFile || req.body?.fileName || "");
  if (!rawName) return res.status(400).json({ error: "fileName is required" });

  try {
    const { buffer, ext } = await downloadImageFromUrl(req.body?.imageUrl);
    const finalName = rawName.toLowerCase().endsWith(ext) ? rawName : `${rawName}${ext}`;
    const fullPath = path.join(dir, finalName);
    if (!fullPath.startsWith(dir)) return res.status(400).json({ error: "Invalid file path" });

    fs.writeFileSync(fullPath, buffer);
    return res.json({ ok: true, group, file: finalName, bytes: buffer.length, source: "url" });
  } catch (error) {
    return res.status(400).json({ error: String(error?.message || error) });
  }
});

app.post("/auth/register", async (req, res) => {
  const { name, email, password, loyaltyCardNumber } = req.body || {};
  const normalizedName = String(name || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  if (!normalizedName || !normalizedEmail || !normalizedPassword) {
    return res.status(400).json({ error: "name, email, password are required" });
  }

  const exists = await db.getUserByEmail(normalizedEmail);
  if (exists) return res.status(409).json({ error: "Email already exists" });

  let assignedCardNumber = "";
  const submittedCardNumber = normalizeCardNumber(loyaltyCardNumber);
  if (submittedCardNumber) {
    if (!isValidCardNumber(submittedCardNumber)) {
      return res.status(400).json({ error: "Invalid loyalty card number format" });
    }
    const existingCardOwner = await db.getUserByCardNumber(submittedCardNumber);
    if (existingCardOwner) {
      return res.status(409).json({ error: "Loyalty card is already linked to another profile" });
    }
    assignedCardNumber = submittedCardNumber;
  } else {
    assignedCardNumber = await generateUniqueCardNumber();
  }

  const user = {
    id: `u${Date.now()}`,
    name: normalizedName,
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(normalizedPassword, 10),
    points: 0,
    coupons: 0,
    cardNumber: assignedCardNumber,
  };
  await db.createUser(user);

  return res.json({ token: issueToken(user.id), user: sanitizeUser(user) });
});

app.post("/auth/login", async (req, res) => {
  const { email, password, provider } = req.body || {};

  if (provider && provider !== "email") {
    const existing = await db.getFirstUser();
    if (!existing) return res.status(404).json({ error: "No users in database" });
    return res.json({ token: issueToken(existing.id), user: sanitizeUser(existing) });
  }

  const user = await db.getUserByEmail(String(email).toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(String(password || ""), user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  return res.json({ token: issueToken(user.id), user: sanitizeUser(user) });
});

app.get("/auth/oauth/:provider/start", (req, res) => {
  const provider = String(req.params.provider || "");
  const cfg = getOAuthProviderConfig(provider);
  if (!cfg) return res.status(400).json({ error: "Unsupported provider" });
  if (!cfg.clientId || !cfg.clientSecret) {
    return res.status(500).json({ error: `${provider} OAuth is not configured on backend` });
  }

  const redirectUriMobile = String(req.query.redirect_uri || "");
  if (!redirectUriMobile) return res.status(400).json({ error: "redirect_uri is required" });

  const state = crypto.randomBytes(16).toString("hex");
  oauthStateStore.set(state, {
    provider,
    redirectUriMobile,
    createdAt: Date.now(),
  });

  const callbackUrl = `${getBackendBaseUrl(req)}/auth/oauth/${provider}/callback`;
  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scope);
  url.searchParams.set("state", state);

  if (provider === "google") {
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
  }

  return res.redirect(url.toString());
});

app.get("/auth/oauth/:provider/callback", async (req, res) => {
  const provider = String(req.params.provider || "");
  const cfg = getOAuthProviderConfig(provider);
  if (!cfg) return res.status(400).send("Unsupported provider");

  const state = String(req.query.state || "");
  const code = String(req.query.code || "");
  const stateData = oauthStateStore.get(state);
  oauthStateStore.delete(state);

  if (!stateData || stateData.provider !== provider || !code) {
    return res.status(400).send("Invalid OAuth callback state/code");
  }
  if (Date.now() - stateData.createdAt > OAUTH_STATE_TTL_MS) {
    return res.status(400).send("OAuth state expired");
  }

  try {
    const callbackUrl = `${getBackendBaseUrl(req)}/auth/oauth/${provider}/callback`;
    let tokenPayload;

    if (provider === "google") {
      const tokenRes = await fetch(cfg.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: callbackUrl,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) throw new Error("google_token_exchange_failed");
      tokenPayload = await tokenRes.json();
    } else {
      const tokenUrl = new URL(cfg.tokenUrl);
      tokenUrl.searchParams.set("client_id", cfg.clientId);
      tokenUrl.searchParams.set("client_secret", cfg.clientSecret);
      tokenUrl.searchParams.set("redirect_uri", callbackUrl);
      tokenUrl.searchParams.set("code", code);
      const tokenRes = await fetch(tokenUrl.toString());
      if (!tokenRes.ok) throw new Error("facebook_token_exchange_failed");
      tokenPayload = await tokenRes.json();
    }

    const identity = await getOAuthIdentity(provider, String(tokenPayload.access_token || ""));
    const user = await findOrCreateOAuthUser(provider, identity);
    const appToken = issueToken(user.id);

    const appRedirect = new URL(stateData.redirectUriMobile);
    appRedirect.searchParams.set("token", appToken);
    return res.redirect(appRedirect.toString());
  } catch (_error) {
    const appRedirect = new URL(stateData.redirectUriMobile);
    appRedirect.searchParams.set("error", "oauth_failed");
    return res.redirect(appRedirect.toString());
  }
});

app.get("/me", requireAuth, (req, res) => {
  db.getUserById(req.userId).then((user) => {
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(sanitizeUser(user));
  }).catch((error) => res.status(500).json({ error: String(error) }));
});

app.post("/me/profile", requireAuth, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();

  if (!name) return res.status(400).json({ error: "name is required" });
  if (!email || !email.includes("@")) return res.status(400).json({ error: "invalid email" });

  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const existing = await db.getUserByEmail(email);
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const updated = await db.updateUserProfile(user.id, { name, email });
    return res.json(sanitizeUser(updated));
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.post("/me/password", requireAuth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");
  const newPassword = String(req.body?.newPassword || "");

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "currentPassword and newPassword are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "new password must be at least 6 characters" });
  }

  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid current password" });

    const nextHash = await bcrypt.hash(newPassword, 10);
    await db.updateUserPassword(user.id, nextHash);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.post("/me/card", requireAuth, async (req, res) => {
  const cardNumber = normalizeCardNumber(req.body?.cardNumber);
  if (!isValidCardNumber(cardNumber)) {
    return res.status(400).json({ error: "Invalid loyalty card number format" });
  }

  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const existingCardOwner = await db.getUserByCardNumber(cardNumber);
    if (existingCardOwner && existingCardOwner.id !== user.id) {
      return res.status(409).json({ error: "Loyalty card is already linked to another profile" });
    }

    const updated = await db.updateUserCardNumber(user.id, cardNumber);
    return res.json({
      cardNumber: updated.cardNumber,
      barcode: updated.cardNumber,
      qrValue: `ZITO:${updated.cardNumber}:${updated.id}`,
    });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.get("/loyalty/card", requireAuth, (req, res) => {
  db.getUserById(req.userId).then((user) => {
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({
      cardNumber: user.cardNumber,
      barcode: user.cardNumber,
      qrValue: `ZITO:${user.cardNumber}:${user.id}`,
    });
  }).catch((error) => res.status(500).json({ error: String(error) }));
});

app.get("/flyers", requireAuth, (_req, res) => {
  db.listFlyers()
    .then((rows) => res.json(rows))
    .catch((error) => res.status(500).json({ error: String(error) }));
});

app.post("/price/check", requireAuth, async (req, res) => {
  const barcode = normalizeBarcode(req.body?.barcode);
  if (!isValidBarcode(barcode)) {
    return res.status(400).json({ error: "Invalid barcode format" });
  }
  try {
    const price = await db.getProductPriceByBarcode(barcode);
    if (!price) return res.status(404).json({ error: "Product not found" });
    return res.json(price);
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.get("/notifications", requireAuth, (_req, res) => {
  db.listNotifications()
    .then((rows) => res.json(rows))
    .catch((error) => res.status(500).json({ error: String(error) }));
});

app.post("/push/register", requireAuth, (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "token is required" });

  db.addPushToken(token)
    .then(() => res.json({ registered: true, token }))
    .catch((error) => res.status(500).json({ error: String(error) }));
});

app.post("/push/test", requireAuth, async (req, res) => {
  const { token, title, body } = req.body || {};
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) return res.status(400).json({ error: "token is required" });
  if (!normalizedToken.startsWith("ExponentPushToken[")) {
    return res.status(400).json({ error: "invalid expo push token" });
  }

  const pushTitle = String(title || "Zito aplikacija");
  const pushBody = String(body || "Test push notifikacija.");

  try {
    const pushResult = await sendExpoPush([normalizedToken], pushTitle, pushBody);
    if (pushResult.errors && pushResult.errors.length > 0) {
      return res.status(502).json({
        ok: false,
        error: "Push ticket error",
        errors: pushResult.errors,
      });
    }
    await db.addNotification({
      id: `n${Date.now()}`,
      title: pushTitle,
      body: pushBody,
      createdAt: "now",
    });
    return res.json({ ok: true, ...pushResult });
  } catch (error) {
    return res.status(500).json({ error: "Push test send failed", detail: String(error) });
  }
});

app.post("/admin/flyers", requireAdmin, (req, res) => {
  const { title, price, image } = req.body || {};
  if (!title || !price) return res.status(400).json({ error: "title and price are required" });
  const flyer = {
    id: `f${Date.now()}`,
    title: String(title),
    price: String(price),
    image: String(image || "flyers_grid.png"),
  };
  db.addFlyer(flyer)
    .then((row) => res.json(row))
    .catch((error) => res.status(500).json({ error: String(error) }));
});

app.get("/admin/flyers", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.listFlyers();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.delete("/admin/flyers/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "id is required" });
  try {
    const deleted = await db.deleteFlyerById(id);
    if (!deleted) return res.status(404).json({ error: "Flyer not found" });
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.post("/admin/notifications", requireAdmin, (req, res) => {
  const { title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "title and body are required" });
  const notice = {
    id: `n${Date.now()}`,
    title: String(title),
    body: String(body),
    createdAt: "now",
  };
  db.addNotification(notice)
    .then((row) => res.json(row))
    .catch((error) => res.status(500).json({ error: String(error) }));
});

app.get("/admin/notifications", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.listNotifications();
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.delete("/admin/notifications/:id", requireAdmin, async (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "id is required" });
  try {
    const deleted = await db.deleteNotificationById(id);
    if (!deleted) return res.status(404).json({ error: "Notification not found" });
    return res.json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.post("/admin/push-broadcast", requireAdmin, async (req, res) => {
  const { title, body } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "title and body are required" });

  try {
    const tokens = await db.listPushTokens();
    const result = await sendExpoPush(tokens, String(title), String(body));
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Push send failed", detail: String(error) });
  }
});

app.post("/admin/prices", requireAdmin, async (req, res) => {
  const barcode = normalizeBarcode(req.body?.barcode);
  const name = String(req.body?.name || "").trim();
  const price = String(req.body?.price || "").trim();
  const currency = String(req.body?.currency || "MKD").trim() || "MKD";
  const unit = String(req.body?.unit || "").trim();

  if (!isValidBarcode(barcode)) return res.status(400).json({ error: "Invalid barcode format" });
  if (!name || !price) return res.status(400).json({ error: "name and price are required" });

  try {
    const saved = await db.upsertProductPrice({
      barcode,
      name,
      price,
      currency,
      unit,
      updatedAt: new Date().toISOString(),
    });
    return res.json(saved);
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.get("/admin/prices", requireAdmin, async (req, res) => {
  const limitRaw = Number(req.query?.limit || 500);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 500;
  try {
    const rows = await db.listProductPrices(limit);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.delete("/admin/prices/:barcode", requireAdmin, async (req, res) => {
  const barcode = normalizeBarcode(req.params?.barcode);
  if (!isValidBarcode(barcode)) return res.status(400).json({ error: "Invalid barcode format" });
  try {
    const deleted = await db.deleteProductPriceByBarcode(barcode);
    if (!deleted) return res.status(404).json({ error: "Price item not found" });
    return res.json({ ok: true, barcode });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.use((error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large. Max upload size is 50MB." });
  }
  return next(error);
});

async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`Zito backend listening on http://localhost:${PORT}`);
    console.log(`Database engine: ${db.type}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});

