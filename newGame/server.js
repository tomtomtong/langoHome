/* ===========================================================
   Word-Whack Blitz — server API
   =========================================================== */

const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const multer = require("multer");

const PORT = process.env.PORT || 3000;
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

const DEFAULT_INWORLD_VOICE_ID = "default-zylgts2tamenvybeti3z0w__uncle_tommy";
const INWORLD_TTS_URL = "https://api.inworld.ai/tts/v1/voice";

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

app.get("/api/settings/inworld", (_req, res) => {
  const apiKey = getSetting("inworld_api_key");
  const voiceId = getSetting("inworld_voice_id") || DEFAULT_INWORLD_VOICE_ID;
  res.json({
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

app.post("/api/inworld/tts", express.json(), async (req, res) => {
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

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Game server running at http://0.0.0.0:${PORT}`);
    logGameRoutes("");
  });
}
