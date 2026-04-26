"use client";

import { useState } from "react";
import { AppSettings, DEFAULT_SETTINGS } from "@/lib/types";
import styles from "./SettingsModal.module.css";

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
}

type Tab = "api" | "prompts" | "context" | "about";

export default function SettingsModal({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>({ ...settings });
  const [tab, setTab] = useState<Tab>(settings.groqApiKey ? "prompts" : "api");
  const [showKey, setShowKey] = useState(false);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => setDraft((prev) => ({ ...prev, ...DEFAULT_SETTINGS }));

  const TAB_LABELS: Record<Tab, string> = {
    api: "API Key",
    prompts: "Prompts",
    context: "Context & Timing",
    about: "How It Works",
  };

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Settings</span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.tabs}>
          {(["api", "prompts", "context", "about"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className={styles.body}>

          {/* ── API Key ── */}
          {tab === "api" && (
            <div className={styles.section}>
              <label className={styles.label}>Groq API Key</label>
              <p className={styles.hint}>
                Get your free key at{" "}
                <a href="https://console.groq.com" target="_blank" rel="noreferrer" className={styles.link}>
                  console.groq.com
                </a>. Never stored — lives only in this browser session.
              </p>
              <div className={styles.keyRow}>
                <input
                  type={showKey ? "text" : "password"}
                  className={styles.input}
                  value={draft.groqApiKey}
                  onChange={(e) => set("groqApiKey", e.target.value)}
                  placeholder="gsk_..."
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className={styles.toggleKey} onClick={() => setShowKey((v) => !v)}>
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
              {draft.groqApiKey
                ? <p className={styles.keyOk}>✓ Key entered — you're ready to go</p>
                : <p className={styles.keyMissing}>⚠ Paste your Groq key to enable recording</p>
              }
            </div>
          )}

          {/* ── Prompts ── */}
          {tab === "prompts" && (
            <>
              <div className={styles.section}>
                <label className={styles.label}>Live Suggestions Prompt</label>
                <p className={styles.hint}>
                  Sent every refresh. Use{" "}
                  <code className={styles.code}>{"{previous_titles}"}</code> to inject
                  recent suggestion titles for deduplication. The conversation state analysis
                  is injected automatically — you don't need to prompt for it.
                </p>
                <textarea
                  className={styles.textarea}
                  rows={12}
                  value={draft.suggestionPrompt}
                  onChange={(e) => set("suggestionPrompt", e.target.value)}
                />
              </div>
              <div className={styles.section}>
                <label className={styles.label}>Chat / Detailed Answer Prompt</label>
                <p className={styles.hint}>
                  System prompt for the chat panel. Full transcript is injected automatically.
                  Used for both typed messages and suggestion card clicks (click gets a
                  more structured expand prompt regardless).
                </p>
                <textarea
                  className={styles.textarea}
                  rows={10}
                  value={draft.chatPrompt}
                  onChange={(e) => set("chatPrompt", e.target.value)}
                />
              </div>
            </>
          )}

          {/* ── Context & Timing ── */}
          {tab === "context" && (
            <>
              <div className={styles.section}>
                <label className={styles.label}>
                  Suggestion Context Window{" "}
                  <span className={styles.value}>{draft.suggestionContextWords} words</span>
                </label>
                <p className={styles.hint}>
                  Words of recent transcript sent for analysis + suggestions.
                  600 words ≈ last 3–4 minutes of speech. More = better context, slower.
                </p>
                <input
                  type="range" min={100} max={2000} step={50}
                  value={draft.suggestionContextWords}
                  onChange={(e) => set("suggestionContextWords", Number(e.target.value))}
                  className={styles.slider}
                />
                <div className={styles.sliderLabels}>
                  <span>100 (~30s)</span><span>2000 (~20min)</span>
                </div>
              </div>

              <div className={styles.section}>
                <label className={styles.label}>
                  Auto-Refresh Interval{" "}
                  <span className={styles.value}>{draft.autoRefreshSeconds}s</span>
                </label>
                <p className={styles.hint}>
                  How often suggestions auto-refresh during recording.
                  Auto-refresh is skipped if transcript hasn't changed meaningfully.
                </p>
                <input
                  type="range" min={15} max={120} step={5}
                  value={draft.autoRefreshSeconds}
                  onChange={(e) => set("autoRefreshSeconds", Number(e.target.value))}
                  className={styles.slider}
                />
                <div className={styles.sliderLabels}>
                  <span>15s (fast)</span><span>120s (slow)</span>
                </div>
              </div>

              <div className={styles.section}>
                <label className={styles.label}>Chat Context</label>
                <p className={styles.hint}>
                  Chat always sends the full transcript for maximum answer quality.
                </p>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Full transcript</span>
                  <span className={styles.infoOn}>Always on</span>
                </div>
              </div>
            </>
          )}

          {/* ── About / How It Works ── */}
          {tab === "about" && (
            <div className={styles.aboutSection}>
              <p className={styles.aboutTitle}>Two-pass AI pipeline per refresh</p>

              <div className={styles.pipeline}>
                <div className={styles.pipelineStep}>
                  <div className={styles.stepNum}>1</div>
                  <div className={styles.stepBody}>
                    <p className={styles.stepTitle}>Conversation Analysis</p>
                    <p className={styles.stepDesc}>
                      A fast structured analysis pass runs first. It detects conversation
                      phase (opening → deep account → commitment), mode (interview, negotiation,
                      technical, etc.), and behavioral signals using frameworks from forensic
                      interviewing, cognitive psychology, and sociolinguistics.
                    </p>
                    <div className={styles.signalList}>
                      {[
                        "Hedging / vague qualifiers",
                        "Distancing language (passive voice, vague subjects)",
                        "Unanswered questions",
                        "Topic pivots mid-answer",
                        "Over-explanation (possible concealment)",
                        "Commitment & Consistency triggers",
                        "Power dynamic imbalance",
                        "Cognitive load signals",
                        "Ambivalence patterns (yes-but)",
                        "Bold claims worth fact-checking",
                      ].map((s) => (
                        <span key={s} className={styles.signalChip}>{s}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={styles.pipelineArrow}>↓</div>

                <div className={styles.pipelineStep}>
                  <div className={styles.stepNum}>2</div>
                  <div className={styles.stepBody}>
                    <p className={styles.stepTitle}>Suggestion Generation</p>
                    <p className={styles.stepDesc}>
                      The analysis state is injected into the suggestion prompt. The model
                      picks the 3 most useful suggestion types for this exact moment — not a
                      generic mix. If a question just went unanswered, the first suggestion
                      is forced to be an ANSWER or PROBE.
                    </p>
                    <div className={styles.typeGrid}>
                      {[
                        { type: "ANSWER", color: "var(--accent-green)", desc: "Direct answer to question just asked" },
                        { type: "QUESTION", color: "var(--accent-blue)", desc: "Sharp question to ask right now" },
                        { type: "PROBE", color: "#ff9f43", desc: "Expose hedging or unanswered question" },
                        { type: "FACT_CHECK", color: "var(--accent-red)", desc: "Verify a bold claim just made" },
                        { type: "TALKING_POINT", color: "var(--accent-yellow)", desc: "Concrete fact or angle to raise" },
                        { type: "CLARIFICATION", color: "var(--accent-purple)", desc: "Expand something vague or assumed" },
                        { type: "COMMITMENT", color: "#48dbfb", desc: "Surface implications of a promise made" },
                        { type: "REBALANCE", color: "#ff6b9d", desc: "Shift the power dynamic" },
                      ].map(({ type, color, desc }) => (
                        <div key={type} className={styles.typeRow}>
                          <span className={styles.typeChip} style={{ borderColor: color, color }}>{type}</span>
                          <span className={styles.typeDesc}>{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.modelInfo}>
                <span className={styles.modelLabel}>Models</span>
                <span className={styles.modelVal}>Whisper Large V3 — transcription</span>
                <span className={styles.modelVal}>Llama 4 Maverick 17B — analysis + suggestions + chat</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button className={styles.resetBtn} onClick={handleReset}>
            Reset prompts to defaults
          </button>
          <div className={styles.footerRight}>
            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button className={styles.saveBtn} onClick={() => onSave(draft)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
