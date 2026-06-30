import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const ROOT = dirname(fileURLToPath(import.meta.url));

// Local: ./config.json  |  Railway: mount a volume (e.g. /app/data) — uses RAILWAY_VOLUME_MOUNT_PATH
const CONFIG_DIR = process.env.CONFIG_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || ROOT;
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DEBUG_LOG_PATH = join(CONFIG_DIR, 'hello-debug-log.json');
const DEBUG_LOG_MAX_REPORTS = 20;

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
};

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
  '/visme': 'visme/index.html',
};

const server = createServer((req, res) => {
  const url = req.url?.split('?')[0] ?? '/';

  if (url === '/api/config') {
    if (req.method === 'GET') {
      const cfg = loadConfig();
      sendJson(res, 200, {
        apiKey: cfg.apiKey ?? '',
        instructions: cfg.instructions ?? '',
        voice: cfg.voice ?? '',
        model: cfg.model ?? '',
        avatar: normalizeAvatar(cfg.avatar),
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
        saveConfig({
          apiKey,
          instructions: parsed.instructions?.trim() || '',
          voice: parsed.voice?.trim() || '',
          model: parsed.model?.trim() || '',
          avatar: normalizeAvatar(parsed.avatar),
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

  if (url.startsWith('/visme/')) {
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
  cameraY: 1.3,
  cameraZ: 1.6,
  targetY: 1.42,
};

function parseAvatarNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeAvatar(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  return {
    cameraY: parseAvatarNumber(a.cameraY, DEFAULT_AVATAR.cameraY),
    cameraZ: parseAvatarNumber(a.cameraZ, DEFAULT_AVATAR.cameraZ),
    targetY: parseAvatarNumber(a.targetY, DEFAULT_AVATAR.targetY),
  };
}

const FOOTBALL_TOOL_INSTRUCTION =
  ' When the user mentions football, soccer, or related topics, call the show_football_icon tool.';

const LEAVE_TOOL_INSTRUCTION =
  ' When the user says goodbye, bye, see you, see you later, I have to go, or otherwise indicates they want to end the conversation, respond with a brief farewell and immediately call the end_conversation tool in the same turn. Always call end_conversation when the user is done talking — do not keep chatting after a goodbye.';

const SHOW_FOOTBALL_ICON_TOOL = {
  type: 'function',
  name: 'show_football_icon',
  description: 'Shows a football emoji icon on the user\'s screen when they talk about football or soccer.',
  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Brief description of the football-related topic the user mentioned',
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

function buildSessionCfg({ instructions, voice, model } = {}) {
  const session = {
    type: 'realtime',
    model: model || DEFAULT_MODEL,
    instructions: (instructions || DEFAULT_INSTRUCTIONS) + FOOTBALL_TOOL_INSTRUCTION + LEAVE_TOOL_INSTRUCTION,
    output_modalities: ['audio', 'text'],
    tools: [SHOW_FOOTBALL_ICON_TOOL, END_CONVERSATION_TOOL],
    tool_choice: 'auto',
    audio: {
      input: {
        turn_detection: {
          type: 'server_vad',
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
      if (t === 'session.created') { console.log('[session.created] sending session.update'); api.send(sessionCfg); setup = 1; }
      else if (t === 'session.updated' && setup === 1) { console.log('[session.updated] sending greet + response.create'); api.send(GREET); api.send('{"type":"response.create"}'); setup = 2; }
      else if (t === 'error' || t === 'session.error') { console.error('[setup error]', raw.toString()); }
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
  if (CONFIG_DIR !== ROOT) console.log(`Config stored at ${CONFIG_PATH}`);
});
