# Intent: Agentic Resume — Vanilla Rebuild (Fast Chat)

**Author:** Claudio Catalani (Quantitative Developer / AI Engineer)
**Status:** Draft → Accepted
**Date:** 2026-10-17
**Supersedes (in part):** `/home/user/Projects/NextResume/docs/intent.md`

---

## Problem

The current **NextResume** site renders a polished split-screen resume with an AI chat, but
**time-to-first-token (TTFT) is poor** — chat feels sluggish compared to the
**openrouter-chat** project, which streams almost instantly against the same OpenRouter
provider.

Review of both codebases identified four contributing causes:

1. **Oversized system prompt** — `worker/markdownContent.ts` (~16 KB, ≈4 K tokens) is baked
   into every request via `worker/resumeLoader.ts`, so the model must ingest the full prefix
   before emitting token #1.
2. **Per-token re-render** — `src/components/ChatPanel.tsx:162-169` calls `setMessages` for
   **every** stream chunk, re-rendering the whole message list per token.
3. **Heavy edge bundle / cold start** — Hono + `@langchain/langgraph` + `@copilotkit/*`
   (unused at runtime) inflate the Pages Function.
4. **Un-tunable model** — `worker/agent.ts:14` hardcodes `nvidia/nemotron-3.5-lightning:free`
   and ignores the `MODEL` env var.

## Proposed Outcome

A single **vanilla (no build step)** Cloudflare Pages app that keeps NextResume's **visual
layout** while adopting openrouter-chat's **fast chat path and simplified backend**:

- **Left panel (2/5 desktop):** unchanged profile — photo, bio, skills, experience,
  education, projects — driven by `public/data.json`, bilingual EN/ES.
- **Right panel (3/5 desktop):** chat with suggested-question pills, but streaming via
  **direct DOM writes + incremental `streaming-markdown`** (no framework re-render).
- **One backend function:** `functions/api/chat.ts` (~openrouter-chat size) emitting
  **OpenAI-shaped SSE**, with a **concise resume system prompt** and language selection.
- **Theme toggle** (light/dark) and **language toggle** (EN/ES) preserved.

## Affected Users and Systems

| User | Interaction |
|------|-------------|
| Recruiters / hiring managers | Ask questions; expect instant first token |
| Potential collaborators | Explore background interactively, EN/ES |

| System | Role |
|--------|------|
| Cloudflare Pages | Static hosting (`public/`) + Functions (`functions/api/chat.ts`) |
| OpenRouter | LLM API gateway (free models) |
| LangChain `ChatOpenAI` | Streaming client inside the Function |
| `streaming-markdown` (CDN) | Incremental markdown rendering in the browser |

## Constraints

- **Deploy target:** Cloudflare Pages free tier; edge runtime only (no Node APIs in worker).
- **No frontend build step** — `public/index.html` is served as-is (Tailwind via CDN).
- **API contract:** OpenAI-shaped SSE (`choices[0].delta.content`) to match openrouter-chat.
- **Performance target:** TTFT < 800 ms on a warm function (spec.md NFR).
- **Bilingual:** EN/ES for UI labels, resume content, suggestions, and system prompt.
- **Secrets:** `OPENROUTER_API_KEY` only in `.dev.vars` (local) / Pages dashboard (prod).
  The key present in the source projects must be rotated before reuse.
- **No PII in logs**; session/thread handling stays client-side.

## Open Questions

1. Keep the **question limit / KV session counter** from the old spec? (Proposed: **drop** in
   Phase 1 — it adds KV latency and isn't needed for speed.)
2. Expose a **model selector** in the UI, or fix the model server-side? (Proposed: server-side
   `DEFAULT_MODEL`, no UI selector.)
3. Persist thread history across reloads? (Proposed: **no**, in-memory only, as today.)
4. Delete the NextResume React project after parity, or keep it as the "rich" variant?

## Success Signal

Side-by-side, the rebuilt app reaches first token in **roughly the same time as
openrouter-chat** for an equivalent question, while preserving the NextResume layout.
