import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3456;

const API_KEY = process.env.ELEVENLABS_API_KEY?.trim();
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID?.trim() || "Taae9YSyOLxij6fj32HF";
const DEFAULT_AGENT_ID = process.env.ELEVENLABS_AGENT_ID?.trim() || "";

function requireApiKey(_req, res, next) {
  if (!API_KEY) {
    return res.status(500).json({
      error: "Missing ELEVENLABS_API_KEY in eleven-agents-test/.env",
    });
  }
  next();
}

async function elevenFetch(urlPath, init = {}) {
  const res = await fetch(`https://api.elevenlabs.io${urlPath}`, {
    ...init,
    headers: {
      "xi-api-key": API_KEY,
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

app.use(express.json());
app.use(
  "/vendor/elevenlabs-client",
  express.static(path.join(__dirname, "node_modules/@elevenlabs/client/dist"))
);
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config", (_req, res) => {
  res.json({
    voiceId: VOICE_ID,
    defaultAgentId: DEFAULT_AGENT_ID,
    hasApiKey: Boolean(API_KEY),
  });
});

app.get("/api/agents", requireApiKey, async (_req, res) => {
  const { res: apiRes, body } = await elevenFetch("/v1/convai/agents?page_size=100");
  if (!apiRes.ok) {
    return res.status(apiRes.status).json({
      error: "Failed to list agents",
      detail: body,
    });
  }
  res.json(body);
});

app.get("/api/conversation-token", requireApiKey, async (req, res) => {
  const agentId = String(req.query.agent_id || DEFAULT_AGENT_ID || "").trim();
  if (!agentId) {
    return res.status(400).json({ error: "agent_id query parameter is required" });
  }
  const qs = new URLSearchParams({ agent_id: agentId });
  const { res: apiRes, body } = await elevenFetch(`/v1/convai/conversation/token?${qs}`);
  if (!apiRes.ok) {
    return res.status(apiRes.status).json({
      error: "Failed to get conversation token",
      detail: body,
    });
  }
  res.type("text/plain").send(body.token);
});

app.get("/api/signed-url", requireApiKey, async (req, res) => {
  const agentId = String(req.query.agent_id || DEFAULT_AGENT_ID || "").trim();
  if (!agentId) {
    return res.status(400).json({ error: "agent_id query parameter is required" });
  }
  const qs = new URLSearchParams({ agent_id: agentId });
  const { res: apiRes, body } = await elevenFetch(
    `/v1/convai/conversation/get-signed-url?${qs}`
  );
  if (!apiRes.ok) {
    return res.status(apiRes.status).json({
      error: "Failed to get signed URL",
      detail: body,
    });
  }
  res.type("text/plain").send(body.signed_url);
});

app.listen(PORT, () => {
  console.log(`Eleven Agents test server http://localhost:${PORT}`);
  if (!API_KEY) {
    console.warn("Warning: set ELEVENLABS_API_KEY in eleven-agents-test/.env");
  }
});
