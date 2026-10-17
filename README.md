Agentic Chat Interface for resume review
=======
# Agentic Resume

A bilingual (English / Spanish) interactive resume with a streaming AI assistant.
Built with **no frontend build step** — a single HTML file plus one Cloudflare
Pages Function. The assistant, **MrBot**, answers questions about the profile
(background, skills, experience, education, projects, target roles) using the
resume as grounded context.

## Features

- Split layout: profile panel (left) + AI chat (right); on mobile a
  "Profile / Chat" segmented switcher.
- Bilingual EN/ES UI and answers, with a language toggle.
- Token-by-token streaming responses rendered as Markdown.
- Suggested questions grouped by category (Experience, AI & Data, Quant &
  Trading, Education, Contact).
- Light / dark theme with persisted preference.
- Persona and résumé kept in plain-text files, editable without touching code.
- One Function, no retrieval/vendor SDK bloat — a single streaming endpoint.

## Tech stack

- **Frontend:** `public/index.html` — vanilla ES modules, Tailwind via CDN,
  [`streaming-markdown`](https://cdn.jsdelivr.net/npm/streaming-markdown) for
  incremental Markdown rendering.
- **Backend:** Cloudflare Pages Functions (`functions/api/chat.ts`) using
  `@langchain/openai` (`ChatOpenAI`) against **OpenRouter**, exposed as an
  OpenAI-shaped SSE stream.
- **Deploy target:** Cloudflare Pages (`pages_build_output_dir = "public"`).

## How it works

```
Browser (index.html)
  ├── GET /data.json      → profile panel content
  └── POST /api/chat      → SSE stream { messages, language }
                              │
                    functions/api/chat.ts
                      ├── system prompt = content/soul.txt + language + content/resume.txt
                      ├── ChatOpenAI.stream(...)  →  OpenRouter
                      └── SSE frames: data: {"choices":[{"delta":{"content":"…"}}]}
                                                   data: [DONE]
```

- The system prompt is the persona (`content/soul.txt`) plus the full résumé
  (`content/resume.txt`) and a language instruction — roughly 1.8K tokens, no
  retrieval or tool round-trips.
- Errors are streamed as `data: {"error":"…"}` and API keys are redacted before
  being surfaced.

### Chat API contract

`POST /api/chat`

```jsonc
// request
{
  "messages": [ { "role": "user", "content": "Tell me about his quant work." } ],
  "language": "en",            // "en" | "es"
  "model": "openai/gpt-4o-mini" // optional; overrides DEFAULT_MODEL
}
```

```text
// response: text/event-stream
data: {"choices":[{"delta":{"content":"Claudio "}}]}
data: {"choices":[{"delta":{"content":"builds …"}}]}
data: [DONE]
```

Non-OK responses return JSON with an `error` field (`400`, `500`, `502`).

## Project structure

```
functions/
  api/chat.ts        Streaming chat endpoint (system prompt + OpenRouter + SSE)
  types.d.ts         Module declarations for *.txt imports
content/
  soul.txt           Persona / system-prompt rules (MrBot)
  resume.txt         Canonical resume facts (grounding context)
  *.txt              Source résumés & certificates (reference material)
public/
  index.html         App shell: layout, i18n, chat client
  data.json          Profile panel content (bilingual)
  profile.png        Profile photo
  _redirects         /api/* passthrough
docs/                intent, design, spec, plan, test notes
wrangler.toml        Pages config + DEFAULT_MODEL
```

## Getting started

Prerequisites: Node.js 18+ and an [OpenRouter](https://openrouter.ai) API key.

```bash
npm install
```

Create a local env file with your key (never commit it):

```bash
# .dev.vars
OPENROUTER_API_KEY=sk-or-v1-...
```

Run locally:

```bash
npm run dev        # wrangler pages dev → http://localhost:8788
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local Pages dev server (Functions + static) |
| `npm run typecheck` | Type-check Functions with `tsc --noEmit` |
| `npm run deploy` | Deploy to Cloudflare Pages |

## Configuration

- **Default model** — set `DEFAULT_MODEL` in `wrangler.toml` (or via the
  Cloudflare dashboard). It can be overridden per request with the `model` field
  in the `/api/chat` body.
- **Context files** — edit `content/resume.txt` (facts) and `content/soul.txt`
  (persona/tone). No code changes required; the Function rebuilds automatically
  under `npm run dev`.
- **Profile panel** — edit `public/data.json` (fields use `_es` suffixes for
  Spanish).

## Deployment

```bash
npm run deploy
```

Set `OPENROUTER_API_KEY` as an environment variable/secret in the Cloudflare
Pages project (the local `.dev.vars` is for development only). `.dev.vars` is
git-ignored — keep it out of version control and rotate the key if it leaks.

## Documentation

See `docs/` for `intent.md`, `design.md`, `spec.md`, `plan.md`, and `test.md`.
