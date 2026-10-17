// functions/api/chat.ts
// Simplified streaming chat endpoint (openrouter-chat style) with a single
// plain-text resume system prompt loaded from content/resume.txt.
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import resumeText from "../../content/resume.txt";

interface Env {
  OPENROUTER_API_KEY: string;
  DEFAULT_MODEL?: string;
}

type Lang = "en" | "es";

interface ChatMessage {
  role?: string;
  content?: unknown;
}

interface ChatRequest {
  messages?: ChatMessage[];
  language?: string;
  model?: string;
}

const LANG_INSTRUCTION: Record<Lang, string> = {
  en: "Always respond in English.",
  es: "Responde siempre en español.",
};

// The full resume is sent as one plain-text system prompt (~1.5K tokens).
// Deliberately simple: no retrieval or tool round-trips. The model answers in
// the requested language based on LANG_INSTRUCTION.
function buildSystemPrompt(lang: Lang): string {
  return `You are an AI assistant representing the professional profile below. Answer questions about the person's background, skills, experience, education, certifications, and projects.

${LANG_INSTRUCTION[lang]}

Rules:
1. Use only the facts in the resume below. Do not invent details.
2. Be concise, professional, and friendly.
3. If asked something not covered, politely say you do not have that information.
4. Prefer short bullet points for technical answers.

---
${resumeText}`;
}

function describeError(err: unknown): string {
  const anyErr = err as { status?: number; message?: string; error?: { message?: string } };
  const status = anyErr?.status;
  const raw = String(anyErr?.error?.message ?? anyErr?.message ?? "unknown error").slice(0, 300);
  const message = raw.replace(/sk-or-v1-[A-Za-z0-9]+/g, "[redacted]");
  if (status === 401) return `OpenRouter rejected the API key (401): ${message}`;
  if (status === 402) return `OpenRouter payment required (402): ${message}`;
  if (status === 404) return `OpenRouter model not found (404): ${message}`;
  if (status === 429) return `OpenRouter rate limit (429): ${message}`;
  return `AI request failed (${status ?? "no-status"}): ${message}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let body: ChatRequest;
  try {
    body = (await ctx.request.json()) as ChatRequest;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const apiKey = ctx.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return json({ error: "OpenRouter API key not configured" }, 500);
  }

  const lang: Lang = body.language === "es" ? "es" : "en";

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const history = rawMessages
    .filter((m) => typeof m.content === "string" && (m.content as string).trim().length > 0)
    .slice(-20)
    .map((m) =>
      m.role === "assistant" || m.role === "ai"
        ? new AIMessage(String(m.content))
        : new HumanMessage(String(m.content))
    );

  if (history.length === 0) {
    return json({ error: "No messages provided" }, 400);
  }

  const model = new ChatOpenAI({
    apiKey,
    model: body.model || ctx.env.DEFAULT_MODEL || "nvidia/nemotron-3.5-lightning:free",
    temperature: 0.3,
    streaming: true,
    configuration: {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: { "X-Title": "Agentic Resume" },
    },
  });

  let stream: AsyncIterable<any>;
  try {
    stream = await model.stream([new SystemMessage(buildSystemPrompt(lang)), ...history]);
  } catch (err) {
    console.error("[chat] model.stream failed:", err);
    return json({ error: describeError(err) }, 502);
  }

  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const frame = (obj: unknown) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  (async () => {
    try {
      for await (const chunk of stream) {
        const content = (chunk as any)?.content;
        const text =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content.map((c: any) => (typeof c === "string" ? c : c?.text ?? "")).join("")
              : "";
        if (text) await frame({ choices: [{ delta: { content: text } }] });
      }
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch (err) {
      console.error("[chat] stream error:", err);
      await frame({ error: describeError(err) });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
