const { Conversation } = ElevenLabsClient;

const STORAGE = {
  apiKey: "elevenagents_api_key",
  agentId: "elevenagents_agent_id",
  voiceId: "elevenagents_voice_id",
};

const apiKeyInput = document.getElementById("apiKey");
const agentIdInput = document.getElementById("agentId");
const voiceIdInput = document.getElementById("voiceId");
const agentSelect = document.getElementById("agentSelect");
const firstMessageInput = document.getElementById("firstMessage");
const connectionStatus = document.getElementById("connectionStatus");
const agentStatus = document.getElementById("agentStatus");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const saveBtn = document.getElementById("saveBtn");
const loadAgentsBtn = document.getElementById("loadAgentsBtn");
const settingsHint = document.getElementById("settingsHint");
const logEl = document.getElementById("log");

let conversation = null;
let serverDefaults = { voiceId: "", defaultAgentId: "", hasApiKey: false };

function appendLog(text, className = "meta") {
  const line = document.createElement("div");
  line.className = className;
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setUiConnected(connected) {
  startBtn.disabled = connected;
  stopBtn.disabled = !connected;
  connectionStatus.textContent = connected ? "Connected" : "Idle";
  if (!connected) agentStatus.textContent = "—";
}

function elevenLabsFetchHeaders() {
  const key = apiKeyInput.value.trim();
  if (!key) return {};
  return { "X-ElevenLabs-Api-Key": key };
}

function saveSettingsToStorage() {
  localStorage.setItem(STORAGE.apiKey, apiKeyInput.value.trim());
  localStorage.setItem(STORAGE.agentId, agentIdInput.value.trim());
  localStorage.setItem(STORAGE.voiceId, voiceIdInput.value.trim());
  settingsHint.textContent = "Saved in this browser.";
}

function loadSettingsFromStorage() {
  const storedKey = localStorage.getItem(STORAGE.apiKey);
  const storedAgent = localStorage.getItem(STORAGE.agentId);
  const storedVoice = localStorage.getItem(STORAGE.voiceId);
  if (storedKey) apiKeyInput.value = storedKey;
  if (storedAgent) agentIdInput.value = storedAgent;
  if (storedVoice) voiceIdInput.value = storedVoice;
}

async function loadServerDefaults() {
  const res = await fetch("/api/elevenlabs/config");
  serverDefaults = await res.json();
  if (!voiceIdInput.value.trim() && serverDefaults.voiceId) {
    voiceIdInput.value = serverDefaults.voiceId;
  }
  if (!agentIdInput.value.trim() && serverDefaults.defaultAgentId) {
    agentIdInput.value = serverDefaults.defaultAgentId;
  }
  if (!apiKeyInput.value.trim() && serverDefaults.hasApiKey) {
    settingsHint.textContent = "Server has an API key; leave the key field empty to use it.";
  }
}

function resolveAgentId() {
  const fromSelect = agentSelect.value.trim();
  const fromInput = agentIdInput.value.trim();
  return fromSelect || fromInput;
}

async function loadAgents() {
  saveSettingsToStorage();
  agentSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select an agent…";
  agentSelect.appendChild(placeholder);

  const res = await fetch("/api/elevenlabs/agents", {
    headers: elevenLabsFetchHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    placeholder.textContent = "Could not load agents";
    appendLog(JSON.stringify(data, null, 2), "err");
    return;
  }

  const agents = Array.isArray(data.agents) ? data.agents : [];
  if (!agents.length) {
    placeholder.textContent = "No agents in this account";
    return;
  }

  for (const agent of agents) {
    const opt = document.createElement("option");
    opt.value = agent.agent_id;
    opt.textContent = agent.name ? `${agent.name} (${agent.agent_id})` : agent.agent_id;
    agentSelect.appendChild(opt);
  }

  const preferred = agentIdInput.value.trim();
  if (preferred && agents.some((a) => a.agent_id === preferred)) {
    agentSelect.value = preferred;
  } else if (agents.length === 1) {
    agentSelect.value = agents[0].agent_id;
    agentIdInput.value = agents[0].agent_id;
  }
}

async function fetchConversationToken(agentId) {
  const res = await fetch(
    `/api/elevenlabs/conversation-token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: elevenLabsFetchHeaders() }
  );
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      detail = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      /* plain text */
    }
    throw new Error(`Conversation token failed (${res.status}):\n${detail}`);
  }
  return text;
}

async function startConversation() {
  saveSettingsToStorage();
  const agentId = resolveAgentId();
  if (!agentId) {
    appendLog("Set an agent ID or pick one from the list.", "err");
    return;
  }

  startBtn.disabled = true;
  connectionStatus.textContent = "Connecting…";

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const token = await fetchConversationToken(agentId);

    const voiceId = voiceIdInput.value.trim() || serverDefaults.voiceId;
    const overrides = { tts: { voiceId } };
    const firstMessage = firstMessageInput.value.trim();
    if (firstMessage) {
      overrides.agent = { firstMessage };
    }

    conversation = await Conversation.startSession({
      conversationToken: token,
      connectionType: "webrtc",
      overrides,
      onConnect: () => {
        setUiConnected(true);
        appendLog("Connected to Eleven Agents.", "meta");
      },
      onDisconnect: () => {
        setUiConnected(false);
        conversation = null;
        appendLog("Disconnected.", "meta");
      },
      onError: (message) => {
        appendLog(`Error: ${message}`, "err");
      },
      onModeChange: (mode) => {
        agentStatus.textContent = mode.mode === "speaking" ? "Speaking" : "Listening";
      },
      onMessage: (message) => {
        if (message.source === "user" && message.message) {
          appendLog(`You: ${message.message}`, "user");
        }
        if (message.source === "ai" && message.message) {
          appendLog(`Agent: ${message.message}`, "agent");
        }
      },
    });
  } catch (error) {
    setUiConnected(false);
    appendLog(error?.message || String(error), "err");
  } finally {
    if (!conversation) startBtn.disabled = false;
  }
}

async function stopConversation() {
  if (conversation) {
    await conversation.endSession();
    conversation = null;
  }
  setUiConnected(false);
}

agentSelect.addEventListener("change", () => {
  if (agentSelect.value) agentIdInput.value = agentSelect.value;
});

startBtn.addEventListener("click", startConversation);
stopBtn.addEventListener("click", stopConversation);
saveBtn.addEventListener("click", saveSettingsToStorage);
loadAgentsBtn.addEventListener("click", () => {
  loadAgents().catch((err) => appendLog(String(err), "err"));
});

loadSettingsFromStorage();
loadServerDefaults().catch((err) => appendLog(String(err), "err"));
