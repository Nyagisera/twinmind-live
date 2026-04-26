import { NextRequest, NextResponse } from "next/server";

const DEFAULT_SUGGESTION_PROMPT = `You are an expert real-time meeting copilot trained in forensic interviewing,
cognitive psychology, and sociolinguistics. A live conversation is in progress.

You have been given:
1. The recent transcript (last few minutes)
2. A structured analysis of the conversation state

Your job: generate exactly 3 suggestions to help the listener RIGHT NOW.

━━━ SUGGESTION TYPES ━━━
ANSWER         → Direct answer to a question just asked. Include the actual answer.
QUESTION       → Sharp question worth asking RIGHT NOW.
TALKING_POINT  → Concrete fact or insight that adds new information.
FACT_CHECK     → State what was claimed AND what is actually true/contested.
CLARIFICATION  → Expand something vague, assumed, or undefined.
PROBE          → Expose hedging, distancing language, or unanswered question.
COMMITMENT     → Surface a commitment just made and what it implies.
REBALANCE      → Suggest a power rebalance.

━━━ PHASE-BASED RULES ━━━
- opening       → QUESTION (open), TALKING_POINT
- exploration   → QUESTION (deepen), CLARIFICATION, FACT_CHECK
- deep_account  → PROBE (hedging), FACT_CHECK, ANSWER
- challenge     → PROBE, FACT_CHECK, REBALANCE
- commitment    → COMMITMENT, QUESTION (confirm), TALKING_POINT
- closing       → COMMITMENT, TALKING_POINT, QUESTION

━━━ BEHAVIORAL SIGNAL RULES ━━━
- question_unanswered   → First suggestion MUST be ANSWER or PROBE
- hedging_detected      → Include PROBE calling out the vagueness
- distancing_language   → Include PROBE about accountability
- bold_claim            → Include FACT_CHECK with actual facts
- commitment_made       → Include COMMITMENT card
- topic_pivot           → Include REBALANCE or PROBE
- ambivalence           → Include CLARIFICATION naming the real barrier

━━━ QUALITY RULES ━━━
1. "preview" MUST stand alone — give something immediately usable
2. Quote transcript in previews when it strengthens the suggestion
3. Never repeat these previous suggestions: {previous_titles}
4. Be hyper-specific — no generic meeting advice
5. Last 2-3 sentences of transcript carry the most weight
6. Vary types — never give 3 of the same type

Return ONLY valid JSON, no markdown:
[
  {"type": "ANSWER", "title": "Short title max 8 words", "preview": "1-2 sentence useful preview"},
  {"type": "PROBE", "title": "Short title max 8 words", "preview": "1-2 sentence useful preview"},
  {"type": "FACT_CHECK", "title": "Short title max 8 words", "preview": "1-2 sentence useful preview"}
]`;

async function analyzeConversation(
  transcript: string,
  apiKey: string
): Promise<object | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/analyze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-api-key": apiKey,
        },
        body: JSON.stringify({ transcript_context: transcript }),
      }
    );
    const data = await res.json();
    return data.state ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-groq-api-key") ?? "";
    if (!apiKey) {
      return NextResponse.json({ error: "Missing X-Groq-Api-Key header" }, { status: 401 });
    }

    const body = await req.json();
    const {
      transcript_context,
      previous_titles = [],
      system_prompt = DEFAULT_SUGGESTION_PROMPT,
    } = body;

    if (!transcript_context?.trim()) {
      return NextResponse.json({ error: "transcript_context is required" }, { status: 400 });
    }

    // Run analysis pass (graceful degradation if it fails)
    const conversationState = await analyzeConversation(transcript_context, apiKey);

    // Build state block to inject
    let stateBlock = "";
    if (conversationState) {
      const s = conversationState as any;
      stateBlock = `
CONVERSATION STATE ANALYSIS:
- Phase: ${s.phase ?? "unknown"}
- Mode: ${s.mode ?? "unknown"}
- Urgency: ${s.urgency ?? "medium"}
- Power dynamic: ${s.power_dynamic ?? "unclear"}
- Behavioral signals: ${(s.behavioral_signals ?? []).join(", ") || "none"}
- Last question: ${s.last_question ?? "none"}
- Active commitments: ${(s.active_commitments ?? []).join("; ") || "none"}
- Key claims: ${(s.key_claims ?? []).join("; ") || "none"}
`;
    }

    const previousStr =
      previous_titles.length > 0
        ? previous_titles.map((t: string) => `"${t}"`).join(", ")
        : "none";

    const systemPrompt = system_prompt.replace("{previous_titles}", previousStr);

    const userMessage = `RECENT TRANSCRIPT (last few minutes — final sentences are most important):
---
${transcript_context}
---
${stateBlock}
Generate 3 suggestions based on what is happening right now.`;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 700,
        temperature: 0.65,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return NextResponse.json({ error: `Groq error: ${err}` }, { status: 500 });
    }

    const data = await groqRes.json();
    let raw = data.choices[0].message.content.trim();

    if (raw.startsWith("```")) {
      raw = raw.split("```")[1];
      if (raw.startsWith("json")) raw = raw.slice(4);
    }

    const suggestions = JSON.parse(raw.trim());

    return NextResponse.json({ suggestions, conversation_state: conversationState });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
