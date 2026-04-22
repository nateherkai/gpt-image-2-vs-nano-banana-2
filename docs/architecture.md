# Architecture

Evergreen design doc. For the in-flight decisions that shaped this design, see the implementation plan in `.claude/plans/`.

## Goals

1. **Two frontier image models, 30 matchups, one judge** — GPT Image 2 (`gpt-image-2-*`) vs Nano Banana 2 (`nano-banana-2`), judged by Claude Opus 4.7 running in a Claude Code session.
2. **Everything resumable** — any step can crash or be killed mid-run and the next invocation picks up exactly where it stopped. No duplicated API calls.
3. **Screen-recordable** — a localhost dashboard that's readable at 1080p, with score-reveal animations timed for a YouTube edit.

## High-level flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│  prompts/    │────▶│   generate   │────▶│  runs/<id>/       │
│  (30 json)   │     │   (script)   │     │  state.json       │
└──────────────┘     └──────────────┘     │  images/...       │
                            ▲              │  judgments/...    │
                            │ kie.ai       └──────────────────┘
                            │                      ▲   │
                     ┌──────┴─────┐                │   │
                     │  sources/  │                │   ▼
                     │ (jpg/png)  │         ┌──────┴────────────┐
                     └────────────┘         │  Claude (this     │
                                            │  Claude Code      │
                                            │  session) writes  │
                                            │  judgments/*.json │
                                            └────────┬──────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │   dashboard      │
                                            │   (Vite + React) │
                                            │   localhost:5173 │
                                            └──────────────────┘
```

Three independent agents share the run folder:

- **`generate`** — automated, resumable. Submits `createTask`, polls, downloads.
- **Claude in-session** — reads image pairs, writes judgment JSON files. No SDK.
- **`dashboard`** — read-only consumer. Reads state.json + judgments + image files.

## Data model

Single source of truth is `runs/<run-id>/state.json`, validated by `RunStateSchema` in `scripts/src/state/schema.ts`.

```
runs/<run-id>/
├── state.json              ← single-writer (generate pipeline)
├── images/
│   └── <category>/<matchup-id>/
│       ├── gpt-image-2.png
│       └── nano-banana-2.png
├── judgments/              ← single-writer (Claude in-session)
│   └── <matchup-id>.json
└── logs/
    └── run.log
```

Matchup state per model lives in `state.matchups[i].models[modelId]`:

| status        | Meaning                                                |
|---------------|--------------------------------------------------------|
| `pending`     | No task submitted yet                                  |
| `submitted`   | `createTask` returned a `taskId`; poll loop will start |
| `polling`     | Polling kie.ai for task completion                     |
| `downloaded`  | Image saved to disk at `localPath`; terminal success   |
| `failed`      | Task failed, timeout, or retries exhausted             |

Judgment state is **not** a field on the matchup. It's the filesystem. A valid `judgments/<matchup-id>.json` = judged; absence = pending.

## Write boundaries

| Who                        | Writes                                      |
|----------------------------|---------------------------------------------|
| `generate` pipeline         | `state.json`, `images/...`                  |
| Claude (in Claude Code)     | `judgments/*.json`                          |
| Dashboard                   | nothing                                     |
| User                        | `prompts/*.json`, `sources/*`, `.env`       |

No process writes the other's domain. The dashboard is strictly read-only.

## Resumability contract

The system state machine is:

```
                ┌──────── retry (--retry-failed) ────────┐
                │                                         │
pending ──► submitted ──► polling ──► downloaded  (terminal OK)
                                 │
                                 └─► failed  (terminal, retryable by flag)
```

`generate` walks every matchup × model unit and drives it toward `downloaded`:

- `pending` → submit `createTask`, set `taskId`, move to `submitted`.
- `submitted` / `polling` → poll until terminal; on success, record `remoteUrl` and download immediately.
- `downloaded` → no-op.
- `failed` → no-op unless `--retry-failed` is set (in which case reset to `pending`).

### Idempotency guarantees

- `state.json` writes go through `writeAtomic` (tmp file + rename). No partial writes.
- `StateMutator` serializes concurrent unit writes so the in-memory state never diverges from disk.
- Source uploads are keyed by SHA-256: same file = skip. Expiring soon (<1h) = re-upload.
- Image result URLs expire in 20 min; the pipeline downloads *immediately* after polling. If that fails, `POST /common/download-url` gets a fresh URL.

## Rate limiting

kie.ai publishes **20 createTask / 10 seconds**. The pipeline uses a token bucket at 20 capacity, 2/sec refill. Polling uses a separate bucket (10 capacity, 5/sec).

Concurrency caps (in `scripts/src/config.ts`) stay well under the "100+ concurrent" documented ceiling:
- `CONCURRENT_CREATE = 8`
- `CONCURRENT_POLL = 30`
- `CONCURRENT_DOWNLOAD = 6`

Retry policy: exponential backoff (2s → 60s, 5 attempts) for 429/5xx. Hard-fail on 401 (bad key), 402 (no credits), 422 (bad request).

## CLI surface

Scripts live in `scripts/src/`. Entry point is `scripts/src/index.ts`. Every command runs from the project root via `npm run <name>`:

| Command           | What it does                                                  |
|-------------------|---------------------------------------------------------------|
| `new-run`          | Create a fresh `runs/<YYYY-MM-DD-NNN>/state.json` from prompts |
| `upload-sources`   | Upload `sources/*` to kie.ai; populate `state.sources`         |
| `generate`         | Run all pending image generations (resumable)                 |
| `status`           | Generation + judging progress                                  |
| `judge-status`     | Which matchups need a judgment file, with paths                |
| `credits`          | kie.ai balance                                                 |
| `dashboard`        | Start Vite dev server on :5173                                 |

Flags supported by `generate`: `--only=<category>`, `--retry-failed`, `--limit=<n>`, `--run=<id>`. See `docs/api-reference.md` for kie.ai endpoint details.

## Dashboard

Vite + React 19 + Tailwind v4 + Framer Motion. Three views, hash-routed:

- `#/intro` — title slide
- `#/deck` — 30 slides, one matchup each; `R` reveals scores, `F` fullscreens
- `#/leaderboard` — per-category winners, overall tally, average latency

A Vite plugin at `dashboard/vite.config.ts` adds three endpoints:
- `GET /api/runs` → list of run IDs
- `GET /api/run/:id` → bundled `{state, judgments, invalid}`
- `GET /runs/:id/...` → streams image files from `../runs/`

The dashboard does not call kie.ai directly and has no write paths.

## Why the judge is in-session Claude (not the Anthropic SDK)

Early drafts orchestrated judging through `@anthropic-ai/sdk`. We swapped to in-session Claude because:

1. **One less API key** — no `ANTHROPIC_API_KEY` needed.
2. **Resumability is trivial** — judgment state = "does the JSON file exist?". No extra state machine.
3. **~200 fewer lines of orchestration** — no retry loop, no rate limiter, no batching.
4. **Same model quality** — Claude in the session and Claude through the SDK are the same model.

Trade-offs: the judging step can't run unattended. That's acceptable — this rig produces one set of judgments for one video; it's not a continuous system.

## Security

- `.env` is gitignored. Only `KIE_API_KEY` is secret.
- No Anthropic API key required anywhere.
- `sources/*.jpg` may contain faces of real people — keep out of public repos if that matters.
- `runs/<id>/images/` can get large; `.gitignore` excludes `runs/*/images/`.

## What's deliberately NOT built

- Generation variants / seeds — one image per (matchup, model). Expandable by extending the matchup schema.
- Multi-judge panels — single judge.
- Auto-video rendering — the user handles the YouTube edit manually.
- Live web-grounding tests for Nano Banana 2 — out of scope for v1.
