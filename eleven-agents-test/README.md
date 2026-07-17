# ElevenLabs test sandbox

Standalone page to try **Eleven Agents** (voice) without touching the main Inworld app.

## Setup

```bash
cd eleven-agents-test
cp .env.example .env   # if you need a fresh env file
npm install
npm start
```

Open [http://localhost:3456](http://localhost:3456).

Environment variables in `.env`:

| Variable | Purpose |
|----------|---------|
| `ELEVENLABS_API_KEY` | Server-only; never sent to the browser |
| `ELEVENLABS_VOICE_ID` | Default TTS override for agent sessions (`Taae9YSyOLxij6fj32HF`) |
| `ELEVENLABS_AGENT_ID` | Optional default agent; otherwise pick in the UI |
| `PORT` | HTTP port (default `3456`) |

## Pages

- **`/`** — hub
- **`/agents.html`** — Eleven Agents WebRTC conversation with voice override

The server exposes:

- `GET /api/agents` — list ConvAI agents
- `GET /api/conversation-token?agent_id=` — WebRTC token for private agents

Do not commit `.env` or expose API keys in frontend code.
