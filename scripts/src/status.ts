import fs from 'node:fs/promises';
import path from 'node:path';
import { getCredits } from './kie/client.js';
import { JudgmentFileSchema } from './state/schema.js';
import { readState, resolveRunId, runDir } from './state/store.js';
import type {
  Category,
  Matchup,
  ModelId,
  ModelRunState,
  RunState,
} from './types.js';
import { MODEL_IDS } from './types.js';

interface UnitCounts {
  pending: number;
  submitted: number;
  polling: number;
  downloaded: number;
  failed: number;
}

function emptyCounts(): UnitCounts {
  return { pending: 0, submitted: 0, polling: 0, downloaded: 0, failed: 0 };
}

function tallyUnits(matchups: Matchup[]): UnitCounts {
  const c = emptyCounts();
  for (const m of matchups) {
    for (const id of MODEL_IDS) {
      c[m.models[id].status] += 1;
    }
  }
  return c;
}

function isFullyGenerated(m: Matchup): boolean {
  return MODEL_IDS.every((id) => m.models[id].status === 'downloaded');
}

function judgmentPath(runId: string, matchupId: string): string {
  return path.join(runDir(runId), 'judgments', `${matchupId}.json`);
}

interface JudgmentStatus {
  exists: boolean;
  valid: boolean;
  error?: string;
}

async function checkJudgment(
  runId: string,
  matchupId: string,
): Promise<JudgmentStatus> {
  const file = judgmentPath(runId, matchupId);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, valid: false };
    }
    return { exists: true, valid: false, error: (err as Error).message };
  }
  try {
    const parsed = JSON.parse(raw);
    JudgmentFileSchema.parse(parsed);
    return { exists: true, valid: true };
  } catch (err) {
    return { exists: true, valid: false, error: (err as Error).message };
  }
}

function byCategory(matchups: Matchup[]): Map<Category, Matchup[]> {
  const m = new Map<Category, Matchup[]>();
  for (const mu of matchups) {
    const arr = m.get(mu.category) ?? [];
    arr.push(mu);
    m.set(mu.category, arr);
  }
  return m;
}

export async function printStatus(runIdArg?: string): Promise<void> {
  const runId = await resolveRunId(runIdArg);
  const state = await readState(runId);
  await renderStatus(state);
}

async function renderStatus(state: RunState): Promise<void> {
  const { runId, matchups } = state;
  const units = tallyUnits(matchups);
  const totalUnits = matchups.length * MODEL_IDS.length;
  const fullyGenerated = matchups.filter(isFullyGenerated).length;

  // Judging status
  let judged = 0;
  let judgmentsInvalid = 0;
  for (const m of matchups) {
    const j = await checkJudgment(runId, m.id);
    if (j.valid) judged += 1;
    else if (j.exists) judgmentsInvalid += 1;
  }

  console.log(`Run: ${runId}`);
  console.log(`Created: ${state.createdAt}`);
  console.log('');
  console.log(
    `Generated: ${fullyGenerated}/${matchups.length} matchups (${units.downloaded}/${totalUnits} images)`,
  );
  console.log(
    `  pending=${units.pending}  submitted=${units.submitted}  polling=${units.polling}  failed=${units.failed}`,
  );
  console.log(`Judged: ${judged}/${matchups.length}`);
  if (judgmentsInvalid > 0) {
    console.log(`  (${judgmentsInvalid} judgment file(s) failed validation — see judge-status)`);
  }

  // Per-category breakdown
  console.log('');
  console.log('By category:');
  const cats = byCategory(matchups);
  const catNames = [...cats.keys()].sort();
  for (const cat of catNames) {
    const list = cats.get(cat)!;
    const gen = list.filter(isFullyGenerated).length;
    let jud = 0;
    for (const m of list) {
      if ((await checkJudgment(runId, m.id)).valid) jud += 1;
    }
    console.log(
      `  ${cat.padEnd(24)} gen=${gen}/${list.length}  judged=${jud}/${list.length}`,
    );
  }

  // Sources
  const sourceNames = Object.keys(state.sources);
  if (sourceNames.length > 0) {
    console.log('');
    console.log('Sources:');
    for (const name of sourceNames.sort()) {
      const s = state.sources[name]!;
      const remainingMs = Date.parse(s.expiresAt) - Date.now();
      const remainingH = (remainingMs / 3_600_000).toFixed(1);
      console.log(`  ${name.padEnd(32)} ${s.status}  expires in ${remainingH}h`);
    }
  }

  // Failed unit details
  const failed: Array<{ m: Matchup; modelId: ModelId; ms: ModelRunState }> = [];
  for (const m of matchups) {
    for (const id of MODEL_IDS) {
      const ms = m.models[id];
      if (ms.status === 'failed') failed.push({ m, modelId: id, ms });
    }
  }
  if (failed.length > 0) {
    console.log('');
    console.log('Failed units:');
    for (const { m, modelId, ms } of failed) {
      const err = ms.lastError
        ? `${ms.lastError.code}: ${ms.lastError.message}`
        : 'unknown';
      console.log(`  ${m.id} / ${modelId}  (attempts=${ms.attempts})`);
      console.log(`    ${err}`);
    }
    console.log('');
    console.log('Retry with: npm run generate -- --retry-failed');
  }
}

export async function printJudgeStatus(runIdArg?: string): Promise<void> {
  const runId = await resolveRunId(runIdArg);
  const state = await readState(runId);
  const rd = runDir(runId);

  interface Pending {
    matchup: Matchup;
    reason: 'missing' | 'invalid' | 'images-missing';
    errorDetail?: string;
  }

  const pending: Pending[] = [];
  let validCount = 0;

  for (const m of state.matchups) {
    if (!isFullyGenerated(m)) {
      // Skip — can't judge until both images are downloaded.
      pending.push({ matchup: m, reason: 'images-missing' });
      continue;
    }
    const j = await checkJudgment(runId, m.id);
    if (j.valid) {
      validCount += 1;
    } else if (j.exists) {
      pending.push({ matchup: m, reason: 'invalid', errorDetail: j.error });
    } else {
      pending.push({ matchup: m, reason: 'missing' });
    }
  }

  console.log(`Run: ${runId}`);
  console.log(
    `Judged: ${validCount}/${state.matchups.length}  Pending: ${pending.length}`,
  );
  console.log('');

  if (pending.length === 0) {
    console.log('All matchups have valid judgment files. Nothing to do.');
    return;
  }

  // Group pending by reason
  const toJudge = pending.filter((p) => p.reason === 'missing' || p.reason === 'invalid');
  const blocked = pending.filter((p) => p.reason === 'images-missing');

  if (blocked.length > 0) {
    console.log(`Blocked by missing images (${blocked.length}):`);
    for (const { matchup } of blocked) {
      console.log(`  ${matchup.id}  (run \`npm run generate\` first)`);
    }
    console.log('');
  }

  if (toJudge.length === 0) return;

  console.log(`Pending judgments (${toJudge.length}):`);
  console.log('');
  for (const { matchup: m, reason, errorDetail } of toJudge) {
    const gpt = m.models['gpt-image-2'];
    const nano = m.models['nano-banana-2'];
    const gptPath = gpt.localPath ? path.join(rd, gpt.localPath) : '(missing)';
    const nanoPath = nano.localPath ? path.join(rd, nano.localPath) : '(missing)';
    const write = judgmentPath(runId, m.id);

    console.log(`- ${m.id}`);
    console.log(`    category: ${m.category}  mode: ${m.mode}`);
    console.log(`    prompt:   ${truncate(m.prompt, 180)}`);
    if (m.sourceImages && m.sourceImages.length > 0) {
      console.log(`    sources:  ${m.sourceImages.join(', ')}`);
    }
    console.log(`    gpt:      ${gptPath}`);
    console.log(`    nano:     ${nanoPath}`);
    console.log(`    write:    ${write}`);
    if (reason === 'invalid') {
      console.log(`    (existing judgment file is invalid: ${errorDetail ?? 'parse error'})`);
    }
    console.log('');
  }

  console.log(
    'Judging workflow: read each image pair with the Read tool, score per the rubric in docs/judging-guide.md,',
  );
  console.log(
    'then Write the JSON to the `write` path. Re-run `npm run judge-status` to confirm.',
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

export async function printCredits(): Promise<void> {
  const { balance } = await getCredits();
  console.log(`kie.ai credit balance: ${balance}`);
}
