import fs from 'node:fs/promises';
import path from 'node:path';
import { RUNS_DIR, PROMPTS_DIR, NANO_BANANA_RESOLUTION_DEFAULT } from '../config.js';
import {
  PromptManifestSchema,
  RunStateSchema,
} from './schema.js';
import type {
  Matchup,
  Mode,
  ModelId,
  ModelRunState,
  PromptDef,
  RunState,
} from '../types.js';
import { MODEL_IDS } from '../types.js';

const STATE_FILENAME = 'state.json';

export function runDir(runId: string): string {
  return path.join(RUNS_DIR, runId);
}

export function statePath(runId: string): string {
  return path.join(runDir(runId), STATE_FILENAME);
}

export async function ensureRunDirs(runId: string): Promise<void> {
  const root = runDir(runId);
  await fs.mkdir(path.join(root, 'images'), { recursive: true });
  await fs.mkdir(path.join(root, 'judgments'), { recursive: true });
  await fs.mkdir(path.join(root, 'logs'), { recursive: true });
}

export async function readState(runId: string): Promise<RunState> {
  const raw = await fs.readFile(statePath(runId), 'utf8');
  const parsed = JSON.parse(raw);
  return RunStateSchema.parse(parsed);
}

export async function writeState(runId: string, state: RunState): Promise<void> {
  // Validate before writing — this catches bugs that would corrupt state.json.
  const validated = RunStateSchema.parse(state);
  const target = statePath(runId);
  const tmp = `${target}.tmp`;
  const json = JSON.stringify(validated, null, 2);

  // Retry writeFile + rename. OneDrive (and AV scanners) briefly hold file
  // handles open for indexing/syncing, which surfaces as EPERM/EBUSY/EACCES on
  // Windows when we try to rename on top of a recently-written file.
  const maxAttempts = 10;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fs.writeFile(tmp, json, 'utf8');
      await fs.rename(tmp, target);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw err;
      if (attempt === maxAttempts) break;
      const wait = Math.min(2_000, 50 * attempt);
      await new Promise<void>((r) => setTimeout(r, wait));
    }
  }
  throw lastErr ?? new Error(`writeState failed after ${maxAttempts} attempts`);
}

export async function listRuns(): Promise<string[]> {
  try {
    const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

export async function getLatestRunId(): Promise<string | null> {
  const ids = await listRuns();
  return ids.length > 0 ? ids[ids.length - 1]! : null;
}

/** Build YYYY-MM-DD-NNN run ID, where NNN is the next available sequence for today. */
export async function nextRunId(now: Date = new Date()): Promise<string> {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`;
  const ids = await listRuns();
  const seq = ids.filter((id) => id.startsWith(today)).length + 1;
  return `${today}-${String(seq).padStart(3, '0')}`;
}

function emptyModelRunState(): ModelRunState {
  return { status: 'pending', attempts: 0 };
}

function freshMatchup(def: PromptDef, mode: Mode): Matchup {
  const models: Record<ModelId, ModelRunState> = {
    'gpt-image-2': emptyModelRunState(),
    'nano-banana-2': emptyModelRunState(),
  };
  return {
    id: def.id,
    category: def.category,
    mode,
    prompt: def.prompt,
    sourceImages: def.sourceImages,
    notes: def.notes,
    models,
  };
}

async function loadPrompts(): Promise<{ t2i: PromptDef[]; i2i: PromptDef[] }> {
  const t2iRaw = await fs.readFile(
    path.join(PROMPTS_DIR, 'text-to-image.json'),
    'utf8',
  );
  const i2iRaw = await fs.readFile(
    path.join(PROMPTS_DIR, 'image-to-image.json'),
    'utf8',
  );
  // Strip $schema before parsing — it's a JSON Schema reference, not data.
  const stripSchema = (raw: string): unknown => {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    delete obj['$schema'];
    return obj;
  };
  const t2i = PromptManifestSchema.parse(stripSchema(t2iRaw));
  const i2i = PromptManifestSchema.parse(stripSchema(i2iRaw));
  return { t2i: t2i.matchups, i2i: i2i.matchups };
}

/** Create a fresh run from prompts/. */
export async function createRun(runId?: string): Promise<RunState> {
  const id = runId ?? (await nextRunId());
  await ensureRunDirs(id);
  const { t2i, i2i } = await loadPrompts();
  const matchups: Matchup[] = [
    ...t2i.map((def) => freshMatchup(def, 'text-to-image')),
    ...i2i.map((def) => freshMatchup(def, 'image-to-image')),
  ];
  const state: RunState = {
    runId: id,
    createdAt: new Date().toISOString(),
    config: {
      models: MODEL_IDS,
      judgeModel: 'claude-opus-4-7',
      nanoBananaResolution: NANO_BANANA_RESOLUTION_DEFAULT,
    },
    sources: {},
    matchups,
  };
  await writeState(id, state);
  return state;
}

/** Resolve a runId argument or fall back to the latest run. */
export async function resolveRunId(arg?: string): Promise<string> {
  if (arg) return arg;
  const latest = await getLatestRunId();
  if (!latest) {
    throw new Error('No runs found. Create one with `npm run new-run`.');
  }
  return latest;
}
