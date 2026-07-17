/* ===========================================================
   Word-Whack Blitz — server API
   =========================================================== */

const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const multer = require("multer");

const PORT = process.env.PORT || 3000;
const INWORLD_API_ENABLED = !/^(0|false|no|off)$/i.test(
  process.env.INWORLD_API_ENABLED ?? "1"
);
const INWORLD_API_DISABLED_MESSAGE =
  "Inworld API is disabled. Unset INWORLD_API_ENABLED=0 or set INWORLD_API_ENABLED=1.";
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DB_MAX_BYTES = 200 * 1024 * 1024;
const DATA_DIR =
  process.env.GAME_DATA_DIR ||
  (process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "game-data")
    : path.join(__dirname, "data"));
const DB_PATH = path.join(DATA_DIR, "game.db");
const WORDWHACK_SLOTS = new Set([
  "background",
  "cloud",
  "hole",
  "mole",
  "wordSign",
  "sign",
  "returnBtn",
  "stopwatch",
  "progressFrame",
  "panel",
  "button",
  "cursor",
]);

const CARDGAME_SLOTS = new Set([
  "card_background",
  "card_returnBtn",
  "card_timer",
  "card_star",
  "card_cardBack",
  "card_progressBar",
  "card_levelPanel",
]);

const FINDGAME_SLOTS = new Set([
  "find_background",
  "find_scene",
  "find_returnBtn",
  "find_panel",
]);

const LEVEL_SCENE_SLOT_RE = /^find_level_scene_\d+$/;

function levelSceneSlotKey(levelId) {
  return `find_level_scene_${levelId}`;
}

function isLevelSceneSlot(slotKey) {
  return LEVEL_SCENE_SLOT_RE.test(slotKey);
}

function isValidImageSlot(slotKey) {
  return VALID_SLOTS.has(slotKey) || isLevelSceneSlot(slotKey);
}

const VALID_SLOTS = new Set([...WORDWHACK_SLOTS, ...CARDGAME_SLOTS, ...FINDGAME_SLOTS]);

const GAME_SLOTS = {
  wordwhack: WORDWHACK_SLOTS,
  cardgame: CARDGAME_SLOTS,
  findgame: FINDGAME_SLOTS,
};

const DEFAULT_FINDGAME_LEVELS = [
  {
    sentence: "Find the red apple on the table!",
    target: "0",
    hotspots: [
      { x: 0.35, y: 0.517, radius: 0.08, target: "apple" },
      { x: 0.7, y: 0.758, radius: 0.09, target: "cat" },
    ],
  },
  {
    sentence: "Where is the orange cat?",
    target: "0",
    hotspots: [{ x: 0.7, y: 0.758, radius: 0.09, target: "cat" }],
  },
  {
    sentence: "Tap the yellow ball!",
    target: "0",
    hotspots: [{ x: 0.15, y: 0.8, radius: 0.08, target: "ball" }],
  },
  {
    sentence: "Can you find the blue book?",
    target: "0",
    hotspots: [{ x: 0.485, y: 0.153, radius: 0.07, target: "book" }],
  },
  {
    sentence: "Look for the gold star on the wall!",
    target: "0",
    hotspots: [{ x: 0.825, y: 0.25, radius: 0.07, target: "star" }],
  },
];

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS game_images (
    slot_key   TEXT PRIMARY KEY,
    mime_type  TEXT NOT NULL,
    data       BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS game_image_meta (
    slot_key TEXT PRIMARY KEY,
    scale    REAL NOT NULL DEFAULT 1.0
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS findgame_levels (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sentence      TEXT NOT NULL,
    target_label  TEXT NOT NULL,
    hotspot_x     REAL NOT NULL,
    hotspot_y     REAL NOT NULL,
    hotspot_radius REAL NOT NULL DEFAULT 0.08,
    sort_order    INTEGER NOT NULL DEFAULT 0
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS game_settings (
    setting_key   TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at    INTEGER NOT NULL
  )
`);
function ensureVocaItemsSchema() {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='voca_items'"
    )
    .get();
  if (tableExists) {
    const cols = db.prepare("PRAGMA table_info(voca_items)").all();
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("content") || !colNames.has("import_no")) {
      db.exec("DROP TABLE voca_items");
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS voca_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      import_no       TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'vocabulary',
      level           INTEGER NOT NULL DEFAULT 1,
      language_code   TEXT NOT NULL DEFAULT 'en',
      category        TEXT NOT NULL DEFAULT '',
      sub_category    TEXT NOT NULL DEFAULT '',
      content         TEXT NOT NULL,
      keywords        TEXT NOT NULL DEFAULT '',
      image_url       TEXT NOT NULL DEFAULT '',
      sort_order      INTEGER NOT NULL DEFAULT 0,
      updated_at      INTEGER NOT NULL
    )
  `);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_voca_import_no ON voca_items(import_no)"
  );

  const cols = db.prepare("PRAGMA table_info(voca_items)").all();
  if (!cols.some((c) => c.name === "image_url")) {
    db.exec("ALTER TABLE voca_items ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  }
}

ensureVocaItemsSchema();

const DEFAULT_INWORLD_VOICE_ID = "default-zylgts2tamenvybeti3z0w__uncle_tommy";
const INWORLD_TTS_URL = "https://api.inworld.ai/tts/v1/voice";
const INWORLD_LLM_URL = "https://api.inworld.ai/v1/chat/completions";
const LANGO_API_BASE_URL = (
  process.env.LANGO_API_BASE_URL || "https://dev.api.lango.ai"
).replace(/\/$/, "");
const LANGO_API_VERSION = (
  process.env.LANGO_API_VERSION || "v1"
).replace(/^\/|\/$/g, "");
const LANGO_API_KEY =
  process.env.LANGO_API_KEY || "agtwrxMuJ8Kp3LNZk4X97AqhvfVC6ERPsnG2";

function getLangoImageApiConfig() {
  const baseUrl = (
    getSetting("lango_image_api_base_url") || LANGO_API_BASE_URL
  ).replace(/\/$/, "");
  const apiVersion = (
    getSetting("lango_image_api_version") || LANGO_API_VERSION
  ).replace(/^\/|\/$/g, "");
  const apiKey = getSetting("lango_image_api_key") || LANGO_API_KEY;
  return {
    baseUrl,
    apiVersion,
    apiKey,
    imageSearchPath: `${baseUrl}/${apiVersion}/materialImage/getImages`,
  };
}

const getSettingStmt = db.prepare(
  "SELECT setting_value FROM game_settings WHERE setting_key = ?"
);
const upsertSettingStmt = db.prepare(`
  INSERT INTO game_settings (setting_key, setting_value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(setting_key) DO UPDATE SET
    setting_value = excluded.setting_value,
    updated_at = excluded.updated_at
`);

function getSetting(key) {
  const row = getSettingStmt.get(key);
  return row ? row.setting_value : null;
}

function setSetting(key, value) {
  upsertSettingStmt.run(key, value, Date.now());
}

const listVocaStmt = db.prepare(`
  SELECT id, import_no, type, level, language_code, category, sub_category,
         content, keywords, image_url, sort_order, updated_at
  FROM voca_items
  ORDER BY sort_order, id
`);
const listVocaByLevelStmt = db.prepare(`
  SELECT id, import_no, type, level, language_code, category, sub_category,
         content, keywords, image_url, sort_order, updated_at
  FROM voca_items
  WHERE level = ?
  ORDER BY sort_order, id
`);
const getVocaStmt = db.prepare(`
  SELECT id, import_no, type, level, language_code, category, sub_category,
         content, keywords, image_url, sort_order, updated_at
  FROM voca_items WHERE id = ?
`);
const insertVocaStmt = db.prepare(`
  INSERT INTO voca_items (
    import_no, type, level, language_code, category, sub_category,
    content, keywords, image_url, sort_order, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const updateVocaStmt = db.prepare(`
  UPDATE voca_items SET
    import_no = ?, type = ?, level = ?, language_code = ?,
    category = ?, sub_category = ?, content = ?, keywords = ?,
    image_url = ?, sort_order = ?, updated_at = ?
  WHERE id = ?
`);
const deleteVocaStmt = db.prepare("DELETE FROM voca_items WHERE id = ?");
const deleteAllVocaStmt = db.prepare("DELETE FROM voca_items");
const maxVocaSortStmt = db.prepare(
  "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM voca_items"
);

function rowToVocaItem(row) {
  const imageUrl = row.image_url || "";
  return {
    id: row.id,
    importNo: row.import_no,
    type: row.type,
    level: row.level,
    languageCode: row.language_code,
    category: row.category,
    subCategory: row.sub_category,
    content: row.content,
    keywords: row.keywords,
    imageUrl,
    imageProxyUrl: imageUrl ? `/api/voca/${row.id}/image` : "",
    word: row.content,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

function normalizeImageUrl(value) {
  const imageUrl = String(value ?? "").trim();
  if (!imageUrl) return "";
  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new Error("imageUrl must be an http(s) URL.");
  }
  return imageUrl;
}

async function lookupLangoMaterialImages(content, type = "vocabulary") {
  const { imageSearchPath, apiKey } = getLangoImageApiConfig();
  const query = new URLSearchParams({
    content: String(content).trim(),
    type: String(type || "vocabulary").trim() || "vocabulary",
  });
  const url = `${imageSearchPath}?${query}`;
  const response = await fetch(url, {
    headers: {
      authorization: apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(`Image lookup failed (${response.status}) for "${content}".`);
  }
  return response.json();
}

async function fetchLangoMaterialImage(content, type = "vocabulary") {
  const data = await lookupLangoMaterialImages(content, type);
  const images = Array.isArray(data?.images) ? data.images : [];
  if (!images.length) return "";

  const target = String(content).trim().toLowerCase();
  const exact = images.find(
    (image) => String(image?.content ?? "").trim().toLowerCase() === target
  );
  const chosen = exact || images[0];
  const imageUrl = String(chosen?.url ?? "").trim();
  return /^https?:\/\//i.test(imageUrl) ? imageUrl : "";
}

async function attachVocaImages(items) {
  const enriched = [];
  let imageCount = 0;

  for (const item of items) {
    let imageUrl = normalizeImageUrl(item.imageUrl);
    if (!imageUrl) {
      try {
        imageUrl = await fetchLangoMaterialImage(item.content, item.type);
      } catch {
        imageUrl = "";
      }
    }
    if (imageUrl) imageCount += 1;
    enriched.push({ ...item, imageUrl });
  }

  return { items: enriched, imageCount, missingImageCount: items.length - imageCount };
}

function parseStudentGrade(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  const match = raw.match(/\bP\s*([123])\b/) || raw.match(/^([123])$/);
  return match ? `P${match[1]}` : null;
}

function gradeToVocaLevel(grade) {
  const normalized = parseStudentGrade(grade);
  if (!normalized) return null;
  return Number(normalized.slice(1));
}

function vocaLevelToGrade(level) {
  const n = Number(level);
  if (!Number.isFinite(n) || n < 1 || n > 3) return null;
  return `P${Math.floor(n)}`;
}

function parseVocaLevelInput(value) {
  if (value == null || value === "") return null;
  const grade = parseStudentGrade(value);
  if (grade) return gradeToVocaLevel(grade);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function normalizeVocaInput(item, rowLabel = "Row") {
  const importNo = String(
    item?.importNo ?? item?.import_no ?? item?.["Import No."] ?? ""
  ).trim();
  const content = String(item?.content ?? item?.word ?? "").trim();
  const type = String(item?.type ?? "vocabulary").trim() || "vocabulary";
  const languageCode = String(
    item?.languageCode ?? item?.language_code ?? item?.["Language Code"] ?? "en"
  )
    .trim()
    .toLowerCase() || "en";
  const category = String(item?.category ?? item?.Category ?? "").trim();
  const subCategory = String(
    item?.subCategory ?? item?.sub_category ?? item?.["Sub Category"] ?? ""
  ).trim();
  const keywords = String(item?.keywords ?? item?.Keywords ?? "").trim();

  const level = parseVocaLevelInput(item?.level ?? item?.Level ?? 1);
  if (level == null) {
    throw new Error(`${rowLabel}: Level must be P1, P2, P3, or a positive number.`);
  }

  if (!importNo) {
    throw new Error(`${rowLabel}: Import No. is required.`);
  }
  if (!content) {
    throw new Error(`${rowLabel}: Content is required.`);
  }

  return {
    importNo,
    type,
    level,
    languageCode,
    category,
    subCategory,
    content,
    keywords,
    imageUrl: normalizeImageUrl(item?.imageUrl ?? item?.image_url ?? ""),
  };
}

function validateVocaImportBatch(items) {
  const normalized = [];
  const seenImportNos = new Set();
  const seenContent = new Set();

  items.forEach((item, index) => {
    const rowLabel = `Row ${index + 1}`;
    const row = normalizeVocaInput(item, rowLabel);
    const importKey = row.importNo.toLowerCase();
    const contentKey = row.content.toLowerCase();

    if (seenImportNos.has(importKey)) {
      throw new Error(`${rowLabel}: Duplicate Import No. "${row.importNo}".`);
    }
    if (seenContent.has(contentKey)) {
      throw new Error(`${rowLabel}: Duplicate Content "${row.content}".`);
    }

    seenImportNos.add(importKey);
    seenContent.add(contentKey);
    normalized.push(row);
  });

  return normalized;
}

function maskApiKey(key) {
  if (!key || key.length < 8) return key ? "••••" : "";
  return "••••" + key.slice(-4);
}

function migrateFindGameHotspots() {
  const cols = db.prepare("PRAGMA table_info(findgame_levels)").all();
  if (!cols.some((c) => c.name === "hotspots_json")) {
    db.exec(`ALTER TABLE findgame_levels ADD COLUMN hotspots_json TEXT`);
  }

  const rows = db
    .prepare(
      "SELECT id, hotspot_x, hotspot_y, hotspot_radius, hotspots_json FROM findgame_levels"
    )
    .all();
  const update = db.prepare(
    "UPDATE findgame_levels SET hotspots_json = ? WHERE id = ?"
  );

  for (const row of rows) {
    if (row.hotspots_json) continue;
    update.run(
      JSON.stringify([
        { x: row.hotspot_x, y: row.hotspot_y, radius: row.hotspot_radius },
      ]),
      row.id
    );
  }
}

function migrateFindGameHotspotTargets() {
  const rows = db
    .prepare(
      "SELECT id, target_label, hotspots_json FROM findgame_levels WHERE hotspots_json IS NOT NULL"
    )
    .all();
  const update = db.prepare(
    "UPDATE findgame_levels SET hotspots_json = ? WHERE id = ?"
  );

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.hotspots_json);
      if (!Array.isArray(parsed) || !parsed.length) continue;
      if (parsed.every((h) => h.target != null && String(h.target).trim() !== "")) continue;
      const migrated = parsed.map((h) => ({
        ...h,
        target: String(h.target ?? row.target_label ?? "").trim(),
      }));
      update.run(JSON.stringify(migrated), row.id);
    } catch {
      /* skip invalid rows */
    }
  }
}

migrateFindGameHotspots();
migrateFindGameHotspotTargets();

function migrateFindGameCorrectIndex() {
  const rows = db
    .prepare("SELECT id, target_label, hotspots_json FROM findgame_levels")
    .all();
  const update = db.prepare(
    "UPDATE findgame_levels SET target_label = ? WHERE id = ?"
  );

  for (const row of rows) {
    const asIndex = Number(row.target_label);
    if (Number.isInteger(asIndex) && String(asIndex) === String(row.target_label).trim()) {
      continue;
    }
    try {
      const hotspots = JSON.parse(row.hotspots_json || "[]");
      if (!Array.isArray(hotspots) || !hotspots.length) {
        update.run("0", row.id);
        continue;
      }
      const match = hotspots.findIndex(
        (h) =>
          String(h.target || "").trim().toLowerCase() ===
          String(row.target_label || "").trim().toLowerCase()
      );
      update.run(String(match >= 0 ? match : 0), row.id);
    } catch {
      update.run("0", row.id);
    }
  }
}

migrateFindGameCorrectIndex();

function seedFindGameLevelsIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM findgame_levels").get().n;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO findgame_levels (sentence, target_label, hotspot_x, hotspot_y, hotspot_radius, hotspots_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  DEFAULT_FINDGAME_LEVELS.forEach((lv, i) => {
    const hotspots = lv.hotspots || (lv.hotspot ? [lv.hotspot] : []);
    const first = hotspots[0];
    insert.run(
      lv.sentence,
      lv.target,
      first.x,
      first.y,
      first.radius,
      JSON.stringify(hotspots),
      i
    );
  });
}

function normalizeHotspot(h, fallbackTarget = "") {
  return {
    x: Number(h.x),
    y: Number(h.y),
    radius: Number(h.radius ?? 0.08),
    target: String(h.target ?? fallbackTarget ?? "").trim(),
  };
}

function normalizeHotspots(raw, fallbackTarget = "") {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("At least one hotspot position is required.");
  }
  return raw.map((h) => normalizeHotspot(h, fallbackTarget)).filter(
    (h) =>
      Number.isFinite(h.x) &&
      Number.isFinite(h.y) &&
      Number.isFinite(h.radius) &&
      h.x >= 0 &&
      h.x <= 1 &&
      h.y >= 0 &&
      h.y <= 1 &&
      h.radius >= 0.03 &&
      h.radius <= 0.3
  );
}

function parseHotspotsFromRow(row) {
  const fallback = row.target_label || "";
  if (row.hotspots_json) {
    try {
      const parsed = JSON.parse(row.hotspots_json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((h) => normalizeHotspot(h, h.target || fallback));
      }
    } catch {
      /* fall through */
    }
  }
  return [
    normalizeHotspot(
      {
        x: row.hotspot_x,
        y: row.hotspot_y,
        radius: row.hotspot_radius,
        target: fallback,
      },
      fallback
    ),
  ];
}

const listLevelsStmt = db.prepare(
  "SELECT id, sentence, target_label, hotspot_x, hotspot_y, hotspot_radius, hotspots_json, sort_order FROM findgame_levels ORDER BY sort_order, id"
);
const getLevelStmt = db.prepare(
  "SELECT id, sentence, target_label, hotspot_x, hotspot_y, hotspot_radius, hotspots_json, sort_order FROM findgame_levels WHERE id = ?"
);
const insertLevelStmt = db.prepare(`
  INSERT INTO findgame_levels (sentence, target_label, hotspot_x, hotspot_y, hotspot_radius, hotspots_json, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateLevelStmt = db.prepare(`
  UPDATE findgame_levels
  SET sentence = ?, target_label = ?, hotspot_x = ?, hotspot_y = ?, hotspot_radius = ?, hotspots_json = ?, sort_order = ?
  WHERE id = ?
`);
const deleteLevelStmt = db.prepare("DELETE FROM findgame_levels WHERE id = ?");
const deleteAllLevelsStmt = db.prepare("DELETE FROM findgame_levels");
const maxSortOrderStmt = db.prepare(
  "SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM findgame_levels"
);

function getLevelSceneMeta(levelId) {
  const slotKey = levelSceneSlotKey(levelId);
  const row = getStmt.get(slotKey);
  if (!row) return null;
  return {
    slotKey,
    mimeType: row.mime_type,
    updatedAt: row.updated_at,
    url: `/api/images/${slotKey}?v=${row.updated_at}`,
  };
}

function deleteLevelSceneImage(levelId) {
  const slotKey = levelSceneSlotKey(levelId);
  deleteStmt.run(slotKey);
  deleteMetaStmt.run(slotKey);
}

function deleteAllLevelSceneImages() {
  const rows = db
    .prepare("SELECT slot_key FROM game_images WHERE slot_key LIKE 'find_level_scene_%'")
    .all();
  for (const row of rows) {
    deleteStmt.run(row.slot_key);
    deleteMetaStmt.run(row.slot_key);
  }
}

function rowToLevel(row) {
  const hotspots = parseHotspotsFromRow(row);
  const scene = getLevelSceneMeta(row.id);
  return {
    id: row.id,
    sentence: row.sentence,
    target: row.target_label,
    hotspots,
    sortOrder: row.sort_order,
    hasCustomScene: Boolean(scene),
    sceneUrl: scene?.url ?? null,
  };
}

function saveLevelHotspots(id, sentence, target, hotspots, sortOrder) {
  const normalized = normalizeHotspots(hotspots, target);
  if (normalized.length === 0) {
    throw new Error("At least one valid hotspot position is required.");
  }
  const first = normalized[0];
  updateLevelStmt.run(
    sentence,
    target,
    first.x,
    first.y,
    first.radius,
    JSON.stringify(normalized),
    sortOrder,
    id
  );
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed (PNG, JPG, SVG, WebP, GIF)."));
  },
});

const listStmt = db.prepare(
  "SELECT slot_key, mime_type, updated_at FROM game_images ORDER BY slot_key"
);
const getStmt = db.prepare(
  "SELECT mime_type, data, updated_at FROM game_images WHERE slot_key = ?"
);
const upsertStmt = db.prepare(`
  INSERT INTO game_images (slot_key, mime_type, data, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(slot_key) DO UPDATE SET
    mime_type = excluded.mime_type,
    data = excluded.data,
    updated_at = excluded.updated_at
`);
const deleteStmt = db.prepare("DELETE FROM game_images WHERE slot_key = ?");
const deleteAllStmt = db.prepare("DELETE FROM game_images");
const listMetaStmt = db.prepare(
  "SELECT slot_key, scale FROM game_image_meta ORDER BY slot_key"
);
const getMetaStmt = db.prepare(
  "SELECT scale FROM game_image_meta WHERE slot_key = ?"
);
const upsertMetaStmt = db.prepare(`
  INSERT INTO game_image_meta (slot_key, scale)
  VALUES (?, ?)
  ON CONFLICT(slot_key) DO UPDATE SET scale = excluded.scale
`);
const deleteMetaStmt = db.prepare("DELETE FROM game_image_meta WHERE slot_key = ?");
const deleteMetaAllStmt = db.prepare("DELETE FROM game_image_meta");

function scalesForGame(game) {
  const allowed = game && GAME_SLOTS[game] ? GAME_SLOTS[game] : null;
  const rows = listMetaStmt.all();
  const scales = {};
  for (const row of rows) {
    if (allowed && !allowed.has(row.slot_key)) continue;
    scales[row.slot_key] = row.scale;
  }
  return scales;
}

function deleteMetaForGame(game) {
  const allowed = game && GAME_SLOTS[game] ? GAME_SLOTS[game] : null;
  if (allowed) {
    for (const slotKey of allowed) {
      deleteMetaStmt.run(slotKey);
    }
  } else {
    deleteMetaAllStmt.run();
  }
}

const app = express();

app.get("/api/images", (req, res) => {
  const game = req.query.game;
  const allowed = game && GAME_SLOTS[game] ? GAME_SLOTS[game] : null;

  const rows = listStmt.all();
  const slots = {};
  for (const row of rows) {
    if (allowed && !allowed.has(row.slot_key)) continue;
    slots[row.slot_key] = {
      mimeType: row.mime_type,
      updatedAt: row.updated_at,
      url: `/api/images/${row.slot_key}?v=${row.updated_at}`,
    };
  }
  res.json({ slots, scales: scalesForGame(game) });
});

app.get("/api/images/:slotKey", (req, res) => {
  const { slotKey } = req.params;
  if (!isValidImageSlot(slotKey)) {
    return res.status(400).json({ error: "Unknown image slot." });
  }

  const row = getStmt.get(slotKey);
  if (!row) {
    return res.status(404).json({ error: "No custom image for this slot." });
  }

  res.set("Content-Type", row.mime_type);
  res.set("Cache-Control", "public, max-age=3600");
  res.send(row.data);
});

app.patch("/api/images/:slotKey", express.json(), (req, res) => {
  const { slotKey } = req.params;
  if (!isValidImageSlot(slotKey)) {
    return res.status(400).json({ error: "Unknown image slot." });
  }

  const scale = Number(req.body?.scale);
  if (!Number.isFinite(scale) || scale < 0.25 || scale > 3) {
    return res.status(400).json({ error: "Scale must be a number between 0.25 and 3." });
  }

  upsertMetaStmt.run(slotKey, scale);
  res.json({ ok: true, slotKey, scale });
});

app.delete("/api/images/:slotKey/scale", (req, res) => {
  const { slotKey } = req.params;
  if (!isValidImageSlot(slotKey)) {
    return res.status(400).json({ error: "Unknown image slot." });
  }

  deleteMetaStmt.run(slotKey);
  res.json({ ok: true, slotKey, scale: 1 });
});

app.put("/api/images/:slotKey", upload.single("image"), (req, res) => {
  const { slotKey } = req.params;
  if (!isValidImageSlot(slotKey)) {
    return res.status(400).json({ error: "Unknown image slot." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Missing image file." });
  }

  const updatedAt = Date.now();
  upsertStmt.run(slotKey, req.file.mimetype, req.file.buffer, updatedAt);

  res.json({
    ok: true,
    slotKey,
    mimeType: req.file.mimetype,
    updatedAt,
    url: `/api/images/${slotKey}?v=${updatedAt}`,
  });
});

app.delete("/api/images/:slotKey", (req, res) => {
  const { slotKey } = req.params;
  if (!isValidImageSlot(slotKey)) {
    return res.status(400).json({ error: "Unknown image slot." });
  }

  deleteStmt.run(slotKey);
  deleteMetaStmt.run(slotKey);
  res.json({ ok: true, slotKey });
});

app.get("/api/findgame/levels", (_req, res) => {
  const rows = listLevelsStmt.all();
  res.json({ levels: rows.map(rowToLevel) });
});

app.post("/api/findgame/levels", express.json(), (req, res) => {
  try {
    const { sentence, target, hotspots, hotspot, sortOrder } = req.body || {};
    if (!sentence || !target) {
      return res.status(400).json({ error: "sentence and target are required." });
    }

    const rawHotspots = hotspots ?? (hotspot ? [hotspot] : null);
    if (!rawHotspots) {
      return res.status(400).json({ error: "hotspots array is required." });
    }

    const normalized = normalizeHotspots(rawHotspots, target);
    const first = normalized[0];
    const order =
      sortOrder != null
        ? Number(sortOrder)
        : maxSortOrderStmt.get().max_order + 1;

    const result = insertLevelStmt.run(
      sentence,
      target,
      first.x,
      first.y,
      first.radius,
      JSON.stringify(normalized),
      order
    );
    const row = getLevelStmt.get(result.lastInsertRowid);
    res.status(201).json({ level: rowToLevel(row) });
  } catch (err) {
    res.status(400).json({ error: err.message || "Invalid level data." });
  }
});

app.put("/api/findgame/levels/:id", express.json(), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = getLevelStmt.get(id);
    if (!existing) {
      return res.status(404).json({ error: "Level not found." });
    }

    const { sentence, target, hotspots, hotspot, sortOrder } = req.body || {};
    const rawHotspots =
      hotspots ??
      (hotspot ? [hotspot] : parseHotspotsFromRow(existing));

    saveLevelHotspots(
      id,
      sentence ?? existing.sentence,
      target ?? existing.target_label,
      rawHotspots,
      sortOrder != null ? Number(sortOrder) : existing.sort_order
    );

    const row = getLevelStmt.get(id);
    res.json({ level: rowToLevel(row) });
  } catch (err) {
    res.status(400).json({ error: err.message || "Invalid level data." });
  }
});

app.delete("/api/findgame/levels/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = getLevelStmt.get(id);
  if (!existing) {
    return res.status(404).json({ error: "Level not found." });
  }
  deleteLevelSceneImage(id);
  deleteLevelStmt.run(id);
  res.json({ ok: true, id });
});

app.put("/api/findgame/levels/:id/scene", upload.single("image"), (req, res) => {
  const id = Number(req.params.id);
  if (!getLevelStmt.get(id)) {
    return res.status(404).json({ error: "Level not found." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Missing image file." });
  }

  const slotKey = levelSceneSlotKey(id);
  const updatedAt = Date.now();
  upsertStmt.run(slotKey, req.file.mimetype, req.file.buffer, updatedAt);
  res.json({ level: rowToLevel(getLevelStmt.get(id)) });
});

app.delete("/api/findgame/levels/:id/scene", (req, res) => {
  const id = Number(req.params.id);
  if (!getLevelStmt.get(id)) {
    return res.status(404).json({ error: "Level not found." });
  }
  deleteLevelSceneImage(id);
  res.json({ level: rowToLevel(getLevelStmt.get(id)) });
});

app.post("/api/findgame/levels/reset", (_req, res) => {
  deleteAllLevelSceneImages();
  deleteAllLevelsStmt.run();
  seedFindGameLevelsIfEmpty();
  const rows = listLevelsStmt.all();
  res.json({ levels: rows.map(rowToLevel) });
});

app.get("/api/voca", (req, res) => {
  const requestedGrade = parseStudentGrade(req.query?.grade);
  const requestedLevel =
    parseVocaLevelInput(req.query?.level) ??
    (requestedGrade ? gradeToVocaLevel(requestedGrade) : null);
  const wantAll = String(req.query?.all || "") === "1";

  let rows = listVocaStmt.all();
  let appliedGrade = null;
  let appliedLevel = null;
  let gradeFallback = false;

  if (!wantAll && requestedLevel != null) {
    const filtered = listVocaByLevelStmt.all(requestedLevel);
    if (filtered.length) {
      rows = filtered;
      appliedLevel = requestedLevel;
      appliedGrade = vocaLevelToGrade(requestedLevel) || requestedGrade;
    } else {
      gradeFallback = true;
      appliedGrade = requestedGrade || vocaLevelToGrade(requestedLevel);
      appliedLevel = requestedLevel;
    }
  }

  res.json({
    items: rows.map(rowToVocaItem),
    grade: appliedGrade,
    level: appliedLevel,
    gradeFallback,
  });
});

app.get("/api/voca/image-search", async (req, res) => {
  try {
    const content = String(req.query?.content ?? "").trim();
    const type = String(req.query?.type ?? "vocabulary").trim() || "vocabulary";
    if (!content) {
      return res.status(400).json({ error: "content query parameter is required." });
    }

    const data = await lookupLangoMaterialImages(content, type);
    const imageUrl = await fetchLangoMaterialImage(content, type).catch(() => "");
    const { imageSearchPath } = getLangoImageApiConfig();
    res.json({
      content,
      type,
      imageUrl,
      endpoint: imageSearchPath,
      ...data,
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "Image search failed." });
  }
});

app.get("/api/voca/:id/image", async (req, res) => {
  const id = Number(req.params.id);
  const row = getVocaStmt.get(id);
  if (!row?.image_url) {
    return res.status(404).end();
  }

  try {
    const response = await fetch(row.image_url);
    if (!response.ok) {
      return res.status(502).end();
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch {
    res.status(502).end();
  }
});

app.post("/api/voca", express.json(), (req, res) => {
  try {
    const row = normalizeVocaInput(req.body || {}, "Item");
    const sortOrder =
      req.body?.sortOrder != null
        ? Number(req.body.sortOrder)
        : maxVocaSortStmt.get().max_order + 1;
    const now = Date.now();
    const result = insertVocaStmt.run(
      row.importNo,
      row.type,
      row.level,
      row.languageCode,
      row.category,
      row.subCategory,
      row.content,
      row.keywords,
      row.imageUrl,
      sortOrder,
      now
    );
    const saved = getVocaStmt.get(result.lastInsertRowid);
    res.status(201).json({ item: rowToVocaItem(saved) });
  } catch (err) {
    res.status(400).json({ error: err.message || "Invalid vocabulary item." });
  }
});

app.put("/api/voca/:id", express.json(), (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = getVocaStmt.get(id);
    if (!existing) {
      return res.status(404).json({ error: "Vocabulary item not found." });
    }
    const row = normalizeVocaInput(
      {
        importNo: req.body?.importNo ?? existing.import_no,
        type: req.body?.type ?? existing.type,
        level: req.body?.level ?? existing.level,
        languageCode: req.body?.languageCode ?? existing.language_code,
        category: req.body?.category ?? existing.category,
        subCategory: req.body?.subCategory ?? existing.sub_category,
        content: req.body?.content ?? existing.content,
        keywords: req.body?.keywords ?? existing.keywords,
        imageUrl: req.body?.imageUrl ?? existing.image_url,
      },
      "Item"
    );
    const sortOrder =
      req.body?.sortOrder != null ? Number(req.body.sortOrder) : existing.sort_order;
    const now = Date.now();
    updateVocaStmt.run(
      row.importNo,
      row.type,
      row.level,
      row.languageCode,
      row.category,
      row.subCategory,
      row.content,
      row.keywords,
      row.imageUrl,
      sortOrder,
      now,
      id
    );
    res.json({ item: rowToVocaItem(getVocaStmt.get(id)) });
  } catch (err) {
    res.status(400).json({ error: err.message || "Invalid vocabulary item." });
  }
});

app.delete("/api/voca/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!getVocaStmt.get(id)) {
    return res.status(404).json({ error: "Vocabulary item not found." });
  }
  deleteVocaStmt.run(id);
  res.json({ ok: true, id });
});

app.post("/api/voca/import", express.json(), async (req, res) => {
  try {
    const items = req.body?.items;
    const replace = req.body?.replace !== false;
    const fetchImages = req.body?.fetchImages !== false;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "items array is required." });
    }

    const normalized = validateVocaImportBatch(items);
    const prepared = fetchImages
      ? await attachVocaImages(normalized)
      : {
          items: normalized.map((item) => ({ ...item, imageUrl: item.imageUrl || "" })),
          imageCount: normalized.filter((item) => item.imageUrl).length,
          missingImageCount: normalized.filter((item) => !item.imageUrl).length,
        };
    const now = Date.now();
    const importMany = db.transaction((rows) => {
      if (replace) deleteAllVocaStmt.run();
      rows.forEach((item, index) => {
        insertVocaStmt.run(
          item.importNo,
          item.type,
          item.level,
          item.languageCode,
          item.category,
          item.subCategory,
          item.content,
          item.keywords,
          item.imageUrl || "",
          index,
          now
        );
      });
    });
    importMany(prepared.items);
    const rows = listVocaStmt.all();
    res.json({
      ok: true,
      count: rows.length,
      imageCount: prepared.imageCount,
      missingImageCount: prepared.missingImageCount,
      items: rows.map(rowToVocaItem),
    });
  } catch (err) {
    res.status(400).json({ error: err.message || "Import failed." });
  }
});

app.get("/api/settings/inworld", (_req, res) => {
  const apiKey = getSetting("inworld_api_key");
  const voiceId = getSetting("inworld_voice_id") || DEFAULT_INWORLD_VOICE_ID;
  res.json({
    enabled: INWORLD_API_ENABLED,
    configured: Boolean(apiKey),
    voiceId,
    apiKeyPreview: maskApiKey(apiKey),
  });
});

app.put("/api/settings/inworld", express.json(), (req, res) => {
  const { apiKey, voiceId } = req.body || {};

  if (apiKey != null) {
    const trimmed = String(apiKey).trim();
    if (!trimmed) {
      return res.status(400).json({ error: "API key cannot be empty." });
    }
    setSetting("inworld_api_key", trimmed);
  }

  if (voiceId != null) {
    const trimmedVoice = String(voiceId).trim();
    if (!trimmedVoice) {
      return res.status(400).json({ error: "Voice ID cannot be empty." });
    }
    setSetting("inworld_voice_id", trimmedVoice);
  }

  const savedKey = getSetting("inworld_api_key");
  const savedVoice = getSetting("inworld_voice_id") || DEFAULT_INWORLD_VOICE_ID;
  res.json({
    ok: true,
    configured: Boolean(savedKey),
    voiceId: savedVoice,
    apiKeyPreview: maskApiKey(savedKey),
  });
});

app.get("/api/settings/lango-image", (_req, res) => {
  const config = getLangoImageApiConfig();
  res.json({
    configured: Boolean(config.apiKey),
    baseUrl: config.baseUrl,
    apiVersion: config.apiVersion,
    imageSearchPath: config.imageSearchPath,
    apiKeyPreview: maskApiKey(config.apiKey),
  });
});

app.put("/api/settings/lango-image", express.json(), (req, res) => {
  const { baseUrl, apiVersion, apiKey } = req.body || {};

  if (baseUrl != null) {
    const trimmed = String(baseUrl).trim().replace(/\/$/, "");
    if (!trimmed) {
      return res.status(400).json({ error: "Base URL cannot be empty." });
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      return res.status(400).json({ error: "Base URL must start with http:// or https://." });
    }
    setSetting("lango_image_api_base_url", trimmed);
  }

  if (apiVersion != null) {
    const trimmedVersion = String(apiVersion).trim().replace(/^\/|\/$/g, "");
    if (!trimmedVersion) {
      return res.status(400).json({ error: "API version cannot be empty." });
    }
    setSetting("lango_image_api_version", trimmedVersion);
  }

  if (apiKey != null) {
    const trimmedKey = String(apiKey).trim();
    if (!trimmedKey) {
      return res.status(400).json({ error: "API key cannot be empty." });
    }
    setSetting("lango_image_api_key", trimmedKey);
  }

  const config = getLangoImageApiConfig();
  res.json({
    ok: true,
    configured: Boolean(config.apiKey),
    baseUrl: config.baseUrl,
    apiVersion: config.apiVersion,
    imageSearchPath: config.imageSearchPath,
    apiKeyPreview: maskApiKey(config.apiKey),
  });
});

function normalizeRoundWords(words, requiredWord) {
  const seen = new Set();
  const out = [];
  const add = (value) => {
    const word = String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    if (!word || seen.has(word)) return;
    seen.add(word);
    out.push(word);
  };
  if (requiredWord) add(requiredWord);
  (words || []).forEach(add);
  return out;
}

app.post("/api/inworld/llm/wordwhack-round", express.json(), async (req, res) => {
  if (!INWORLD_API_ENABLED) {
    return res.status(503).json({ error: INWORLD_API_DISABLED_MESSAGE });
  }
  const apiKey = getSetting("inworld_api_key");
  if (!apiKey) {
    return res.status(503).json({ error: "Inworld API key not configured." });
  }

  const targetWord = String(req.body?.targetWord || "").trim();
  if (!targetWord) {
    return res.status(400).json({ error: "targetWord is required." });
  }

  const otherWords = Array.isArray(req.body?.otherWords)
    ? req.body.otherWords.map((word) => String(word).trim()).filter(Boolean)
    : [];

  const systemPrompt = `You generate content for a children's English vocabulary game (ages 6-10).
Return ONLY valid JSON with keys: "prompt", "correct", "distractors".
- prompt: short sentence stem BEFORE the blank, with no trailing blank, underscore, or period (example: "Honey is")
- correct: 3-5 single English words in UPPERCASE that correctly complete the sentence; MUST include the target word
- distractors: 5-8 single UPPERCASE words that are plausible but WRONG answers for this sentence
Use simple kid-friendly language. One word per array entry. No punctuation in array values.`;

  const userPrompt = `Target vocabulary word: "${targetWord}"
Other lesson words (use as distractors when they do not fit the sentence): ${otherWords.slice(0, 30).join(", ") || "(none)"}
Create a fill-in-the-blank sentence where "${targetWord}" is one of the correct answers.`;

  try {
    const upstream = await fetch(INWORLD_LLM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });

    const payload = await upstream.json();
    if (!upstream.ok) {
      const message =
        payload?.error?.message ||
        payload?.error ||
        "Inworld LLM request failed.";
      return res.status(upstream.status).json({ error: message });
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ error: "Inworld returned empty content." });
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.status(502).json({ error: "Inworld returned invalid JSON." });
    }

    const prompt = String(parsed.prompt || "")
      .trim()
      .replace(/\s*[_….]+\s*$/, "");
    if (!prompt) {
      return res.status(502).json({ error: "Inworld returned an invalid prompt." });
    }

    const targetUpper = targetWord.toUpperCase();
    const correct = normalizeRoundWords(parsed.correct, targetUpper);
    const distractors = normalizeRoundWords(parsed.distractors).filter(
      (word) => !correct.includes(word)
    );

    if (correct.length < 2) {
      return res.status(502).json({ error: "Inworld returned too few correct answers." });
    }
    if (distractors.length < 3) {
      return res.status(502).json({ error: "Inworld returned too few distractors." });
    }

    res.json({
      prompt,
      correct,
      distractors,
      targetWord: targetUpper,
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "Failed to reach Inworld LLM." });
  }
});

app.post("/api/inworld/tts", express.json(), async (req, res) => {
  if (!INWORLD_API_ENABLED) {
    return res.status(503).json({ error: INWORLD_API_DISABLED_MESSAGE });
  }
  const apiKey = getSetting("inworld_api_key");
  if (!apiKey) {
    return res.status(503).json({ error: "Inworld API key not configured." });
  }

  const text = String(req.body?.text || "").trim();
  if (!text) {
    return res.status(400).json({ error: "text is required." });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: "text exceeds 2000 characters." });
  }

  const voiceId = getSetting("inworld_voice_id") || DEFAULT_INWORLD_VOICE_ID;

  try {
    const upstream = await fetch(INWORLD_TTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voiceId,
        modelId: "inworld-tts-1.5-max",
        audioConfig: {
          audioEncoding: "MP3",
          sampleRateHertz: 24000,
        },
      }),
    });

    const payload = await upstream.json();
    if (!upstream.ok) {
      const message =
        payload?.message ||
        payload?.error?.message ||
        payload?.error ||
        "Inworld TTS request failed.";
      return res.status(upstream.status).json({ error: message });
    }

    if (!payload?.audioContent) {
      return res.status(502).json({ error: "Inworld returned no audio." });
    }

    res.json({
      audioContent: payload.audioContent,
      mimeType: "audio/mpeg",
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "Failed to reach Inworld TTS." });
  }
});

app.delete("/api/images", (req, res) => {
  const game = req.query.game;
  const allowed = game && GAME_SLOTS[game] ? GAME_SLOTS[game] : null;

  if (allowed) {
    const deleteGameStmt = db.prepare(
      "DELETE FROM game_images WHERE slot_key = ?"
    );
    for (const slotKey of allowed) {
      deleteGameStmt.run(slotKey);
    }
    deleteMetaForGame(game);
  } else {
    deleteAllStmt.run();
    deleteMetaAllStmt.run();
  }
  res.json({ ok: true, game: game || "all" });
});

app.get("/api/game-data/export", (_req, res) => {
  if (!fs.existsSync(DB_PATH)) {
    return res.status(404).json({ error: "Database file not found." });
  }
  res.set("Content-Type", "application/x-sqlite3");
  res.set("Content-Disposition", 'attachment; filename="game.db"');
  res.sendFile(DB_PATH);
});

const dbUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DB_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith(".db") || file.mimetype === "application/x-sqlite3") {
      cb(null, true);
    } else {
      cb(new Error("Upload a .db SQLite file."));
    }
  },
});

app.post("/api/game-data/import", dbUpload.single("database"), (req, res) => {
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ error: "Missing database file." });
  }

  const header = req.file.buffer.subarray(0, 16).toString("utf8");
  if (!header.startsWith("SQLite format 3")) {
    return res.status(400).json({ error: "File is not a valid SQLite database." });
  }

  db.close();
  fs.writeFileSync(DB_PATH, req.file.buffer);
  res.json({
    ok: true,
    message: "Database imported. Server will restart to load the new data.",
    path: DB_PATH,
  });
  setTimeout(() => process.exit(0), 500);
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const isDbImport = req.path === "/api/game-data/import";
      const maxMb = (isDbImport ? DB_MAX_BYTES : IMAGE_MAX_BYTES) / (1024 * 1024);
      const label = isDbImport ? "Database file" : "Image";
      return res.status(400).json({ error: `${label} too large (max ${maxMb} MB).` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || "Upload failed." });
  }
  next();
});

app.use(express.static(__dirname));

function logGameRoutes(basePath = "") {
  const prefix = basePath || "";
  console.log(`Word-Whack: ${prefix}/index.html`);
  console.log(`Card Game:  ${prefix}/CardGame/index.html`);
  console.log(`Find Game:  ${prefix}/FindGame/index.html`);
  console.log(`Config:     ${prefix}/config.html`);
  console.log(`Images database: ${DB_PATH}`);
}

module.exports = app;
module.exports.DB_PATH = DB_PATH;
module.exports.DATA_DIR = DATA_DIR;
module.exports.parseStudentGrade = parseStudentGrade;
module.exports.gradeToVocaLevel = gradeToVocaLevel;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Game server running at http://0.0.0.0:${PORT}`);
    logGameRoutes("");
  });
}
