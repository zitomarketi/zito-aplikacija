require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("node:path");
const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { dbFactory } = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 8000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "change-me";
const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const BACKEND_PUBLIC_URL = (process.env.BACKEND_PUBLIC_URL || "").replace(/\/+$/, "");
const db = dbFactory();
const oauthStateStore = new Map();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

app.use(cors());
app.use(express.json());
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

async function start() {
  await db.init();
  app.listen(PORT, () => {
    console.log(`Zito backend listening on http://localhost:${PORT}`);
    console.log(`Database engine: ${db.type}`);
    console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
    console.log(`Admin token: ${ADMIN_TOKEN}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});

