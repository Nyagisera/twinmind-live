import { NextRequest, NextResponse } from "next/server";

const ANALYSIS_PROMPT = `You are an expert conversation analyst trained in forensic interviewing,
cognitive psychology, and sociolinguistics. Analyze this transcript and return a structured
JSON object describing the current state of the conversation.

Analyze for these signals:

1. CONVERSATION PHASE: opening | exploration | deep_account | challenge | commitment | closing | unknown
2. CONVERSATION MODE: interview | sales_pitch | technical_discussion | brainstorm | negotiation | status_update | casual | unknown
3. BEHAVIORAL SIGNALS (array, pick all that apply):
   question_unanswered | hedging_detected | distancing_language | over_explanation |
   topic_pivot | commitment_made | bold_claim | contradiction_possible | ambivalence | cognitive_load_high | none
4. POWER DYNAMIC: balanced | listener_passive | listener_dominant | unclear
5. LAST QUESTION: the most recent question asked, or null
6. ACTIVE COMMITMENTS: array of short strings, or []
7. KEY CLAIMS: array of bold factual claims made, or []
8. URGENCY: high | medium | low

Return ONLY valid JSON, no markdown:
{
  "phase": "exploration",
  "mode": "interview",
  "behavioral_signals": ["question_unanswered"],
  "power_dynamic": "listener_passive",
  "last_question": "What happened with Q3?",
  "active_commitments": [],
  "key_claims": [],
  "urgency": "high"
}`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-groq-api-key") ?? "";
    if (!apiKey) {
      return NextResponse.json({ error: "Missing X-Groq-Api-Key header" }, { status: 401 });
    }

    const body = await req.json();
    const { transcript_context } = body;

    if (!transcript_context?.trim()) {
      return NextResponse.json({ error: "transcript_context is required" }, { status: 400 });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
        messages: [
          { role: "system", content: ANALYSIS_PROMPT },
          {
            role: "user",
            content: `TRANSCRIPT TO ANALYZE:\n---\n${transcript_context}\n---\n\nReturn the conversation state JSON.`,
          },
        ],
        max_tokens: 400,
        temperature: 0.2,
      }),
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return NextResponse.json({ error: `Groq error: ${err}` }, { status: 500 });
    }

    const data = await groqRes.json();
    let raw = data.choices[0].message.content.trim();

    // Strip markdown fences
    if (raw.startsWith("```")) {
      raw = raw.split("```")[1];
      if (raw.startsWith("json")) raw = raw.slice(4);
    }

    const state = JSON.parse(raw.trim());
    return NextResponse.json({ state });
  } catch (e: any) {
    // Graceful degradation — analysis failing shouldn't block suggestions
    return NextResponse.json({ state: null, error: e.message });
  }
}
