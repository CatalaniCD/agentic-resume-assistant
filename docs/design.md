# Design: Agentic Resume — Vanilla Rebuild

**Derived from:** intent.md
**Status:** Accepted
**Date:** 2026-10-17

---

## 1. Design Goal

Combine the **presentation** of NextResume with the **runtime behavior** of openrouter-chat.
Concretely: keep the split-screen resume layout and bilingual UX; replace the streaming and
backend with a no-build static page + a single streaming Function.

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Cloudflare Pages                       │
│                                                              │
│   public/  (static, no build)      functions/api/chat.ts      │
│   ├── index.html  (Tailwind CDN + vanilla JS module)          │
│   ├── data.json   (resume data; also imported by the Function)│
│   ├── profile.png                                             │
│   └── _redirects                                              │
└───────────────────────────┬──────────────────────────────────┘
                            │  POST /api/chat  (JSON in, SSE out)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                     OpenRouter (OpenAI-compatible)            │
│            ChatOpenAI.stream() → default free model           │
└──────────────────────────────────────────────────────────────┘
```

No Cloudflare KV, no Hono, no LangGraph, no CopilotKit. The Function imports
`public/data.json` and builds a compact bilingual system prompt at request time.

## 3. Why This Is Faster

| Cause in NextResume | Fix in rebuild |
|---------------------|----------------|
| 16 KB markdown in system prompt | Build prompt from structured `data.json` only (≈1 KB); no markdown blob |
| Per-token React `setState` | Vanilla DOM; chunks written straight into the answer node via `streaming-markdown` |
| Hono/LangGraph/CopilotKit weight | Single-function bundle: `@langchain/openai` + `@langchain/core` only |
| Hardcoded model | `DEFAULT_MODEL` env, override supported per request |

## 4. Frontend Structure (`public/index.html`)

Single HTML file. Three script/style regions:

- **Tailwind CDN** (`https://cdn.tailwindcss.com`) for utility classes, incl. arbitrary
  values like `bg-[var(--color-surface)]`.
- **`<style>`** holding NextResume's design tokens as CSS custom properties for
  `[data-theme="light"|"dark"]`, plus plain-CSS component classes (`.card`, `.btn-primary`,
  `.input-field`, `.section-title`, `.scrollbar-thin`).
- **`<script type="module">`** with the app logic and the `streaming-markdown` CDN import.

DOM shell:

```
body (h-screen flex flex-col md:flex-row overflow-hidden)
├── button#langToggle      (fixed top-left; EN/ES)
├── button#themeToggle     (fixed top-right; sun/moon via [data-theme])
├── aside#profile          (md:w-2/5, overflow-y-auto)  ← rendered from data.json
└── main                   (md:w-3/5, flex flex-col)
    ├── header: suggested questions (category pills + question pills)
    ├── div#messages       (flex-1 overflow-y-auto)
    └── form#form          (input#input + button#send)
```

### Client state

```ts
type Lang = 'en' | 'es'
interface AppState {
  lang: Lang
  data: ResumeData | null
  categoryIndex: number          // avoids language/name mismatch
  messages: { role: 'user' | 'assistant'; content: string }[]  // sent to API
  loading: boolean
}
```

Language toggle re-renders the profile panel and suggestion pills; message history is kept.
Suggested categories are indexed (0–3) so the selection survives a language switch.

## 5. Chat Streaming (ported from openrouter-chat)

```
submit(text)
  ├─ push user msg, append user bubble
  ├─ append assistant bubble with "…"
  ├─ renderer = smd.default_renderer(assistantEl)
  ├─ parser   = smd.parser(renderer)
  ├─ fetch POST /api/chat { messages, language }
  ├─ read body via getReader(); split on "\n"
  ├─ per "data: " line: parse choices[0].delta.content → smd.parser_write(parser, delta)
  └─ on "[DONE]": smd.parser_end(parser); release input
```

No per-token app state mutation — only the answer node is touched.

## 6. Backend (`functions/api/chat.ts`)

```ts
export const onRequestPost: PagesFunction<Env> = async (ctx) => { ... }
interface Env { OPENROUTER_API_KEY: string; DEFAULT_MODEL?: string }
```

Flow:

1. Parse `{ messages, language, model? }`.
2. Reject 500 if `OPENROUTER_API_KEY` missing; 400 on invalid body / empty messages.
3. Map history: `role:'assistant'` → `AIMessage`, otherwise `HumanMessage`.
4. Prepend `SystemMessage(buildSystemPrompt(language))` (compact; built from `data.json`).
5. `ChatOpenAI({ baseURL:'https://openrouter.ai/api/v1', streaming:true })`.
6. Pipe `model.stream()` → `TransformStream` → SSE: each chunk as
   `data: {"choices":[{"delta":{"content":"<text>"}}]}\n\n`, then `data: [DONE]\n\n`.
7. On upstream failure, emit a redacted `data: {"error":...}` frame instead of leaking keys.

## 7. System Prompt Design

Built at request time by `buildSystemPrompt(lang)`, sourcing the requested-language fields
from `data.json`:

- Header + language instruction (`Always respond in English` / `Responde siempre en español`).
- Rules: stick to facts, be concise/professional, decline unknown topics, prefer bullets.
- Sections: Profile, Skills (Infrastructure / AI-ML / Quant), Experience, Education,
  Certifications, Projects.

Budget: **< ~2 KB** (vs ~16 KB previously). The long-form `content/*.md` is intentionally
**not** included.

## 8. API Contract

### `POST /api/chat`

Request:
```json
{
  "messages": [{ "role": "user", "content": "What is your current role?" }],
  "language": "en",
  "model": "optional-override"
}
```

Response: `text/event-stream`
```
data: {"choices":[{"delta":{"content":"Claudio "}}]}
data: {"choices":[{"delta":{"content":"is a "}}]}
data: [DONE]
```
Error frame (stream-time): `data: {"error":"..."}`.

## 9. Data Model

`public/data.json` — same shape as NextResume `resume/data.json`:
`name, title, location, bio, bio_es, photo, skills{infrastructure,ai,quant}, experience[],
education[], certificates[], projects[], languages[]`. Bilingual variants use `_es` suffixes.

## 10. Security

- `OPENROUTER_API_KEY` never reaches the browser; server-only via `ctx.env`.
- Error messages redact `sk-or-v1-*` tokens.
- Resume facts are public by nature; no user PII is stored or logged.
- `_redirects` passes `/api/*` through Functions; Pages serves `index.html` and static assets directly.

## 11. Trade-offs / Rejected Alternatives

- **Keep React, fix streaming only** (earlier option): smaller visual risk but retains the
  Vite build, per-token reconciliation, and dependency weight. Rejected in favor of the
  no-build target.
- **Keep KV question limit:** adds latency and a binding for little value now. Deferred.
- **Bundle `streaming-markdown` locally:** avoids a CDN dependency but breaks the "no build"
  property; CDN import kept for Phase 1.
