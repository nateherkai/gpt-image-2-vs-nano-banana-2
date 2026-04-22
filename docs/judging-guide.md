# Judging Guide

This doc is for **Claude running in a Claude Code session on this repo**. It covers the rubric, the required JSON file format, and the workflow for judging the 30 matchups.

## TL;DR for Claude

1. `npm run judge-status` — lists matchups that still need a judgment file, with the absolute path to both PNGs, the prompt, and the `write:` path for the JSON output.
2. For each pending matchup: `Read` both image files (the `Read` tool renders PNGs inline), apply the rubric below, write a JSON file to the `write:` path.
3. Re-run `npm run judge-status` at the end to confirm nothing is invalid.

Do **not** invoke the Anthropic SDK. Do **not** shell out to another Claude. You are the judge.

---

## The rubric

Score each image **on its absolute merit**, independent of the other image. Do not grade on a curve. Scores are integers 1–10.

| Axis        | What it measures                                                                 |
|-------------|----------------------------------------------------------------------------------|
| `realism`   | For photo prompts: does it look like a real photograph? For art prompts: is it coherent and convincing within its style? |
| `adherence` | How completely did it execute the prompt? Count specific asks fulfilled, penalize omissions/hallucinations. |
| `detail`    | Texture, edges, lighting, anatomy, background coherence. Zoom mentally — does it hold up?              |
| `text`      | Only when the prompt asks for rendered text/labels/typography. Score legibility + spelling. `null` if no text was requested. |
| `overall`   | Holistic quality as a final deliverable. Not an average — your gestalt rating.   |

### Scale anchors

- **1–3** — broken: wrong subject, severe distortion, unreadable text.
- **4–5** — usable but flawed: clearly AI, obvious artifacts, partial prompt execution.
- **6–7** — solid: would pass a casual look, minor issues on close inspection.
- **8–9** — excellent: near-indistinguishable from pro output, executes the prompt fully.
- **10** — flawless for this category. Don't hand these out casually.

### When to use `null` for `text`

Set `text: null` when the prompt has no text-rendering requirement. Examples:
- Portrait with no label/sign → `null`
- Landscape without signage → `null`
- Product shot with explicit brand/model text in the prompt → score it
- UI mockup / packaging / poster / diagram — always score `text`

If one image renders text and the other doesn't, still use `null` for both if the prompt didn't ask for text.

### Picking a winner

- `"winner": "gpt-image-2"` or `"nano-banana-2"` — one model is clearly better overall.
- `"winner": "tie"` — within ~1 point on `overall`, no decisive per-axis advantage.

Don't force ties to avoid hard calls; don't force winners to avoid ties. The `overall` score should align with your pick.

### The verdict

One sentence, ≤25 words, the kind of line you'd say out loud in a YouTube voiceover. Specific, not generic.

- Good: *"GPT Image 2 nails the serif typography while Nano Banana 2 mangles the tagline into nonsense."*
- Bad: *"GPT Image 2 produced a better image than Nano Banana 2."*

### The reasoning

One paragraph, ≤200 words. Call out the specific observations that drove each axis score. If a score seems surprising, explain.

---

## JSON file format

Write to `runs/<run-id>/judgments/<matchup-id>.json`. Exact path is in the `write:` field of `judge-status` output.

```json
{
  "matchupId": "text-typography__01-vintage-poster",
  "judgedAt": "2026-04-21T15:30:00Z",
  "judgeModel": "claude-opus-4-7 (Claude Code)",
  "scores": {
    "gpt-image-2":   { "realism": 8, "adherence": 9, "detail": 9, "text": 10, "overall": 9 },
    "nano-banana-2": { "realism": 7, "adherence": 8, "detail": 8, "text": 6,  "overall": 7 }
  },
  "winner": "gpt-image-2",
  "verdict": "GPT Image 2 nailed the vintage typography while Nano Banana 2 fudged the tagline into gibberish.",
  "reasoning": "GPT Image 2's title logotype shows crisp kerning and consistent weathering across all letterforms; the gold border integrates with the paper texture rather than floating on top. Nano Banana 2 got the overall composition right but dropped two letters from the tagline and rendered the art-deco corners with visible smearing. Both handle the red glow well (hence similar realism), but GPT's execution is markedly cleaner at full resolution."
}
```

### Field rules

- `matchupId` — must match the filename (minus `.json`). Copy from the `judge-status` output.
- `judgedAt` — ISO 8601 UTC timestamp, `new Date().toISOString()`.
- `judgeModel` — `"claude-opus-4-7 (Claude Code)"` verbatim. Or whatever model you are (opus 4.7 is the default).
- `scores` — both `gpt-image-2` and `nano-banana-2` keys required. All 5 axes required per model. `text` may be `null`.
- `winner` — one of `"gpt-image-2"`, `"nano-banana-2"`, `"tie"`.
- `verdict` — 1 sentence, ≤25 words.
- `reasoning` — 1 paragraph, ≤200 words.

`JudgmentFileSchema` in `scripts/src/state/schema.ts` validates this shape. Malformed files are reported by `judge-status` as "invalid."

---

## Bias notes

Known confounders — try to control for them:

- **Position bias**: you know which file is `gpt-image-2.png` and which is `nano-banana-2.png`. Evaluate per-image on absolute merit, then compare, rather than the other way around.
- **Resolution bias**: images may differ in resolution (GPT Image 2 is 1024, Nano Banana 2 defaults to 2K in this rig). Don't just reward "sharper" — a crisper image of a wrong subject still misses on adherence.
- **Style familiarity**: OpenAI's house look (slightly shiny, symmetric) and Google's house look (slightly softer, more candid) are recognizable. Don't reward either just for being typical.
- **"More is more"**: don't penalize minimalism when the prompt asked for restraint, and don't reward over-rendering.

Score the image, not the brand.

---

## Workflow example

```
# From project root
npm run judge-status
# → lists matchup-1, matchup-2, ...

# For each entry in the list, Claude:
#   1. Reads the absolute paths from `gpt:` and `nano:`
#   2. Applies the rubric above
#   3. Writes JSON to the `write:` path
#
# Then:
npm run judge-status
# → should print "All matchups have valid judgment files. Nothing to do."
```

The whole judging pass for 30 matchups should take one focused Claude Code session. No external API calls; no key management. The presence of a valid JSON file on disk *is* the judgment status.
