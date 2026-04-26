"use client";

import { useEffect, useRef, useState } from "react";
import { SuggestionBatch, SuggestionType, ConversationState } from "@/lib/types";
import styles from "./SuggestionsPanel.module.css";

interface Props {
  batches: SuggestionBatch[];
  loading: boolean;
  error: string | null;
  autoRefreshSeconds: number;
  hasTranscript: boolean;
  onRefresh: () => void;
  onManualRefresh: () => void;
  onSuggestionClick: (title: string, preview: string) => void;
}

const TYPE_META: Record<SuggestionType, { label: string; color: string }> = {
  QUESTION:      { label: "Question",      color: "var(--accent-blue)" },
  TALKING_POINT: { label: "Talking Point", color: "var(--accent-yellow)" },
  ANSWER:        { label: "Answer",        color: "var(--accent-green)" },
  FACT_CHECK:    { label: "Fact Check",    color: "var(--accent-red)" },
  CLARIFICATION: { label: "Clarification", color: "var(--accent-purple)" },
  PROBE:         { label: "Probe",         color: "#ff9f43" },
  COMMITMENT:    { label: "Commitment",    color: "#48dbfb" },
  REBALANCE:     { label: "Rebalance",     color: "#ff6b9d" },
};

const PHASE_LABELS: Record<string, string> = {
  opening: "Opening",
  exploration: "Exploring",
  deep_account: "Deep Account",
  challenge: "Challenge",
  commitment: "Commitment",
  closing: "Closing",
  unknown: "—",
};

const MODE_LABELS: Record<string, string> = {
  interview: "Interview",
  sales_pitch: "Sales Pitch",
  technical_discussion: "Technical",
  brainstorm: "Brainstorm",
  negotiation: "Negotiation",
  status_update: "Status Update",
  casual: "Casual",
  unknown: "—",
};

const URGENCY_COLORS: Record<string, string> = {
  high: "var(--accent-red)",
  medium: "var(--accent-yellow)",
  low: "var(--text-dim)",
};

export default function SuggestionsPanel({
  batches,
  loading,
  error,
  autoRefreshSeconds,
  hasTranscript,
  onRefresh,
  onManualRefresh,
  onSuggestionClick,
}: Props) {
  const [countdown, setCountdown] = useState(autoRefreshSeconds);
  const countdownRef = useRef(autoRefreshSeconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    countdownRef.current = autoRefreshSeconds;
    setCountdown(autoRefreshSeconds);

    timerRef.current = setInterval(() => {
      countdownRef.current -= 1;
      setCountdown(countdownRef.current);

      if (countdownRef.current <= 0) {
        countdownRef.current = autoRefreshSeconds;
        setCountdown(autoRefreshSeconds);
        if (hasTranscript) onRefresh();
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshSeconds, batches.length]);

  const handleManualRefresh = () => {
    countdownRef.current = autoRefreshSeconds;
    setCountdown(autoRefreshSeconds);
    onManualRefresh();
  };

  const latestState = batches[0]?.conversationState ?? null;

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.panelLabel}>2. LIVE SUGGESTIONS</span>
        <span className={styles.batchCount}>
          {batches.length} {batches.length === 1 ? "BATCH" : "BATCHES"}
        </span>
      </div>

      <div className={styles.toolbar}>
        <button
          className={`${styles.refreshBtn} ${loading ? styles.refreshLoading : ""}`}
          onClick={handleManualRefresh}
          disabled={loading}
        >
          <span className={styles.refreshIcon}>↺</span>
          {loading ? "Generating…" : "Reload suggestions"}
        </button>
        <span className={styles.countdown}>auto-refresh in {countdown}s</span>
      </div>

      {/* Conversation state bar — shows after first batch */}
      {latestState && (
        <ConversationStateBar state={latestState} />
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.batchList}>
        {batches.length === 0 && !loading && (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>Suggestions appear here once recording starts.</p>
            <p className={styles.emptyDesc}>
              Each refresh uses{" "}
              <span style={{ color: "var(--accent-blue)" }}>forensic interview analysis</span>{" "}
              to detect conversation phase, behavioral signals, and power dynamics —
              then surfaces the 3 most useful suggestions for this exact moment.
            </p>
          </div>
        )}

        {loading && batches.length === 0 && (
          <div className={styles.loadingCards}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}

        {batches.map((batch, batchIdx) => (
          <div key={batch.id} className={`${styles.batch} ${batchIdx > 0 ? styles.batchOld : ""}`}>
            <div className={styles.batchHeader}>
              <span className={styles.batchTime}>
                {new Date(batch.timestamp).toLocaleTimeString([], {
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                })}
              </span>
              {batchIdx === 0 && loading && (
                <span className={styles.refreshingTag}>Refreshing…</span>
              )}
            </div>
            <div className={styles.cards}>
              {batch.suggestions.map((s, i) => {
                const meta = TYPE_META[s.type] ?? { label: s.type, color: "var(--text-muted)" };
                return (
                  <button
                    key={i}
                    className={styles.card}
                    onClick={() => onSuggestionClick(s.title, s.preview)}
                    style={{ "--type-color": meta.color } as React.CSSProperties}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.cardType}>{meta.label}</span>
                    </div>
                    <p className={styles.cardTitle}>{s.title}</p>
                    <p className={styles.cardPreview}>{s.preview}</p>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {loading && batches.length > 0 && (
          <div className={styles.loadingCards}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationStateBar({ state }: { state: ConversationState }) {
  const signals = state.behavioral_signals.filter((s) => s !== "none");

  return (
    <div className={styles.stateBar}>
      <div className={styles.stateRow}>
        <StateTag label="Phase" value={PHASE_LABELS[state.phase] ?? state.phase} />
        <StateTag label="Mode" value={MODE_LABELS[state.mode] ?? state.mode} />
        <StateTag
          label="Urgency"
          value={state.urgency}
          valueColor={URGENCY_COLORS[state.urgency]}
        />
      </div>
      {signals.length > 0 && (
        <div className={styles.signalRow}>
          {signals.map((sig) => (
            <span key={sig} className={styles.signal}>
              {sig.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
      {state.last_question && (
        <p className={styles.lastQuestion}>
          <span className={styles.lastQuestionLabel}>Last Q:</span>{" "}
          {state.last_question}
        </p>
      )}
    </div>
  );
}

function StateTag({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className={styles.stateTag}>
      <span className={styles.stateTagLabel}>{label}</span>
      <span className={styles.stateTagValue} style={valueColor ? { color: valueColor } : {}}>
        {value}
      </span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonLine} style={{ width: "30%", height: 10 }} />
      <div className={styles.skeletonLine} style={{ width: "70%", height: 13, marginTop: 8 }} />
      <div className={styles.skeletonLine} style={{ width: "100%", height: 11, marginTop: 6 }} />
      <div className={styles.skeletonLine} style={{ width: "85%", height: 11, marginTop: 4 }} />
    </div>
  );
}
