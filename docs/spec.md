# Spec: Agentic Resume — Vanilla Rebuild

**Derived from:** intent.md, design.md
**Status:** Accepted
**Date:** 2026-10-17

---

## Functional Requirements

### FR1: Profile Panel (left, 2/5 desktop)
- Render photo, name, title, location, bio from `public/data.json`.
- Skills in three cards: Infrastructure, AI / ML, Quant Finance.
- Experience entries (role, company, period, location, achievements, technologies).
- Education entries; Projects with tech tags and optional link.
- Scrollable; full width and stacked above chat on mobile.
- Bilingual via `_es` fields + label map.

### FR2: Chat Panel (right, 3/5 desktop)
- Suggested-question **categories** (4 pills) + questions (3 pills each), EN/ES.
- Message list with user/assistant bubbles; assistant renders **markdown**.
- Input form (text input + send); disabled while streaming.
- Streaming token-by-token via `streaming-markdown` incremental parser.
- Inline error text on failure; typing indicator while awaiting first token.

### FR3: Streaming Backend
- `POST /api/chat` accepts `{ messages, language, model? }`.
- Streams `ChatOpenAI` output as **OpenAI-shaped SSE**.
- Terminates with `data: [DONE]`.
- Emits `data: {"error": "..."}` on mid-stream failure.

### FR4: Bilingual Support
- Language toggle (top-left) switches EN ⇄ ES.
- Selecting language re-renders profile + suggestions and sets `language` on requests.
- Server builds the matching system prompt; model replies in that language.

### FR5: Theming
- Theme toggle (top-right) switches light/dark.
- Persisted in `localStorage`; defaults to `prefers-color-scheme`.
- Implemented with `[data-theme]` + CSS custom properties.

### FR6: Deployment
- `wrangler pages deploy` publishes `public/` + `functions/`.
- `OPENROUTER_API_KEY` as a Pages secret; `DEFAULT_MODEL` as a var.
- `_redirects`: `/api/*` → Functions; Pages serves `index.html` and assets directly.

### FR7: No Build Step
- Frontend served verbatim; Tailwind and `streaming-markdown` via CDN.
- Only TypeScript compilation needed is `tsc --noEmit` for the Function (dev-time check).

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Time to first token (warm) | < 800 ms |
| System prompt size | < 2 KB |
| Client render work per token | O(1) DOM writes to the answer node |
| Frontend bundle (self-authored) | ~1 HTML file, no framework |
| Lighthouse performance | > 90 |
| Accessibility | > 95 |
| Mobile usability | Pass |

## Technical Architecture

See `design.md` §2. Static `public/` + one `functions/api/chat.ts`; OpenRouter upstream.

## Data Models

### `public/data.json`
```ts
interface ResumeData {
  name: string; title: string; location: string;
  bio: string; bio_es?: string; photo: string;
  skills: { infrastructure: string[]; ai: string[]; quant: string[] };
  experience: Array<{ company: string; company_es?: string; role: string; role_es?: string;
    period: string; location: string; location_es?: string;
    achievements: string[]; achievements_es?: string[]; technologies: string[] }>;
  education: Array<{ degree: string; degree_es?: string; institution: string;
    institution_es?: string; year: string; details?: string; details_es?: string }>;
  certificates: Array<{ name: string; name_es?: string; year: string; issuer: string }>;
  projects: Array<{ name: string; name_es?: string; description: string;
    description_es?: string; tech: string[]; link?: string }>;
  languages: ('en' | 'es')[];
}
```

### SSE frame
```ts
type ChatFrame = { choices: [{ delta: { content: string } }] };
type ErrorFrame = { error: string };
```

## UI/UX Specifications

Design tokens (CSS custom properties), carried over from NextResume `globals.css`:

| Token | Light | Dark |
|-------|-------|------|
| `--color-surface` | `#f7f7f6` | `#000000` |
| `--color-surface-elevated` | `#ffffff` | `#111111` |
| `--color-border` | `#d1d1d0` | `#222222` |
| `--color-text-primary` | `#111111` | `#f0f0f0` |
| `--color-text-secondary` | `#444444` | `#a0a0a0` |
| `--color-text-muted` | `#8a8a8a` | `#666666` |
| `--color-accent` | `#f59e0b` | `#f59e0b` |
| `--color-indigo` | `#374151` | `#374151` |

- Font: system UI stack (`-apple-system`, `SF Pro`, `Segoe UI`, system-ui).
- Headings `tracking-tight`; body `leading-relaxed`.
- Hover: `border-[var(--color-accent)]` + shadow; Focus: accent ring; Disabled: `opacity-50`.

## Security Considerations

- Key server-side only; never in `index.html` or client JS.
- Redact `sk-or-v1-*` from any error surfaced to the client.
- No PII logging; no KV, no cookies.
- CORS not required (same-origin `/api/chat`).

## Out of Scope (Phase 1)

- 12-question session limit / Cloudflare KV.
- Thread persistence, file upload, analytics, admin editing, voice.
- Multiple agent personalities / model selector UI.
