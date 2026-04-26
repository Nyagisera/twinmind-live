// lib/api.ts — client wrappers for the three Python API routes

import { Suggestion, ChatMessage, ConversationState } from "./types";

const BASE = "/api";

// ─── Transcribe ───────────────────────────────────────────────────────────────

export async function transcribeAudio(
  audioBlob: Blob,
  apiKey: string
): Promise<string> {
  const form = new FormData();
  form.append("audio", audioBlob, "audio.webm");

  const res = await fetch(`${BASE}/transcribe`, {
    method: "POST",
    headers: { "X-Groq-Api-Key": apiKey },
    body: form,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Transcription failed");
  return data.text as string;
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

export interface SuggestionsResult {
  suggestions: Suggestion[];
  conversationState: ConversationState | null;
}

export async function fetchSuggestions(
  transcriptContext: string,
  previousTitles: string[],
  apiKey: string,
  systemPrompt: string
): Promise<SuggestionsResult> {
  const res = await fetch(`${BASE}/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Groq-Api-Key": apiKey,
    },
    body: JSON.stringify({
      transcript_context: transcriptContext,
      previous_titles: previousTitles,
      system_prompt: systemPrompt,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Suggestions failed");

  return {
    suggestions: data.suggestions as Suggestion[],
    conversationState: data.conversation_state ?? null,
  };
}

// ─── Chat (streaming SSE) ─────────────────────────────────────────────────────

export async function* streamChat(
  fullTranscript: string,
  chatHistory: ChatMessage[],
  userMessage: string,
  apiKey: string,
  systemPrompt: string,
  isSuggestionClick: boolean
): AsyncGenerator<string> {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Groq-Api-Key": apiKey,
    },
    body: JSON.stringify({
      full_transcript: fullTranscript,
      chat_history: chatHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      user_message: userMessage,
      system_prompt: systemPrompt,
      is_suggestion_click: isSuggestionClick,
    }),
  });

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: "Stream failed" }));
    throw new Error(err.error || "Chat stream failed");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.token) yield parsed.token;
      } catch {
        // skip malformed lines
      }
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract last N words from transcript for suggestion context */
export function getTranscriptContext(
  fullTranscript: string,
  maxWords: number
): string {
  const words = fullTranscript.trim().split(/\s+/);
  if (words.length <= maxWords) return fullTranscript;
  return words.slice(-maxWords).join(" ");
}

/** Detect if recent transcript content is substantially new vs last batch.
 *  Skip refresh if less than 20% of words are new — nothing meaningful happened. */
export function hasSubstantialNewContent(
  currentContext: string,
  lastContext: string
): boolean {
  if (!lastContext) return true;
  const currentWords = currentContext.toLowerCase().split(/\s+/);
  const lastWordsSet = new Set(lastContext.toLowerCase().split(/\s+/));
  const newWords = currentWords.filter((w) => !lastWordsSet.has(w));
  return newWords.length / currentWords.length > 0.2;
}

/** Unique ID generator */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
