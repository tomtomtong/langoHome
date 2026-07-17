import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, readdirSync, statSync, copyFileSync } from 'fs';
import { randomBytes, timingSafeEqual } from 'crypto';
import { createServer } from 'http';
import { createRequire } from 'module';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import multer from 'multer';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const ROOT = dirname(fileURLToPath(import.meta.url));
// Enabled by default so realtime sessions work out of the box. Opt out during
// development with INWORLD_API_ENABLED=0|false|no|off.
const INWORLD_API_ENABLED = !/^(0|false|no|off)$/i.test(
  process.env.INWORLD_API_ENABLED ?? '1',
);
const INWORLD_API_DISABLED_MESSAGE =
  'Inworld API is disabled. Unset INWORLD_API_ENABLED=0 or set INWORLD_API_ENABLED=1.';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY?.trim() || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim() || 'Taae9YSyOLxij6fj32HF';
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID?.trim() || '';
const ELEVENLABS_CLIENT_DIST = join(ROOT, 'node_modules', '@elevenlabs', 'client', 'dist');

async function elevenLabsFetch(apiKey, urlPath, init = {}) {
  const res = await fetch(`https://api.elevenlabs.io${urlPath}`, {
    ...init,
    headers: {
      'xi-api-key': apiKey,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

function getRequestElevenLabsApiKey(req) {
  const raw = req.headers['x-elevenlabs-api-key'];
  const fromHeader = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (fromHeader) return fromHeader;
  return ELEVENLABS_API_KEY;
}

function requireElevenLabsApiKey(req, res) {
  const apiKey = getRequestElevenLabsApiKey(req);
  if (apiKey) return apiKey;
  sendJson(res, 400, {
    error: 'Missing ElevenLabs API key. Enter it on the page or set ELEVENLABS_API_KEY on the server.',
  });
  return null;
}

function isElevenAgentsPublicPath(url) {
  return url === '/agents'
    || url === '/agents.html'
    || url === '/agents.js'
    || url === '/agents.css'
    || url.startsWith('/vendor/elevenlabs-client/')
    || url === '/api/elevenlabs/config'
    || url === '/api/elevenlabs/agents'
    || url === '/api/elevenlabs/conversation-token';
}

// Local: ./config.json  |  Railway: mount a volume (e.g. /app/data) — uses RAILWAY_VOLUME_MOUNT_PATH
const CONFIG_DIR = process.env.CONFIG_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || ROOT;
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const USER_PROFILES_PATH = join(CONFIG_DIR, 'user-profiles.json');
const USER_LOGIN_META_PATH = join(CONFIG_DIR, 'user-login-meta.json');
const STUDENT_USERS_PATH = join(CONFIG_DIR, 'student-users.json');
const CHECK_INS_PATH = join(CONFIG_DIR, 'check-ins.json');
const SESSIONS_PATH = join(CONFIG_DIR, 'sessions.json');
const DEBUG_LOG_PATH = join(CONFIG_DIR, 'hello-debug-log.json');
const DEBUG_LOG_MAX_REPORTS = 20;
const CONVERSATIONS_DB_PATH = join(CONFIG_DIR, 'conversations.db');
const SESSION_AUDIO_DIR = join(CONFIG_DIR, 'session-audio');
const USER_AUDIO_SAMPLE_RATE = 24000;
const IDLE_VIDEO_DIR = join(CONFIG_DIR, 'idle-video');
const TRANSITION_VIDEO_DIR = join(CONFIG_DIR, 'transition-video');
const VIDEO_PAIRS_DIR = join(CONFIG_DIR, 'video-pairs');
const VIDEO_PAIRS_MANIFEST_PATH = join(VIDEO_PAIRS_DIR, 'manifest.json');
const AVATAR_BG_DIR = join(CONFIG_DIR, 'avatar-background');
const GAME_ICONS_DIR = join(CONFIG_DIR, 'game-icons');
const GAME_ICON_IDS = ['wordwhack', 'cardgame', 'findgame'];
const PAIR_THEME_IDS = ['default', 'warm', 'cool', 'nature', 'night'];
const DEFAULT_PAIR_THEME = 'default';
const DEFAULT_ROOM_SCENE = 'livingroom';
const DEFAULT_VIDEO_PAIRS_TIMEZONE = 'Asia/Hong_Kong';
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

ensureConfigDir();
const conversationsDb = new Database(CONVERSATIONS_DB_PATH);
conversationsDb.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    turn_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS conversation_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    event_type TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_started ON conversations(started_at DESC);
  CREATE INDEX IF NOT EXISTS idx_turns_conversation ON conversation_turns(conversation_id, created_at);
  CREATE TABLE IF NOT EXISTS profile_sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    username TEXT NOT NULL,
    model TEXT,
    status TEXT NOT NULL,
    message TEXT,
    changed_fields TEXT,
    updates_json TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_profile_sync_logs_created ON profile_sync_logs(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_profile_sync_logs_conversation ON profile_sync_logs(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_profile_sync_logs_username ON profile_sync_logs(username, created_at DESC);
  CREATE TABLE IF NOT EXISTS game_plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    game_id TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    play_date TEXT NOT NULL,
    played_at INTEGER NOT NULL,
    details_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_game_plays_username_date ON game_plays(username, play_date DESC);
  CREATE INDEX IF NOT EXISTS idx_game_plays_played_at ON game_plays(played_at DESC);
  CREATE INDEX IF NOT EXISTS idx_game_plays_date_game ON game_plays(play_date, game_id);
`);
try {
  conversationsDb.exec(`ALTER TABLE conversations ADD COLUMN user_audio_path TEXT`);
} catch (e) {
  if (!String(e.message).includes('duplicate column')) throw e;
}

const insertConversationStmt = conversationsDb.prepare(`
  INSERT INTO conversations (id, username, role, started_at, turn_count)
  VALUES (?, ?, ?, ?, 0)
`);
const endConversationStmt = conversationsDb.prepare(`
  UPDATE conversations SET ended_at = ? WHERE id = ? AND ended_at IS NULL
`);
const insertTurnStmt = conversationsDb.prepare(`
  INSERT INTO conversation_turns (conversation_id, role, text, event_type, created_at)
  VALUES (?, ?, ?, ?, ?)
`);
const incrementTurnCountStmt = conversationsDb.prepare(`
  UPDATE conversations SET turn_count = turn_count + 1 WHERE id = ?
`);
const listConversationsStmt = conversationsDb.prepare(`
  SELECT id, username, role, started_at, ended_at, turn_count, user_audio_path
  FROM conversations
  WHERE (? IS NULL OR username = ?)
  ORDER BY started_at DESC
  LIMIT ? OFFSET ?
`);
const countConversationsStmt = conversationsDb.prepare(`
  SELECT COUNT(*) AS total FROM conversations WHERE (? IS NULL OR username = ?)
`);
const getConversationStmt = conversationsDb.prepare(`
  SELECT id, username, role, started_at, ended_at, turn_count, user_audio_path
  FROM conversations WHERE id = ?
`);
const setConversationUserAudioPathStmt = conversationsDb.prepare(`
  UPDATE conversations SET user_audio_path = ? WHERE id = ?
`);
const getConversationTurnsStmt = conversationsDb.prepare(`
  SELECT role, text, event_type, created_at
  FROM conversation_turns
  WHERE conversation_id = ?
  ORDER BY created_at ASC, id ASC
`);
const deleteConversationStmt = conversationsDb.prepare(`DELETE FROM conversations WHERE id = ?`);
const deleteConversationTurnsStmt = conversationsDb.prepare(`DELETE FROM conversation_turns WHERE conversation_id = ?`);
const deleteProfileSyncLogsForConversationStmt = conversationsDb.prepare(`
  DELETE FROM profile_sync_logs WHERE conversation_id = ?
`);
const listConversationAudioPathsStmt = conversationsDb.prepare(`
  SELECT id, user_audio_path FROM conversations WHERE (? IS NULL OR username = ?)
`);
const deleteConversationTurnsForUserStmt = conversationsDb.prepare(`
  DELETE FROM conversation_turns
  WHERE conversation_id IN (SELECT id FROM conversations WHERE username = ?)
`);
const deleteConversationsForUserStmt = conversationsDb.prepare(`DELETE FROM conversations WHERE username = ?`);
const deleteProfileSyncLogsForUserStmt = conversationsDb.prepare(`DELETE FROM profile_sync_logs WHERE username = ?`);
const insertProfileSyncLogStmt = conversationsDb.prepare(`
  INSERT INTO profile_sync_logs (
    conversation_id, username, model, status, message, changed_fields, updates_json, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const listProfileSyncLogsStmt = conversationsDb.prepare(`
  SELECT id, conversation_id, username, model, status, message, changed_fields, updates_json, created_at
  FROM profile_sync_logs
  WHERE (? IS NULL OR username = ?)
    AND (? IS NULL OR conversation_id = ?)
  ORDER BY created_at DESC
  LIMIT ? OFFSET ?
`);
const countProfileSyncLogsStmt = conversationsDb.prepare(`
  SELECT COUNT(*) AS total
  FROM profile_sync_logs
  WHERE (? IS NULL OR username = ?)
    AND (? IS NULL OR conversation_id = ?)
`);
const getProfileSyncLogStmt = conversationsDb.prepare(`
  SELECT id, conversation_id, username, model, status, message, changed_fields, updates_json, created_at
  FROM profile_sync_logs WHERE id = ?
`);
const getProfileSyncLogForConversationStmt = conversationsDb.prepare(`
  SELECT id, conversation_id, username, model, status, message, changed_fields, updates_json, created_at
  FROM profile_sync_logs
  WHERE conversation_id = ?
  ORDER BY created_at DESC
  LIMIT 1
`);

function createConversationRecord(username, role) {
  const id = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  insertConversationStmt.run(id, username, role, Date.now());
  return id;
}

function endConversationRecord(id) {
  endConversationStmt.run(Date.now(), id);
}

function addConversationTurn(conversationId, role, text, eventType) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;
  insertTurnStmt.run(conversationId, role, trimmed, eventType || null, Date.now());
  incrementTurnCountStmt.run(conversationId);
}

function rowToConversation(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    turnCount: row.turn_count,
    hasUserAudio: Boolean(row.user_audio_path),
    userAudioUrl: row.user_audio_path ? `/api/conversations/${row.id}/user-audio` : null,
    hasSessionAudio: Boolean(row.user_audio_path),
    sessionAudioUrl: row.user_audio_path ? `/api/conversations/${row.id}/user-audio` : null,
  };
}

function ensureSessionAudioDir() {
  if (!existsSync(SESSION_AUDIO_DIR)) mkdirSync(SESSION_AUDIO_DIR, { recursive: true });
}

function createSessionAudioRecorder(sampleRate = USER_AUDIO_SAMPLE_RATE) {
  const startedAt = Date.now();
  const segments = [];
  let userSampleCursor = 0;
  let userBaseSample = null;
  let currentAgentResponseId = null;
  let agentResponseStartSample = 0;
  let agentResponseSampleCursor = 0;

  const wallClockSample = () => Math.round(((Date.now() - startedAt) / 1000) * sampleRate);

  return {
    appendUserPcm(buf) {
      if (!buf?.length) return;
      if (userBaseSample === null) userBaseSample = wallClockSample();
      const start = userBaseSample + userSampleCursor;
      segments.push({ start, pcm: buf });
      userSampleCursor += buf.length / 2;
    },

    appendUserFromMessage(msg) {
      let parsed;
      try {
        parsed = JSON.parse(msg.toString());
      } catch {
        return;
      }
      if (parsed?.type !== 'input_audio_buffer.append' || !parsed.audio) return;
      this.appendUserPcm(Buffer.from(parsed.audio, 'base64'));
    },

    appendAgentDelta(parsed) {
      if (!parsed?.delta) return;
      const buf = Buffer.from(parsed.delta, 'base64');
      if (!buf.length) return;

      const responseId = parsed.response_id || parsed.item_id || '__default__';
      if (responseId !== currentAgentResponseId) {
        currentAgentResponseId = responseId;
        agentResponseStartSample = wallClockSample();
        agentResponseSampleCursor = 0;
      }

      const start = agentResponseStartSample + agentResponseSampleCursor;
      segments.push({ start, pcm: buf });
      agentResponseSampleCursor += buf.length / 2;
    },

    buildPcmBuffer() {
      if (!segments.length) return null;

      let maxEnd = 0;
      for (const { start, pcm } of segments) {
        maxEnd = Math.max(maxEnd, start + (pcm.length / 2));
      }
      if (maxEnd <= 0) return null;

      const mix = new Float32Array(maxEnd);
      for (const { start, pcm } of segments) {
        const view = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
        for (let i = 0; i < view.length; i++) {
          mix[start + i] += view[i] / 32768;
        }
      }

      const out = Buffer.alloc(maxEnd * 2);
      for (let i = 0; i < maxEnd; i++) {
        const sample = Math.max(-1, Math.min(1, mix[i]));
        out.writeInt16LE(Math.round(sample * 32767), i * 2);
      }
      return out;
    },

    hasAudio() {
      return segments.length > 0;
    },
  };
}

function buildWavBuffer(pcmChunks, sampleRate = USER_AUDIO_SAMPLE_RATE) {
  const pcm = Buffer.concat(pcmChunks);
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

function saveSessionMixAudio(conversationId, recorder) {
  if (!recorder?.hasAudio()) return null;
  const pcm = recorder.buildPcmBuffer();
  if (!pcm?.length) return null;
  ensureSessionAudioDir();
  const filename = `${conversationId}.wav`;
  const filePath = join(SESSION_AUDIO_DIR, filename);
  try {
    writeFileSync(filePath, buildWavBuffer([pcm]));
    setConversationUserAudioPathStmt.run(filename, conversationId);
    return filename;
  } catch (e) {
    console.error('[session-audio] save failed:', e.message);
    return null;
  }
}

function deleteUserSessionAudio(filename) {
  if (!filename) return;
  const filePath = join(SESSION_AUDIO_DIR, filename);
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch (e) {
    console.error('[session-audio] delete failed:', e.message);
  }
}

function listConversationRecords({ username = null, limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const filterUser = username ? String(username) : null;
  const rows = listConversationsStmt.all(filterUser, filterUser, safeLimit, safeOffset);
  const total = countConversationsStmt.get(filterUser, filterUser).total;
  return {
    conversations: rows.map(rowToConversation),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

function getConversationRecord(id) {
  const row = getConversationStmt.get(id);
  if (!row) return null;
  const turns = getConversationTurnsStmt.all(id).map((turn) => ({
    role: turn.role,
    text: turn.text,
    eventType: turn.event_type,
    createdAt: turn.created_at,
  }));
  return { ...rowToConversation(row), turns };
}

function deleteConversationRecord(id) {
  const row = getConversationStmt.get(id);
  if (row?.user_audio_path) deleteUserSessionAudio(row.user_audio_path);
  deleteConversationTurnsStmt.run(id);
  deleteProfileSyncLogsForConversationStmt.run(id);
  const result = deleteConversationStmt.run(id);
  return result.changes > 0;
}

function deleteAllConversationRecords({ username = null } = {}) {
  const filterUser = username ? String(username).trim() : null;
  const rows = listConversationAudioPathsStmt.all(filterUser, filterUser);
  for (const row of rows) {
    if (row.user_audio_path) deleteUserSessionAudio(row.user_audio_path);
  }

  const runBulk = conversationsDb.transaction(() => {
    if (filterUser) {
      deleteConversationTurnsForUserStmt.run(filterUser);
      deleteProfileSyncLogsForUserStmt.run(filterUser);
      return deleteConversationsForUserStmt.run(filterUser).changes;
    }
    conversationsDb.exec('DELETE FROM conversation_turns');
    conversationsDb.exec('DELETE FROM profile_sync_logs');
    return conversationsDb.prepare('DELETE FROM conversations').run().changes;
  });

  const deleted = runBulk();
  return { deleted, username: filterUser };
}

function transcriptRoleLabel(role) {
  if (role === 'user') return 'Child';
  if (role === 'assistant') return 'Uncle Tommy';
  if (role === 'tool') return 'Tool';
  return role || 'unknown';
}

function formatConversationTranscriptText(record) {
  const lines = [
    'Uncle Tommy — conversation transcript',
    `Conversation ID: ${record.id}`,
    `Account: ${record.username}`,
    `Role: ${record.role}`,
    `Started: ${record.startedAt ? new Date(record.startedAt).toISOString() : '—'}`,
    `Ended: ${record.endedAt ? new Date(record.endedAt).toISOString() : '—'}`,
    `Turns: ${record.turnCount || 0}`,
    '',
    '---',
    '',
  ];

  if (!record.turns?.length) {
    lines.push('(No transcript turns captured for this session.)');
    return lines.join('\n');
  }

  for (const turn of record.turns) {
    const when = turn.createdAt ? new Date(turn.createdAt).toISOString() : '';
    lines.push(`[${when}] ${transcriptRoleLabel(turn.role)}:`);
    lines.push(String(turn.text || '').trim());
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function buildConversationExportFilename(record) {
  const started = record.startedAt ? new Date(record.startedAt) : new Date();
  const stamp = started.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const user = String(record.username || 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `conversation-${user}-${stamp}.zip`;
}

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (~crc) >>> 0;
}

function buildZipStoreArchive(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);
    const fileStart = offset;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, name, data);
    offset += local.length + name.length + data.length;

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(fileStart, 42);
    centralParts.push(central, name);
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, end]);
}

function buildConversationExportArchive(conversationId) {
  const record = getConversationRecord(conversationId);
  if (!record) return null;

  const entries = [{
    name: 'transcript.txt',
    data: Buffer.from(formatConversationTranscriptText(record), 'utf8'),
  }];

  const row = getConversationStmt.get(conversationId);
  if (row?.user_audio_path) {
    const audioPath = join(SESSION_AUDIO_DIR, row.user_audio_path);
    if (existsSync(audioPath)) {
      entries.push({
        name: 'session-audio.wav',
        data: readFileSync(audioPath),
      });
    }
  }

  return {
    buffer: buildZipStoreArchive(entries),
    filename: buildConversationExportFilename(record),
  };
}

function rowToProfileSyncLog(row) {
  let changedFields = [];
  let updates = null;
  try {
    if (row.changed_fields) changedFields = JSON.parse(row.changed_fields);
  } catch { /* ignore */ }
  try {
    if (row.updates_json) updates = JSON.parse(row.updates_json);
  } catch { /* ignore */ }
  return {
    id: row.id,
    conversationId: row.conversation_id,
    username: row.username,
    model: row.model,
    status: row.status,
    message: row.message,
    changedFields: Array.isArray(changedFields) ? changedFields : [],
    updates,
    createdAt: row.created_at,
  };
}

function recordProfileSyncLog({
  conversationId = null,
  username,
  model = null,
  status,
  message = '',
  changedFields = [],
  updates = null,
}) {
  insertProfileSyncLogStmt.run(
    conversationId,
    username,
    model,
    status,
    message || null,
    changedFields.length ? JSON.stringify(changedFields) : null,
    updates && typeof updates === 'object' ? JSON.stringify(updates) : null,
    Date.now(),
  );
}

function listProfileSyncLogRecords({
  username = null,
  conversationId = null,
  limit = 50,
  offset = 0,
} = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const filterUser = username ? String(username) : null;
  const filterConversation = conversationId ? String(conversationId) : null;
  const rows = listProfileSyncLogsStmt.all(
    filterUser,
    filterUser,
    filterConversation,
    filterConversation,
    safeLimit,
    safeOffset,
  );
  const total = countProfileSyncLogsStmt.get(
    filterUser,
    filterUser,
    filterConversation,
    filterConversation,
  ).total;
  return {
    logs: rows.map(rowToProfileSyncLog),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

function getProfileSyncLogRecord(id) {
  const row = getProfileSyncLogStmt.get(id);
  return row ? rowToProfileSyncLog(row) : null;
}

function getProfileSyncLogForConversation(conversationId) {
  const row = getProfileSyncLogForConversationStmt.get(conversationId);
  return row ? rowToProfileSyncLog(row) : null;
}

const VALID_GAME_IDS = new Set(['wordwhack', 'cardgame', 'findgame', 'wordchop']);
const GAME_LABELS = {
  wordwhack: 'Word-Whack Blitz',
  cardgame: 'Picture-Word Memory Match',
  findgame: 'Find the Object',
  wordchop: 'Word Chop',
};

const insertGamePlayStmt = conversationsDb.prepare(`
  INSERT INTO game_plays (username, game_id, score, play_date, played_at, details_json)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const getGamePlayStmt = conversationsDb.prepare(`
  SELECT id, username, game_id, score, play_date, played_at, details_json
  FROM game_plays WHERE id = ?
`);

function rowToGamePlay(row) {
  let details = null;
  try {
    if (row.details_json) details = JSON.parse(row.details_json);
  } catch { /* ignore */ }
  return {
    id: row.id,
    username: row.username,
    gameId: row.game_id,
    gameLabel: GAME_LABELS[row.game_id] || row.game_id,
    score: row.score,
    playDate: row.play_date,
    playedAt: row.played_at,
    details,
  };
}

function recordGamePlay(username, { gameId, score, details } = {}) {
  if (!STUDENT_USERS[username]) return { ok: false, error: 'Invalid user.' };
  const normalizedGameId = String(gameId || '').trim();
  if (!VALID_GAME_IDS.has(normalizedGameId)) {
    return { ok: false, error: 'Invalid game.' };
  }
  const safeScore = Math.max(0, Math.round(Number(score) || 0));
  const timezone = getVideoPairsTimezone();
  const playDate = getTodayDateString(timezone);
  const playedAt = Date.now();
  const detailsJson = details && typeof details === 'object'
    ? JSON.stringify(details)
    : null;
  const result = insertGamePlayStmt.run(
    username,
    normalizedGameId,
    safeScore,
    playDate,
    playedAt,
    detailsJson,
  );
  const play = rowToGamePlay(getGamePlayStmt.get(result.lastInsertRowid));
  const checkIn = recordCheckIn(username);
  console.log(`[game-play] ${username} ${normalizedGameId} score=${safeScore} date=${playDate}`);
  return { ok: true, play, checkIn };
}

function listGamePlays({
  username = null,
  playDate = null,
  gameId = null,
  limit = 50,
  offset = 0,
} = {}) {
  const conditions = [];
  const params = [];
  if (username) {
    conditions.push('username = ?');
    params.push(String(username));
  }
  if (playDate) {
    conditions.push('play_date = ?');
    params.push(String(playDate));
  }
  if (gameId && VALID_GAME_IDS.has(gameId)) {
    conditions.push('game_id = ?');
    params.push(String(gameId));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const total = conversationsDb.prepare(
    `SELECT COUNT(*) AS total FROM game_plays ${where}`,
  ).get(...params).total;
  const rows = conversationsDb.prepare(`
    SELECT id, username, game_id, score, play_date, played_at, details_json
    FROM game_plays
    ${where}
    ORDER BY played_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, safeLimit, safeOffset);
  return {
    plays: rows.map(rowToGamePlay),
    total,
    limit: safeLimit,
    offset: safeOffset,
  };
}

function getGamePlayDailySummary({
  username = null,
  playDate = null,
  days = 14,
} = {}) {
  const timezone = getVideoPairsTimezone();
  const endDate = playDate || getTodayDateString(timezone);
  const safeDays = Math.min(Math.max(Number(days) || 14, 1), 90);
  const startDate = offsetDateString(endDate, -(safeDays - 1), timezone);
  const conditions = ['play_date >= ?', 'play_date <= ?'];
  const params = [startDate, endDate];
  if (username) {
    conditions.push('username = ?');
    params.push(String(username));
  }
  const where = conditions.join(' AND ');
  const rows = conversationsDb.prepare(`
    SELECT username, play_date, game_id,
           COUNT(*) AS plays,
           MAX(score) AS best_score,
           SUM(score) AS total_score,
           GROUP_CONCAT(score) AS scores
    FROM game_plays
    WHERE ${where}
    GROUP BY username, play_date, game_id
    ORDER BY play_date DESC, username ASC, game_id ASC
  `).all(...params);

  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.play_date)) byDate.set(row.play_date, new Map());
    const byUser = byDate.get(row.play_date);
    if (!byUser.has(row.username)) {
      byUser.set(row.username, { username: row.username, games: [], totalPlays: 0 });
    }
    const entry = byUser.get(row.username);
    const scores = String(row.scores || '')
      .split(',')
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    entry.games.push({
      gameId: row.game_id,
      gameLabel: GAME_LABELS[row.game_id] || row.game_id,
      plays: row.plays,
      bestScore: row.best_score,
      totalScore: row.total_score,
      scores,
    });
    entry.totalPlays += row.plays;
  }

  const daysOut = [];
  for (const [date, byUser] of byDate) {
    daysOut.push({
      date,
      users: [...byUser.values()].sort((a, b) => a.username.localeCompare(b.username)),
    });
  }
  daysOut.sort((a, b) => b.date.localeCompare(a.date));

  return {
    timezone,
    startDate,
    endDate,
    days: daysOut,
    games: [...VALID_GAME_IDS].map((id) => ({ id, label: GAME_LABELS[id] })),
    users: getUserList(),
  };
}

const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

const BUILTIN_STUDENT_USERS = {
  demo: 'demo',
  'demo-1': '123456',
  ...Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => {
      const username = `user${String(i + 1).padStart(2, '0')}`;
      return [username, 'password123'];
    }),
  ),
};

/** Mutable map of username → password (built-ins + custom accounts from student-users.json). */
const STUDENT_USERS = { ...BUILTIN_STUDENT_USERS };

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

const SESSION_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_SEC = Math.floor(SESSION_MAX_AGE_MS / 1000);

const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,31}$/;

function getUserList() {
  return Object.keys(STUDENT_USERS).sort((a, b) => a.localeCompare(b));
}

function loadCustomStudentUsers() {
  try {
    if (!existsSync(STUDENT_USERS_PATH)) return {};
    const data = JSON.parse(readFileSync(STUDENT_USERS_PATH, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const out = {};
    for (const [username, password] of Object.entries(data)) {
      const u = String(username || '').trim();
      const p = String(password ?? '');
      if (!USERNAME_RE.test(u) || u === ADMIN_USERNAME || !p) continue;
      out[u] = p;
    }
    return out;
  } catch (e) {
    console.warn('Could not load student-users.json:', e.message);
    return {};
  }
}

function saveCustomStudentUsers(customUsers) {
  ensureConfigDir();
  writeFileSync(STUDENT_USERS_PATH, JSON.stringify(customUsers, null, 2) + '\n');
}

function mergeCustomStudentUsers() {
  const custom = loadCustomStudentUsers();
  for (const [username, password] of Object.entries(custom)) {
    if (BUILTIN_STUDENT_USERS[username]) continue;
    STUDENT_USERS[username] = password;
  }
}

function createStudentUser(username, password) {
  const u = String(username || '').trim();
  const p = String(password ?? '');
  if (!USERNAME_RE.test(u)) {
    return { ok: false, error: 'Username must be 2–32 characters: letters, numbers, _ or -.' };
  }
  if (u === ADMIN_USERNAME) {
    return { ok: false, error: 'That username is reserved.' };
  }
  if (!p || p.length < 4) {
    return { ok: false, error: 'Password must be at least 4 characters.' };
  }
  if (STUDENT_USERS[u]) {
    return { ok: false, error: 'That username already exists.' };
  }
  const custom = loadCustomStudentUsers();
  custom[u] = p;
  saveCustomStudentUsers(custom);
  STUDENT_USERS[u] = p;
  return { ok: true, username: u };
}

mergeCustomStudentUsers();

const DEFAULT_USER_PROFILE = {
  childName: '',
  nickname: '',
  age: '',
  grade: '',
  mainLearningLanguage: '',
  homeLanguage: '',
  personalityType: '',
  confidenceLevel: '',
  attentionSpan: '',
  preferredPraise: '',
  favoriteToy: '',
  favoriteCharacter: '',
  favoriteFood: '',
  favoriteDrink: '',
  favoriteColor: '',
  favoriteAnimal: '',
  favoriteHobby: '',
  favoriteSport: '',
  favoriteMusic: '',
  favoritePlace: '',
  favoriteGameType: '',
  learningLevelSource: '',
  vocabularyLevel: '',
  grammarFocus: '',
  spellingLevel: '',
  readingSpeed: '',
  commonMistakes: '',
  strongAreas: '',
  weakAreas: '',
  preferredDifficulty: '',
  reviewFrequency: '',
  motivationTriggers: '',
  favoriteReward: '',
  frustrationSignal: '',
  encouragement: '',
  competitionPreference: '',
  correctionStyle: '',
  preferredRoleplay: '',
  fearDislike: '',
  schoolGrade: '',
  currentUnit: '',
  weeklyVocabulary: '',
  currentGrammar: '',
  homeworkType: '',
  dictationWords: '',
  upcomingTest: '',
  parentPriority: '',
  recentlyMentioned: '',
  recentAchievement: '',
  recentMistake: '',
  recentEmotion: '',
  recentPromise: '',
  nextFollowUp: '',
};

function normalizeUserProfile(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const profile = {};
  for (const key of Object.keys(DEFAULT_USER_PROFILE)) {
    profile[key] = String(src[key] ?? '').trim();
  }
  return profile;
}

function loadUserProfiles() {
  try {
    if (existsSync(USER_PROFILES_PATH)) {
      const data = JSON.parse(readFileSync(USER_PROFILES_PATH, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Could not load user-profiles.json:', e.message);
  }
  return {};
}

function saveUserProfiles(profiles) {
  ensureConfigDir();
  writeFileSync(USER_PROFILES_PATH, JSON.stringify(profiles, null, 2) + '\n');
}

function getUserProfile(username) {
  const profiles = loadUserProfiles();
  return normalizeUserProfile(profiles[username]);
}

function saveUserProfile(username, profile) {
  if (!STUDENT_USERS[username]) return false;
  const profiles = loadUserProfiles();
  profiles[username] = normalizeUserProfile(profile);
  saveUserProfiles(profiles);
  return true;
}

function parseBrowserName(userAgent) {
  const ua = String(userAgent || '');
  if (/\bEdg\//.test(ua)) return 'Edge';
  if (/\bOPR\//.test(ua) || /\bOpera\//.test(ua)) return 'Opera';
  if (/\bFirefox\//.test(ua)) return 'Firefox';
  if (/\bCriOS\//.test(ua)) return 'Chrome';
  if (/\bChrome\//.test(ua) && !/\bEdg\//.test(ua)) return 'Chrome';
  if (/\bSafari\//.test(ua) && !/\bChrome\//.test(ua)) return 'Safari';
  return '';
}

function classifyClientDevice(userAgent) {
  const ua = String(userAgent || '');
  if (!ua.trim()) {
    return { deviceLabel: 'Unknown', deviceType: 'unknown', os: '', browser: '' };
  }

  const browser = parseBrowserName(ua);
  const isIPad = /\biPad\b/.test(ua) || (/\bMacintosh\b/.test(ua) && /\bMobile\b/.test(ua));
  if (isIPad) {
    return { deviceLabel: 'iPad', deviceType: 'tablet', os: 'iOS', browser };
  }
  if (/\biPhone\b/.test(ua) || /\biPod\b/.test(ua)) {
    return { deviceLabel: 'iPhone', deviceType: 'phone', os: 'iOS', browser };
  }
  if (/\bAndroid\b/.test(ua)) {
    if (/\bMobile\b/i.test(ua)) {
      return { deviceLabel: 'Android phone', deviceType: 'phone', os: 'Android', browser };
    }
    return { deviceLabel: 'Android tablet', deviceType: 'tablet', os: 'Android', browser };
  }
  if (/\bWindows NT\b/.test(ua)) {
    return { deviceLabel: 'Windows PC', deviceType: 'desktop', os: 'Windows', browser };
  }
  if (/\bMacintosh\b/.test(ua)) {
    return { deviceLabel: 'Mac', deviceType: 'desktop', os: 'macOS', browser };
  }
  if (/\bCrOS\b/.test(ua)) {
    return { deviceLabel: 'Chromebook', deviceType: 'desktop', os: 'Chrome OS', browser };
  }
  if (/\bLinux\b/.test(ua)) {
    return { deviceLabel: 'Linux PC', deviceType: 'desktop', os: 'Linux', browser };
  }
  return { deviceLabel: 'Other device', deviceType: 'unknown', os: '', browser };
}

function normalizeUserLoginMeta(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const classified = classifyClientDevice(src.userAgent);
  const deviceLabel = String(src.deviceLabel ?? '').trim() || classified.deviceLabel;
  return {
    deviceLabel,
    deviceType: String(src.deviceType ?? '').trim() || classified.deviceType,
    os: String(src.os ?? '').trim() || classified.os,
    browser: String(src.browser ?? '').trim() || classified.browser,
    userAgent: String(src.userAgent ?? '').trim().slice(0, 512),
    lastLoginAt: Number(src.lastLoginAt) || 0,
  };
}

function loadUserLoginMeta() {
  try {
    if (existsSync(USER_LOGIN_META_PATH)) {
      const data = JSON.parse(readFileSync(USER_LOGIN_META_PATH, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Could not load user-login-meta.json:', e.message);
  }
  return {};
}

function saveUserLoginMeta(meta) {
  ensureConfigDir();
  writeFileSync(USER_LOGIN_META_PATH, JSON.stringify(meta, null, 2) + '\n');
}

function getUserLoginMeta(username) {
  const meta = loadUserLoginMeta();
  return normalizeUserLoginMeta(meta[username]);
}

function getUserLoginMetaForUsers(usernames) {
  const all = loadUserLoginMeta();
  const out = {};
  for (const username of usernames) {
    out[username] = normalizeUserLoginMeta(all[username]);
  }
  return out;
}

function recordStudentLogin(username, userAgent) {
  if (!STUDENT_USERS[username]) return;
  const classified = classifyClientDevice(userAgent);
  const all = loadUserLoginMeta();
  all[username] = {
    ...classified,
    userAgent: String(userAgent || '').trim().slice(0, 512),
    lastLoginAt: Date.now(),
  };
  saveUserLoginMeta(all);
}

const REPO_USER_PROFILES_PATH = join(ROOT, 'user-profiles.json');
const PROFILE_SEED_IDENTITY_FIELDS = ['childName', 'nickname', 'grade', 'schoolGrade'];

function loadRepoUserProfiles() {
  try {
    if (!existsSync(REPO_USER_PROFILES_PATH)) return {};
    const data = JSON.parse(readFileSync(REPO_USER_PROFILES_PATH, 'utf8'));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch (e) {
    console.warn('Could not load bundled user-profiles.json:', e.message);
  }
  return {};
}

/** When CONFIG_DIR is on a Railway volume, copy/merge git-bundled profiles into the volume. */
function seedUserProfilesFromRepo() {
  if (CONFIG_DIR === ROOT) return;

  const repoProfiles = loadRepoUserProfiles();
  if (!Object.keys(repoProfiles).length) return;

  const mode = String(process.env.USER_PROFILES_SEED || 'merge').toLowerCase();
  const force = mode === 'force' || mode === 'overwrite';
  const volumeProfiles = existsSync(USER_PROFILES_PATH) ? loadUserProfiles() : {};
  const updatedUsers = [];

  for (const username of getUserList()) {
    const repoProfile = normalizeUserProfile(repoProfiles[username]);
    const hasRepoIdentity = PROFILE_SEED_IDENTITY_FIELDS.some((key) => repoProfile[key]);
    if (!hasRepoIdentity) continue;

    if (force) {
      volumeProfiles[username] = repoProfile;
      updatedUsers.push(username);
      continue;
    }

    if (!volumeProfiles[username]) {
      volumeProfiles[username] = repoProfile;
      updatedUsers.push(username);
      continue;
    }

    const merged = normalizeUserProfile(volumeProfiles[username]);
    let userChanged = false;
    for (const key of PROFILE_SEED_IDENTITY_FIELDS) {
      if (!merged[key] && repoProfile[key]) {
        merged[key] = repoProfile[key];
        userChanged = true;
      }
    }
    if (userChanged) {
      volumeProfiles[username] = merged;
      updatedUsers.push(username);
    }
  }

  if (updatedUsers.length) {
    saveUserProfiles(volumeProfiles);
    console.log(
      `[profiles-seed] updated ${updatedUsers.length} account(s) on volume from bundled user-profiles.json (mode=${mode})`,
    );
  }
}

const INWORLD_LLM_URL = 'https://api.inworld.ai/v1/chat/completions';
const INWORLD_MODELS_URL = 'https://api.inworld.ai/llm/v1alpha/models';
const INWORLD_MODELS_CACHE_MS = 5 * 60 * 1000;
const PROFILE_SYNC_MIN_USER_TURNS = 1;
const PROFILE_SYNC_TRANSCRIPT_SETTLE_MS = 2500;
const DEFAULT_PROFILE_SYNC_MODEL = 'openai/gpt-4o-mini';
const PROFILE_FIELD_KEYS = Object.keys(DEFAULT_USER_PROFILE);

/** Human labels for sync prompts — keep in sync with account-config.html / buildProfileContext. */
const PROFILE_FIELD_CATALOG = [
  { key: 'childName', label: 'Child Name', section: 'Basic Profile' },
  { key: 'nickname', label: 'Nickname', section: 'Basic Profile' },
  { key: 'age', label: 'Age', section: 'Basic Profile' },
  { key: 'grade', label: 'Grade', section: 'Basic Profile' },
  { key: 'mainLearningLanguage', label: 'Main Learning Language', section: 'Basic Profile' },
  { key: 'homeLanguage', label: 'Home Language', section: 'Basic Profile' },
  { key: 'personalityType', label: 'Personality Type', section: 'Basic Profile' },
  { key: 'confidenceLevel', label: 'Confidence Level', section: 'Basic Profile' },
  { key: 'attentionSpan', label: 'Attention Span', section: 'Basic Profile' },
  { key: 'preferredPraise', label: 'Preferred Praise', section: 'Basic Profile' },
  { key: 'favoriteToy', label: 'Favorite Toy', section: 'Favorite Items' },
  { key: 'favoriteCharacter', label: 'Favorite Character', section: 'Favorite Items' },
  { key: 'favoriteFood', label: 'Favorite Food', section: 'Favorite Items' },
  { key: 'favoriteDrink', label: 'Favorite Drink', section: 'Favorite Items' },
  { key: 'favoriteColor', label: 'Favorite Color', section: 'Favorite Items' },
  { key: 'favoriteAnimal', label: 'Favorite Animal', section: 'Favorite Items' },
  { key: 'favoriteHobby', label: 'Favorite Hobby', section: 'Favorite Items' },
  { key: 'favoriteSport', label: 'Favorite Sport', section: 'Favorite Items' },
  { key: 'favoriteMusic', label: 'Favorite Song / Music Type', section: 'Favorite Items' },
  { key: 'favoritePlace', label: 'Favorite Place', section: 'Favorite Items' },
  { key: 'favoriteGameType', label: 'Favorite Game Type', section: 'Favorite Items' },
  { key: 'learningLevelSource', label: 'Source', section: 'Learning Level' },
  { key: 'vocabularyLevel', label: 'Vocabulary Level', section: 'Learning Level' },
  { key: 'grammarFocus', label: 'Grammar Focus', section: 'Learning Level' },
  { key: 'spellingLevel', label: 'Spelling Level', section: 'Learning Level' },
  { key: 'readingSpeed', label: 'Reading Speed', section: 'Learning Level' },
  { key: 'commonMistakes', label: 'Common Mistakes', section: 'Learning Level' },
  { key: 'strongAreas', label: 'Strong Areas', section: 'Learning Level' },
  { key: 'weakAreas', label: 'Weak Areas', section: 'Learning Level' },
  { key: 'preferredDifficulty', label: 'Preferred Difficulty', section: 'Learning Level' },
  { key: 'reviewFrequency', label: 'Review Frequency', section: 'Learning Level' },
  { key: 'motivationTriggers', label: 'Motivation Triggers', section: 'Emotional & Motivation' },
  { key: 'favoriteReward', label: 'Favorite Reward', section: 'Emotional & Motivation' },
  { key: 'frustrationSignal', label: 'Frustration Signal', section: 'Emotional & Motivation' },
  { key: 'encouragement', label: 'Encouragement', section: 'Emotional & Motivation' },
  { key: 'competitionPreference', label: 'Competition Preference', section: 'Emotional & Motivation' },
  { key: 'correctionStyle', label: 'Correction Style', section: 'Emotional & Motivation' },
  { key: 'preferredRoleplay', label: 'Preferred Roleplay', section: 'Emotional & Motivation' },
  { key: 'fearDislike', label: 'Fear / Dislike', section: 'Emotional & Motivation' },
  { key: 'schoolGrade', label: 'School Grade', section: 'School & Curriculum' },
  { key: 'currentUnit', label: 'Current Unit', section: 'School & Curriculum' },
  { key: 'weeklyVocabulary', label: 'Weekly Vocabulary', section: 'School & Curriculum' },
  { key: 'currentGrammar', label: 'Current Grammar', section: 'School & Curriculum' },
  { key: 'homeworkType', label: 'Homework Type', section: 'School & Curriculum' },
  { key: 'dictationWords', label: 'Dictation Words', section: 'School & Curriculum' },
  { key: 'upcomingTest', label: 'Upcoming Test', section: 'School & Curriculum' },
  { key: 'parentPriority', label: 'Parent Priority', section: 'School & Curriculum' },
  { key: 'recentlyMentioned', label: 'Recently Mentioned', section: 'Conversation Memory' },
  { key: 'recentAchievement', label: 'Recent Achievement', section: 'Conversation Memory' },
  { key: 'recentMistake', label: 'Recent Mistake', section: 'Conversation Memory' },
  { key: 'recentEmotion', label: 'Recent Emotion', section: 'Conversation Memory' },
  { key: 'recentPromise', label: 'Recent Promise', section: 'Conversation Memory' },
  { key: 'nextFollowUp', label: 'Next Follow-up', section: 'Conversation Memory' },
];

const PROFILE_MEMORY_KEYS = new Set([
  'recentlyMentioned',
  'recentAchievement',
  'recentMistake',
  'recentEmotion',
  'recentPromise',
  'nextFollowUp',
]);

const PROFILE_OBSERVABLE_KEYS = new Set([
  'personalityType',
  'confidenceLevel',
  'attentionSpan',
  'preferredPraise',
  'frustrationSignal',
  'encouragement',
  'correctionStyle',
  'commonMistakes',
  'strongAreas',
  'weakAreas',
  'preferredDifficulty',
]);

let inworldModelsCache = { fetchedAt: 0, models: [] };

function resolveInworldApiKey(apiKey) {
  return apiKey?.trim() || loadConfig().apiKey?.trim() || process.env.INWORLD_API_KEY?.trim() || '';
}

async function fetchInworldModels(apiKey, { forceRefresh = false } = {}) {
  if (!INWORLD_API_ENABLED) throw new Error(INWORLD_API_DISABLED_MESSAGE);
  const key = resolveInworldApiKey(apiKey);
  if (!key) {
    throw new Error('No Inworld API key configured.');
  }
  const now = Date.now();
  if (!forceRefresh && inworldModelsCache.models.length && now - inworldModelsCache.fetchedAt < INWORLD_MODELS_CACHE_MS) {
    return inworldModelsCache.models;
  }

  const upstream = await fetch(INWORLD_MODELS_URL, {
    headers: { Authorization: `Basic ${key}` },
  });
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const message = payload?.message || payload?.error?.message || payload?.error || 'Could not load models from Inworld.';
    throw new Error(message);
  }

  const models = (Array.isArray(payload.models) ? payload.models : [])
    .map((entry) => {
      const provider = String(entry.provider || '').trim();
      const model = String(entry.model || '').trim();
      if (!provider || !model) return null;
      return {
        id: `${provider}/${model}`,
        provider,
        model,
        modelCreator: String(entry.modelCreator || '').trim(),
        isSupported: entry.isSupported !== false,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));

  inworldModelsCache = { fetchedAt: now, models };
  return models;
}

function getProfileSyncModel() {
  const cfg = loadConfig();
  return cfg.profileSyncModel?.trim() || DEFAULT_PROFILE_SYNC_MODEL;
}

function mergeProfileUpdates(profile, updates) {
  const merged = normalizeUserProfile(profile);
  if (!updates || typeof updates !== 'object') return merged;
  for (const key of PROFILE_FIELD_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
    const value = String(updates[key] ?? '').trim();
    if (value) merged[key] = value;
  }
  return merged;
}

function formatTranscriptForProfileSync(turns) {
  return turns
    .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
    .map((turn) => `${turn.role === 'user' ? 'Child' : 'Uncle Tommy'}: ${turn.text}`)
    .join('\n');
}

function formatProfileFieldCatalog() {
  const bySection = new Map();
  for (const entry of PROFILE_FIELD_CATALOG) {
    if (!bySection.has(entry.section)) bySection.set(entry.section, []);
    bySection.get(entry.section).push(`  - ${entry.key} (${entry.label})`);
  }
  const lines = [];
  for (const [section, fields] of bySection) {
    lines.push(`${section}:`);
    lines.push(...fields);
  }
  return lines.join('\n');
}

function listProfileFields(profile, predicate) {
  return PROFILE_FIELD_CATALOG
    .filter(({ key }) => predicate(profile[key], key))
    .map(({ key, label }) => `${key} (${label})`);
}

function parseProfileSyncJson(content) {
  const raw = String(content || '').trim();
  if (!raw) throw new Error('Empty content');
  try {
    return JSON.parse(raw);
  } catch {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return JSON.parse(fenced[1].trim());
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('Invalid JSON');
  }
}

function buildProfileSyncSystemPrompt(currentProfile) {
  const profile = normalizeUserProfile(currentProfile);
  const emptyFields = listProfileFields(profile, (value) => !value);
  const filledFields = listProfileFields(profile, (value) => Boolean(value));

  return `You update a child learner profile for a voice tutoring app based on ONE completed conversation.
Return ONLY valid JSON with this shape:
{ "updates": { "fieldKey": "new value" } }

Goal: capture EVERY usable fact from this session into the correct profile field so empty fields get filled whenever the conversation supports them.

Field catalog (use these exact camelCase keys):
${formatProfileFieldCatalog()}

Currently EMPTY fields (fill any of these if the conversation supports them):
${emptyFields.length ? emptyFields.map((f) => `- ${f}`).join('\n') : '- (none)'}

Already filled fields (update only to correct, refine, or replace with clearer evidence):
${filledFields.length ? filledFields.map((f) => `- ${f}`).join('\n') : '- (none)'}

Extraction rules:
1. Scan the WHOLE transcript. Prefer filling EMPTY fields over leaving them blank.
2. Map likes/preferences to the specific favorite field — do NOT dump them only into recentlyMentioned:
   - "I like sushi" / "my favorite food is sushi" → favoriteFood
   - toys, LEGO, dolls → favoriteToy
   - Iron Man, Pokémon, Disney characters → favoriteCharacter
   - drinks / milk / juice → favoriteDrink
   - colors → favoriteColor
   - animals / pets → favoriteAnimal
   - hobbies, sports, songs, places, game types → matching favorite* fields
3. Soft evidence counts. Accept child statements, tutor confirmations, and clear implications such as:
   "I like…", "my favorite…", "I love…", "I want…", "I play with…", "I drink…", "my color is…".
4. Observable traits may be inferred from behaviour in this session when empty:
   ${[...PROFILE_OBSERVABLE_KEYS].join(', ')}.
5. Always refresh conversation-memory fields when relevant:
   ${[...PROFILE_MEMORY_KEYS].join(', ')}
6. Keep each value concise (under 140 characters). Use simple English unless the child mainly spoke another language.
7. Do not invent facts with no transcript support. If a field has no evidence, omit it.
8. Include ALL supported fields in updates in one response — do not stop after memory fields.
9. If the session was too short to learn anything, return { "updates": {} }.`;
}

async function syncUserProfileFromConversation({ username, apiKey, conversationId }) {
  if (!STUDENT_USERS[username]) return;
  const key = resolveInworldApiKey(apiKey);
  const model = getProfileSyncModel();
  const logBase = { conversationId, username, model };

  if (!INWORLD_API_ENABLED) {
    console.log(`[profile-sync] skipped ${username}: ${INWORLD_API_DISABLED_MESSAGE}`);
    recordProfileSyncLog({
      ...logBase,
      status: 'skipped',
      message: INWORLD_API_DISABLED_MESSAGE,
    });
    return;
  }

  if (!key) {
    const message = 'No Inworld API key configured.';
    console.warn(`[profile-sync] skipped ${username}: ${message}`);
    recordProfileSyncLog({ ...logBase, status: 'skipped', message });
    return;
  }

  // Wait briefly so late STT completions can land before we read the transcript.
  if (PROFILE_SYNC_TRANSCRIPT_SETTLE_MS > 0) {
    await new Promise((resolve) => setTimeout(resolve, PROFILE_SYNC_TRANSCRIPT_SETTLE_MS));
  }

  const record = getConversationRecord(conversationId);
  if (!record) {
    recordProfileSyncLog({ ...logBase, status: 'skipped', message: 'Conversation not found.' });
    return;
  }

  const userTurns = record.turns.filter((turn) => turn.role === 'user' && turn.text.trim());
  if (userTurns.length < PROFILE_SYNC_MIN_USER_TURNS) {
    const message = `Only ${userTurns.length} user turn(s); minimum is ${PROFILE_SYNC_MIN_USER_TURNS}.`;
    console.log(`[profile-sync] skipped ${username}: ${message}`);
    recordProfileSyncLog({ ...logBase, status: 'skipped', message });
    return;
  }

  const transcript = formatTranscriptForProfileSync(record.turns);
  if (!transcript.trim()) {
    recordProfileSyncLog({ ...logBase, status: 'skipped', message: 'No transcript available.' });
    return;
  }

  const currentProfile = getUserProfile(username);
  const emptyFields = listProfileFields(currentProfile, (value) => !value);
  const userPrompt = `Account: ${username}

Current profile JSON:
${JSON.stringify(currentProfile, null, 2)}

Empty fields that still need values if this conversation mentions them:
${emptyFields.length ? emptyFields.join(', ') : '(none)'}

Conversation transcript:
${transcript}

Extract every supported profile update from this session. Fill empty matching fields. Return JSON { "updates": { ... } }.`;

  try {
    const upstream = await fetch(INWORLD_LLM_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildProfileSyncSystemPrompt(currentProfile) },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = payload?.error?.message || payload?.error || 'Inworld LLM request failed.';
      console.warn(`[profile-sync] failed for ${username}:`, message);
      recordProfileSyncLog({ ...logBase, status: 'error', message: String(message) });
      return;
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      const message = 'Inworld returned empty content.';
      console.warn(`[profile-sync] empty response for ${username}`);
      recordProfileSyncLog({ ...logBase, status: 'error', message });
      return;
    }

    let parsed;
    try {
      parsed = parseProfileSyncJson(content);
    } catch {
      const message = 'Inworld returned invalid JSON.';
      console.warn(`[profile-sync] invalid JSON for ${username}`);
      recordProfileSyncLog({ ...logBase, status: 'error', message });
      return;
    }

    const updates = parsed?.updates && typeof parsed.updates === 'object'
      ? parsed.updates
      : parsed;
    const merged = mergeProfileUpdates(currentProfile, updates);
    const changedKeys = PROFILE_FIELD_KEYS.filter((field) => merged[field] !== currentProfile[field]);
    if (!changedKeys.length) {
      const message = 'LLM returned no profile changes.';
      console.log(`[profile-sync] no changes for ${username} (${conversationId})`);
      recordProfileSyncLog({ ...logBase, status: 'no_changes', message, updates });
      return;
    }

    const appliedUpdates = {};
    for (const field of changedKeys) appliedUpdates[field] = merged[field];

    saveUserProfile(username, merged);
    const filledEmpty = changedKeys.filter((field) => !currentProfile[field]);
    const message = `Updated ${changedKeys.length} field(s)`
      + (filledEmpty.length ? ` (filled ${filledEmpty.length} empty)` : '')
      + '.';
    console.log(`[profile-sync] updated ${username} (${conversationId}): ${changedKeys.join(', ')}`);
    recordProfileSyncLog({
      ...logBase,
      status: 'success',
      message,
      changedFields: changedKeys,
      updates: appliedUpdates,
    });
  } catch (e) {
    const message = e.message || 'Profile sync failed.';
    console.warn(`[profile-sync] error for ${username}:`, message);
    recordProfileSyncLog({ ...logBase, status: 'error', message });
  }
}

function queueProfileSyncFromConversation({ username, role, apiKey, conversationId }) {
  if (role !== 'student' || !STUDENT_USERS[username]) return;
  syncUserProfileFromConversation({ username, apiKey, conversationId }).catch((e) => {
    console.warn(`[profile-sync] unhandled error for ${username}:`, e.message);
  });
}

const REWARD_CYCLE_DAYS = 7;
const LANGOMON_DOLLS = ['bird', 'cat', 'dog', 'mouse', 'penguin', 'rabbit']
  .flatMap((animal) => Array.from({ length: 5 }, (_, index) => {
    const variant = index + 1;
    return {
      id: `${animal}-${variant}`,
      name: `${animal[0].toUpperCase()}${animal.slice(1)} Doll ${variant}`,
      asset: `/assets/collections/unlocked-${animal}-${variant}.png`,
    };
  }));
const LANGOMON_DOLL_IDS = LANGOMON_DOLLS.map((doll) => doll.id);
const LANGOMON_DOLL_ID_SET = new Set(LANGOMON_DOLL_IDS);
const REWARD_CYCLE = [
  { day: 1, type: 'checkin', label: 'Check in', icon: 'calendar', stars: 5 },
  { day: 2, type: 'game', label: 'Game', icon: 'game', stars: 8 },
  { day: 3, type: 'spot', label: 'Spot', icon: 'spot', stars: 10 },
  { day: 4, type: 'doll', label: 'Doll', icon: 'doll', stars: 12 },
  { day: 5, type: 'game', label: 'Game', icon: 'game', stars: 15 },
  { day: 6, type: 'spot', label: 'Spot', icon: 'spot', stars: 18 },
  { day: 7, type: 'doll', label: 'Doll', icon: 'doll', stars: 25 },
];

const DAILY_REWARD_MILESTONES = [
  {
    day: 1,
    id: 'word-whack',
    type: 'game',
    label: 'New Game',
    title: 'New Game In Garden',
    name: 'Word-Whack Blitz',
    icon: 'mole',
    cta: 'Play',
    destination: 'game',
    unlockGame: 'wordwhack',
    stars: 5,
  },
  {
    day: 3,
    id: 'langomon-doll',
    type: 'random-doll',
    label: 'Langomon Doll',
    title: 'New Langomon Doll',
    name: 'Mystery Langomon Doll',
    icon: 'penguin',
    cta: 'Add to collection',
    destination: 'modal',
    stars: 10,
  },
  {
    day: 5,
    id: 'new-spot',
    type: 'spot',
    label: 'New Spot',
    title: 'New Spot',
    name: 'School',
    icon: 'spot',
    cta: 'Explore map',
    destination: 'map',
    unlockLocation: 'school',
    stars: 15,
  },
  {
    day: 7,
    id: 'seven-day-doll',
    type: 'random-doll',
    label: 'Langomon Doll',
    title: 'New Langomon Doll',
    name: 'Mystery Langomon Doll',
    icon: 'penguin',
    cta: 'Add to collection',
    destination: 'modal',
    stars: 0,
  },
];

function getTodayDateString(timezone = DEFAULT_VIDEO_PAIRS_TIMEZONE) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function offsetDateString(dateStr, offsetDays, timezone = DEFAULT_VIDEO_PAIRS_TIMEZONE) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d + offsetDays, 12);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utc));
}

function defaultCheckInRecord() {
  return {
    currentStreak: 0,
    totalCheckIns: 0,
    totalStars: 0,
    lastCheckInDate: '',
    cyclePosition: 0,
    rewardFlowDate: '',
    claimedMilestones: [],
    collection: [],
    unlockedLocations: [],
    unlockedGames: [],
  };
}

function normalizeCheckInRecord(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const claimedMilestones = Array.isArray(src.claimedMilestones)
    ? [...new Set(src.claimedMilestones.map(String))]
    : [];
  const collection = Array.isArray(src.collection)
    ? [...new Set(src.collection.map(String))].filter((id) => LANGOMON_DOLL_ID_SET.has(id))
    : [];
  const unlockedLocations = Array.isArray(src.unlockedLocations)
    ? [...new Set(src.unlockedLocations.map(String).map((id) => id === 'park' ? 'school' : id))]
    : [];
  let unlockedGames = Array.isArray(src.unlockedGames)
    ? [...new Set(src.unlockedGames.map(String))]
    : [];
  // Backfill: later reward progress means Day 1 Word-Whack was already earned.
  const earnedWordWhack =
    claimedMilestones.includes('word-whack')
    || claimedMilestones.includes('langomon-doll')
    || claimedMilestones.includes('new-spot')
    || claimedMilestones.includes('seven-day-doll')
    || collection.length > 0
    || unlockedLocations.length > 0;
  if (earnedWordWhack && !unlockedGames.includes('wordwhack')) {
    unlockedGames = [...unlockedGames, 'wordwhack'];
  }
  return {
    currentStreak: Math.max(0, Number(src.currentStreak) || 0),
    totalCheckIns: Math.max(0, Number(src.totalCheckIns) || 0),
    totalStars: Math.max(0, Number(src.totalStars) || 0),
    lastCheckInDate: String(src.lastCheckInDate || '').trim(),
    cyclePosition: Math.max(0, Number(src.cyclePosition) || 0),
    rewardFlowDate: String(src.rewardFlowDate || '').trim(),
    claimedMilestones,
    collection,
    unlockedLocations,
    unlockedGames,
  };
}

function loadCheckIns() {
  try {
    if (existsSync(CHECK_INS_PATH)) {
      const data = JSON.parse(readFileSync(CHECK_INS_PATH, 'utf8'));
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Could not load check-ins.json:', e.message);
  }
  return {};
}

function saveCheckIns(data) {
  ensureConfigDir();
  writeFileSync(CHECK_INS_PATH, JSON.stringify(data, null, 2) + '\n');
}

function getCheckInRecord(username) {
  const all = loadCheckIns();
  return normalizeCheckInRecord(all[username]);
}

function saveCheckInRecord(username, record) {
  if (!STUDENT_USERS[username]) return false;
  const all = loadCheckIns();
  all[username] = normalizeCheckInRecord(record);
  saveCheckIns(all);
  return true;
}

function getRewardForCycleDay(cycleDay) {
  const idx = ((cycleDay - 1) % REWARD_CYCLE_DAYS + REWARD_CYCLE_DAYS) % REWARD_CYCLE_DAYS;
  return REWARD_CYCLE[idx];
}

function buildCheckInSlots(record, checkedInToday) {
  const todayCycleDay = checkedInToday
    ? record.cyclePosition
    : (record.totalCheckIns % REWARD_CYCLE_DAYS) + 1;
  const slots = [];
  for (let i = 0; i < REWARD_CYCLE_DAYS; i++) {
    const cycleDay = ((todayCycleDay - 1 + i) % REWARD_CYCLE_DAYS) + 1;
    const reward = getRewardForCycleDay(cycleDay);
    const status = i === 0
      ? (checkedInToday ? 'claimed' : 'active')
      : 'locked';
    slots.push({
      ...reward,
      displayDay: i + 1,
      cycleDay,
      status,
      label: i === 0 && !checkedInToday ? 'Check in' : reward.label,
    });
  }
  return slots;
}

function getCheckInStatus(username) {
  const timezone = getVideoPairsTimezone();
  const today = getTodayDateString(timezone);
  const yesterday = offsetDateString(today, -1, timezone);
  const record = getCheckInRecord(username);
  const checkedInToday = record.lastCheckInDate === today;
  const canCheckIn = !checkedInToday;
  const currentStreak = checkedInToday || record.lastCheckInDate === yesterday
    ? record.currentStreak
    : 0;
  const nextRewardDay = checkedInToday
    ? (record.cyclePosition % REWARD_CYCLE_DAYS) + 1
    : (record.totalCheckIns % REWARD_CYCLE_DAYS) + 1;
  const todayReward = getRewardForCycleDay(
    checkedInToday ? record.cyclePosition : nextRewardDay,
  );
  const claimedMilestones = record.rewardFlowDate === today ? record.claimedMilestones : [];
  const nextMilestone = DAILY_REWARD_MILESTONES.find((reward) => !claimedMilestones.includes(reward.id));
  const milestones = DAILY_REWARD_MILESTONES.map((reward) => ({
    ...reward,
    status: claimedMilestones.includes(reward.id)
      ? 'claimed'
      : checkedInToday && reward.id === nextMilestone?.id ? 'active' : 'locked',
  }));
  return {
    timezone,
    today,
    currentStreak,
    totalCheckIns: record.totalCheckIns,
    totalStars: record.totalStars,
    checkedInToday,
    canCheckIn,
    todayReward,
    cyclePosition: record.cyclePosition || nextRewardDay,
    slots: buildCheckInSlots(record, checkedInToday),
    rewards: REWARD_CYCLE,
    taskProgress: { current: checkedInToday ? 1 : 0, target: 1, complete: checkedInToday },
    taskText: 'Finish a game or daily exercise to check-in now!',
    milestones,
    claimedMilestones,
    nextMilestone: nextMilestone || null,
    canClaimMilestone: checkedInToday && Boolean(nextMilestone),
    collection: record.collection,
    unlockedLocations: record.unlockedLocations,
    unlockedGames: record.unlockedGames,
  };
}

function claimDailyMilestone(username) {
  const timezone = getVideoPairsTimezone();
  const today = getTodayDateString(timezone);
  const record = getCheckInRecord(username);
  if (record.lastCheckInDate !== today) {
    return {
      ok: false,
      error: 'Finish one game to check in before claiming a reward.',
      reward: null,
      status: getCheckInStatus(username),
    };
  }
  const claimedMilestones = record.rewardFlowDate === today ? [...record.claimedMilestones] : [];
  const reward = DAILY_REWARD_MILESTONES.find((item) => !claimedMilestones.includes(item.id));

  if (!reward) {
    return { ok: true, alreadyClaimed: true, reward: null, status: getCheckInStatus(username) };
  }

  let claimedReward = reward;
  let collection = record.collection;
  if (reward.type === 'random-doll') {
    const lockedDolls = LANGOMON_DOLL_IDS.filter((id) => !record.collection.includes(id));
    const collectionItemId = lockedDolls.length
      ? lockedDolls[Math.floor(Math.random() * lockedDolls.length)]
      : null;
    if (collectionItemId) collection = [...record.collection, collectionItemId];
    const doll = LANGOMON_DOLLS.find((item) => item.id === collectionItemId);
    claimedReward = {
      ...reward,
      collectionItemId,
      collectionAsset: doll?.asset || '',
      name: doll?.name || 'Langomon Collection Complete',
      collectionComplete: !collectionItemId,
    };
  }

  const updated = {
    ...record,
    rewardFlowDate: today,
    claimedMilestones: [...claimedMilestones, reward.id],
    totalStars: record.totalStars + reward.stars,
    collection,
  };

  if (reward.unlockLocation && !updated.unlockedLocations.includes(reward.unlockLocation)) {
    updated.unlockedLocations = [...updated.unlockedLocations, reward.unlockLocation];
  }
  if (reward.unlockGame && !updated.unlockedGames.includes(reward.unlockGame)) {
    updated.unlockedGames = [...updated.unlockedGames, reward.unlockGame];
  }

  saveCheckInRecord(username, updated);
  return { ok: true, alreadyClaimed: false, reward: claimedReward, status: getCheckInStatus(username) };
}

function recordCheckIn(username) {
  const timezone = getVideoPairsTimezone();
  const today = getTodayDateString(timezone);
  const yesterday = offsetDateString(today, -1, timezone);
  const record = getCheckInRecord(username);

  if (record.lastCheckInDate === today) {
    return { ok: true, alreadyClaimed: true, status: getCheckInStatus(username) };
  }

  let newStreak = 1;
  if (record.lastCheckInDate === yesterday) {
    newStreak = record.currentStreak + 1;
  }

  const nextCycleDay = (record.totalCheckIns % REWARD_CYCLE_DAYS) + 1;
  const reward = getRewardForCycleDay(nextCycleDay);
  const updated = {
    ...record,
    currentStreak: newStreak,
    totalCheckIns: record.totalCheckIns + 1,
    totalStars: record.totalStars + reward.stars,
    lastCheckInDate: today,
    cyclePosition: nextCycleDay,
  };
  saveCheckInRecord(username, updated);
  return {
    ok: true,
    alreadyClaimed: false,
    reward,
    status: getCheckInStatus(username),
  };
}

function hasUnlockedGame(username, gameId) {
  if (!username) return true;
  return getCheckInRecord(username).unlockedGames.includes(gameId);
}

function buildCheckInContext(username) {
  const status = getCheckInStatus(username);
  if (!status.totalCheckIns && !status.canCheckIn) return '';
  const lines = [
    'Daily Check-in & Retention:',
    `- Current streak: ${status.currentStreak} day${status.currentStreak === 1 ? '' : 's'}`,
    `- Total check-ins: ${status.totalCheckIns}`,
    `- Total stars earned: ${status.totalStars}`,
  ];
  if (status.checkedInToday) {
    lines.push(`- They already checked in today and earned ${status.todayReward.stars} stars (${status.todayReward.label}).`);
    lines.push('- Celebrate their streak and encourage them to come back tomorrow for the next reward.');
  } else {
    lines.push(`- They have NOT checked in today yet. Gently remind them to open their daily reward (${status.todayReward.label}, +${status.todayReward.stars} stars).`);
    if (status.currentStreak > 0) {
      lines.push(`- Warning: if they miss today, their ${status.currentStreak}-day streak will reset.`);
    }
  }
  if (!status.unlockedGames.includes('wordwhack')) {
    lines.push('- Word-Whack Blitz is LOCKED until they claim the Day 1 daily reward ("New Game"). Do not launch it; suggest claiming the daily reward or playing Picture-Word Memory Match / Find the Object instead.');
  }
  return lines.join('\n');
}

function buildProfileContext(profile) {
  const p = normalizeUserProfile(profile);
  const basic = [
    ['Child Name', p.childName],
    ['Nickname', p.nickname],
    ['Age', p.age],
    ['Grade', p.grade],
    ['Main Learning Language', p.mainLearningLanguage],
    ['Home Language', p.homeLanguage],
    ['Personality Type', p.personalityType],
    ['Confidence Level', p.confidenceLevel],
    ['Attention Span', p.attentionSpan],
    ['Preferred Praise', p.preferredPraise],
  ].filter(([, value]) => value);

  const favorites = [
    ['Favorite Toy', p.favoriteToy],
    ['Favorite Character', p.favoriteCharacter],
    ['Favorite Food', p.favoriteFood],
    ['Favorite Drink', p.favoriteDrink],
    ['Favorite Color', p.favoriteColor],
    ['Favorite Animal', p.favoriteAnimal],
    ['Favorite Hobby', p.favoriteHobby],
    ['Favorite Sport', p.favoriteSport],
    ['Favorite Song / Music Type', p.favoriteMusic],
    ['Favorite Place', p.favoritePlace],
    ['Favorite Game Type', p.favoriteGameType],
  ].filter(([, value]) => value);

  const learningLevel = [
    ['Source', p.learningLevelSource],
    ['Vocabulary Level', p.vocabularyLevel],
    ['Grammar Focus', p.grammarFocus],
    ['Spelling Level', p.spellingLevel],
    ['Reading Speed', p.readingSpeed],
    ['Common Mistakes', p.commonMistakes],
    ['Strong Areas', p.strongAreas],
    ['Weak Areas', p.weakAreas],
    ['Preferred Difficulty', p.preferredDifficulty],
    ['Review Frequency', p.reviewFrequency],
  ].filter(([, value]) => value);

  const emotional = [
    ['Motivation Triggers', p.motivationTriggers],
    ['Favorite Reward', p.favoriteReward],
    ['Frustration Signal', p.frustrationSignal],
    ['Encouragement', p.encouragement],
    ['Competition Preference', p.competitionPreference],
    ['Correction Style', p.correctionStyle],
    ['Preferred Roleplay', p.preferredRoleplay],
    ['Fear / Dislike', p.fearDislike],
  ].filter(([, value]) => value);

  const schoolCurriculum = [
    ['School Grade', p.schoolGrade],
    ['Current Unit', p.currentUnit],
    ['Weekly Vocabulary', p.weeklyVocabulary],
    ['Current Grammar', p.currentGrammar],
    ['Homework Type', p.homeworkType],
    ['Dictation Words', p.dictationWords],
    ['Upcoming Test', p.upcomingTest],
    ['Parent Priority', p.parentPriority],
  ].filter(([, value]) => value);

  const conversationMemory = [
    ['Recently Mentioned', p.recentlyMentioned],
    ['Recent Achievement', p.recentAchievement],
    ['Recent Mistake', p.recentMistake],
    ['Recent Emotion', p.recentEmotion],
    ['Recent Promise', p.recentPromise],
    ['Next Follow-up', p.nextFollowUp],
  ].filter(([, value]) => value);

  if (!basic.length && !favorites.length && !learningLevel.length && !emotional.length
    && !schoolCurriculum.length && !conversationMemory.length) return '';

  const lines = [
    'You are speaking with a child learner. Personalize the conversation using this profile.',
    '',
  ];
  if (basic.length) {
    lines.push('Basic Profile:');
    for (const [label, value] of basic) lines.push(`- ${label}: ${value}`);
    lines.push('');
  }
  if (favorites.length) {
    lines.push('Favorite Items:');
    for (const [label, value] of favorites) lines.push(`- ${label}: ${value}`);
    lines.push('');
  }
  if (learningLevel.length) {
    lines.push('Learning Level Profile:');
    for (const [label, value] of learningLevel) lines.push(`- ${label}: ${value}`);
    lines.push('');
  }
  if (emotional.length) {
    lines.push('Emotional & Motivation Profile:');
    for (const [label, value] of emotional) lines.push(`- ${label}: ${value}`);
    lines.push('');
  }
  if (schoolCurriculum.length) {
    lines.push('School & Curriculum Profile:');
    for (const [label, value] of schoolCurriculum) lines.push(`- ${label}: ${value}`);
    lines.push('');
  }
  if (conversationMemory.length) {
    lines.push('Conversation Memory Profile:');
    for (const [label, value] of conversationMemory) lines.push(`- ${label}: ${value}`);
    lines.push('');
  }
  lines.push(
    'Use their name and interests naturally. Match their confidence level and attention span. Use their preferred praise style when encouraging them. Adapt difficulty, correction style, and rewards to their learning level and motivation profile. Watch for frustration signals and avoid things they dislike. Tie activities to their current school unit and weekly vocabulary when relevant. Reference conversation memory naturally — follow up on promises, achievements, and things they recently mentioned.',
  );
  return lines.join('\n');
}

function mergeInstructionsWithProfile(baseInstructions, profile, username) {
  const base = (baseInstructions || DEFAULT_INSTRUCTIONS).trim();
  const profileBlock = buildProfileContext(profile);
  const checkInBlock = username ? buildCheckInContext(username) : '';
  const blocks = [profileBlock, checkInBlock].filter(Boolean);
  if (!blocks.length) return base;
  return `${base}\n\n${blocks.join('\n\n')}`;
}

function isValidUsername(username) {
  return Object.prototype.hasOwnProperty.call(STUDENT_USERS, username);
}

const sessions = new Map();

function loadSessions() {
  try {
    if (!existsSync(SESSIONS_PATH)) return;
    const data = JSON.parse(readFileSync(SESSIONS_PATH, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    const now = Date.now();
    for (const [token, session] of Object.entries(data)) {
      if (!session || typeof session !== 'object') continue;
      if (typeof session.expiresAt === 'number' && session.expiresAt <= now) continue;
      sessions.set(token, session);
    }
  } catch (e) {
    console.warn('Could not load sessions.json:', e.message);
  }
}

function saveSessions() {
  try {
    ensureConfigDir();
    writeFileSync(SESSIONS_PATH, JSON.stringify(Object.fromEntries(sessions), null, 2) + '\n');
  } catch (e) {
    console.warn('Could not save sessions.json:', e.message);
  }
}

function deleteSession(token) {
  if (!token) return;
  sessions.delete(token);
  saveSessions();
}

loadSessions();
seedUserProfilesFromRepo();

function parseCookies(req) {
  const cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function getSession(req) {
  const token = parseCookies(req).session;
  if (!token || !sessions.has(token)) return null;
  const session = sessions.get(token);
  if (typeof session.expiresAt === 'number' && session.expiresAt <= Date.now()) {
    deleteSession(token);
    return null;
  }
  return session;
}

function isAuthenticated(req) {
  return getSession(req) !== null;
}

function isAdmin(req) {
  return getSession(req)?.role === 'admin';
}

function verifyStudentCredentials(username, password) {
  const expected = STUDENT_USERS[username];
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function verifyAdminCredentials(username, password) {
  if (username !== ADMIN_USERNAME) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function createSession(username, role) {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(token, {
    username,
    role,
    createdAt: now,
    expiresAt: now + SESSION_MAX_AGE_MS,
  });
  saveSessions();
  return token;
}

function sessionCookie(token) {
  return `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`;
}

function clearSessionCookie() {
  return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

function redirectToLogin(res, nextUrl) {
  const loc = nextUrl && nextUrl !== '/login'
    ? `/login?next=${encodeURIComponent(nextUrl)}`
    : '/login';
  res.writeHead(302, { Location: loc, ...SECURITY_HEADERS });
  res.end();
}

function redirectToAdminLogin(res, nextUrl) {
  const loc = nextUrl && nextUrl !== '/admin/login'
    ? `/admin/login?next=${encodeURIComponent(nextUrl)}`
    : '/admin/login';
  res.writeHead(302, { Location: loc, ...SECURITY_HEADERS });
  res.end();
}

function isPublicPath(url) {
  return isElevenAgentsPublicPath(url)
    || url === '/login'
    || url === '/admin/login'
    || url === '/api/login'
    || url === '/api/admin/login'
    || url === '/assets/page-motion.css'
    || url === '/assets/page-motion.js'
    || /^\/assets\/uncle-tommy-transition\/(?:uncle-tommy-transition\.(?:css|js)|user_uncletommy_[1-4]\.png)$/i.test(url)
    || url === '/langoLogo.jpeg';
}

function isPreviewStaticAsset(url) {
  return /^\/visme\/.+\.(?:js|mjs|vrm|fbx|wasm|json)$/i.test(url)
    || /^\/Animation\/.+\.fbx$/i.test(url)
    || /^\/assets\/(?:lango-home|daily-rewards|collections|map|sfx|bgm)\/.+\.(?:png|jpe?g|webp|svg|json|mp3|wav)$/i.test(url)
    || url === '/assets/page-motion.css'
    || url === '/assets/page-motion.js'
    || /^\/assets\/uncle-tommy-transition\/(?:uncle-tommy-transition\.(?:css|js)|user_uncletommy_[1-4]\.png)$/i.test(url)
    || url === '/assets/vendor/lottie_light.min.js'
    || /^\/games\/.+\.(?:css|js|svg|png|jpe?g|webp|gif|mp3|wav)$/i.test(url)
    || url === '/vocab-game-app.css'
    || url === '/vocab-game-app.js'
    || url === '/wordchop-voca.js';
}

function isPreviewSafeRequest(req, url, rawUrl) {
  const method = (req.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;

  const requestUrl = new URL(rawUrl, 'http://local');
  const isDirectPreview = requestUrl.searchParams.get('preview') === '1';
  const isPreviewPage = (
    url === '/'
    || url === '/map'
    || url === '/map/'
    || url === '/map/index.html'
    || url === '/vocab-game'
    || url === '/vocab-game/'
    || url === '/vocab-game/index.html'
    || url === '/games'
    || url.startsWith('/games/')
  );
  if (isDirectPreview && isPreviewPage) return true;
  if (url === '/api/preview-config' && requestUrl.searchParams.get('preview') === '1') return true;
  // Static preview files may import other static files. Those nested requests
  // no longer carry the original `?preview=1` referrer, so keep this narrowly
  // limited to executable/media extensions and never include HTML or data.
  if (isPreviewStaticAsset(url)) return true;

  let previewReferrer = false;
  try {
    const referrer = new URL(req.headers.referer || '', 'http://local');
    previewReferrer = (
      referrer.pathname === '/'
      || referrer.pathname === '/map'
      || referrer.pathname === '/map/'
      || referrer.pathname === '/map/index.html'
      || referrer.pathname === '/vocab-game'
      || referrer.pathname === '/vocab-game/'
      || referrer.pathname === '/vocab-game/index.html'
      || referrer.pathname === '/games'
      || referrer.pathname.startsWith('/games/')
    ) && referrer.searchParams.get('preview') === '1';
  } catch {}
  if (!previewReferrer) return false;

  if (
    url === '/api/voca'
    || /^\/api\/voca\/\d+\/image$/.test(url)
    || url === '/api/images'
    || /^\/api\/images\/[^/]+$/.test(url)
    || url === '/api/findgame/levels'
  ) return true;

  return url.startsWith('/visme/')
    || url.startsWith('/Animation/')
    || url.startsWith('/assets/lango-home/')
    || url.startsWith('/assets/daily-rewards/')
    || url.startsWith('/assets/collections/')
    || url.startsWith('/assets/map/')
    || url.startsWith('/assets/sfx/')
    || url.startsWith('/assets/bgm/')
    || url === '/assets/page-motion.css'
    || url === '/assets/page-motion.js'
    || url.startsWith('/assets/uncle-tommy-transition/')
    || url.startsWith('/games/assets/')
    || /^\/games\/.+\.(?:css|js|svg|png|jpe?g|webp|gif|mp3|wav)$/i.test(url)
    || /^\/api\/(idle-video|transition-video|avatar-background)$/.test(url)
    || /^\/api\/game-icons\/(wordwhack|cardgame|findgame)$/.test(url)
    || /^\/api\/video-pairs\/[^/]+\/(loop|transition|background)$/.test(url)
    || /^\/[^/]+\.(png|jpe?g|webp|fbx|vrm|mp4|webm|mov|css|js)$/i.test(url);
}

const ADMIN_PAGE_PATHS = new Set([
  '/admin',
  '/config',
  '/account-config',
  '/avatar-config',
  '/video-pairs',
  '/conversations',
  '/game-plays',
]);

function isGameConfigPage(gamePath) {
  return gamePath === '/config.html' || gamePath.endsWith('/config.html');
}

function requiresAdmin(url, method) {
  const m = (method || 'GET').toUpperCase();

  if (ADMIN_PAGE_PATHS.has(url)) return true;

  if (url === '/api/config' && m === 'POST') return true;
  if (url.startsWith('/api/user-profiles')) return true;
  if (url.startsWith('/api/student-users')) return true;
  if (url === '/api/debug-log' && m === 'GET') return true;
  if (url.startsWith('/api/conversations')) return true;
  if (url.startsWith('/api/profile-sync-logs')) return true;
  if (url.startsWith('/api/game-plays') && m !== 'POST') return true;
  if (url === '/api/inworld/models') return true;

  const uploadPaths = ['/api/idle-video', '/api/transition-video', '/api/avatar-background'];
  if (uploadPaths.includes(url) && m !== 'GET') return true;

  if (url.match(/^\/api\/game-icons\/(wordwhack|cardgame|findgame)$/) && m !== 'GET') return true;

  if (url.startsWith('/api/video-pairs') && m !== 'GET') return true;
  if (url === '/api/video-pairs' && m === 'POST') return true;

  if (isGameApiRoute(url)) {
    if (m === 'POST' && (url === '/api/inworld/tts' || url === '/api/inworld/llm/wordwhack-round')) return false;
    if (m === 'GET') {
      if (url === '/api/game-data/export') return true;
      if (url === '/api/settings/inworld') return true;
      if (url === '/api/settings/lango-image') return true;
      return false;
    }
    return true;
  }

  return false;
}

function denyAdminAccess(req, res, nextUrl) {
  if (wantsHtml(req)) {
    redirectToAdminLogin(res, nextUrl);
    return;
  }
  sendJson(res, 403, { error: 'Admin login required.' });
}

function wantsHtml(req) {
  const accept = req.headers.accept || '';
  return accept.includes('text/html') || accept === '*/*' || !accept.includes('application/json');
}

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
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.zip': 'application/zip',
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

function ensureVideoPairsDir() {
  if (!existsSync(VIDEO_PAIRS_DIR)) mkdirSync(VIDEO_PAIRS_DIR, { recursive: true });
}

function newPairId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getVideoPairsTimezone() {
  return DEFAULT_VIDEO_PAIRS_TIMEZONE;
}

function loadVideoPairsManifest() {
  ensureVideoPairsDir();
  try {
    if (existsSync(VIDEO_PAIRS_MANIFEST_PATH)) {
      const data = JSON.parse(readFileSync(VIDEO_PAIRS_MANIFEST_PATH, 'utf8'));
      if (!Array.isArray(data.pairs)) {
        return { pairs: [] };
      }
      return {
        pairs: data.pairs,
        legacyMigrated: data.legacyMigrated,
      };
    }
  } catch (e) {
    console.warn('Could not load video-pairs manifest:', e.message);
  }
  return { pairs: [] };
}

function saveVideoPairsManifest(manifest) {
  ensureVideoPairsDir();
  writeFileSync(VIDEO_PAIRS_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
}

function getPairVideoFilename(pairDir, basename) {
  if (!existsSync(pairDir)) return null;
  const files = readdirSync(pairDir).filter((name) => name.startsWith(`${basename}.`));
  return files.length ? files[0] : null;
}

function getPairAssetInfo(pairId, basename) {
  const pairDir = join(VIDEO_PAIRS_DIR, pairId);
  const filename = getPairVideoFilename(pairDir, basename);
  if (!filename) return null;
  const filePath = join(pairDir, filename);
  const updatedAt = statSync(filePath).mtimeMs || Date.now();
  const apiPath = `/api/video-pairs/${pairId}/${basename}`;
  return {
    filename,
    url: `${apiPath}?v=${updatedAt}`,
    updatedAt,
  };
}

function getPairVideoInfo(pairId, basename) {
  return getPairAssetInfo(pairId, basename);
}

function normalizePairTheme(value) {
  const theme = String(value ?? '').trim().toLowerCase();
  return PAIR_THEME_IDS.includes(theme) ? theme : DEFAULT_PAIR_THEME;
}

function inferRoomSceneFromPrompt(value) {
  const prompt = String(value ?? '').trim().toLowerCase();
  if (!prompt) return DEFAULT_ROOM_SCENE;

  const sceneMatchers = [
    ['washroom', /\b(?:wash\s*room|bath\s*room|rest\s*room|toilet)\b|洗手間|浴室|廁所/],
    ['livingroom', /\b(?:living\s*room|lounge|sitting\s*room)\b|客廳|起居室/],
    ['classroom', /\b(?:class\s*room|school|lesson)\b|課室|教室|學校/],
    ['library', /\b(?:library|libary)\b|圖書館/],
    ['bedroom', /\b(?:bed\s*room)\b|睡房|臥室/],
    ['garden', /\b(?:garden|back\s*yard|courtyard)\b|花園|庭院/],
    ['kitchen', /\b(?:kitchen)\b|廚房/],
  ];

  return sceneMatchers.find(([, matcher]) => matcher.test(prompt))?.[0] || DEFAULT_ROOM_SCENE;
}

function buildPairInfo(meta) {
  return {
    id: meta.id,
    text: meta.text || '',
    scene: inferRoomSceneFromPrompt(meta.text),
    theme: normalizePairTheme(meta.theme),
    startTime: meta.startTime || '00:00',
    endTime: meta.endTime || '23:59',
    loopVideo: getPairVideoInfo(meta.id, 'loop'),
    transitionVideo: getPairVideoInfo(meta.id, 'transition'),
    backgroundImage: getPairAssetInfo(meta.id, 'background'),
    order: meta.order ?? 0,
  };
}

function createPairMeta(fields, order) {
  const startTime = normalizeTimeString(fields.startTime) || '00:00';
  const endTime = normalizeTimeString(fields.endTime) || '23:59';
  return {
    id: newPairId(),
    text: String(fields.text || '').slice(0, 500),
    theme: normalizePairTheme(fields.theme),
    startTime,
    endTime,
    order,
  };
}

function normalizeCsvHeader(header) {
  return String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function parseCsv(text) {
  const content = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!content) return [];

  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let inQuotes = false;

  while (i < content.length) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      if (row.some((cell) => String(cell).trim().length > 0)) rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim().length > 0)) rows.push(row);
  return rows;
}

function getCsvField(headers, row, ...names) {
  for (const name of names) {
    const idx = headers.indexOf(name);
    if (idx !== -1 && row[idx] != null && String(row[idx]).trim()) {
      return String(row[idx]).trim();
    }
  }
  return '';
}

const PAIR_VIDEO_EXTS = ['.mp4', '.webm', '.mov'];
const PAIR_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

function isAllowedImportUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function extFromImportUrl(url) {
  try {
    const ext = extname(new URL(url).pathname).toLowerCase();
    return ext || null;
  } catch {
    return null;
  }
}

function extFromContentType(contentType, allowedExts) {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  const map = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
  };
  const ext = map[ct];
  if (!ext || !allowedExts.includes(ext)) return null;
  return ext;
}

async function downloadUrlToBuffer(url, maxBytes) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  if (!res.body) {
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`File exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
    }
    return { buffer, contentType: res.headers.get('content-type') };
  }

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      throw new Error(`File exceeds ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
    }
    chunks.push(value);
  }
  return { buffer: Buffer.concat(chunks), contentType: res.headers.get('content-type') };
}

async function savePairAssetFromUrl(pairId, basename, url, { allowedExts, maxBytes, defaultExt }) {
  if (!url) return;
  if (!isAllowedImportUrl(url)) throw new Error(`Invalid URL "${url}". Use http:// or https://.`);

  ensureVideoPairsDir();
  const pairDir = join(VIDEO_PAIRS_DIR, pairId);
  mkdirSync(pairDir, { recursive: true });
  clearPairVideo(pairId, basename);

  const { buffer, contentType } = await downloadUrlToBuffer(url, maxBytes);
  let ext = extFromImportUrl(url);
  if (!ext || !allowedExts.includes(ext)) {
    ext = extFromContentType(contentType, allowedExts);
  }
  if (!ext || !allowedExts.includes(ext)) ext = defaultExt;

  writeFileSync(join(pairDir, `${basename}${ext}`), buffer);
}

async function importPairMediaFromUrls(pairId, fields, rowNum, warnings) {
  const downloads = [
    {
      url: fields.loopVideoUrl,
      basename: 'loop',
      label: 'loop_video_link',
      options: { allowedExts: PAIR_VIDEO_EXTS, maxBytes: VIDEO_MAX_BYTES, defaultExt: '.mp4' },
    },
    {
      url: fields.transitionVideoUrl,
      basename: 'transition',
      label: 'transit_video_link',
      options: { allowedExts: PAIR_VIDEO_EXTS, maxBytes: VIDEO_MAX_BYTES, defaultExt: '.mp4' },
    },
    {
      url: fields.backgroundImageUrl,
      basename: 'background',
      label: 'bg_image_link',
      options: { allowedExts: PAIR_IMAGE_EXTS, maxBytes: IMAGE_MAX_BYTES, defaultExt: '.png' },
    },
  ];

  for (const item of downloads) {
    if (!item.url) continue;
    try {
      await savePairAssetFromUrl(pairId, item.basename, item.url, item.options);
    } catch (e) {
      warnings.push({
        row: rowNum,
        field: item.label,
        error: e.message || 'Download failed.',
      });
    }
  }
}

async function importVideoPairsFromCsv(csvText) {
  const table = parseCsv(csvText);
  if (!table.length) {
    return { imported: 0, pairs: [], errors: [{ row: 0, error: 'CSV is empty.' }], warnings: [] };
  }

  const headers = table[0].map(normalizeCsvHeader);
  const hasKnownHeader = headers.some((h) => (
    [
      'session_prompt', 'text', 'prompt', 'theme',
      'start_time', 'starttime', 'start',
      'end_time', 'endtime', 'end',
      'loop_video_link', 'loop_video', 'loop_video_url',
      'transit_video_link', 'transition_video_link', 'transition_video', 'transit_video',
      'bg_image_link', 'background_image_link', 'background_image', 'bg_image',
    ].includes(h)
  ));
  const dataRows = hasKnownHeader ? table.slice(1) : table;
  const rowOffset = hasKnownHeader ? 2 : 1;

  const manifest = loadVideoPairsManifest();
  let nextOrder = manifest.pairs.reduce((m, p) => Math.max(m, p.order ?? 0), -1) + 1;
  const created = [];
  const errors = [];
  const warnings = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + rowOffset;
    const fields = {
      text: getCsvField(headers, row, 'session_prompt', 'text', 'prompt', 'sessionprompt'),
      theme: getCsvField(headers, row, 'theme'),
      startTime: getCsvField(headers, row, 'start_time', 'starttime', 'start'),
      endTime: getCsvField(headers, row, 'end_time', 'endtime', 'end'),
      loopVideoUrl: getCsvField(headers, row, 'loop_video_link', 'loop_video', 'loop_video_url'),
      transitionVideoUrl: getCsvField(
        headers,
        row,
        'transit_video_link',
        'transition_video_link',
        'transition_video',
        'transit_video',
      ),
      backgroundImageUrl: getCsvField(
        headers,
        row,
        'bg_image_link',
        'background_image_link',
        'background_image',
        'bg_image',
      ),
    };
    const orderRaw = getCsvField(headers, row, 'order');
    const order = orderRaw !== '' ? Number(orderRaw) : nextOrder++;

    if (
      !fields.text
      && !fields.startTime
      && !fields.endTime
      && !fields.theme
      && !fields.loopVideoUrl
      && !fields.transitionVideoUrl
      && !fields.backgroundImageUrl
      && orderRaw === ''
    ) {
      continue;
    }

    if (fields.startTime) {
      const startTime = normalizeTimeString(fields.startTime);
      if (!startTime) {
        errors.push({
          row: rowNum,
          error: `Invalid start time "${fields.startTime}". Use 24-hour HH:MM (e.g. 08:00, 20:30), HHMM (0800), or HH:MM:SS.`,
        });
        continue;
      }
      fields.startTime = startTime;
    }
    if (fields.endTime) {
      const endTime = normalizeTimeString(fields.endTime);
      if (!endTime) {
        errors.push({
          row: rowNum,
          error: `Invalid end time "${fields.endTime}". Use 24-hour HH:MM (e.g. 08:00, 20:30), HHMM (0800), or HH:MM:SS.`,
        });
        continue;
      }
      fields.endTime = endTime;
    }
    if (orderRaw !== '' && !Number.isFinite(order)) {
      errors.push({ row: rowNum, error: `Invalid order "${orderRaw}".` });
      continue;
    }

    const meta = createPairMeta(fields, Number.isFinite(order) ? order : nextOrder++);
    manifest.pairs.push(meta);
    await importPairMediaFromUrls(meta.id, fields, rowNum, warnings);
    created.push(buildPairInfo(meta));
    if (orderRaw === '') nextOrder = Math.max(nextOrder, meta.order + 1);
  }

  if (!created.length) {
    return {
      imported: 0,
      pairs: [],
      errors: errors.length
        ? errors
        : [{ row: 0, error: 'No valid rows found. Include a header row and at least one data row.' }],
      warnings,
    };
  }

  saveVideoPairsManifest(manifest);
  return {
    imported: created.length,
    pairs: created,
    errors,
    warnings,
    timezone: DEFAULT_VIDEO_PAIRS_TIMEZONE,
  };
}

function normalizeTimeString(value) {
  let s = String(value ?? '').trim();
  if (!s) return null;

  // Excel fraction-of-day serial (e.g. 0.333333 ≈ 08:00)
  if (/^\d*\.?\d+$/.test(s) && s.includes('.') && !s.includes(':')) {
    const frac = Number(s);
    if (Number.isFinite(frac) && frac >= 0 && frac < 1) {
      const totalMins = Math.round(frac * 24 * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
  }

  // HHMM without colon (e.g. 0800, 2030)
  if (/^\d{3,4}$/.test(s)) {
    const padded = s.padStart(4, '0');
    s = `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }

  // HH:MM or HH:MM:SS (24-hour)
  let match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // 12-hour with AM/PM (converted to stored 24-hour HH:MM)
  match = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*([AaPp])\.?\s*[Mm]\.?$/);
  if (match) {
    let h = Number(match[1]);
    const m = Number(match[2] ?? '0');
    const meridiem = match[3].toUpperCase();
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 1 || h > 12 || m < 0 || m > 59) return null;
    if (meridiem === 'A' && h === 12) h = 0;
    if (meridiem === 'P' && h !== 12) h += 12;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

function parseTimeToMinutes(value) {
  const normalized = normalizeTimeString(value);
  if (!normalized) return null;
  const [h, m] = normalized.split(':').map(Number);
  return h * 60 + m;
}

function getLocalMinutesInTimezone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function isTimeInPeriod(startTime, endTime, date = new Date(), timeZone = getVideoPairsTimezone()) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return true;
  const now = getLocalMinutesInTimezone(date, timeZone);
  if (start === end) return true;
  if (start < end) return now >= start && now <= end;
  return now >= start || now <= end;
}

function migrateLegacyVideosIfNeeded() {
  const manifest = loadVideoPairsManifest();
  if (manifest.pairs.length > 0 || manifest.legacyMigrated) return;

  const idleInfo = idleVideos.getInfo();
  if (!idleInfo) {
    manifest.legacyMigrated = true;
    saveVideoPairsManifest(manifest);
    return;
  }

  const id = newPairId();
  const pairDir = join(VIDEO_PAIRS_DIR, id);
  mkdirSync(pairDir, { recursive: true });

  copyFileSync(join(IDLE_VIDEO_DIR, idleInfo.filename), join(pairDir, `loop${extname(idleInfo.filename)}`));

  const transitionInfo = transitionVideos.getInfo();
  if (transitionInfo) {
    copyFileSync(
      join(TRANSITION_VIDEO_DIR, transitionInfo.filename),
      join(pairDir, `transition${extname(transitionInfo.filename)}`),
    );
  }

  manifest.pairs.push({
    id,
    text: '',
    theme: DEFAULT_PAIR_THEME,
    startTime: '00:00',
    endTime: '23:59',
    order: 0,
  });
  manifest.legacyMigrated = true;
  saveVideoPairsManifest(manifest);
}

function listVideoPairs() {
  migrateLegacyVideosIfNeeded();
  const manifest = loadVideoPairsManifest();
  return manifest.pairs
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(buildPairInfo);
}

function findPairMeta(pairId) {
  const manifest = loadVideoPairsManifest();
  return manifest.pairs.find((p) => p.id === pairId) || null;
}

function clearPairVideo(pairId, basename) {
  const pairDir = join(VIDEO_PAIRS_DIR, pairId);
  if (!existsSync(pairDir)) return;
  for (const name of readdirSync(pairDir)) {
    if (name.startsWith(`${basename}.`)) {
      try { unlinkSync(join(pairDir, name)); } catch {}
    }
  }
}

function createPairVideoUpload(pairId, basename) {
  const pairDir = join(VIDEO_PAIRS_DIR, pairId);
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!existsSync(pairDir)) mkdirSync(pairDir, { recursive: true });
        cb(null, pairDir);
      },
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase() || '.mp4';
        cb(null, `${basename}${ext}`);
      },
    }),
    limits: { fileSize: VIDEO_MAX_BYTES },
    fileFilter: videoFileFilter,
  }).single('video');
}

function createPairImageUpload(pairId, basename) {
  const pairDir = join(VIDEO_PAIRS_DIR, pairId);
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        if (!existsSync(pairDir)) mkdirSync(pairDir, { recursive: true });
        cb(null, pairDir);
      },
      filename: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase() || '.png';
        cb(null, `${basename}${ext}`);
      },
    }),
    limits: { fileSize: IMAGE_MAX_BYTES },
    fileFilter: imageFileFilter,
  }).single('image');
}

function handlePairBackgroundUpload(pairId, req, res) {
  const basename = 'background';
  if (req.method === 'GET') {
    const info = getPairAssetInfo(pairId, basename);
    if (!info) {
      sendJson(res, 404, { error: 'No background image uploaded for this pair.' });
      return;
    }
    serveFile(res, join(VIDEO_PAIRS_DIR, pairId, info.filename));
    return;
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    if (!findPairMeta(pairId)) {
      sendJson(res, 404, { error: 'Video pair not found.' });
      return;
    }
    clearPairVideo(pairId, basename);
    const upload = createPairImageUpload(pairId, basename);
    upload(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? `File must be under ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB.`
          : (err.message || 'Upload failed.');
        sendJson(res, 400, { error: message });
        return;
      }
      if (!req.file) {
        sendJson(res, 400, { error: 'No file provided.' });
        return;
      }
      sendJson(res, 200, { ok: true, backgroundImage: getPairAssetInfo(pairId, basename) });
    });
    return;
  }
  if (req.method === 'DELETE') {
    if (!findPairMeta(pairId)) {
      sendJson(res, 404, { error: 'Video pair not found.' });
      return;
    }
    clearPairVideo(pairId, basename);
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 405, { error: 'Method not allowed.' });
}

function handlePairVideoUpload(pairId, basename, resKey, req, res) {
  if (req.method === 'GET') {
    const info = getPairVideoInfo(pairId, basename);
    if (!info) {
      sendJson(res, 404, { error: `No ${basename} video uploaded for this pair.` });
      return;
    }
    serveFile(res, join(VIDEO_PAIRS_DIR, pairId, info.filename));
    return;
  }
  if (req.method === 'PUT' || req.method === 'POST') {
    if (!findPairMeta(pairId)) {
      sendJson(res, 404, { error: 'Video pair not found.' });
      return;
    }
    clearPairVideo(pairId, basename);
    const upload = createPairVideoUpload(pairId, basename);
    upload(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE'
          ? `File must be under ${Math.round(VIDEO_MAX_BYTES / (1024 * 1024))} MB.`
          : (err.message || 'Upload failed.');
        sendJson(res, 400, { error: message });
        return;
      }
      if (!req.file) {
        sendJson(res, 400, { error: 'No file provided.' });
        return;
      }
      sendJson(res, 200, { ok: true, [resKey]: getPairVideoInfo(pairId, basename) });
    });
    return;
  }
  if (req.method === 'DELETE') {
    if (!findPairMeta(pairId)) {
      sendJson(res, 404, { error: 'Video pair not found.' });
      return;
    }
    clearPairVideo(pairId, basename);
    sendJson(res, 200, { ok: true });
    return;
  }
  sendJson(res, 405, { error: 'Method not allowed.' });
}

function handleVideoPairsApi(req, res, url) {
  const pairBackgroundMatch = url.match(/^\/api\/video-pairs\/([^/]+)\/background$/);
  if (pairBackgroundMatch) {
    handlePairBackgroundUpload(pairBackgroundMatch[1], req, res);
    return true;
  }

  const pairVideoMatch = url.match(/^\/api\/video-pairs\/([^/]+)\/(loop|transition)$/);
  if (pairVideoMatch) {
    const [, pairId, videoType] = pairVideoMatch;
    const resKey = videoType === 'loop' ? 'loopVideo' : 'transitionVideo';
    handlePairVideoUpload(pairId, videoType, resKey, req, res);
    return true;
  }

  const pairMatch = url.match(/^\/api\/video-pairs\/([^/]+)$/);
  if (pairMatch) {
    const pairId = pairMatch[1];
    if (req.method === 'PUT') {
      readJsonBody(req, res, (parsed) => {
        const manifest = loadVideoPairsManifest();
        const meta = manifest.pairs.find((p) => p.id === pairId);
        if (!meta) {
          sendJson(res, 404, { error: 'Video pair not found.' });
          return;
        }
        meta.text = String(parsed.text || '').slice(0, 500);
        if (parsed.theme != null) meta.theme = normalizePairTheme(parsed.theme);
        if (parsed.startTime != null) {
          const startTime = normalizeTimeString(parsed.startTime);
          if (!startTime) {
            sendJson(res, 400, { error: 'Invalid start time. Use HH:MM (24-hour).' });
            return;
          }
          meta.startTime = startTime;
        }
        if (parsed.endTime != null) {
          const endTime = normalizeTimeString(parsed.endTime);
          if (!endTime) {
            sendJson(res, 400, { error: 'Invalid end time. Use HH:MM (24-hour).' });
            return;
          }
          meta.endTime = endTime;
        }
        if (parsed.order != null) meta.order = Number(parsed.order) || 0;
        saveVideoPairsManifest(manifest);
        sendJson(res, 200, { ok: true, pair: buildPairInfo(meta) });
      });
      return true;
    }
    if (req.method === 'DELETE') {
      const manifest = loadVideoPairsManifest();
      const idx = manifest.pairs.findIndex((p) => p.id === pairId);
      if (idx === -1) {
        sendJson(res, 404, { error: 'Video pair not found.' });
        return true;
      }
      manifest.pairs.splice(idx, 1);
      saveVideoPairsManifest(manifest);
      const pairDir = join(VIDEO_PAIRS_DIR, pairId);
      if (existsSync(pairDir)) {
        for (const name of readdirSync(pairDir)) {
          try { unlinkSync(join(pairDir, name)); } catch {}
        }
        try { unlinkSync(pairDir); } catch {}
      }
      sendJson(res, 200, { ok: true });
      return true;
    }
    sendJson(res, 405, { error: 'Method not allowed.' });
    return true;
  }

  if (url === '/api/video-pairs') {
    if (req.method === 'GET') {
      sendJson(res, 200, { pairs: listVideoPairs(), timezone: getVideoPairsTimezone() });
      return true;
    }
    if (req.method === 'POST') {
      readJsonBody(req, res, (parsed) => {
        const manifest = loadVideoPairsManifest();
        const maxOrder = manifest.pairs.reduce((m, p) => Math.max(m, p.order ?? 0), -1);
        const meta = createPairMeta(parsed, maxOrder + 1);
        manifest.pairs.push(meta);
        saveVideoPairsManifest(manifest);
        sendJson(res, 200, { ok: true, pair: buildPairInfo(meta) });
      });
      return true;
    }
    sendJson(res, 405, { error: 'Method not allowed.' });
    return true;
  }

  if (url === '/api/video-pairs/import' && req.method === 'POST') {
    readJsonBody(req, res, (parsed) => {
      const csv = typeof parsed.csv === 'string' ? parsed.csv : '';
      if (!csv.trim()) {
        sendJson(res, 400, { error: 'CSV content is required.' });
        return;
      }
      importVideoPairsFromCsv(csv)
        .then((result) => {
          if (!result.imported) {
            sendJson(res, 400, {
              error: result.errors[0]?.error || 'Could not import any rows from CSV.',
              errors: result.errors,
              warnings: result.warnings || [],
            });
            return;
          }
          sendJson(res, 200, { ok: true, ...result });
        })
        .catch((e) => {
          sendJson(res, 500, { error: e.message || 'CSV import failed.' });
        });
    });
    return true;
  }

  return false;
}
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
    ...(ext === '.html' ? { 'Cache-Control': 'no-store' } : {}),
    ...SECURITY_HEADERS,
  });
  res.end(readFileSync(filePath));
}

const pages = {
  '/': 'index.html',
  '/login': 'login.html',
  '/admin/login': 'admin-login.html',
  '/admin': 'admin.html',
  '/config': 'config.html',
  '/account-config': 'account-config.html',
  '/avatar-config': 'avatar-config.html',
  '/video-pairs': 'video-pairs.html',
  '/conversations': 'conversations.html',
  '/game-plays': 'game-plays.html',
  '/visme': 'visme/index.html',
  '/map': 'map/index.html',
  '/map/': 'map/index.html',
  '/vocab-game': 'vocab-game/index.html',
  '/vocab-game/': 'vocab-game/index.html',
  '/session-simple': 'session-simple.html',
  '/agents': 'agents.html',
};

function resolvePage(url) {
  if (pages[url]) return pages[url];
  // Allow /config.html as well as /config (unknown paths used to fall back to index.html).
  if (url.endsWith('.html')) {
    const withoutExt = url.slice(0, -5);
    if (pages[withoutExt]) return pages[withoutExt];
    const filename = url.slice(1);
    if (existsSync(join(ROOT, filename))) return filename;
  }
  return pages['/'];
}

const GAME_API_PREFIXES = [
  '/api/images',
  '/api/findgame',
  '/api/voca',
  '/api/settings/inworld',
  '/api/settings/lango-image',
  '/api/inworld/tts',
  '/api/inworld/llm',
  '/api/game-data',
];

function isGameApiRoute(url) {
  return GAME_API_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`));
}

function isGameStaticRoute(url) {
  return url === '/games' || url.startsWith('/games/');
}

function isWordWhackGamePage(url) {
  return url === '/games' || url === '/games/' || url === '/games/index.html';
}

function delegateToGameApp(req, res, pathname, query) {
  const savedUrl = req.url;
  req.url = `${pathname}${query}`;
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  gameApp(req, res, () => {
    req.url = savedUrl;
    res.writeHead(404, SECURITY_HEADERS).end();
  });
}

const HKO_WEATHER_API = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php';
const HKO_ICON_BASE = 'https://www.hko.gov.hk/images/HKOWxIconOutline';
const HKO_WEATHER_CACHE_MS = 5 * 60 * 1000;

const HKO_ICON_LABELS = {
  50: 'Sunny',
  51: 'Sunny Periods',
  52: 'Sunny Intervals',
  53: 'Sunny Periods with A Few Showers',
  54: 'Sunny Intervals with Showers',
  60: 'Cloudy',
  61: 'Overcast',
  62: 'Light Rain',
  63: 'Rain',
  64: 'Heavy Rain',
  65: 'Thunderstorms',
  70: 'Fine',
  71: 'Fine',
  72: 'Fine',
  73: 'Fine',
  74: 'Fine',
  75: 'Fine',
  76: 'Mainly Cloudy',
  77: 'Mainly Fine',
  80: 'Windy',
  81: 'Dry',
  82: 'Humid',
  83: 'Fog',
  84: 'Haze',
  85: 'Hot',
  90: 'Warm',
  91: 'Cool',
  92: 'Cold',
};

const hkoWeatherCache = new Map();

function getHkoIconLabel(code) {
  const n = Number(code);
  if (!Number.isFinite(n)) return 'Current weather';
  return HKO_ICON_LABELS[n] || 'Current weather';
}

function parseHkoWeatherReport(data) {
  const hkoTemp = data.temperature?.data?.find((d) => d.place === 'Hong Kong Observatory')
    || data.temperature?.data?.[0];
  const hkoHumidity = data.humidity?.data?.find((d) => d.place === 'Hong Kong Observatory')
    || data.humidity?.data?.[0];
  const iconCode = Array.isArray(data.icon) ? Number(data.icon[0]) : null;
  const warningMessage = Array.isArray(data.warningMessage)
    ? data.warningMessage.find((msg) => String(msg || '').trim())
    : null;

  return {
    temperature: hkoTemp?.value ?? null,
    temperatureUnit: hkoTemp?.unit ?? 'C',
    humidity: hkoHumidity?.value ?? null,
    humidityUnit: hkoHumidity?.unit === 'percent' ? '%' : (hkoHumidity?.unit ?? '%'),
    condition: getHkoIconLabel(iconCode),
    iconCode: Number.isFinite(iconCode) ? iconCode : null,
    updateTime: data.updateTime || data.temperature?.recordTime || data.humidity?.recordTime || null,
    warning: warningMessage ? String(warningMessage) : null,
  };
}

async function fetchHkoWeather(lang = 'en') {
  const cacheKey = lang === 'tc' || lang === 'sc' ? lang : 'en';
  const cached = hkoWeatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < HKO_WEATHER_CACHE_MS) {
    return cached.data;
  }

  const res = await fetch(`${HKO_WEATHER_API}?dataType=rhrread&lang=${cacheKey}`);
  if (!res.ok) throw new Error(`HKO weather API returned HTTP ${res.status}`);
  const raw = await res.json();
  const data = parseHkoWeatherReport(raw);
  hkoWeatherCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

async function fetchHkoWeatherIcon(code) {
  const iconCode = Number(code);
  if (!Number.isFinite(iconCode) || iconCode < 0 || iconCode > 999) {
    throw new Error('Invalid weather icon code.');
  }
  const res = await fetch(`${HKO_ICON_BASE}/pic${iconCode}.png`);
  if (!res.ok) throw new Error(`HKO icon returned HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const server = createServer(async (req, res) => {
  const rawUrl = req.url ?? '/';
  const qIndex = rawUrl.indexOf('?');
  const url = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
  const query = qIndex === -1 ? '' : rawUrl.slice(qIndex);

  if (url === '/api/login' && req.method === 'POST') {
    readJsonBody(req, res, (parsed) => {
      const username = String(parsed.username || '').trim();
      const password = String(parsed.password || '');
      if (verifyAdminCredentials(username, password)) {
        sendJson(res, 403, { error: 'Use admin sign-in at /admin/login for CMS access.' });
        return;
      }
      if (!verifyStudentCredentials(username, password)) {
        sendJson(res, 401, { error: 'Invalid username or password.' });
        return;
      }
      const userAgent = String(req.headers['user-agent'] || parsed.userAgent || '');
      recordStudentLogin(username, userAgent);
      const token = createSession(username, 'student');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookie(token),
        ...SECURITY_HEADERS,
      });
      res.end(JSON.stringify({ ok: true, username, role: 'student' }));
    });
    return;
  }

  if (url === '/api/admin/login' && req.method === 'POST') {
    readJsonBody(req, res, (parsed) => {
      const username = String(parsed.username || '').trim();
      const password = String(parsed.password || '');
      if (!verifyAdminCredentials(username, password)) {
        sendJson(res, 401, { error: 'Invalid admin username or password.' });
        return;
      }
      const token = createSession(username, 'admin');
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': sessionCookie(token),
        ...SECURITY_HEADERS,
      });
      res.end(JSON.stringify({ ok: true, username, role: 'admin' }));
    });
    return;
  }

  if (url === '/api/logout' && req.method === 'POST') {
    deleteSession(parseCookies(req).session);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
      ...SECURITY_HEADERS,
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url === '/api/me' && req.method === 'GET') {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: 'Not authenticated.' });
      return;
    }
    sendJson(res, 200, { username: session.username, role: session.role });
    return;
  }

  if (url === '/login' && isAuthenticated(req)) {
    res.writeHead(302, { Location: '/', ...SECURITY_HEADERS });
    res.end();
    return;
  }

  if (url === '/admin/login' && isAdmin(req)) {
    const next = new URL(rawUrl, 'http://local').searchParams.get('next');
    const dest = next && next.startsWith('/') ? next : '/admin';
    res.writeHead(302, { Location: dest, ...SECURITY_HEADERS });
    res.end();
    return;
  }

  if (!isPublicPath(url) && !isPreviewSafeRequest(req, url, rawUrl) && !isAuthenticated(req)) {
    if (wantsHtml(req)) {
      redirectToLogin(res, url);
      return;
    }
    sendJson(res, 401, { error: 'Login required.' });
    return;
  }

  if (requiresAdmin(url, req.method) && !isAdmin(req)) {
    denyAdminAccess(req, res, url);
    return;
  }

  if (url === '/api/me/profile' && req.method === 'GET') {
    const session = getSession(req);
    sendJson(res, 200, {
      username: session.username,
      profile: getUserProfile(session.username),
    });
    return;
  }

  if (url === '/api/check-in' && req.method === 'GET') {
    const session = getSession(req);
    if (!session || session.role !== 'student') {
      sendJson(res, 403, { error: 'Student login required.' });
      return;
    }
    sendJson(res, 200, getCheckInStatus(session.username));
    return;
  }

  if (url === '/api/check-in' && req.method === 'POST') {
    const session = getSession(req);
    if (!session || session.role !== 'student') {
      sendJson(res, 403, { error: 'Student login required.' });
      return;
    }
    readJsonBody(req, res, (body) => {
      if (body.action && body.action !== 'claim-milestone') {
        sendJson(res, 400, { error: 'Unsupported check-in action.' });
        return;
      }
      sendJson(res, 200, claimDailyMilestone(session.username));
    });
    return;
  }

  if (url === '/api/game-plays' && req.method === 'POST') {
    const session = getSession(req);
    if (!session || session.role !== 'student') {
      sendJson(res, 403, { error: 'Student login required.' });
      return;
    }
    readJsonBody(req, res, (parsed) => {
      const result = recordGamePlay(session.username, {
        gameId: parsed.gameId,
        score: parsed.score,
        details: parsed.details,
      });
      if (!result.ok) {
        sendJson(res, 400, { error: result.error || 'Could not record game play.' });
        return;
      }
      sendJson(res, 200, result);
    });
    return;
  }

  if (url === '/api/game-plays/daily-summary' && req.method === 'GET') {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: 'Login required.' });
      return;
    }
    const params = new URL(rawUrl, 'http://local').searchParams;
    let username = params.get('username')?.trim() || null;
    if (session.role === 'student') {
      username = session.username;
    } else if (username && !STUDENT_USERS[username]) {
      sendJson(res, 400, { error: 'Invalid username.' });
      return;
    }
    const playDate = params.get('date')?.trim() || null;
    const days = params.get('days');
    sendJson(res, 200, getGamePlayDailySummary({ username, playDate, days }));
    return;
  }

  if (url === '/api/game-plays' && req.method === 'GET') {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: 'Login required.' });
      return;
    }
    const params = new URL(rawUrl, 'http://local').searchParams;
    let username = params.get('username')?.trim() || null;
    if (session.role === 'student') {
      username = session.username;
    } else if (username && !STUDENT_USERS[username]) {
      sendJson(res, 400, { error: 'Invalid username.' });
      return;
    }
    const playDate = params.get('date')?.trim() || null;
    const gameId = params.get('gameId')?.trim() || null;
    const limit = params.get('limit');
    const offset = params.get('offset');
    sendJson(res, 200, listGamePlays({ username, playDate, gameId, limit, offset }));
    return;
  }

  const weatherIconMatch = url.match(/^\/api\/weather\/icon\/(\d+)$/);
  if (weatherIconMatch && req.method === 'GET') {
    fetchHkoWeatherIcon(weatherIconMatch[1])
      .then((buffer) => {
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
          ...SECURITY_HEADERS,
        });
        res.end(buffer);
      })
      .catch((e) => {
        sendJson(res, 502, { error: e.message || 'Could not load weather icon.' });
      });
    return;
  }

  if (url === '/api/weather' && req.method === 'GET') {
    const lang = new URL(rawUrl, 'http://local').searchParams.get('lang') || 'en';
    fetchHkoWeather(lang)
      .then((data) => sendJson(res, 200, data))
      .catch((e) => {
        sendJson(res, 502, { error: e.message || 'Could not load weather.' });
      });
    return;
  }

  if (url === '/api/user-profiles' && req.method === 'GET') {
    const profiles = loadUserProfiles();
    const users = getUserList();
    const normalized = {};
    for (const username of users) {
      normalized[username] = normalizeUserProfile(profiles[username]);
    }
    sendJson(res, 200, {
      users,
      profiles: normalized,
      loginMeta: getUserLoginMetaForUsers(users),
    });
    return;
  }

  if (url === '/api/student-users' && req.method === 'GET') {
    sendJson(res, 200, {
      users: getUserList(),
      custom: Object.keys(loadCustomStudentUsers()).sort((a, b) => a.localeCompare(b)),
    });
    return;
  }

  if (url === '/api/student-users' && req.method === 'POST') {
    readJsonBody(req, res, (parsed) => {
      const result = createStudentUser(parsed.username, parsed.password);
      if (!result.ok) {
        sendJson(res, 400, { error: result.error });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        username: result.username,
        users: getUserList(),
      });
    });
    return;
  }

  const profileMatch = url.match(/^\/api\/user-profiles\/([^/]+)$/);
  if (profileMatch) {
    const username = decodeURIComponent(profileMatch[1]);
    if (!isValidUsername(username)) {
      sendJson(res, 404, { error: 'Unknown account.' });
      return;
    }
    if (req.method === 'GET') {
      sendJson(res, 200, {
        username,
        profile: getUserProfile(username),
        loginMeta: getUserLoginMeta(username),
      });
      return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      readJsonBody(req, res, (parsed) => {
        const profile = parsed.profile != null ? parsed.profile : parsed;
        if (!saveUserProfile(username, profile)) {
          sendJson(res, 400, { error: 'Could not save profile.' });
          return;
        }
        sendJson(res, 200, { ok: true, username, profile: getUserProfile(username) });
      });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  const conversationMatch = url.match(/^\/api\/conversations\/([^/]+)$/);
  const conversationExportMatch = url.match(/^\/api\/conversations\/([^/]+)\/export$/);
  if (conversationExportMatch && req.method === 'GET') {
    const conversationId = conversationExportMatch[1];
    const archive = buildConversationExportArchive(conversationId);
    if (!archive) {
      sendJson(res, 404, { error: 'Conversation not found.' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archive.filename}"`,
      'Content-Length': archive.buffer.length,
      ...SECURITY_HEADERS,
    });
    res.end(archive.buffer);
    return;
  }

  const userAudioMatch = url.match(/^\/api\/conversations\/([^/]+)\/user-audio$/);
  if (userAudioMatch && req.method === 'GET') {
    const conversationId = userAudioMatch[1];
    const row = getConversationStmt.get(conversationId);
    if (!row?.user_audio_path) {
      sendJson(res, 404, { error: 'Session audio not found for this conversation.' });
      return;
    }
    const filePath = join(SESSION_AUDIO_DIR, row.user_audio_path);
    serveFile(res, filePath);
    return;
  }

  if (conversationMatch) {
    const conversationId = conversationMatch[1];
    if (req.method === 'GET') {
      const record = getConversationRecord(conversationId);
      if (!record) {
        sendJson(res, 404, { error: 'Conversation not found.' });
        return;
      }
      sendJson(res, 200, {
        ...record,
        profileSyncLog: getProfileSyncLogForConversation(conversationId),
      });
      return;
    }
    if (req.method === 'DELETE') {
      if (!deleteConversationRecord(conversationId)) {
        sendJson(res, 404, { error: 'Conversation not found.' });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed.' });
    return;
  }

  if (url === '/api/conversations' && req.method === 'GET') {
    const params = new URL(rawUrl, 'http://local').searchParams;
    const username = params.get('username')?.trim() || null;
    const limit = params.get('limit');
    const offset = params.get('offset');
    sendJson(res, 200, listConversationRecords({ username, limit, offset }));
    return;
  }

  if (url === '/api/conversations' && req.method === 'DELETE') {
    const params = new URL(rawUrl, 'http://local').searchParams;
    const username = params.get('username')?.trim() || null;
    const result = deleteAllConversationRecords({ username });
    sendJson(res, 200, { ok: true, ...result });
    return;
  }

  const profileSyncLogMatch = url.match(/^\/api\/profile-sync-logs\/(\d+)$/);
  if (profileSyncLogMatch && req.method === 'GET') {
    const log = getProfileSyncLogRecord(Number(profileSyncLogMatch[1]));
    if (!log) {
      sendJson(res, 404, { error: 'Profile summary log not found.' });
      return;
    }
    sendJson(res, 200, log);
    return;
  }

  if (url === '/api/profile-sync-logs' && req.method === 'GET') {
    const params = new URL(rawUrl, 'http://local').searchParams;
    const username = params.get('username')?.trim() || null;
    const conversationId = params.get('conversationId')?.trim() || null;
    const limit = params.get('limit');
    const offset = params.get('offset');
    sendJson(res, 200, listProfileSyncLogRecords({ username, conversationId, limit, offset }));
    return;
  }

  if (url === '/api/inworld/models' && req.method === 'GET') {
    const params = new URL(rawUrl, 'http://local').searchParams;
    const forceRefresh = params.get('refresh') === '1';
    fetchInworldModels(null, { forceRefresh })
      .then((models) => sendJson(res, 200, { models, cachedAt: inworldModelsCache.fetchedAt }))
      .catch((e) => {
        sendJson(res, 502, { error: e.message || 'Could not load models from Inworld.' });
      });
    return;
  }

  if (isGameApiRoute(url)) {
    if (url === '/api/voca' && req.method === 'GET') {
      const params = new URL(rawUrl, 'http://local').searchParams;
      const hasExplicitFilter = params.has('grade') || params.has('level') || params.get('all') === '1';
      if (!hasExplicitFilter) {
        const session = getSession(req);
        if (session?.role === 'student') {
          const profile = getUserProfile(session.username);
          const grade = gameApp.parseStudentGrade?.(
            profile.grade || profile.schoolGrade || profile.vocabularyLevel,
          ) || null;
          if (grade) {
            params.set('grade', grade);
            delegateToGameApp(req, res, url, `?${params.toString()}`);
            return;
          }
        }
      }
    }
    delegateToGameApp(req, res, url, query);
    return;
  }

  if (isGameStaticRoute(url)) {
    const gamePath = url === '/games' ? '/index.html' : url.slice('/games'.length) || '/index.html';
    if (isGameConfigPage(gamePath) && !isAdmin(req)) {
      denyAdminAccess(req, res, url);
      return;
    }
    const requestUrl = new URL(rawUrl, 'http://local');
    const allowPreview =
      requestUrl.searchParams.get('preview') === '1'
      || requestUrl.searchParams.get('embedded') === '1';
    if (isWordWhackGamePage(url) && !allowPreview) {
      const session = getSession(req);
      if (session?.role === 'student' && !hasUnlockedGame(session.username, 'wordwhack')) {
        res.writeHead(302, { Location: '/?locked=wordwhack', ...SECURITY_HEADERS });
        res.end();
        return;
      }
    }
    delegateToGameApp(req, res, gamePath, query);
    return;
  }

  if (url === '/api/preview-config' && req.method === 'GET') {
    const cfg = loadConfig();
    const videoPairs = listVideoPairs().map(({ text: _sessionPrompt, ...pair }) => pair);
    const firstPair = videoPairs.find((p) => p.loopVideo) || null;
    sendJson(res, 200, {
      avatar: normalizeAvatar(cfg.avatar),
      lipsync: normalizeLipsync(cfg.lipsync),
      lighting: normalizeLighting(cfg.lighting),
      videoPairs,
      videoPairsTimezone: getVideoPairsTimezone(),
      idleVideo: firstPair?.loopVideo ?? idleVideos.getInfo(),
      transitionVideo: firstPair?.transitionVideo ?? transitionVideos.getInfo(),
      avatarBackground: avatarBackgrounds.getInfo(),
      gameIcons: getGameIconsInfo(),
    });
    return;
  }

  if (url === '/api/config') {
    if (req.method === 'GET') {
      const cfg = loadConfig();
      const videoPairs = listVideoPairs();
      const firstPair = videoPairs.find((p) => p.loopVideo) || null;
      sendJson(res, 200, {
        apiKey: cfg.apiKey ?? '',
        instructions: cfg.instructions ?? '',
        voice: cfg.voice ?? '',
        model: cfg.model ?? '',
        profileSyncModel: cfg.profileSyncModel ?? '',
        avatar: normalizeAvatar(cfg.avatar),
        lipsync: normalizeLipsync(cfg.lipsync),
        lighting: normalizeLighting(cfg.lighting),
        videoPairs,
        videoPairsTimezone: getVideoPairsTimezone(),
        idleVideo: firstPair?.loopVideo ?? idleVideos.getInfo(),
        transitionVideo: firstPair?.transitionVideo ?? transitionVideos.getInfo(),
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
          profileSyncModel: parsed.profileSyncModel?.trim() || '',
          avatar: parsed.avatar != null
            ? normalizeAvatar(parsed.avatar)
            : normalizeAvatar(existing.avatar),
          lipsync: normalizeLipsync(parsed.lipsync),
          lighting: parsed.lighting != null
            ? normalizeLighting(parsed.lighting)
            : normalizeLighting(existing.lighting),
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

  if (handleVideoPairsApi(req, res, url)) {
    return;
  }

  if (url === '/api/elevenlabs/config' && req.method === 'GET') {
    sendJson(res, 200, {
      voiceId: ELEVENLABS_VOICE_ID,
      defaultAgentId: ELEVENLABS_AGENT_ID,
      hasApiKey: Boolean(ELEVENLABS_API_KEY),
    });
    return;
  }

  if (url === '/api/elevenlabs/agents' && req.method === 'GET') {
    const apiKey = requireElevenLabsApiKey(req, res);
    if (!apiKey) return;
    const { res: apiRes, body } = await elevenLabsFetch(apiKey, '/v1/convai/agents?page_size=100');
    if (!apiRes.ok) {
      sendJson(res, apiRes.status, { error: 'Failed to list agents', detail: body });
      return;
    }
    sendJson(res, 200, body);
    return;
  }

  if (url === '/api/elevenlabs/conversation-token' && req.method === 'GET') {
    const apiKey = requireElevenLabsApiKey(req, res);
    if (!apiKey) return;
    const params = new URL(rawUrl, 'http://local').searchParams;
    const agentId = String(params.get('agent_id') || ELEVENLABS_AGENT_ID || '').trim();
    if (!agentId) {
      sendJson(res, 400, { error: 'agent_id query parameter is required' });
      return;
    }
    const qs = new URLSearchParams({ agent_id: agentId });
    const { res: apiRes, body } = await elevenLabsFetch(apiKey, `/v1/convai/conversation/token?${qs}`);
    if (!apiRes.ok) {
      sendJson(res, apiRes.status, { error: 'Failed to get conversation token', detail: body });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...SECURITY_HEADERS,
    });
    res.end(body.token);
    return;
  }

  if (url.startsWith('/vendor/elevenlabs-client/')) {
    const rel = url.slice('/vendor/elevenlabs-client/'.length);
    if (!rel || rel.includes('..')) {
      res.writeHead(400, SECURITY_HEADERS).end();
      return;
    }
    serveFile(res, join(ELEVENLABS_CLIENT_DIST, rel));
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

  if (url.startsWith('/Animation/')) {
    serveFile(res, join(ROOT, decodeURIComponent(url.slice(1))));
    return;
  }

  // React home overlay assets live in a nested directory. Keep the route
  // narrowly scoped so arbitrary files below ROOT cannot be requested.
  const langoHomeAsset = url.match(/^\/assets\/lango-home\/([a-z0-9_-]+\.png)$/i);
  if (langoHomeAsset) {
    serveFile(res, join(ROOT, 'assets', 'lango-home', langoHomeAsset[1]));
    return;
  }

  const dailyRewardAsset = url.match(/^\/assets\/daily-rewards\/([a-z0-9-]+\.(?:png|json))$/i);
  if (dailyRewardAsset) {
    serveFile(res, join(ROOT, 'assets', 'daily-rewards', dailyRewardAsset[1]));
    return;
  }

  const collectionAsset = url.match(/^\/assets\/collections\/([a-z0-9-]+\.png)$/i);
  if (collectionAsset) {
    serveFile(res, join(ROOT, 'assets', 'collections', collectionAsset[1]));
    return;
  }

  const mapAsset = url.match(/^\/assets\/map\/([a-z0-9-]+\.png)$/i);
  if (mapAsset) {
    serveFile(res, join(ROOT, 'assets', 'map', mapAsset[1]));
    return;
  }

  const soundEffectAsset = url.match(/^\/assets\/sfx\/([a-z0-9-]+\.mp3)$/i);
  if (soundEffectAsset) {
    serveFile(res, join(ROOT, 'assets', 'sfx', soundEffectAsset[1]));
    return;
  }

  const backgroundMusicAsset = url.match(
    /^\/assets\/bgm\/(dance|kungfu)\/([a-z0-9-]+\.mp3)$/i,
  );
  if (backgroundMusicAsset) {
    serveFile(
      res,
      join(ROOT, 'assets', 'bgm', backgroundMusicAsset[1], backgroundMusicAsset[2]),
    );
    return;
  }

  const sharedMotionAsset = url.match(/^\/assets\/(page-motion\.(?:css|js))$/i);
  if (sharedMotionAsset) {
    serveFile(res, join(ROOT, 'assets', sharedMotionAsset[1]));
    return;
  }

  const uncleTommyTransitionAsset = url.match(
    /^\/assets\/uncle-tommy-transition\/(uncle-tommy-transition\.(?:css|js)|user_uncletommy_[1-4]\.png)$/i,
  );
  if (uncleTommyTransitionAsset) {
    serveFile(res, join(ROOT, 'assets', 'uncle-tommy-transition', uncleTommyTransitionAsset[1]));
    return;
  }

  if (url === '/assets/vendor/lottie_light.min.js') {
    serveFile(res, join(ROOT, 'assets', 'vendor', 'lottie_light.min.js'));
    return;
  }

  if (url === '/ChickenDance.fbx') {
    serveFile(res, join(ROOT, 'Animation', 'Dance', 'ChickenDance.fbx'));
    return;
  }

  const rootAsset = url.match(/^\/[^/]+\.(png|jpe?g|webp|fbx|vrm|mp4|webm|mov|css|js)$/i);
  if (rootAsset) {
    serveFile(res, join(ROOT, url.slice(1)));
    return;
  }

  const file = resolvePage(url);
  serveFile(res, join(ROOT, file));
});

const wss = new WebSocketServer({ server, path: '/ws' });

const DEFAULT_VOICE_ID = 'default-zylgts2tamenvybeti3z0w__uncle_tommy';
const DEFAULT_TTS_MODEL = 'inworld-tts-2';
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

const DEFAULT_LIGHTING = {
  hemisphereIntensity: 1.6,
  keyLightIntensity: 1.25,
  fillLightIntensity: 0.5,
  exposure: 1.35,
};

function normalizeLighting(raw) {
  const l = raw && typeof raw === 'object' ? raw : {};
  return {
    hemisphereIntensity: parseLipsyncNumber(l.hemisphereIntensity, 0, 4, DEFAULT_LIGHTING.hemisphereIntensity),
    keyLightIntensity: parseLipsyncNumber(l.keyLightIntensity, 0, 4, DEFAULT_LIGHTING.keyLightIntensity),
    fillLightIntensity: parseLipsyncNumber(l.fillLightIntensity, 0, 4, DEFAULT_LIGHTING.fillLightIntensity),
    exposure: parseLipsyncNumber(l.exposure, 0.4, 3, DEFAULT_LIGHTING.exposure),
  };
}

const HAPPY_TOOL_INSTRUCTION =
  ' Call the happy tool whenever the user asks to dance, says "chicken dance", wants a funny move or celebration, or says anything that suggests they want Uncle Tommy to dance. Trigger on short phrases like "dance", "do a dance", "chicken dance", "dance for me", or "can you dance". Uncle Tommy will do a random fun dance — err on the side of calling it.';

const KUNGFU_TOOL_INSTRUCTION =
  ' Call the kungfu tool whenever the user asks Uncle Tommy to fight, do kung fu, punch, karate, martial arts, or show fighting moves. Trigger on phrases like "kung fu", "do a punch", "fight", "fight me", "show me your moves", or "can you fight". Keep it playful and kid-friendly — Tommy is showing off moves, not real violence.';

const LEAVE_TOOL_INSTRUCTION =
  ' When the user says goodbye, bye bye, bye, see you later, see ya, gotta go, I have to go, or that they are leaving, you MUST call end_conversation in that same turn after a brief farewell. Never end a session with only spoken words — always call the tool. Do NOT call it for casual phrases like "nice to see you", "take care of", or "talk later about…".';

const GAME_TOOLS_INSTRUCTION =
  ' Three games are available: (1) Word-Whack Blitz — call play_wordwhack when they want whack-a-word, sentence completion, or "word whack". (2) Picture-Word Memory Match — call play_cardgame when they want the card game, memory match, flip cards, or picture-word match. (3) Find the Object — call play_findgame when they want find-the-object, tap to find, or spotting game. If they only say "let\'s play" or "play a game" without naming one, ask which of the three they want; call the matching tool once they choose or name a game clearly.';

const GAME_TOOLS_INSTRUCTION_WORDWHACK_LOCKED =
  ' Two games are available right now: (1) Picture-Word Memory Match — call play_cardgame when they want the card game, memory match, flip cards, or picture-word match. (2) Find the Object — call play_findgame when they want find-the-object, tap to find, or spotting game. Word-Whack Blitz is LOCKED until they claim the Day 1 daily reward ("New Game"). If they ask for Word-Whack, do NOT call play_wordwhack; warmly tell them to open their daily reward to unlock it, and offer one of the two unlocked games instead. If they only say "let\'s play" or "play a game" without naming one, ask which of the two unlocked games they want.';

function buildGameToolsInstruction(username) {
  if (!username || hasUnlockedGame(username, 'wordwhack')) {
    return GAME_TOOLS_INSTRUCTION;
  }
  return GAME_TOOLS_INSTRUCTION_WORDWHACK_LOCKED;
}

const HAPPY_TOOL = {
  type: 'function',
  name: 'happy',
  description:
    'Makes Uncle Tommy perform a random fun dance animation. Call when the user wants a dance, says chicken dance, asks for something fun, or uses "dance" in a request.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'How the user asked to dance, e.g. "do a dance"',
      },
    },
  },
};

const KUNGFU_TOOL = {
  type: 'function',
  name: 'kungfu',
  description:
    'Makes Uncle Tommy perform a random kung fu / fighting animation. Call when the user wants to fight, kung fu, punch, karate, martial arts, or fighting moves.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'How the user asked to fight, e.g. "do kung fu" or "punch"',
      },
    },
  },
};

const END_CONVERSATION_TOOL = {
  type: 'function',
  name: 'end_conversation',
  description:
    'Ends the voice session. Call only when the user clearly wants to leave — explicit goodbyes or saying they have to go. Do not call for ambiguous or partial phrases.',
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

const PLAY_WORDWHACK_TOOL = {
  type: 'function',
  name: 'play_wordwhack',
  description:
    'Launches Word-Whack Blitz (complete the sentence / whack-a-word). Call when the user asks for this game by name or describes whacking words or finishing sentences. If Word-Whack is locked in the session instructions, do not call this tool.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'What the user asked for, e.g. "play word whack"',
      },
    },
  },
};

const PLAY_CARDGAME_TOOL = {
  type: 'function',
  name: 'play_cardgame',
  description:
    'Launches Picture-Word Memory Match (flip cards and match words). Call when the user wants the card game, memory match, or picture-word game.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'What the user asked for, e.g. "play the card game"',
      },
    },
  },
};

const PLAY_FINDGAME_TOOL = {
  type: 'function',
  name: 'play_findgame',
  description:
    'Launches Find the Object (tap the right thing in the scene). Call when the user wants find-the-object, spotting, or tap-to-find game.',
  parameters: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'What the user asked for, e.g. "play find the object"',
      },
    },
  },
};

const DEFAULT_ASR_MODEL = 'assemblyai/universal-streaming-english';
const DEFAULT_VAD_EAGERNESS = 'low';

function buildSessionCfg({
  instructions,
  voice,
  model,
  asrModel,
  asrLanguage,
  vadEagerness,
  vadThreshold,
  ttsModel,
  ttsLanguage,
  ttsSpeed,
  ttsDeliveryMode,
  temperature,
  maxOutputTokens,
  simpleSession = false,
  username = null,
} = {}) {
  const gameToolsInstruction = buildGameToolsInstruction(username);
  const session = {
    type: 'realtime',
    model: model || DEFAULT_MODEL,
    instructions: simpleSession
      ? (instructions ?? '')
      : (instructions || DEFAULT_INSTRUCTIONS) + HAPPY_TOOL_INSTRUCTION + KUNGFU_TOOL_INSTRUCTION + gameToolsInstruction + LEAVE_TOOL_INSTRUCTION,
    output_modalities: ['audio', 'text'],
    audio: {
      input: {
        turn_detection: {
          type: 'semantic_vad',
          eagerness: vadEagerness || DEFAULT_VAD_EAGERNESS,
          create_response: true,
          interrupt_response: true,
        },
        transcription: {
          model: asrModel || DEFAULT_ASR_MODEL,
        },
      },
      output: {
        voice: voice || DEFAULT_VOICE_ID,
        model: ttsModel || DEFAULT_TTS_MODEL,
      },
    },
  };

  if (!simpleSession) {
    session.tools = [HAPPY_TOOL, KUNGFU_TOOL, PLAY_WORDWHACK_TOOL, PLAY_CARDGAME_TOOL, PLAY_FINDGAME_TOOL, END_CONVERSATION_TOOL];
    session.tool_choice = 'auto';
  }

  const asrLang = String(asrLanguage || '').trim();
  if (asrLang) session.audio.input.transcription.language = asrLang;

  const temp = Number(temperature);
  if (Number.isFinite(temp)) session.temperature = temp;

  if (maxOutputTokens === 'inf') {
    session.max_output_tokens = 'inf';
  } else {
    const maxTokens = Number(maxOutputTokens);
    if (Number.isFinite(maxTokens) && maxTokens > 0) session.max_output_tokens = maxTokens;
  }

  const speed = Number(ttsSpeed);
  if (Number.isFinite(speed) && speed > 0) session.audio.output.speed = speed;

  const providerData = {};
  const vad = Number(vadThreshold);
  if (Number.isFinite(vad) && vad >= 0 && vad <= 1) {
    providerData.stt = { vad_threshold: vad };
  }

  const ttsPd = {};
  const deliveryMode = String(ttsDeliveryMode || '').trim().toUpperCase();
  if (deliveryMode === 'STABLE' || deliveryMode === 'BALANCED' || deliveryMode === 'CREATIVE') {
    ttsPd.delivery_mode = deliveryMode;
  }
  const ttsLang = String(ttsLanguage || '').trim();
  if (ttsLang) ttsPd.language = ttsLang;
  if (Object.keys(ttsPd).length) providerData.tts = ttsPd;

  if (Object.keys(providerData).length) session.providerData = providerData;

  return JSON.stringify({ type: 'session.update', session });
}

const GREET = JSON.stringify({
  type: 'conversation.item.create',
  item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Greet the user' }] }
});

function connectToInworld(apiKey, browser, session, userInfo = {}) {
  let setup = 0;
  let conversationFinished = false;
  const sessionAudio = createSessionAudioRecorder();
  const conversationId = createConversationRecord(
    userInfo.username || 'unknown',
    userInfo.role || 'unknown',
  );
  const recordedAgentResponses = new Set();
  const sessionCfg = buildSessionCfg(session);
  const api = new WebSocket(
    `wss://api.inworld.ai/api/v1/realtime/session?key=voice-${Date.now()}&protocol=realtime`,
    { headers: { Authorization: `Basic ${apiKey}` } }
  );

  const finishConversation = () => {
    if (conversationFinished) return;
    conversationFinished = true;
    const savedAudio = saveSessionMixAudio(conversationId, sessionAudio);
    if (savedAudio) console.log(`[session-audio] saved mixed ${savedAudio}`);
    endConversationRecord(conversationId);
    queueProfileSyncFromConversation({
      username: userInfo.username,
      role: userInfo.role,
      apiKey,
      conversationId,
    });
  };

  const recordInworldMessage = (parsed) => {
    if (!parsed?.type) return;
    const t = parsed.type;

    if (t === 'conversation.item.input_audio_transcription.completed') {
      const transcript = parsed.transcript?.trim();
      if (transcript) addConversationTurn(conversationId, 'user', transcript, t);
      return;
    }

    if (t === 'response.output_text.done' || t === 'response.output_audio_transcript.done') {
      const responseId = parsed.response_id || parsed.item_id;
      if (responseId && recordedAgentResponses.has(responseId)) return;
      const text = (parsed.text || parsed.transcript || '').trim();
      if (!text) return;
      if (responseId) recordedAgentResponses.add(responseId);
      addConversationTurn(conversationId, 'assistant', text, t);
      return;
    }

    if (t === 'response.function_call_arguments.done') {
      const name = parsed.name || 'tool';
      const args = parsed.arguments || '';
      addConversationTurn(conversationId, 'tool', `[${name}] ${args}`, t);
    }
  };

  api.on('message', (raw) => {
    let parsed;
    try { parsed = JSON.parse(raw.toString()); } catch { parsed = null; }
    if (parsed) {
      recordInworldMessage(parsed);
      if (parsed.type === 'response.output_audio.delta') {
        sessionAudio.appendAgentDelta(parsed);
      }
    }
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
    sessionAudio.appendUserFromMessage(msg);
    if (api.readyState === WebSocket.OPEN) api.send(msg.toString());
  });

  browser.on('close', () => {
    // Keep the Inworld socket open briefly so final STT transcripts can arrive
    // before we end the conversation and run profile sync.
    setTimeout(() => {
      finishConversation();
      if (api.readyState === WebSocket.OPEN || api.readyState === WebSocket.CONNECTING) {
        api.close();
      }
    }, PROFILE_SYNC_TRANSCRIPT_SETTLE_MS);
  });
  api.on('close', () => {
    finishConversation();
    if (browser.readyState === WebSocket.OPEN) browser.close();
  });
  api.on('error', (e) => {
    console.error('API error:', e.message);
    finishConversation();
    if (browser.readyState === WebSocket.OPEN) {
      browser.send(JSON.stringify({ type: 'client.error', message: e.message }));
      browser.close();
    }
  });
}

wss.on('connection', (browser, req) => {
  if (!isAuthenticated(req)) {
    browser.close(4001, 'Login required');
    return;
  }

  if (!INWORLD_API_ENABLED) {
    browser.send(JSON.stringify({
      type: 'client.error',
      message: INWORLD_API_DISABLED_MESSAGE,
    }));
    browser.close(4003, 'Inworld API disabled');
    return;
  }

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
    const sessionUser = getSession(req);
    const profile = sessionUser?.role === 'student'
      ? getUserProfile(sessionUser.username)
      : {};
    const simpleSession = parsed.simpleSession === true;
    const baseInstructions = simpleSession
      ? (typeof parsed.instructions === 'string' ? parsed.instructions.trim() : '')
      : (parsed.instructions?.trim() || saved.instructions?.trim());
    const vadThresholdRaw = parsed.vadThreshold;
    const vadThreshold = vadThresholdRaw === '' || vadThresholdRaw == null
      ? undefined
      : Number(vadThresholdRaw);
    const temperatureRaw = parsed.temperature;
    const temperature = temperatureRaw === '' || temperatureRaw == null
      ? undefined
      : Number(temperatureRaw);
    const maxOutputTokensRaw = parsed.maxOutputTokens;
    const maxOutputTokens = maxOutputTokensRaw === '' || maxOutputTokensRaw == null
      ? undefined
      : (String(maxOutputTokensRaw).trim().toLowerCase() === 'inf'
        ? 'inf'
        : Number(maxOutputTokensRaw));
    const ttsSpeedRaw = parsed.ttsSpeed;
    const ttsSpeed = ttsSpeedRaw === '' || ttsSpeedRaw == null
      ? undefined
      : Number(ttsSpeedRaw);

    connectToInworld(apiKey, browser, {
      instructions: simpleSession
        ? baseInstructions
        : mergeInstructionsWithProfile(
          baseInstructions,
          profile,
          sessionUser?.role === 'student' ? sessionUser.username : null,
        ),
      simpleSession,
      username: sessionUser?.role === 'student' ? sessionUser.username : null,
      voice: parsed.voice?.trim() || saved.voice?.trim(),
      model: parsed.model?.trim() || saved.model?.trim(),
      asrModel: parsed.asrModel?.trim() || saved.asrModel?.trim(),
      asrLanguage: parsed.asrLanguage?.trim() || saved.asrLanguage?.trim(),
      vadEagerness: parsed.vadEagerness?.trim() || saved.vadEagerness?.trim(),
      vadThreshold: Number.isFinite(vadThreshold) ? vadThreshold : undefined,
      ttsModel: parsed.ttsModel?.trim() || saved.ttsModel?.trim(),
      ttsLanguage: parsed.ttsLanguage?.trim() || saved.ttsLanguage?.trim(),
      ttsSpeed: Number.isFinite(ttsSpeed) ? ttsSpeed : undefined,
      ttsDeliveryMode: parsed.ttsDeliveryMode?.trim() || saved.ttsDeliveryMode?.trim(),
      temperature: Number.isFinite(temperature) ? temperature : undefined,
      maxOutputTokens: maxOutputTokens === 'inf' || Number.isFinite(maxOutputTokens)
        ? maxOutputTokens
        : undefined,
    }, {
      username: sessionUser?.username || 'unknown',
      role: sessionUser?.role || 'unknown',
    });
  });
});

const port = Number(process.env.PORT) || 4000;
server.listen(port, '0.0.0.0', () => {
  console.log(`Listening on http://0.0.0.0:${port}  (config: /config)`);
  console.log(`Admin CMS: http://0.0.0.0:${port}/admin  (login: /admin/login)`);
  console.log(`Account profiles: http://0.0.0.0:${port}/account-config`);
  console.log(`Games hub:  http://0.0.0.0:${port}/games/`);
  console.log(`Game database: ${GAME_DB_PATH}`);
  console.log(`Conversation logs: ${CONVERSATIONS_DB_PATH}`);
  console.log(`Session audio: ${SESSION_AUDIO_DIR}`);
  console.log(`Eleven Agents: http://0.0.0.0:${port}/agents.html  (public, no login)`);
  console.log(`ElevenLabs API: ${ELEVENLABS_API_KEY ? 'configured' : 'missing ELEVENLABS_API_KEY'}`);
  if (CONFIG_DIR !== ROOT) console.log(`Config stored at ${CONFIG_PATH}`);
});
