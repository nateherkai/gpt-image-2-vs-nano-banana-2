# Runbook

Failure modes and recovery procedures for the comparison rig.

## Golden rule: run again

Every command is idempotent. If generate/upload-sources/anything crashes halfway, **just re-run the same command**. The state file tracks per-unit progress and the second run picks up where the first stopped.

## Commands for diagnosis

```bash
npm run status              # per-category gen + judge tally, failed units, source expiry
npm run judge-status        # which matchups still need a judgment file
npm run credits             # kie.ai credit balance
DEBUG=1 npm run <cmd>       # include full stack trace on error
```

The source of truth is always `runs/<run-id>/state.json`. You can open it in any editor.

## Common failures

### "KIE_API_KEY missing from environment"

`.env` at the project root is missing or doesn't contain `KIE_API_KEY=<value>`. `scripts/src/index.ts` loads `<root>/.env` explicitly — it does *not* respect `scripts/.env`.

### "Error: kie.ai 401"

Bad or expired API key. Regenerate on kie.ai and update `.env`.

### "Error: kie.ai 402"

Out of credits. `npm run credits` to confirm; top up on kie.ai. Generate will hard-fail on the first unit it submits rather than burning through whatever balance is left.

### "kie.ai 429" spam in logs

Rate limited. The client already retries with exponential backoff (up to 5 attempts, capped at 60s). If it exhausts retries, units will go to `failed`. Reasons it might happen despite the token bucket:
- Multiple copies of `generate` running simultaneously — don't.
- kie.ai tightened the published limit without warning — tune `RATE_LIMIT_CREATE` in `scripts/src/config.ts` lower.

Rerun with `npm run generate -- --retry-failed` to pick up the failed units.

### "Task <id> polling timed out after 600s"

A task stayed in `waiting|queuing|generating` longer than 10 min. Usually a kie.ai-side slowdown. Unit is marked `failed`; retry with `--retry-failed`. If it persists:
1. Check kie.ai status page.
2. Look at `state.json` for the `taskId` — you can hit `/jobs/recordInfo?taskId=...` manually to see what's happening.

### "Task succeeded but returned no resultUrls"

kie.ai reported success but no image URL. This is a kie.ai bug. Mark failed and retry with `--retry-failed`; if it repeats, file with kie.ai support and try a fresh task.

### "Source image X not uploaded"

You ran `generate` before `upload-sources`, or a source file was added to `sources/` after the fact. `npm run upload-sources` is idempotent — re-run it. It skips files whose SHA-256 and expiry haven't changed.

### Source URL expired (3-day TTL)

`upload-sources` checks each source's `expiresAt`; if it's within 1 hour of expiry, it re-uploads and writes the new URL to `state.json`. Just re-run `upload-sources` before resuming generation after a gap of ≥3 days.

### Image result URL expired (20-min TTL)

The generate pipeline downloads the image immediately after polling completes, so this is rare. If it happens (long pause between poll success and download), the client calls `POST /common/download-url` to refresh. If that fails too, the unit goes to `failed`; re-run with `--retry-failed` to re-submit.

### state.json corrupted

`writeState` uses atomic rename (write to `state.json.tmp`, then `fs.rename`), so a crash mid-write cannot produce a partial file. If `state.json` somehow gets corrupted:

```bash
# Recover from the most recent backup... there is none. There's no automatic backup.
# But git status + git checkout HEAD -- runs/<id>/state.json works if you've committed.
```

You can also hand-fix. `RunStateSchema` in `scripts/src/state/schema.ts` documents the shape. Worst case: bootstrap a fresh run (`npm run new-run`) and re-run — generated images in `runs/<id>/images/` from the old run won't be detected, so you'll regenerate, but that's the fallback.

### "Warning: matchup X references source Y which is not uploaded"

Pre-flight warning from `generate`. You're missing a source file; the matchup will error when generate reaches it. Fix before it gets there:

```bash
# Drop the missing image into sources/, then:
npm run upload-sources
```

### Dashboard: "No runs yet"

`runs/` is empty. `npm run new-run`, then refresh.

### Dashboard: blank page, console errors about `@shared/types`

`scripts/` workspace not installed. From the root: `npm install`.

### Dashboard can't find images

The Vite plugin serves `/runs/<id>/...` by streaming from `../runs/<id>/...` on disk. If nothing shows up:
- `ls runs/<id>/images/` — do the PNGs exist?
- Check Vite dev server terminal for errors about path escape (`403 Forbidden`).

## How to manually re-run one matchup

Open `runs/<id>/state.json`, find the matchup, and edit one or both model entries:

```jsonc
{
  "status": "pending",          // reset
  "attempts": 0,                // optional reset
  // delete: taskId, submittedAt, completedAt, costTimeMs, remoteUrl,
  //         remoteUrlExpiresAt, localPath, fileSizeBytes, lastError
}
```

Then `npm run generate -- --only=<category>`. The pipeline will re-submit just that unit.

## How to wipe and start over

```bash
rm -rf runs/<id>        # nuke a specific run
npm run new-run         # bootstrap a new one
```

Nothing else in the repo is modified by the scripts — prompts, sources, state all stay put.

## How to inspect a live task on kie.ai

```bash
curl -H "Authorization: Bearer $KIE_API_KEY" \
  "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<taskId>"
```

The `state` field tells you what kie.ai thinks is happening. `resultJson` contains the URL once `state=success`.
