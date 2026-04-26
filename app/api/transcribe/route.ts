import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-groq-api-key") ?? "";
    if (!apiKey) {
      return NextResponse.json({ error: "Missing X-Groq-Api-Key header" }, { status: 401 });
    }

    const formData = await req.formData();
    const audio = formData.get("audio") as File | null;

    if (!audio) {
      return NextResponse.json({ error: "Missing audio field" }, { status: 400 });
    }

    if (audio.size < 1000) {
      return NextResponse.json({ text: "" });
    }

    // Forward to Groq Whisper
    const groqForm = new FormData();
    groqForm.append("file", audio, "audio.webm");
    groqForm.append("model", "whisper-large-v3");
    groqForm.append("response_format", "text");
    groqForm.append("language", "en");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      return NextResponse.json({ error: `Groq error: ${err}` }, { status: 500 });
    }

    const text = await groqRes.text();
    return NextResponse.json({ text: text.trim() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
