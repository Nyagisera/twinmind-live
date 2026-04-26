# TwinMind — Live Suggestions Web App

Real-time AI meeting copilot. Listens to your mic, transcribes with Whisper, and surfaces 3 contextual suggestions every 30 seconds using a two-pass AI pipeline.

## Live Demo

→ [your-url.vercel.app](#) *(replace after deploy)*

---

## Quick Start

### Prerequisites
- Node.js 18+
- A free [Groq API key](https://console.groq.com)

### Local dev

```bash
git clone https://github.com/your-username/twinmind-live
cd twinmind-live
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000) → click ⚙ Settings → paste Groq key → Save → click mic.

### Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Python serverless functions are auto-detected via `vercel.json`. No env vars needed — API key is passed per-request from the browser.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 + TypeScript | Vercel-native, no extra backend |
| Styling | CSS Modules | Scoped, zero runtime, co-located |
| API | Python 3.12 (Vercel serverless) | Clean Groq SDK |
| Transcription | Groq Whisper Large V3 | Fastest Whisper inference available |
| Analysis + Suggestions + Chat | Llama 4 Maverick 17B (128E) | GPT-OSS 120B class, fast on Groq |
| Chat streaming | Server-Sent Events | Browser-native, works in serverless |

---

## Architecture

```
Browser
  ├── MediaRecorder (30s chunks, silence-filtered)
  │     └── POST /api/transcribe  →  Whisper Large V3  →  text chunk
  │
  ├── 30s timer / reload click (skips if no new content)
  │     ├── POST /api/suggestions  →  pass 1: analyze.py (conversation state)
  │     │                          →  pass 2: suggestions (state-aware, 3 cards)
  │
  └── Suggestion click / chat input
        └── POST /api/chat  →  LLM stream  →  SSE tokens  →  chat panel
```

State lives entirely in React. No database, no auth, no persistence.

---

## Two-Pass Suggestion Pipeline

This is the core differentiator. Every suggestion refresh runs two LLM calls:

### Pass 1 — Conversation Analysis (`/api/analyze.py`)

A fast, low-temperature structured pass that returns a `ConversationState` JSON object:

```json
{
  "phase": "deep_account",
  "mode": "interview",
  "behavioral_signals": ["question_unanswered", "hedging_detected"],
  "power_dynamic": "listener_passive",
  "last_question": "What exactly happened with the Q3 numbers?",
  "active_commitments": ["deliver report by Friday"],
  "key_claims": ["revenue grew 40% YoY"],
  "urgency": "high"
}
```

**Behavioral signals detected** (from forensic interviewing + cognitive psychology):
- `hedging_detected` — vague qualifiers, "it depends", "generally speaking"
- `distancing_language` — passive voice, vague subjects ("mistakes were made")
- `question_unanswered` — direct question asked but not directly answered
- `over_explanation` — unusually long answer (possible concealment)
- `topic_pivot` — speaker changed subject without completing answer
- `commitment_made` — specific promise or commitment stated
- `bold_claim` — definitive factual statement worth verifying
- `contradiction_possible` — current statement may conflict with earlier
- `ambivalence` — yes-but patterns, wanting but resisting
- `cognitive_load_high` — short sentences, filler words, fragmented speech

### Pass 2 — Suggestion Generation (`/api/suggestions.py`)

The conversation state is injected into the suggestion prompt. The model uses phase-based and signal-based rules to pick the right 3 types:

- If `question_unanswered` → first suggestion forced to ANSWER or PROBE
- If `hedging_detected` → include a PROBE calling out the vagueness directly
- If `bold_claim` → include a FACT_CHECK with actual facts
- If `commitment_made` → include a COMMITMENT card surfacing implications

**8 suggestion types:**

| Type | When used |
|---|---|
| ANSWER | A direct question was just asked |
| QUESTION | Best thing to ask right now |
| TALKING_POINT | Concrete fact or angle to raise |
| FACT_CHECK | Bold claim just made |
| CLARIFICATION | Something vague or assumed |
| PROBE | Hedging, distancing, unanswered question |
| COMMITMENT | Specific promise just made |
| REBALANCE | Power dynamic is imbalanced |

---

## Other Design Decisions

| Decision | Rationale |
|---|---|
| 600-word context for suggestions | Recent context only — suggestions about NOW, not a recap. Configurable in Settings. |
| Full transcript for chat | Chat needs to cite anything from the session. |
| Smart refresh skip | Auto-refresh won't fire if <20% new words since last batch. Manual refresh always forces. |
| Silence detection | RMS energy check on audio blob before sending to Whisper. Skips near-silence chunks. |
| Chunk deduplication | Whisper repeats tail of previous chunk ~10% of the time. Strip overlapping phrases. |
| Browser format detection | `MediaRecorder` format varies by browser. Safari uses mp4, Chrome/Firefox use webm. Auto-detected. |
| SSE over WebSockets | Simpler in serverless, browser-native, sufficient for one-way streaming. |
| Previous titles dedup | Pass last 3 batches of titles to avoid suggestion repetition without over-constraining the model. |

---

## Session Export

**Export Session** button → downloads JSON with:
- All transcript chunks with timestamps
- Every suggestion batch with timestamps + conversation state at that moment
- Full chat history with timestamps and whether each message came from a suggestion click

---

## Settings

All configurable in ⚙ Settings:
- **API Key** — Groq key, session-only, never persisted
- **Suggestion prompt** — full editable system prompt
- **Chat prompt** — full editable system prompt
- **Suggestion context window** — 100–2000 words (default: 600)
- **Auto-refresh interval** — 15–120s (default: 30)
- **How It Works tab** — explains the two-pass pipeline and all signal types
