# GPT Image 2 vs Nano Banana 2

An automated head-to-head comparison rig for two frontier image models. Generates 30 matchups across 10 categories, lets **Claude Opus 4.7 (running in Claude Code)** judge each pair, and ships with a localhost slide-deck dashboard built for screen recording.

This repo is a **template for students** — a working reference for how to wire up a real AI comparison pipeline: external model APIs, resumable batch jobs, model-as-judge, and a read-only dashboard on top of a single source-of-truth file.

## What you'll learn by reading this repo

- How to call **kie.ai** to drive two different image models through one API
- How to build a **resumable pipeline** — crash at any point, re-run, no duplicated work, no wasted API calls
- How to use **state-as-source-of-truth** (`runs/<id>/state.json`) instead of scattered side-effects
- How to use **Claude as a judge** in-session — no Anthropic SDK, no second API key, judgment state lives as files on disk
- How to build a **screen-recordable dashboard** (Vite + React + Tailwind v4 + Framer Motion) with keyboard-driven reveal animations

## Prerequisites

- **Node 20+**
- A **kie.ai API key** with credit balance — sign up at [kie.ai](https://kie.ai), grab the key, drop it in `.env`. kie.ai proxies both image models with one auth, so this is the only key you need.
- **Claude Code** — you'll open this repo in a Claude Code session and ask Claude to judge the matchups. No extra API key needed; Claude reads the images and writes JSON directly to disk.

## Setup

```bash
cp .env.example .env
# Fill in KIE_API_KEY

npm install
```

## Quickstart

```bash
# 1. Verify your kie.ai balance + that the key works
npm run credits

# 2. Bootstrap a fresh run from the 30 matchup definitions in prompts/
npm run new-run

# 3. (Option A) Generate the 6 source images via kie.ai — ~$0.12
npm run generate-sources
#    (Option B) Or drop your own jpgs into sources/ using the filenames in sources/README.md

# 4. Upload sources to kie.ai (stores public URLs in references/urls.json)
npm run upload-sources

# 5. Generate 60 images (30 matchups x 2 models). Resumable — safe to Ctrl+C and re-run.
npm run generate

# 6. Judge: open this directory in Claude Code and ask Claude to judge all pending matchups.
#    Claude will call judge-status, read image pairs, and write JSON to runs/<id>/judgments/.
npm run judge-status   # lists what still needs judging

# 7. Open the slide-deck dashboard
npm run dashboard
```

Every command is **resumable** — if `generate` or the judging pass is interrupted, re-running picks up exactly where it stopped. Nothing is duplicated; no API call is wasted.

## How the automations work

The pipeline is deliberately simple — three independent agents, one shared run folder, no message bus.

```
prompts/ ──► npm run new-run ──► runs/<id>/state.json
                                       │
                                       ▼
                               npm run generate
                                       │  (kie.ai: submit → poll → download)
                                       ▼
                               runs/<id>/images/
                                       │
                                       ▼
                          Claude in Claude Code session
                          (reads rubric from docs/judging-guide.md,
                           reads image pairs, writes JSON)
                                       │
                                       ▼
                             runs/<id>/judgments/
                                       │
                                       ▼
                             npm run dashboard  (read-only)
```

- **`scripts/`** is a [tsx](https://github.com/privatenumber/tsx)-based CLI. Each command reads `state.json`, does work, writes state atomically (tmp file + rename). Resumability falls out of the design — state on disk always reflects reality.
- **kie.ai** is the one external API. It fronts both GPT Image 2 and Nano Banana 2 with a shared submit/poll/download protocol. See `docs/api-reference.md` for endpoint details.
- **Judging is not an API call.** You open this repo in Claude Code, say "judge the pending matchups," and Claude reads PNGs using its `Read` tool (which renders images inline), applies the rubric in `docs/judging-guide.md`, and writes one JSON file per matchup. Judgment status = "does the JSON file exist?". That's the whole state machine.

## How images get made

For each of the 30 matchups in `prompts/`, for each of the two models:

1. The pipeline calls kie.ai `POST /playground/createTask` with the prompt (plus source image URLs for image-to-image matchups).
2. kie.ai returns a `taskId`. The pipeline records it in `state.json`.
3. The pipeline polls `GET /playground/recordInfo?taskId=...` until the task is `successful` or `failed`. It uses a token bucket (2 req/s) and exponential backoff on 429/5xx.
4. On success, kie.ai returns a public image URL that expires in 20 minutes. The pipeline downloads it **immediately** to `runs/<id>/images/<category>/<matchup-id>/<model>.png` and records the local path in `state.json`.
5. If anything fails, the unit's status on disk is `submitted` / `polling` / `failed`. Re-running `npm run generate` resumes from there.

All rate-limit values, concurrency caps, and retry policy are in `scripts/src/config.ts`.

## Dashboard controls

- `←` / `→` — navigate slides
- `R` — reveal scores and winner (slides start with scores hidden so you can react on camera)
- `F` — fullscreen
- `1` / `2` / `3` — jump to intro / slide deck / leaderboard

The dashboard is read-only — it reads `runs/<id>/state.json` plus all the judgment JSON files and serves image files over a small Vite plugin. It never calls kie.ai.

## Repo layout

```
prompts/        the 30 matchup definitions — edit these to change what gets tested
sources/        drop source images here for the 12 image-to-image matchups (see sources/README.md)
references/     auto-populated by upload-sources; don't edit manually
runs/<id>/      one folder per run; state.json is the source of truth (gitignored)
scripts/        the tsx CLI (see scripts/src/index.ts for the command router)
dashboard/      Vite + React + Tailwind v4 slide deck (read-only consumer of runs/)
docs/           architecture, api-reference, judging-guide, runbook
```

## Documentation

- **[`docs/architecture.md`](docs/architecture.md)** — data model, write boundaries, state machine, why the judge is in-session Claude
- **[`docs/api-reference.md`](docs/api-reference.md)** — kie.ai endpoints the pipeline uses + Claude `Read` tool patterns for judging
- **[`docs/judging-guide.md`](docs/judging-guide.md)** — rubric, JSON schema, bias notes, worked examples (read this if you're the judge)
- **[`docs/runbook.md`](docs/runbook.md)** — common failure modes and how to recover
- **[`CLAUDE.md`](CLAUDE.md)** — short guide for Claude Code sessions in this repo

## For instructors: using this as a student assignment

This repo was built for an AI engineering course. Suggested student tasks:

- **Extend the matchup set** — add 5 more prompts in a new category; re-run the pipeline end-to-end.
- **Swap a model** — wire up a third model (e.g. Midjourney via kie.ai, or Flux via Replicate) and extend the dashboard to show 3-way comparisons.
- **Reverse the judge** — instead of Claude, have each image model judge its own outputs vs the opponent's. Discuss bias.
- **Build a different dashboard view** — per-category scatter plot of `adherence` vs `detail`, or a timeline of generation latency.
- **Make it fully autonomous** — replace the in-session Claude judging step with Anthropic API calls so the pipeline can run headless on a server. What do you lose?

## License

MIT. Bring your own API keys. Don't commit your `.env`. Don't push generated run folders to a public repo (they're gitignored for a reason — images can be large, and in some categories they contain faces).
