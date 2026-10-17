# Test & Eval Plan: Agentic Resume — Vanilla Rebuild

**Derived from:** spec.md, plan.md
**Status:** Active
**Date:** 2026-10-17

---

## 1. Single-Command Verification

The repo exposes one command that must pass before "done":

```bash
npm run typecheck    # tsc --noEmit over functions/
```

Type errors block completion. Functional verification is manual/automated below because the
frontend is buildless. A future `npm run test` (Vitest) may cover the prompt builder; see §5.

## 2. Layer-by-Layer Checks

### 2.1 Backend — `functions/api/chat.ts`
- **Health of contract:** `curl -N -X POST localhost:8788/api/chat` with a sample body →
  observe `data: {"choices":[{"delta":{"content":"..."}}]}` frames ending in `data: [DONE]`.
- **Missing key:** unset `OPENROUTER_API_KEY` → 500 JSON, no crash.
- **Invalid body:** empty/non-JSON → 400.
- **Empty messages:** `[]` → 400.
- **Bilingual:** same question with `language: "en"` vs `"es"` → replies in the right language.
- **Redaction:** force an upstream 401 → error text contains `[redacted]`, never the key.

### 2.2 Prompt builder — `buildSystemPrompt(lang)`
- EN prompt contains the English language instruction; ES contains the Spanish one.
- All resume sections present (Profile, Skills, Experience, Education, Certifications, Projects).
- Output length `< 2 KB` (guards against re-introducing the markdown blob).

### 2.3 Frontend — `public/index.html`
- Profile renders every section from `data.json`; photo fallback works if `profile.png` 404s.
- Language toggle re-renders profile + suggestion pills; selection survives the switch.
- Theme toggle flips `[data-theme]`, persists to `localStorage`, respects system preference.
- Suggested-question pill and typed submit both call `submit()`.
- Streaming: markdown appears progressively; input disabled during stream, re-enabled after.
- Error path: kill the function → inline error text appears; UI stays usable.

## 3. Manual Smoke Checklist (pre-deploy)

- [ ] `npm run dev`, open `http://localhost:8788`.
- [ ] Left panel: photo, name, title, location, bio, 3 skill cards, experience, education, projects.
- [ ] Right panel: 4 category pills, 3 question pills, greeting, input.
- [ ] Ask "What is your current role?" → streams fast; `[DONE]` closes cleanly.
- [ ] Toggle to ES → labels + content switch; ask in Spanish → Spanish answer.
- [ ] Toggle theme both ways; reload → preference retained.
- [ ] Resize to mobile → profile stacks above chat, both scroll.

## 4. E2E (Playwright, optional Phase 1.5)

Port the smoke specs from NextResume `e2e/`:

```
e2e/vanilla.spec.ts
  - layout: aside visible ≥ md, main visible, toggles present
  - theme: click → html[data-theme] flips; persists after reload
  - language: click → suggestion labels change EN↔ES
  - chat: intercept /api/chat with a mocked SSE → assert streamed text renders
```

Run with `npx playwright test` once `@playwright/test` is added.

## 5. Continuous Evals (adopt after Phase 6)

Maintain a fixed set of **10–20 real questions** run non-interactively against the deployed
app. Record, per run: **TTFT (ms)**, total time, first-token correctness, language.

Baseline eval set (EN/ES pairs):

| # | Prompt | Expect |
|---|--------|--------|
| 1 | What is your current role? | Role + company from data.json |
| 2 | List your core infrastructure skills. | TypeScript, React, … |
| 3 | What quant finance experience do you have? | Quant skills list |
| 4 | What certifications do you hold? | AWS, CKA, … |
| 5 | Where are you located? | Location field |
| 6 | Describe your education. | Degree + year |
| 7 | What projects have you built? | Agentic Resume, … |
| 8 | ¿Cuál es tu rol actual? | Spanish answer |
| 9 | (off-topic) What's the weather? | Polite decline |
| 10 | Are you open to opportunities? | Grounded, professional |

Gate any change to `CLAUDE.md` / prompt / model on: **TTFT within 1.2× baseline** and
**≥ 9/10 grounded answers**. Every production mis-answer becomes eval #N+1.

## 6. Regression / Bug Protocol

For any bug: add the smallest failing check first (eval row or Playwright assertion), then fix
until green. Do not widen tests to pass; fix the cause.

## 7. Definition of Test-Done

- [ ] `npm run typecheck` clean
- [ ] §3 smoke checklist fully passes
- [ ] Eval set ≥ 9/10 grounded, TTFT within target
- [ ] No secret material in any response, log, or client asset
