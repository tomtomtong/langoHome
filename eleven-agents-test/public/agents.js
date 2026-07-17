const { Conversation } = ElevenLabsClient;

const agentSelect = document.getElementById("agentSelect");
const voiceIdInput = document.getElementById("voiceId");
const firstMessageInput = document.getElementById("firstMessage");
const connectionStatus = document.getElementById("connectionStatus");
const agentStatus = document.getElementById("agentStatus");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const logEl = document.getElementById("log");

let conversation = null;
let appConfig = { voiceId: "", defaultAgentId: "" };

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

async function loadConfig() {
  const res = await fetch("/api/config");
  appConfig = await res.json();
  voiceIdInput.value = appConfig.voiceId || "";
}

async function loadAgents() {
  agentSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select an agent…";
  agentSelect.appendChild(placeholder);

  const res = await fetch("/api/agents");
  const data = await res.json();
  if (!res.ok) {
    placeholder.textContent = "Could not load agents (check API key)";
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

  if (appConfig.defaultAgentId) {
    agentSelect.value = appConfig.defaultAgentId;
  } else if (agents.length === 1) {
    agentSelect.value = agents[0].agent_id;
  }
}

async function fetchConversationToken(agentId) {
  const res = await fetch(
    `/api/conversation-token?agent_id=${encodeURIComponent(agentId)}`
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
  const agentId = agentSelect.value.trim();
  if (!agentId) {
    appendLog("Choose an agent first.", "err");
    return;
  }

  startBtn.disabled = true;
  connectionStatus.textContent = "Connecting…";

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const token = await fetchConversationToken(agentId);

    const overrides = {
      tts: {
        voiceId: voiceIdInput.value.trim() || appConfig.voiceId,
      },
    };
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

startBtn.addEventListener("click", startConversation);
stopBtn.addEventListener("click", stopConversation);

loadConfig()
  .then(loadAgents)
  .catch((err) => appendLog(String(err), "err"));
