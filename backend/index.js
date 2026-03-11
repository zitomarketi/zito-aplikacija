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
const EXTERNAL_PRICES_API_BASE = String(process.env.EXTERNAL_PRICES_API_BASE || "").trim().replace(/\/+$/, "");
const EXTERNAL_PRICES_API_PATH = String(process.env.EXTERNAL_PRICES_API_PATH || "/api/artikli").trim() || "/api/artikli";
const EXTERNAL_PRICES_TIMEOUT_MS = Number(process.env.EXTERNAL_PRICES_TIMEOUT_MS || 9000);
const PRICE_REFRESH_HOUR_LOCAL = Number(process.env.PRICE_REFRESH_HOUR_LOCAL || 7);
const PRICE_REFRESH_TIMEZONE = String(process.env.PRICE_REFRESH_TIMEZONE || "Europe/Skopje").trim() || "Europe/Skopje";
const LOYALTY_SOAP_URL = String(process.env.LOYALTY_SOAP_URL || "").trim();
const LOYALTY_SOAP_STRICT_VERIFY = String(process.env.LOYALTY_SOAP_STRICT_VERIFY || "false").trim().toLowerCase() === "true";
const LOYALTY_VERIFY_USERNAME_TEMPLATE = String(process.env.LOYALTY_VERIFY_USERNAME_TEMPLATE || "{CARD}").trim();
const LOYALTY_VERIFY_PASSWORD_TEMPLATE = String(process.env.LOYALTY_VERIFY_PASSWORD_TEMPLATE || "{CARD}").trim();
const APK_ASSET_GROUP_DIRS = {
  letoci: path.resolve(__dirname, "..", "zito-app", "assets", "images", "letoci"),
  akcii: path.resolve(__dirname, "..", "zito-app", "assets", "images", "akcii"),
  home_top: path.resolve(__dirname, "..", "zito-app", "assets", "images"),
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
const ASSET_EXT_TO_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};
const NOTIFICATION_ASSET_GROUP = "notifications";
const HOME_TOP_GROUP = "home_top";

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

function normalizePriceQuery(input) {
  return String(input || "").trim().slice(0, 120);
}

function normalizeSearchText(input) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toMacedonianCyrillic(input) {
  const source = String(input || "").trim();
  if (!source) return "";
  const digraphs = [
    [/DZH/g, "Џ"], [/Dzh/g, "Џ"], [/dzh/g, "џ"],
    [/LJ/g, "Љ"], [/Lj/g, "Љ"], [/lj/g, "љ"],
    [/NJ/g, "Њ"], [/Nj/g, "Њ"], [/nj/g, "њ"],
    [/GJ/g, "Ѓ"], [/Gj/g, "Ѓ"], [/gj/g, "ѓ"],
    [/KJ/g, "Ќ"], [/Kj/g, "Ќ"], [/kj/g, "ќ"],
    [/ZH/g, "Ж"], [/Zh/g, "Ж"], [/zh/g, "ж"],
    [/SH/g, "Ш"], [/Sh/g, "Ш"], [/sh/g, "ш"],
    [/CH/g, "Ч"], [/Ch/g, "Ч"], [/ch/g, "ч"],
    [/DZ/g, "Ѕ"], [/Dz/g, "Ѕ"], [/dz/g, "ѕ"],
  ];
  let output = source;
  for (const [pattern, letter] of digraphs) {
    output = output.replace(pattern, letter);
  }
  const charMap = {
    A: "А", a: "а", B: "Б", b: "б", C: "Ц", c: "ц", D: "Д", d: "д", E: "Е", e: "е",
    F: "Ф", f: "ф", G: "Г", g: "г", H: "Х", h: "х", I: "И", i: "и", J: "Ј", j: "ј",
    K: "К", k: "к", L: "Л", l: "л", M: "М", m: "м", N: "Н", n: "н", O: "О", o: "о",
    P: "П", p: "п", Q: "Ќ", q: "ќ", R: "Р", r: "р", S: "С", s: "с", T: "Т", t: "т",
    U: "У", u: "у", V: "В", v: "в", W: "В", w: "в", X: "Кс", x: "кс", Y: "Ј", y: "ј",
    Z: "З", z: "з",
  };
  return output
    .split("")
    .map((ch) => charMap[ch] || ch)
    .join("");
}

function getTzParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

function businessDayKey(date, timeZone, refreshHour) {
  const parts = getTzParts(date, timeZone);
  let y = parts.year;
  let m = parts.month;
  let d = parts.day;
  if (parts.hour < refreshHour) {
    const prev = new Date(Date.UTC(y, m - 1, d));
    prev.setUTCDate(prev.getUTCDate() - 1);
    y = prev.getUTCFullYear();
    m = prev.getUTCMonth() + 1;
    d = prev.getUTCDate();
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function isPriceFreshForBusinessDay(updatedAt) {
  const parsed = new Date(String(updatedAt || ""));
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  const refreshHour = Number.isFinite(PRICE_REFRESH_HOUR_LOCAL) ? PRICE_REFRESH_HOUR_LOCAL : 7;
  const updatedKey = businessDayKey(parsed, PRICE_REFRESH_TIMEZONE, refreshHour);
  const currentKey = businessDayKey(now, PRICE_REFRESH_TIMEZONE, refreshHour);
  return updatedKey === currentKey;
}

function hasLoyaltySoapConfigured() {
  return /^https?:\/\//i.test(LOYALTY_SOAP_URL);
}

function shouldRejectOnLoyaltyServiceError() {
  return LOYALTY_SOAP_STRICT_VERIFY;
}

function resolveLoyaltyTemplate(template, cardNumber) {
  return String(template || "")
    .replace(/\{CARD\}/gi, String(cardNumber || "").trim())
    .trim();
}

function loyaltyBaseUrl() {
  return String(LOYALTY_SOAP_URL || "").replace(/\?.*$/, "").replace(/\/+$/, "");
}

function decodeXmlEntities(input) {
  return String(input || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTagValue(xml, tag) {
  const match = String(xml || "").match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXmlEntities(match[1]).trim() : "";
}

function parseLoyaltyPurchases(xmlText) {
  const decoded = decodeXmlEntities(xmlText).trim();
  if (decoded.startsWith("[") || decoded.startsWith("{")) {
    try {
      const parsed = JSON.parse(decoded);
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
      return rows.map((row) => ({
        brKasa: String(row?.BrKasa ?? row?.brKasa ?? ""),
        brojSka: String(row?.Broj_Ska ?? row?.brojSka ?? ""),
        datumSka: String(row?.Datum_Ska ?? row?.datumSka ?? ""),
        imeArt: String(row?.ImeArt ?? row?.imeArt ?? ""),
        kolicina: String(row?.Kolicina ?? row?.kolicina ?? ""),
        vrednost: String(row?.Vrednost ?? row?.vrednost ?? ""),
      }));
    } catch (_error) {
      // Continue with XML parsing.
    }
  }
  const list = [];
  const blocks = decoded.match(/<LicnaSmetka>[\s\S]*?<\/LicnaSmetka>/gi) || [];
  for (const block of blocks) {
    list.push({
      brKasa: extractTagValue(block, "BrKasa"),
      brojSka: extractTagValue(block, "Broj_Ska"),
      datumSka: extractTagValue(block, "Datum_Ska"),
      imeArt: extractTagValue(block, "ImeArt"),
      kolicina: extractTagValue(block, "Kolicina"),
      vrednost: extractTagValue(block, "Vrednost"),
    });
  }
  return list;
}

async function callLoyaltySoap(methodName, barkod) {
  if (!hasLoyaltySoapConfigured()) {
    return { ok: false, error: "LOYALTY_SOAP_URL is not configured", raw: "" };
  }
  const base = loyaltyBaseUrl();
  const value = String(barkod || "").trim();
  const username = encodeURIComponent(resolveLoyaltyTemplate(LOYALTY_VERIFY_USERNAME_TEMPLATE, value));
  const password = encodeURIComponent(resolveLoyaltyTemplate(LOYALTY_VERIFY_PASSWORD_TEMPLATE, value));
  const encoded = encodeURIComponent(value);

  const candidates = [];
  if (methodName === "ProverkaKorisnik") {
    candidates.push(`${base}/ProverkaKorisnik?Username=${username}&Password=${password}`);
    candidates.push(`${base}/ProverkaKorisnik?barkod=${encoded}`);
  } else if (methodName === "ZemiLicnaSmetka") {
    candidates.push(`${base}/ZemiLicnaSmetka?Sifra_Kor=${encoded}`);
    candidates.push(`${base}/ZemiLicnaSmetka?barkod=${encoded}`);
  } else if (methodName === "ZemiPoeniZaBarkod") {
    candidates.push(`${base}/ZemiPoeniZaBarkod?Sifra_Kor=${encoded}`);
    candidates.push(`${base}/ZemiPoeniZaBarkod?barkod=${encoded}`);
  } else {
    candidates.push(`${base}/${encodeURIComponent(methodName)}?barkod=${encoded}`);
  }

  let lastError = "No loyalty endpoint candidates";
  for (const url of candidates) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json, text/plain, text/xml, */*" },
        signal: controller.signal,
      });
      const raw = await response.text();
      if (response.ok) return { ok: true, error: "", raw };
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = String(error?.message || error);
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, error: lastError, raw: "" };
}

function parseLoyaltyVerify(rawSoap) {
  const decoded = decodeXmlEntities(rawSoap).trim();
  const resultMatch = decoded.match(/<\w*:?(?:ProverkaKorisnikResult|ProverkaKorisnikResponseResult|string)[^>]*>([\s\S]*?)<\/\w*:?(?:ProverkaKorisnikResult|ProverkaKorisnikResponseResult|string)>/i);
  let value = (resultMatch ? resultMatch[1] : decoded).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  value = value.toLowerCase();
  if (!value) return false;
  return value.includes("true") || value === "1" || value.includes("valid") || value.includes("ok");
}

function parseLoyaltyPoints(rawSoap) {
  const decoded = decodeXmlEntities(rawSoap).trim();
  if (decoded.startsWith("{") || decoded.startsWith("[")) {
    try {
      const parsed = JSON.parse(decoded);
      const source = Array.isArray(parsed) ? parsed[0] : parsed;
      const pointValue = source?.NoviPoeni ?? source?.Poeni_Tekoven_Mesec ?? source?.StariPoeni ?? source?.points ?? 0;
      const numeric = Number(String(pointValue).replace(",", "."));
      return Number.isFinite(numeric) ? numeric : 0;
    } catch (_error) {
      // Continue with XML/plain parsing.
    }
  }
  const resultMatch = decoded.match(/<\w*:?(?:ZemiPoeniZaBarkodResult|string)[^>]*>([\s\S]*?)<\/\w*:?(?:ZemiPoeniZaBarkodResult|string)>/i);
  const value = resultMatch ? decodeXmlEntities(resultMatch[1]) : decoded;
  const numberMatch = String(value).match(/-?\d+(?:[.,]\d+)?/);
  if (!numberMatch) return 0;
  return Number(numberMatch[0].replace(",", ".")) || 0;
}

function asNumberValue(input) {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const normalized = input.replace(",", ".").replace(/[^\d.-]/g, "").trim();
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeExternalPriceItem(item, query, queryBarcode) {
  if (!item || typeof item !== "object") return null;
  const nestedBarcodes = [];
  if (Array.isArray(item.barcodes)) {
    nestedBarcodes.push(...item.barcodes);
  } else if (typeof item.barcodes === "string" && item.barcodes.trim()) {
    try {
      const parsed = JSON.parse(item.barcodes);
      if (Array.isArray(parsed)) nestedBarcodes.push(...parsed);
    } catch (_error) {
      nestedBarcodes.push(item.barcodes);
    }
  }

  const barcodeCandidates = [
    item.barcode,
    item.barkod,
    item.Barcode,
    item.Barkod,
    item.glavenBarcode,
    item.GlavenBarcode,
    item.sifraArt,
    item.SifraArt,
    item.sifra,
    item.Sifra,
    item.code,
    item.Code,
    ...nestedBarcodes,
  ]
    .map((x) => normalizeBarcode(x))
    .filter(Boolean);
  const itemName = String(item.name || item.naziv || item.artikl || item.imeArt || item.Naziv || item.Artikl || item.ImeArt || "").trim();
  const itemSifra = String(item.sifraArt || item.sifra || item.SifraArt || item.Sifra || "").trim();
  const queryText = normalizeSearchText(query);
  const nameText = normalizeSearchText(itemName);
  const sifraText = normalizeSearchText(itemSifra);
  const matchesBarcode = Boolean(queryBarcode && barcodeCandidates.includes(queryBarcode));
  const matchesName = Boolean(queryText && nameText.includes(queryText));
  const matchesSifra = Boolean(queryText && sifraText.includes(queryText));
  if (!matchesBarcode && !matchesName && !matchesSifra) return null;

  const name = toMacedonianCyrillic(itemName || `Proizvod ${queryBarcode || queryText || "artikal"}`);
  const priceNumber =
    asNumberValue(item.price) ??
    asNumberValue(item.cena) ??
    asNumberValue(item.Cena) ??
    asNumberValue(item.maloprodazna) ??
    asNumberValue(item.Maloprodazna) ??
    asNumberValue(item.iznos) ??
    asNumberValue(item.Iznos);
  if (priceNumber === null) return null;
  const unit = String(item.unit || item.ed || item.edm || item.Unit || item.ED || "").trim();
  const updatedAt = String(item.updatedAt || item.datum || item.date || item.UpdatedAt || "").trim();
  const resolvedBarcode = queryBarcode || barcodeCandidates[0] || "";
  return {
    barcode: resolvedBarcode,
    name,
    price: String(priceNumber),
    currency: "MKD",
    unit,
    updatedAt: updatedAt || new Date().toISOString(),
  };
}

function extractArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.value)) return payload.value;
  return [];
}

async function fetchExternalPrice(query) {
  if (!EXTERNAL_PRICES_API_BASE) return null;
  const queryText = normalizePriceQuery(query);
  const queryBarcode = normalizeBarcode(queryText);
  if (!queryText) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, EXTERNAL_PRICES_TIMEOUT_MS));
  try {
    const baseUrl = `${EXTERNAL_PRICES_API_BASE}${EXTERNAL_PRICES_API_PATH.startsWith("/") ? "" : "/"}${EXTERNAL_PRICES_API_PATH}`;
    const urlWithBarcode = `${baseUrl}?${new URLSearchParams({ barcode: queryBarcode || queryText }).toString()}`;

    let response = await fetch(urlWithBarcode, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 404) return null;
    if (!response.ok || response.status === 404) {
      response = await fetch(baseUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) return null;
    }

    const payload = await response.json();
    const rows = extractArrayPayload(payload);
    for (const row of rows) {
      const mapped = normalizeExternalPriceItem(row, queryText, queryBarcode);
      if (mapped) return mapped;
    }
    return null;
  } catch (_error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function listApkAssets(group) {
  const dbRows = await db.listCmsAssets(group);
  return dbRows
    .map((row) => ({
      groupName: row.groupName,
      fileName: row.fileName,
      mimeType: row.mimeType,
      source: "db",
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function isPdfThumbnailFileName(fileName) {
  return /\.pdf\.thumb\.jpe?g$/i.test(String(fileName || ""));
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

function normalizeNoticeKind(input) {
  const kind = String(input || "")
    .trim()
    .toLowerCase();
  if (kind === "image" || kind === "pdf" || kind === "text") return kind;
  return "text";
}

function extractNotificationAssetFileFromUrl(urlValue) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const prefix = "/cms/notification-asset/";
    const idx = u.pathname.indexOf(prefix);
    if (idx < 0) return "";
    const encoded = u.pathname.slice(idx + prefix.length);
    return path.basename(decodeURIComponent(encoded));
  } catch (_error) {
    return "";
  }
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

app.get("/cms/apk-asset/:group/:file", async (req, res) => {
  const group = String(req.params?.group || "").trim();
  const dir = APK_ASSET_GROUP_DIRS[group];
  if (!dir) return res.status(404).send("Unknown group");

  const file = path.basename(String(req.params?.file || ""));
  if (!file || !/\.(png|jpe?g|webp|pdf)$/i.test(file)) return res.status(400).send("Invalid file");

  const dbAsset = await db.getCmsAsset(group, file);
  if (dbAsset && dbAsset.data) {
    const ext = ASSET_URL_EXT_TO_EXT[path.extname(file).toLowerCase()] || "";
    const fallbackMime = ASSET_EXT_TO_MIME[ext] || "application/octet-stream";
    res.setHeader("Content-Type", dbAsset.mimeType || fallbackMime);
    return res.send(dbAsset.data);
  }

  const fullPath = path.join(dir, file);
  if (!fullPath.startsWith(dir)) return res.status(400).send("Invalid path");
  if (!fs.existsSync(fullPath)) return res.status(404).send("Not found");

  return res.sendFile(fullPath);
});

app.get("/cms/notification-asset/:file", async (req, res) => {
  const file = path.basename(String(req.params?.file || ""));
  if (!file || !/\.(png|jpe?g|webp|pdf)$/i.test(file)) return res.status(400).send("Invalid file");

  const dbAsset = await db.getCmsAsset(NOTIFICATION_ASSET_GROUP, file);
  if (!dbAsset || !dbAsset.data) return res.status(404).send("Not found");

  const ext = ASSET_URL_EXT_TO_EXT[path.extname(file).toLowerCase()] || "";
  const fallbackMime = ASSET_EXT_TO_MIME[ext] || "application/octet-stream";
  res.setHeader("Content-Type", dbAsset.mimeType || fallbackMime);
  return res.send(dbAsset.data);
});

async function buildApkGalleryPayload(req) {
  const mkUrl = (group, file) => `${getBackendBaseUrl(req)}/cms/apk-asset/${group}/${encodeURIComponent(file)}`;
  const currentRows = await listApkAssets("letoci");
  const bestRows = await listApkAssets("akcii");

  const buildItems = (rows, group, idPrefix, labelPrefix) => {
    const thumbnailByPdfName = new Map();
    for (const row of rows) {
      if (!isPdfThumbnailFileName(row.fileName)) continue;
      const pdfName = String(row.fileName).replace(/\.thumb\.jpe?g$/i, "");
      thumbnailByPdfName.set(pdfName, mkUrl(group, row.fileName));
    }

    return rows
      .filter((row) => !isPdfThumbnailFileName(row.fileName))
      .map((row, idx) => ({
        id: `${idPrefix}-${idx + 1}`,
        label: `${labelPrefix} ${idx + 1}`,
        file: row.fileName,
        imageUrl: mkUrl(group, row.fileName),
        isPdf: /\.pdf$/i.test(row.fileName),
        thumbnailUrl: /\.pdf$/i.test(row.fileName) ? thumbnailByPdfName.get(row.fileName) || "" : "",
      }));
  };

  const currentFlyers = buildItems(currentRows, "letoci", "letok", "Letok");
  const bestDeals = buildItems(bestRows, "akcii", "akcija", "Akcija");
  return { currentFlyers, bestDeals };
}

async function buildHomeTopPayload(req) {
  const rows = await db.listCmsAssets(HOME_TOP_GROUP);
  const items = rows
    .filter((row) => !isPdfThumbnailFileName(row.fileName))
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const selected = items[0] || null;
  if (!selected) return { item: null };
  return {
    item: {
      file: selected.fileName,
      mimeType: selected.mimeType,
      imageUrl: `${getBackendBaseUrl(req)}/cms/apk-asset/${HOME_TOP_GROUP}/${encodeURIComponent(selected.fileName)}`,
      updatedAt: selected.updatedAt,
    },
  };
}

app.get("/cms/apk-gallery", async (req, res) => {
  return res.json(await buildApkGalleryPayload(req));
});

app.get("/admin/apk-gallery", requireAdmin, async (req, res) => {
  return res.json(await buildApkGalleryPayload(req));
});

app.get("/cms/home-top", async (req, res) => {
  return res.json(await buildHomeTopPayload(req));
});

app.get("/admin/home-top", requireAdmin, async (req, res) => {
  return res.json(await buildHomeTopPayload(req));
});

app.post("/admin/home-top/upload", requireAdmin, async (req, res) => {
  const rawName = sanitizeAssetFilename(req.body?.targetFile || req.body?.fileName || "");
  if (!rawName) return res.status(400).json({ error: "fileName is required" });

  const mimeType = String(req.body?.mimeType || "")
    .trim()
    .toLowerCase();
  const extFromMime = ASSET_MIME_TO_EXT[mimeType] || "";
  const extFromName = ASSET_URL_EXT_TO_EXT[path.extname(rawName).toLowerCase()] || "";
  const buffer = decodeBase64Image(req.body?.dataBase64);
  if (!buffer || buffer.length === 0) return res.status(400).json({ error: "File payload is empty" });
  if (buffer.length > MAX_UPLOAD_SIZE_BYTES) return res.status(400).json({ error: "File is too large (max 50MB)" });

  const extFromBuffer = detectAssetExtFromBuffer(buffer);
  const ext = extFromMime || extFromName || extFromBuffer;
  if (!ext || (ext !== ".png" && ext !== ".jpg" && ext !== ".webp")) {
    return res.status(400).json({ error: "Only png, jpg, webp are supported for home top field" });
  }

  const existing = await db.listCmsAssets(HOME_TOP_GROUP);
  for (const row of existing) {
    // eslint-disable-next-line no-await-in-loop
    await db.deleteCmsAsset(HOME_TOP_GROUP, row.fileName);
  }

  const finalName = rawName.toLowerCase().endsWith(ext) ? rawName : `${rawName}${ext}`;
  const mimeTypeFromExt = ASSET_EXT_TO_MIME[ext] || "application/octet-stream";
  await db.upsertCmsAsset({
    groupName: HOME_TOP_GROUP,
    fileName: finalName,
    mimeType: mimeTypeFromExt,
    data: buffer,
    updatedAt: new Date().toISOString(),
  });
  return res.json({ ok: true, group: HOME_TOP_GROUP, file: finalName, bytes: buffer.length, storage: "db" });
});

app.delete("/admin/home-top", requireAdmin, async (_req, res) => {
  const existing = await db.listCmsAssets(HOME_TOP_GROUP);
  let deleted = 0;
  for (const row of existing) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await db.deleteCmsAsset(HOME_TOP_GROUP, row.fileName);
    if (ok) deleted += 1;
  }
  return res.json({ ok: true, deleted });
});

app.post("/admin/apk-gallery/upload", requireAdmin, async (req, res) => {
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
  const mimeTypeFromExt = ASSET_EXT_TO_MIME[ext] || "application/octet-stream";
  await db.upsertCmsAsset({
    groupName: group,
    fileName: finalName,
    mimeType: mimeTypeFromExt,
    data: buffer,
    updatedAt: new Date().toISOString(),
  });

  if (ext === ".pdf") {
    const thumbRaw = String(req.body?.thumbnailBase64 || "").trim();
    if (thumbRaw) {
      try {
        const thumbBuffer = decodeBase64Image(thumbRaw);
        if (thumbBuffer && thumbBuffer.length > 0 && thumbBuffer.length <= 5 * 1024 * 1024) {
          await db.upsertCmsAsset({
            groupName: group,
            fileName: `${finalName}.thumb.jpg`,
            mimeType: "image/jpeg",
            data: thumbBuffer,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (_error) {
        // Do not fail main PDF upload when thumbnail generation fails.
      }
    }
  }
  return res.json({ ok: true, group, file: finalName, bytes: buffer.length, storage: "db" });
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
    const mimeTypeFromExt = ASSET_EXT_TO_MIME[ext] || "application/octet-stream";
    await db.upsertCmsAsset({
      groupName: group,
      fileName: finalName,
      mimeType: mimeTypeFromExt,
      data: buffer,
      updatedAt: new Date().toISOString(),
    });
    return res.json({ ok: true, group, file: finalName, bytes: buffer.length, source: "url", storage: "db" });
  } catch (error) {
    return res.status(400).json({ error: String(error?.message || error) });
  }
});

app.delete("/admin/apk-gallery/:group/:file", requireAdmin, async (req, res) => {
  const group = String(req.params?.group || "").trim();
  const dir = APK_ASSET_GROUP_DIRS[group];
  if (!dir) return res.status(400).json({ error: "Invalid group" });

  const file = sanitizeAssetFilename(req.params?.file || "");
  if (!file || !/\.(png|jpe?g|webp|pdf)$/i.test(file)) {
    return res.status(400).json({ error: "Invalid file name" });
  }

  let dbDeleted = false;
  let fsDeleted = false;
  try {
    dbDeleted = await db.deleteCmsAsset(group, file);
  } catch (_error) {
    dbDeleted = false;
  }

  const fullPath = path.join(dir, file);
  if (fullPath.startsWith(dir) && fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      fsDeleted = true;
    } catch (_error) {
      fsDeleted = false;
    }
  }

  if (!dbDeleted && !fsDeleted) {
    return res.status(404).json({ error: "Asset not found" });
  }
  return res.json({ ok: true, group, file, deletedFromDb: dbDeleted, deletedFromFs: fsDeleted });
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
    if (hasLoyaltySoapConfigured()) {
      const verifyResult = await callLoyaltySoap("ProverkaKorisnik", submittedCardNumber);
      if (!verifyResult.ok) {
        if (shouldRejectOnLoyaltyServiceError()) {
          return res.status(502).json({ error: `Loyalty service unavailable: ${verifyResult.error}` });
        }
      } else if (!parseLoyaltyVerify(verifyResult.raw) && shouldRejectOnLoyaltyServiceError()) {
        return res.status(400).json({ error: "Invalid loyalty card number" });
      }
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
    if (hasLoyaltySoapConfigured()) {
      const verifyResult = await callLoyaltySoap("ProverkaKorisnik", cardNumber);
      if (!verifyResult.ok) {
        if (shouldRejectOnLoyaltyServiceError()) {
          return res.status(502).json({ error: `Loyalty service unavailable: ${verifyResult.error}` });
        }
      } else if (!parseLoyaltyVerify(verifyResult.raw) && shouldRejectOnLoyaltyServiceError()) {
        return res.status(400).json({ error: "Invalid loyalty card number" });
      }
    }

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

app.get("/loyalty/purchases", requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const barkod = normalizeCardNumber(user.cardNumber);
    if (!isValidCardNumber(barkod)) return res.status(400).json({ error: "No valid loyalty card linked" });
    const soap = await callLoyaltySoap("ZemiLicnaSmetka", barkod);
    if (!soap.ok) return res.status(502).json({ error: `Loyalty service unavailable: ${soap.error}` });
    return res.json({ items: parseLoyaltyPurchases(soap.raw) });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.get("/loyalty/points", requireAuth, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const barkod = normalizeCardNumber(user.cardNumber);
    if (!isValidCardNumber(barkod)) return res.status(400).json({ error: "No valid loyalty card linked" });
    const soap = await callLoyaltySoap("ZemiPoeniZaBarkod", barkod);
    if (!soap.ok) return res.status(502).json({ error: `Loyalty service unavailable: ${soap.error}` });
    return res.json({ points: parseLoyaltyPoints(soap.raw) });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
});

app.get("/flyers", requireAuth, (_req, res) => {
  db.listFlyers()
    .then((rows) => res.json(rows))
    .catch((error) => res.status(500).json({ error: String(error) }));
});

app.post("/price/check", requireAuth, async (req, res) => {
  const query = normalizePriceQuery(req.body?.query || req.body?.barcode);
  const barcode = normalizeBarcode(query);
  if (!query || (barcode && !isValidBarcode(barcode) && query === barcode)) {
    return res.status(400).json({ error: "Invalid barcode or query format" });
  }
  try {
    let localPrice = null;
    if (barcode) {
      localPrice = await db.getProductPriceByBarcode(barcode);
      if (localPrice && isPriceFreshForBusinessDay(localPrice.updatedAt)) {
        return res.json(localPrice);
      }
    }

    const externalPrice = await fetchExternalPrice(query);
    if (externalPrice) {
      try {
        const persistBarcode = normalizeBarcode(externalPrice.barcode || barcode);
        if (persistBarcode && isValidBarcode(persistBarcode)) {
          await db.upsertProductPrice({
            barcode: persistBarcode,
            name: externalPrice.name,
            price: externalPrice.price,
            currency: externalPrice.currency || "MKD",
            unit: externalPrice.unit || "",
            updatedAt: externalPrice.updatedAt || new Date().toISOString(),
          });
        }
      } catch (_error) {
        // Ignore cache write failures and still return external result.
      }
      return res.json(externalPrice);
    }

    if (localPrice) return res.json(localPrice);
    return res.status(404).json({ error: "Product not found" });
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
  const normalizedTitle = String(title || "").trim();
  const normalizedBody = String(body || "").trim();
  if (!normalizedTitle || !normalizedBody) return res.status(400).json({ error: "title and body are required" });
  const notice = {
    id: `n${Date.now()}`,
    title: normalizedTitle,
    body: normalizedBody,
    createdAt: "now",
    kind: "text",
    mediaUrl: "",
    thumbnailUrl: "",
  };
  db.addNotification(notice)
    .then((row) => res.json(row))
    .catch((error) => res.status(500).json({ error: String(error) }));
});

app.post("/admin/notifications/upload", requireAdmin, async (req, res) => {
  const rawName = sanitizeAssetFilename(req.body?.targetFile || req.body?.fileName || "");
  if (!rawName) return res.status(400).json({ error: "fileName is required" });

  const mimeType = String(req.body?.mimeType || "")
    .trim()
    .toLowerCase();
  const extFromMime = ASSET_MIME_TO_EXT[mimeType] || "";
  const extFromName = ASSET_URL_EXT_TO_EXT[path.extname(rawName).toLowerCase()] || "";
  const buffer = decodeBase64Image(req.body?.dataBase64);
  if (!buffer || buffer.length === 0) return res.status(400).json({ error: "File payload is empty" });
  if (buffer.length > MAX_UPLOAD_SIZE_BYTES) return res.status(400).json({ error: "File is too large (max 50MB)" });

  const extFromBuffer = detectAssetExtFromBuffer(buffer);
  const ext = extFromMime || extFromName || extFromBuffer;
  if (!ext || (ext !== ".png" && ext !== ".jpg" && ext !== ".webp" && ext !== ".pdf")) {
    return res.status(400).json({ error: "Only png, jpg, webp, pdf are supported" });
  }

  const finalName = rawName.toLowerCase().endsWith(ext) ? rawName : `${rawName}${ext}`;
  const mimeTypeFromExt = ASSET_EXT_TO_MIME[ext] || "application/octet-stream";
  await db.upsertCmsAsset({
    groupName: NOTIFICATION_ASSET_GROUP,
    fileName: finalName,
    mimeType: mimeTypeFromExt,
    data: buffer,
    updatedAt: new Date().toISOString(),
  });

  let thumbnailUrl = "";
  if (ext === ".pdf") {
    const thumbRaw = String(req.body?.thumbnailBase64 || "").trim();
    if (thumbRaw) {
      try {
        const thumbBuffer = decodeBase64Image(thumbRaw);
        if (thumbBuffer && thumbBuffer.length > 0 && thumbBuffer.length <= 5 * 1024 * 1024) {
          const thumbFileName = `${finalName}.thumb.jpg`;
          await db.upsertCmsAsset({
            groupName: NOTIFICATION_ASSET_GROUP,
            fileName: thumbFileName,
            mimeType: "image/jpeg",
            data: thumbBuffer,
            updatedAt: new Date().toISOString(),
          });
          thumbnailUrl = `${getBackendBaseUrl(req)}/cms/notification-asset/${encodeURIComponent(thumbFileName)}`;
        }
      } catch (_error) {
        thumbnailUrl = "";
      }
    }
  }

  const mediaUrl = `${getBackendBaseUrl(req)}/cms/notification-asset/${encodeURIComponent(finalName)}`;
  const notice = {
    id: `n${Date.now()}`,
    title: String(req.body?.title || "").trim() || "Нова нотификација",
    body: String(req.body?.body || "").trim(),
    createdAt: "now",
    kind: normalizeNoticeKind(ext === ".pdf" ? "pdf" : "image"),
    mediaUrl,
    thumbnailUrl,
  };

  try {
    const saved = await db.addNotification(notice);
    return res.json({ ...saved, file: finalName, bytes: buffer.length });
  } catch (error) {
    return res.status(500).json({ error: String(error) });
  }
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
    const rows = await db.listNotifications();
    const target = rows.find((row) => String(row.id) === id);
    const deleted = await db.deleteNotificationById(id);
    if (!deleted) return res.status(404).json({ error: "Notification not found" });

    const mediaFile = extractNotificationAssetFileFromUrl(target?.mediaUrl);
    const thumbFile = extractNotificationAssetFileFromUrl(target?.thumbnailUrl);
    let deletedAsset = false;
    let deletedThumbnail = false;
    if (mediaFile) {
      deletedAsset = await db.deleteCmsAsset(NOTIFICATION_ASSET_GROUP, mediaFile);
    }
    if (thumbFile) {
      deletedThumbnail = await db.deleteCmsAsset(NOTIFICATION_ASSET_GROUP, thumbFile);
    }

    return res.json({ ok: true, id, deletedAsset, deletedThumbnail });
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


