# Plan: Agentic Resume — Vanilla Rebuild

**Derived from:** spec.md, design.md
**Status:** In Progress
**Date:** 2026-10-17
**Project root:** `/home/user/Projects/nextResumeUpgrade`

---

## Phase 1: Scaffold & Config
- [x] `package.json` — wrangler + `@langchain/openai` + `@langchain/core`; `dev`/`deploy`/`typecheck`
- [x] `wrangler.toml` — Pages config, `DEFAULT_MODEL` var
- [x] `tsconfig.json` — strict, `resolveJsonModule`, workers types
- [x] `.gitignore` — `node_modules/`, `.wrangler/`, `.dev.vars`
- [x] `.dev.vars.example` — placeholder for `OPENROUTER_API_KEY`
- [x] `docs/` — intent / design / spec / plan / test

## Phase 2: Assets & Data
- [x] `public/data.json` — copied from NextResume resume data
- [x] `public/profile.png` — copied from NextResume `static/`
- [x] `public/_redirects` — `/api/*` passthrough + SPA fallback

## Phase 3: Frontend (`public/index.html`)
- [x] Tailwind CDN + theme tokens + component CSS
- [x] Layout shell: lang toggle, theme toggle, `aside#profile`, `main` chat
- [x] `renderProfile(lang)` from `data.json` (skills, experience, education, projects)
- [x] Suggested-question categories + pills (EN/ES)
- [x] `addMessage` + submit flow with `streaming-markdown` SSE reader
- [x] Theme + language persistence and re-render

## Phase 4: Backend (`functions/api/chat.ts`)
- [x] `buildSystemPrompt(lang)` from `data.json` (< 2 KB)
- [x] `onRequestPost`: validate, map history, `ChatOpenAI.stream`
- [x] `TransformStream` → OpenAI-shaped SSE + `[DONE]`
- [x] Redacted error frames; no key leakage

## Phase 5: Verify
- [x] `npm install`
- [x] `npm run typecheck` → 0 errors
- [x] `wrangler pages dev` boots; serves `/`, `/data.json`, `/profile.png`; `/api/chat` returns 400/500 correctly
- [ ] Live chat smoke + compare TTFT against openrouter-chat (needs a real key)

## Phase 6: Deploy
- [ ] Create Pages project / set `OPENROUTER_API_KEY` secret
- [ ] `npm run deploy`
- [ ] Rotate the API key glimpsed in source `.dev.vars` files

---

## Critical Path

```
public/data.json ─────────────┬──> public/index.html (renderProfile)
                              └──> functions/api/chat.ts (buildSystemPrompt)
public/index.html (SSE reader) >── POST /api/chat ──> OpenRouter
```

## Commands Reference

```bash
npm install
npm run dev          # wrangler pages dev  (local Pages emulator)
npm run typecheck    # tsc --noEmit
npm run deploy       # wrangler pages deploy
```

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| CDN outage (Tailwind / streaming-markdown) | Acceptable for Phase 1; vendor locally if needed |
| Model rate limits on free tier | Configurable `DEFAULT_MODEL`; optional per-request override |
| Prompt too small for deep questions | Structured data covers all resume facts; expand sections if gaps found |
| JSON import in Functions bundle | Validated by `typecheck` + `wrangler pages dev` run |

## Definition of Done

- [ ] `npm run typecheck` passes (0 errors)
- [ ] Profile + chat render at both breakpoints; theme/lang toggles work
- [ ] Chat streams token-by-token with markdown, `[DONE]` terminates cleanly
- [ ] TTFT comparable to openrouter-chat
- [ ] Deployed to Cloudflare Pages; secret configured; key rotated
