# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## Project overview

Head-to-head benchmark of two frontier image models — **GPT Image 2** and **Nano Banana 2** — judged by Claude Opus 4.7 running in a Claude Code session. 30 matchups, 10 categories, one localhost dashboard for recording the reveal. Both models are accessed through **kie.ai** (single aggregator API), and judging happens in-session — no Anthropic API key required.

## Commands

All commands run from repo root:

- `npm install` — installs both workspaces (scripts + dashboard)
- `npm run credits` — check kie.ai balance; also sanity-checks the API key
- `npm run new-run` — create `runs/<YYYY-MM-DD-NNN>/state.json` from `prompts/`
- `npm run generate-sources` — generate the 6 source images via kie.ai (skips if present)
- `npm run upload-sources` — upload `sources/*` to kie.ai; stores URLs in `references/urls.json`
- `npm run generate` — run all pending image generations (resumable; flags: `--only=<category>`, `--limit=<n>`, `--retry-failed`, `--run=<id>`)
- `npm run judge-status` — list matchups that still need judgment JSON
- `npm run status` — generation + judging progress
- `npm run dashboard` — Vite dev server on http://localhost:5173
- `npm run typecheck` — `tsc --noEmit` across both workspaces

## Architecture

- **`scripts/`** (TypeScript CLI) writes `runs/<id>/state.json` and downloads images to `runs/<id>/images/`.
- **Claude in-session** (you) writes `runs/<id>/judgments/<matchup-id>.json` — no SDK, no API key.
- **`dashboard/`** (Vite + React 19 + Tailwind v4) reads state + judgments + image files. Read-only.

Single source of truth is `runs/<id>/state.json`, validated by `RunStateSchema` in `scripts/src/state/schema.ts`. Every pipeline command reads state first, does work, writes state atomically. Resumable by construction.

See `docs/architecture.md` for the full design doc; `docs/api-reference.md` for kie.ai endpoint details; `docs/runbook.md` for failure-mode recovery.

## Judging (this is what you do)

When the user asks you to judge:

1. Run `npm run judge-status`. It prints every pending matchup with the absolute paths to both PNGs, the prompt, and the `write:` path for the JSON output.
2. For each pending matchup: `Read` both PNGs (the Read tool renders images inline), apply the rubric in `docs/judging-guide.md`, and `Write` the JSON to the `write:` path.
3. Re-run `npm run judge-status` at the end; it should print "All matchups have valid judgment files."

Do **not** invoke the Anthropic SDK. Do **not** spawn another Claude. You are the judge. Judgment status = "does the JSON file exist on disk?" — there's no field in `state.json` to update.

Rubric, JSON schema, bias notes, and worked example are all in `docs/judging-guide.md`. Read it once at the start of a judging session.

## Conventions

- Node 20+ required (enforced in root `package.json` engines field).
- TypeScript strict; Zod schemas validate all I/O at the boundary (`scripts/src/state/schema.ts`).
- Tailwind CSS v4 via `@tailwindcss/vite` in the dashboard.
- `.env` holds only `KIE_API_KEY`. Never commit. Never log.
- Runs are append-only — never edit a past run's `state.json` or `judgments/` by hand. Make a `new-run` if you need a fresh start.
- State writes go through `writeAtomic` (tmp file + rename) — assume no partial writes on disk.

## Adding or modifying matchups

- T2I matchups: `prompts/text-to-image.json`
- I2I matchups: `prompts/image-to-image.json` (references a filename in `sources/`)
- Source-image prompts: `prompts/source-images.json`

After editing, run `npm run new-run` to bootstrap a fresh run state that includes your changes. Existing runs are frozen.

## Common pitfalls

- **kie.ai 429s** — the pipeline has a token bucket at 2 req/sec for `createTask` and retries with exponential backoff. If you see sustained 429s, check `docs/runbook.md` — usually it means another run is racing against this one.
- **I2I source URL expiry** — kie.ai public URLs last ~3 days. `upload-sources` auto-refreshes anything within 1 hour of expiry. If `generate` fails on an I2I matchup with a 4xx, re-run `upload-sources`.
- **Resuming an interrupted generate** — just re-run `npm run generate`. Every unit's status is on disk; it skips `downloaded` and picks up `submitted` / `polling` wherever they left off.
- **Judging takes one focused session** — 30 matchups × 2 images each. Don't try to batch it across sessions — context from the rubric matters.

## What not to do

- Don't write image generation in anything other than `scripts/src/pipeline/`. The dashboard is read-only.
- Don't add an `ANTHROPIC_API_KEY` anywhere. Judging is in-session.
- Don't commit anything under `runs/`, `sources/` (except `README.md`), `references/` (except `README.md`), `assets/`, `batch-log.txt`, or `.env`. All are gitignored; keep it that way.
