import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync } from 'fs';
import { createServer } from 'http';
import { createRequire } from 'module';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';

const require = createRequire(import.meta.url);

const ROOT = dirname(fileURLToPath(import.meta.url));

// Local: ./config.json  |  Railway: mount a volume (e.g. /app/data) — uses RAILWAY_VOLUME_MOUNT_PATH
const CONFIG_DIR = process.env.CONFIG_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || ROOT;
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DEBUG_LOG_PATH = join(CONFIG_DIR, 'hello-debug-log.json');
const DEBUG_LOG_MAX_REPORTS = 20;
const IDLE_VIDEO_DIR = join(CONFIG_DIR, 'idle-video');
const TRANSITION_VIDEO_DIR = join(CONFIG_DIR, 'transition-video');
const AVATAR_BG_DIR = join(CONFIG_DIR, 'avatar-background');
const GAME_ICONS_DIR = join(CONFIG_DIR, 'game-icons');
const GAME_ICON_IDS = ['wordwhack', 'cardgame', 'findgame'];
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

if (!process.env.GAME_DATA_DIR) {
  process.env.GAME_DATA_DIR =
    CONFIG_DIR === ROOT ? join(ROOT, 'newGame', 'data') : join(CONFIG_DIR, 'game-data');
}

const gameApp = require('./newGame/server.js');
const GAME_DB_PATH = gameApp.DB_PATH;

function ensureConfigDir() {
  if (CONFIG_DIR === ROOT || existsSync(CONFIG_DIR)) return;
  mkdirSync(CONFIG_DIR, { recursive: true });
}

const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

const MIME = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.vrm': 'model/gltf-binary',
  '.vrma': 'model/gltf-binary',
  '.fbx': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function videoFileFilter(_req, file, cb) {
  const ext = extname(file.originalname || '').toLowerCase();
  const okExt = ['.mp4', '.webm', '.mov'].includes(ext);
  const okMime = /^video\/(mp4|webm|quicktime|x-m4v)$/i.test(file.mimetype || '');
  if (okExt || okMime) cb(null, true);
  else cb(new Error('Only MP4, WebM, or MOV videos are allowed.'));
}

function imageFileFilter(_req, file, cb) {
  const ext = extname(file.originalname || '').toLowerCase();
  const okExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  const okMime = /^image\/(png|jpe?g|webp)$/i.test(file.mimetype || '');
  if (okExt || okMime) cb(null, true);
  else cb(new Error('Only PNG, JPG, or WebP images are allowed.'));
}

function createUploadStore({ dir, basename, apiPath, fieldName, maxBytes, fileFilter, defaultExt }) {
  function ensureDir() {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  function listFiles() {
    ensureDir();
    return readdirSync(dir).filter((name) => name.startsWith(`${basename}.`));
  }

  function getInfo() {
    const files = listFiles();
    if (!files.length) return null;
    const filename = files[0];
    const filePath = join(dir, filename);
    if (!existsSync(filePath)) return null;
    const updatedAt = statSync(filePath).mtimeMs || Date.now();
    return {
      filename,
      url: `${apiPath}?v=${updatedAt}`,
      updatedAt,
    };
  }

  function clear() {
    for (const name of listFiles()) {
      try { unlinkSync(join(dir, name)); } catch {}
    }
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        ensureDir();
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase() || defaultExt;
        cb(null, `${basename}${ext}`);
      },
    }),
    limits: { fileSize: maxBytes },
    fileFilter,
  }).single(fieldName);

  return { dir, getInfo, clear, upload };
}

function createVideoStore(dir, basename, apiPath) {
  return createUploadStore({
    dir,
    basename,
    apiPath,
    fieldName: 'video',
    maxBytes: VIDEO_MAX_BYTES,
    fileFilter: videoFileFilter,
    defaultExt: '.mp4',
  });
}

function createImageStore(dir, basename, apiPath) {
  return createUploadStore({
    dir,
    basename,
    apiPath,
    fieldName: 'image',
    maxBytes: IMAGE_MAX_BYTES,
    fileFilter: imageFileFilter,
    defaultExt: '.png',
  });
}

const idleVideos = createVideoStore(IDLE_VIDEO_DIR, 'idle', '/api/idle-video');
const transitionVideos = createVideoStore(TRANSITION_VIDEO_DIR, 'transition', '/api/transition-video');
const avatarBackgrounds = createImageStore(AVATAR_BG_DIR, 'background', '/api/avatar-background');
const gameIconStores = Object.fromEntries(
  GAME_ICON_IDS.map((id) => [
    id,
    createImageStore(join(GAME_ICONS_DIR, id), 'icon', `/api/game-icons/${id}`),
  ]),
);

function getGameIconsInfo() {
  const icons = {};
  for (const id of GAME_ICON_IDS) icons[id] = gameIconStores[id].getInfo();
  return icons;
}

function handleUploadApi(store, resKey, req, res, maxBytes) {
  if (req.method === 'GET') {
    const info = store.getInfo();
    if (!info) {
      sendJson(res, 404, { error: `No ${resKey} uploaded.` });
      return;
    }
    serveFile(res, join(store.dir, info.filename));
    return;
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    store.clear();
    store.upload(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? `File must be under ${Math.round(maxBytes / (1024 * 1024))} MB.`
          : (err.message || 'Upload failed.');
        sendJson(res, 400, { error: message });
        return;
      }
      if (!req.file) {
        sendJson(res, 400, { error: 'No file provided.' });
        return;
      }
      sendJson(res, 200, { ok: true, [resKey]: store.getInfo() });
    });
    return;
  }
  if (req.method === 'DELETE') {
    store.clear();
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 405, { error: 'Method not allowed.' });
}

function loadConfig() {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not load config.json:', e.message);
  }
  return {};
}

function saveConfig(config) {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

function loadDebugLogs() {
  try {
    if (existsSync(DEBUG_LOG_PATH)) {
      const data = JSON.parse(readFileSync(DEBUG_LOG_PATH, 'utf8'));
      return Array.isArray(data.reports) ? data.reports : [];
    }
  } catch (e) {
    console.warn('Could not load hello-debug-log.json:', e.message);
  }
  return [];
}

function saveDebugLogs(reports) {
  ensureConfigDir();
  writeFileSync(DEBUG_LOG_PATH, JSON.stringify({ reports }, null, 2) + '\n');
}

function readJsonBody(req, res, onData) {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
    if (body.length > 512_000) {
      req.destroy();
      sendJson(res, 413, { error: 'Payload too large.' });
    }
  });
  req.on('end', () => {
    try {
      onData(JSON.parse(body || '{}'));
    } catch {
      sendJson(res, 400, { error: 'Invalid JSON.' });
    }
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS,
  });
  res.end(JSON.stringify(body));
}

function serveFile(res, filePath) {
  if (!existsSync(filePath)) {
    res.writeHead(404, SECURITY_HEADERS).end();
    return;
  }
  const ext = extname(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    ...SECURITY_HEADERS,
  });
  res.end(readFileSync(filePath));
}

const pages = {
  '/': 'index.html',
  '/config': 'config.html',
  '/avatar-config': 'avatar-config.html',
  '/visme': 'visme/index.html',
};

const GAME_API_PREFIXES = [
  '/api/images',
  '/api/findgame',
  '/api/settings/inworld',
  '/api/inworld/tts',
  '/api/game-data',
];

function isGameApiRoute(url) {
  return GAME_API_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
}

function isGameStaticRoute(url) {
  return url === '/games' || url.startsWith('/games/');
}

function delegateToGameApp(req, res, pathname, query) {
  const savedUrl = req.url;
  req.url = `${pathname}${query}`;
  gameApp(req, res, () => {
    req.url = savedUrl;
    res.writeHead(404, SECURITY_HEADERS).end();
  });
}

const server = createServer((req, res) => {
  const rawUrl = req.url ?? '/';
  const qIndex = rawUrl.indexOf('?');
  const url = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
  const query = qIndex === -1 ? '' : rawUrl.slice(qIndex);

  if (isGameApiRoute(url)) {
    delegateToGameApp(req, res, url, query);
    return;
  }

  if (isGameStaticRoute(url)) {
    const gamePath = url === '/games' ? '/index.html' : url.slice('/games'.length) || '/index.html';
    delegateToGameApp(req, res, gamePath, query);
    return;
  }

  if (url === '/api/config') {
    if (req.method === 'GET') {
      const cfg = loadConfig();
      sendJson(res, 200, {
        apiKey: cfg.apiKey ?? '',
        instructions: cfg.instructions ?? '',
        voice: cfg.voice ?? '',
        model: cfg.model ?? '',
        avatar: normalizeAvatar(cfg.avatar),
        lipsync: normalizeLipsync(cfg.lipsync),
        idleVideo: idleVideos.getInfo(),
        transitionVideo: transitionVideos.getInfo(),
        avatarBackground: avatarBackgrounds.getInfo(),
        gameIcons: getGameIconsInfo(),
      });
      return;
    }
    if (req.method === 'POST') {
      readJsonBody(req, res, (parsed) => {
        const apiKey = parsed.apiKey?.trim();
        if (!apiKey) {
          sendJson(res, 400, { error: 'API key is required.' });
          return;
        }
        const existing = loadConfig();
        saveConfig({
          apiKey,
          instructions: parsed.instructions?.trim() || '',
          voice: parsed.voice?.trim() || '',
          model: parsed.model?.trim() || '',
          avatar: parsed.avatar != null
            ? normalizeAvatar(parsed.avatar)
            : normalizeAvatar(existing.avatar),
          lipsync: normalizeLipsync(parsed.lipsync),
        });
        sendJson(res, 200, { ok: true });
      });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (url === '/api/debug-log') {
    if (req.method === 'GET') {
      sendJson(res, 200, { reports: loadDebugLogs() });
      return;
    }
    if (req.method === 'POST') {
      readJsonBody(req, res, (parsed) => {
        const lines = Array.isArray(parsed.lines)
          ? parsed.lines.map((l) => String(l)).slice(-200)
          : [];
        if (!lines.length) {
          sendJson(res, 400, { error: 'No log lines provided.' });
          return;
        }
        const report = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          submittedAt: new Date().toISOString(),
          userAgent: String(parsed.userAgent || req.headers['user-agent'] || ''),
          note: String(parsed.note || '').slice(0, 500),
          state: parsed.state && typeof parsed.state === 'object' ? parsed.state : {},
          lines,
        };
        const reports = [report, ...loadDebugLogs()].slice(0, DEBUG_LOG_MAX_REPORTS);
        saveDebugLogs(reports);
        sendJson(res, 200, { ok: true, id: report.id });
      });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (url === '/api/idle-video') {
    handleUploadApi(idleVideos, 'idleVideo', req, res, VIDEO_MAX_BYTES);
    return;
  }

  if (url === '/api/transition-video') {
    handleUploadApi(transitionVideos, 'transitionVideo', req, res, VIDEO_MAX_BYTES);
    return;
  }

  if (url === '/api/avatar-background') {
    handleUploadApi(avatarBackgrounds, 'avatarBackground', req, res, IMAGE_MAX_BYTES);
    return;
  }

  const gameIconMatch = url.match(/^\/api\/game-icons\/(wordwhack|cardgame|findgame)$/);
  if (gameIconMatch) {
    handleUploadApi(gameIconStores[gameIconMatch[1]], 'gameIcon', req, res, IMAGE_MAX_BYTES);
    return;
  }

  if (url.startsWith('/visme/')) {
    serveFile(res, join(ROOT, url.slice(1)));
    return;
  }

  if (url === '/ChickenDance.fbx') {
    serveFile(res, join(ROOT, 'ChickenDance.fbx'));
    return;
  }

  const rootAsset = url.match(/^\/[^/]+\.(png|jpe?g|webp|fbx|vrm|mp4|webm|mov)$/i);
  if (rootAsset) {
    serveFile(res, join(ROOT, url.slice(1)));
    return;
  }

  const file = pages[url] ?? pages['/'];
  serveFile(res, join(ROOT, file));
});

const wss = new WebSocketServer({ server, path: '/ws' });

const DEFAULT_VOICE_ID = 'default-zylgts2tamenvybeti3z0w__uncle_tommy';
const DEFAULT_INSTRUCTIONS = 'You are Uncle Tommy, a friendly voice assistant. Keep responses brief.';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

const DEFAULT_AVATAR = {
  cameraX: 0,
  cameraY: 1.3,
  cameraZ: 1.6,
  targetX: 0,
  targetY: 1.42,
  targetZ: 0,
};

function parseAvatarNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAvatar(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  return {
    cameraX: parseAvatarNumber(a.cameraX, DEFAULT_AVATAR.cameraX),
    cameraY: parseAvatarNumber(a.cameraY, DEFAULT_AVATAR.cameraY),
    cameraZ: parseAvatarNumber(a.cameraZ, DEFAULT_AVATAR.cameraZ),
    targetX: parseAvatarNumber(a.targetX, DEFAULT_AVATAR.targetX),
    targetY: parseAvatarNumber(a.targetY, DEFAULT_AVATAR.targetY),
    targetZ: parseAvatarNumber(a.targetZ, DEFAULT_AVATAR.targetZ),
  };
}

const DEFAULT_LIPSYNC = {
  exaggerate: 1,
  msPerPhone: 120,
  crossfadeMs: 50,
  blendshapes: Array(22).fill(1),
};

function parseLipsyncNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeBlendshapes(raw) {
  const weights = Array(22).fill(1);
  if (!Array.isArray(raw)) return weights;
  for (let i = 0; i < 22; i++) {
    weights[i] = parseLipsyncNumber(raw[i], 0, 2, 1);
  }
  return weights;
}

function normalizeLipsync(raw) {
  const l = raw && typeof raw === 'object' ? raw : {};
  return {
    exaggerate: parseLipsyncNumber(l.exaggerate, 0.2, 1.8, DEFAULT_LIPSYNC.exaggerate),
    msPerPhone: parseLipsyncNumber(l.msPerPhone, 50, 280, DEFAULT_LIPSYNC.msPerPhone),
    crossfadeMs: parseLipsyncNumber(l.crossfadeMs, 0, 120, DEFAULT_LIPSYNC.crossfadeMs),
    blendshapes: normalizeBlendshapes(l.blendshapes),
  };
}

const HAPPY_TOOL_INSTRUCTION =
  ' Call the happy tool (chicken dance) whenever the user asks to dance, says "chicken dance", wants a funny move or celebration, or says anything that suggests they want Uncle Tommy to dance. Trigger on short phrases like "dance", "do a dance", "chicken dance", "dance for me", or "can you dance". Err on the side of calling it — kids love the chicken dance.';

const LEAVE_TOOL_INSTRUCTION =
  ' When the user says goodbye, bye, see you, see you later, I have to go, or otherwise indicates they want to end the conversation, respond with a brief farewell and immediately call the end_conversation tool in the same turn. Always call end_conversation when the user is done talking — do not keep chatting after a goodbye.';

const PLAY_GAME_TOOL_INSTRUCTION =
  ' When the user wants to play a game, asks to play something, says "let\'s play", "I want to play a game", or similar, respond with brief enthusiasm and call the play_game tool in the same turn. The app will randomly pick one of the available games.';

const HAPPY_TOOL = {
  type: 'function',
  name: 'happy',
  description:
    'Makes Uncle Tommy perform his chicken dance animation. Call when the user wants a dance, says chicken dance, asks for something fun, or uses "dance" in a request.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'How the user asked to dance, e.g. "do the chicken dance"',
      },
    },
  },
};

const END_CONVERSATION_TOOL = {
  type: 'function',
  name: 'end_conversation',
  description:
    'Ends the session. Call this whenever the user says goodbye, bye, see you later, or wants to stop talking.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Why the conversation is ending, e.g. user said goodbye',
      },
    },
    required: ['reason'],
  },
};

const PLAY_GAME_TOOL = {
  type: 'function',
  name: 'play_game',
  description:
    'Launches a random mini-game when the user wants to play. Call when they ask to play a game or want some game time.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'What the user asked for, e.g. "I want to play a game"',
      },
    },
  },
};

function buildSessionCfg({ instructions, voice, model } = {}) {
  const session = {
    type: 'realtime',
    model: model || DEFAULT_MODEL,
    instructions: (instructions || DEFAULT_INSTRUCTIONS) + HAPPY_TOOL_INSTRUCTION + PLAY_GAME_TOOL_INSTRUCTION + LEAVE_TOOL_INSTRUCTION,
    output_modalities: ['audio', 'text'],
    tools: [HAPPY_TOOL, PLAY_GAME_TOOL, END_CONVERSATION_TOOL],
    tool_choice: 'auto',
    audio: {
      input: {
        turn_detection: {
          type: 'server_vad',
          idle_timeout_ms: 15000,
          create_response: true,
        },
        transcription: {
          model: 'assemblyai/universal-streaming-english',
        },
      },
      output: {
        voice: voice || DEFAULT_VOICE_ID,
      },
    },
  };
  return JSON.stringify({ type: 'session.update', session });
}

const GREET = JSON.stringify({
  type: 'conversation.item.create',
  item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Greet the user' }] }
});

function connectToInworld(apiKey, browser, session) {
  let setup = 0;
  const sessionCfg = buildSessionCfg(session);
  const api = new WebSocket(
    `wss://api.inworld.ai/api/v1/realtime/session?key=voice-${Date.now()}&protocol=realtime`,
    { headers: { Authorization: `Basic ${apiKey}` } }
  );

  api.on('message', (raw) => {
    let parsed;
    try { parsed = JSON.parse(raw.toString()); } catch { parsed = null; }
    const t = parsed?.type;
    if (setup < 2) {
      if (t === 'session.created') {
        console.log('[session.created] sending session.update:', sessionCfg);
        api.send(sessionCfg);
        setup = 1;
      }
      else if (t === 'session.updated' && setup === 1) {
        console.log('[session.updated] config accepted; sending greet + response.create');
        api.send(GREET); api.send('{"type":"response.create"}'); setup = 2;
      }
      else if (t === 'error' || t === 'session.error') { console.error('[setup error]', raw.toString()); }
    } else {
      if (t === 'error' || t === 'session.error') console.error('[inworld error]', raw.toString());
      if (t === 'input_audio_buffer.timeout_triggered') console.log('[IDLE TIMEOUT] user silent — nudge should follow:', raw.toString());
    }
    if (t && t !== 'response.output_audio.delta') console.log('[inworld ->]', t);
    if (t === 'response.function_call_arguments.done') {
      console.log('[tool call]', parsed.name, parsed.arguments);
    }
    if (browser.readyState === WebSocket.OPEN) browser.send(raw.toString());
  });

  browser.on('message', (msg) => {
    if (api.readyState === WebSocket.OPEN) api.send(msg.toString());
  });

  browser.on('close', () => api.close());
  api.on('close', () => { if (browser.readyState === WebSocket.OPEN) browser.close(); });
  api.on('error', (e) => {
    console.error('API error:', e.message);
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(JSON.stringify({ type: 'client.error', message: e.message }));
      browser.close();
    }
  });
}

wss.on('connection', (browser) => {
  let connected = false;

  const fail = (message) => {
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(JSON.stringify({ type: 'client.error', message }));
      browser.close();
    }
  };

  const authTimeout = setTimeout(() => {
    if (!connected) fail('Authentication timeout. Send your API key first.');
  }, 5000);

  browser.on('message', (msg) => {
    if (connected) return;

    let parsed;
    try { parsed = JSON.parse(msg.toString()); } catch { return fail('Invalid auth message.'); }

    if (parsed.type !== 'client.auth') return fail('Expected client.auth message.');

    const saved = loadConfig();
    const apiKey = parsed.apiKey?.trim() || saved.apiKey?.trim() || process.env.INWORLD_API_KEY;
    if (!apiKey) return fail('No API key. Set one at /config or via INWORLD_API_KEY env var.');

    clearTimeout(authTimeout);
    connected = true;
    browser.removeAllListeners('message');
    connectToInworld(apiKey, browser, {
      instructions: parsed.instructions?.trim() || saved.instructions?.trim(),
      voice: parsed.voice?.trim() || saved.voice?.trim(),
      model: parsed.model?.trim() || saved.model?.trim(),
    });
  });
});

const port = Number(process.env.PORT) || 4000;
server.listen(port, '0.0.0.0', () => {
  console.log(`Listening on http://0.0.0.0:${port}  (config: /config)`);
  console.log(`Games hub:  http://0.0.0.0:${port}/games/`);
  console.log(`Game database: ${GAME_DB_PATH}`);
  if (CONFIG_DIR !== ROOT) console.log(`Config stored at ${CONFIG_PATH}`);
});
