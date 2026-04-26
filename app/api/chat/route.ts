import { NextRequest } from "next/server";

const DEFAULT_SYSTEM_PROMPT = `You are an expert real-time meeting assistant — part analyst, part strategist, part coach.
You have full context of an ongoing conversation via the transcript.

Guidelines:
- Be specific — quote or paraphrase what was actually said in the transcript
- Aim for 150-300 words — complete but not padded
- If answering a question: give the actual answer with supporting detail
- If fact-checking: state what was claimed, what is true, and why it matters
- If probing behavior: explain the pattern and suggest a direct follow-up
- Use plain prose — avoid bullet points unless listing genuinely parallel items
- End with one concrete next action or follow-up the user could use right now
- Never say "Great question", "Certainly!", or similar filler`;

const EXPAND_PROMPT = `You are an expert meeting assistant — part analyst, part strategist, part coach.
A user clicked on a suggestion card during a live conversation.

Structure your answer:
1. The core insight — 2-3 sentences
2. Supporting detail from the transcript — 2-3 sentences
3. Exactly what to do or say next — 1-2 sentences, concrete and immediately usable

Total: 200-400 words. Tone: direct, confident, no filler.`;

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-groq-api-key") ?? "";
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing X-Groq-Api-Key header" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      full_transcript,
      chat_history = [],
      user_message,
      system_prompt = DEFAULT_SYSTEM_PROMPT,
      is_suggestion_click = false,
    } = body;

    if (!user_message?.trim()) {
      return new Response(JSON.stringify({ error: "user_message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const chosenPrompt = is_suggestion_click ? EXPAND_PROMPT : system_prompt;

    const systemContent = `${chosenPrompt}

FULL CONVERSATION TRANSCRIPT:
---
${full_transcript?.trim() || "(No transcript yet — answer based on the question alone)"}
---`;

    const messages = [
      { role: "system", content: systemContent },
      ...chat_history,
      { role: "user", content: user_message },
    ];

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-maverick-17b-128e-instruct",
        messages,
        max_tokens: 1000,
        temperature: 0.6,
        stream: true,
      }),
    });

    if (!groqRes.ok || !groqRes.body) {
      const err = await groqRes.text();
      return new Response(JSON.stringify({ error: `Groq error: ${err}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Transform Groq SSE stream → our SSE format
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = groqRes.body!.getReader();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                return;
              }
              try {
                const parsed = JSON.parse(payload);
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
                  );
                }
              } catch {
                // skip malformed lines
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    return new Response(
      `data: ${JSON.stringify({ error: e.message })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } }
    );
  }
}
