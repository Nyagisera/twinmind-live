"use client";

import { useState, useCallback, useRef } from "react";
import TranscriptPanel from "./components/TranscriptPanel";
import SuggestionsPanel from "./components/SuggestionsPanel";
import ChatPanel from "./components/ChatPanel";
import SettingsModal from "./components/SettingsModal";
import {
  TranscriptChunk,
  SuggestionBatch,
  ChatMessage,
  AppSettings,
  DEFAULT_SETTINGS,
} from "@/lib/types";
import {
  fetchSuggestions,
  streamChat,
  getTranscriptContext,
  hasSubstantialNewContent,
  uid,
} from "@/lib/api";
import styles from "./page.module.css";

export default function Home() {
  // ─── Settings ──────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<AppSettings>({
    groqApiKey: "",
    ...DEFAULT_SETTINGS,
  });
  const [showSettings, setShowSettings] = useState(false);

  // ─── Transcript state ──────────────────────────────────────────────────────
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunk[]>([]);

  const handleTranscriptChunk = useCallback((text: string) => {
    if (!text.trim()) return;
    setTranscriptChunks((prev) => [
      ...prev,
      { id: uid(), text: text.trim(), timestamp: Date.now() },
    ]);
  }, []);

  const fullTranscript = transcriptChunks.map((c) => c.text).join(" ");

  // ─── Suggestions state ─────────────────────────────────────────────────────
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const lastSuggestionContext = useRef<string>("");

  const previousTitles = suggestionBatches
    .slice(0, 3)
    .flatMap((b) => b.suggestions.map((s) => s.title));

  const handleRefreshSuggestions = useCallback(
    async (forceRefresh = false) => {
      if (!settings.groqApiKey) {
        setSuggestionsError("Add your Groq API key in Settings");
        return;
      }
      if (!fullTranscript.trim()) {
        setSuggestionsError("Start recording first");
        return;
      }

      const context = getTranscriptContext(fullTranscript, settings.suggestionContextWords);

      // Smart skip: don't refresh if content hasn't changed meaningfully
      if (!forceRefresh && !hasSubstantialNewContent(context, lastSuggestionContext.current)) {
        return;
      }

      setSuggestionsLoading(true);
      setSuggestionsError(null);
      lastSuggestionContext.current = context;

      try {
        const result = await fetchSuggestions(
          context,
          previousTitles,
          settings.groqApiKey,
          settings.suggestionPrompt
        );

        setSuggestionBatches((prev) => [
          {
            id: uid(),
            timestamp: Date.now(),
            suggestions: result.suggestions,
            conversationState: result.conversationState ?? undefined,
          },
          ...prev,
        ]);
      } catch (e: any) {
        setSuggestionsError(e.message);
      } finally {
        setSuggestionsLoading(false);
      }
    },
    [settings, fullTranscript, previousTitles]
  );

  // ─── Chat state ────────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatStreaming, setChatStreaming] = useState(false);

  const handleSendChat = useCallback(
    async (userMessage: string, isSuggestionClick = false) => {
      if (!settings.groqApiKey || !userMessage.trim()) return;

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: userMessage,
        timestamp: Date.now(),
        isSuggestionClick,
      };

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
      setChatStreaming(true);

      try {
        const stream = streamChat(
          fullTranscript,
          chatMessages,
          userMessage,
          settings.groqApiKey,
          settings.chatPrompt,
          isSuggestionClick
        );

        for await (const token of stream) {
          setChatMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + token };
            }
            return updated;
          });
        }
      } catch (e: any) {
        setChatMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = { ...last, content: `Error: ${e.message}` };
          }
          return updated;
        });
      } finally {
        setChatStreaming(false);
      }
    },
    [settings, fullTranscript, chatMessages]
  );

  // ─── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const session = {
      exportedAt: new Date().toISOString(),
      transcript: transcriptChunks.map((c) => ({
        timestamp: new Date(c.timestamp).toISOString(),
        text: c.text,
      })),
      suggestionBatches: suggestionBatches.map((b) => ({
        timestamp: new Date(b.timestamp).toISOString(),
        conversationState: b.conversationState ?? null,
        suggestions: b.suggestions,
      })),
      chat: chatMessages.map((m) => ({
        timestamp: new Date(m.timestamp).toISOString(),
        role: m.role,
        content: m.content,
        fromSuggestion: m.isSuggestionClick ?? false,
      })),
    };

    const blob = new Blob([JSON.stringify(session, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `twinmind-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [transcriptChunks, suggestionBatches, chatMessages]);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logo}>TwinMind</span>
          <span className={styles.headerSub}>Live Suggestions</span>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.exportBtn} onClick={handleExport}>
            Export Session
          </button>
          <button className={styles.settingsBtn} onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
        </div>
      </header>

      <main className={styles.columns}>
        <TranscriptPanel
          chunks={transcriptChunks}
          apiKey={settings.groqApiKey}
          onChunk={handleTranscriptChunk}
          onNeedApiKey={() => setShowSettings(true)}
        />
        <SuggestionsPanel
          batches={suggestionBatches}
          loading={suggestionsLoading}
          error={suggestionsError}
          autoRefreshSeconds={settings.autoRefreshSeconds}
          hasTranscript={!!fullTranscript.trim()}
          onRefresh={() => handleRefreshSuggestions(false)}
          onManualRefresh={() => handleRefreshSuggestions(true)}
          onSuggestionClick={(title, preview) =>
            handleSendChat(`${title}\n\n${preview}`, true)
          }
        />
        <ChatPanel
          messages={chatMessages}
          streaming={chatStreaming}
          onSend={(msg) => handleSendChat(msg, false)}
          hasApiKey={!!settings.groqApiKey}
          onNeedApiKey={() => setShowSettings(true)}
        />
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => { setSettings(s); setShowSettings(false); }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
