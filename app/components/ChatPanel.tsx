"use client";

import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/lib/types";
import styles from "./ChatPanel.module.css";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  onSend: (message: string) => void;
  hasApiKey: boolean;
  onNeedApiKey: () => void;
}

export default function ChatPanel({
  messages, streaming, onSend, hasApiKey, onNeedApiKey,
}: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!hasApiKey) { onNeedApiKey(); return; }
    onSend(text);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.panelLabel}>3. CHAT (DETAILED ANSWERS)</span>
        <span className={styles.badge}>SESSION-ONLY</span>
      </div>

      <div className={styles.messageList} ref={scrollRef}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Click a suggestion or type a question below.</p>
            <p className={styles.emptyDesc}>
              Clicking a suggestion streams a detailed answer using the full transcript as context.
              You can also type questions directly — one continuous chat per session.
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isStreaming={streaming && i === messages.length - 1 && msg.role === "assistant"}
              onFollowUp={(q) => onSend(q)}
            />
          ))
        )}
      </div>

      <div className={styles.inputArea}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          rows={1}
          disabled={streaming}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || streaming}
        >
          {streaming ? <SpinnerIcon /> : "Send"}
        </button>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
  onFollowUp,
}: {
  message: ChatMessage;
  isStreaming: boolean;
  onFollowUp: (q: string) => void;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleAssistant}`}>
      <div className={styles.bubbleMeta}>
        <span className={styles.bubbleRole}>{isUser ? "You" : "TwinMind"}</span>
        {message.isSuggestionClick && (
          <span className={styles.suggestionTag}>via suggestion</span>
        )}
        <span className={styles.bubbleTime}>
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit", minute: "2-digit", second: "2-digit",
          })}
        </span>
        {!isUser && message.content && !isStreaming && (
          <button className={styles.copyBtn} onClick={handleCopy} title="Copy answer">
            {copied ? "✓" : "⎘"}
          </button>
        )}
      </div>
      <p className={styles.bubbleContent}>
        {message.content}
        {isStreaming && <span className={styles.cursor} />}
      </p>
    </div>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      style={{ animation: "spin 1s linear infinite" }}>
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5"
        strokeDasharray="20" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  );
}
