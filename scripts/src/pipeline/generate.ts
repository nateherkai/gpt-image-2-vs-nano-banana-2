import path from 'node:path';
import pLimit from 'p-limit';
import {
  CONCURRENT_CREATE,
  IMAGE_URL_REFRESH_MARGIN_MS,
  IMAGE_URL_TTL_MS,
  MODELS,
  NANO_BANANA_RESOLUTION_DEFAULT,
  OUTPUT_FORMAT,
} from '../config.js';
import {
  createTask,
  KieError,
  pollTask,
  refreshDownloadUrl,
} from '../kie/client.js';
import { readState, resolveRunId, runDir } from '../state/store.js';
import type { Category, Matchup, ModelId, RunState } from '../types.js';
import { downloadFile } from './download.js';
import { StateMutator } from './state-mutator.js';

interface GenerateOptions {
  runId?: string;
  /** Run only matchups in this category. */
  only?: Category | undefined;
  /** Re-run matchups whose model is in 'failed' state. */
  retryFailed?: boolean;
  /** Smoke-test cap on the number of matchups (per category if `only` set). */
  limit?: number;
}

function buildRequestInput(
  state: RunState,
  m: Matchup,
  modelId: ModelId,
): { model: string; input: Record<string, unknown> } {
  const sourceUrls = (m.sourceImages ?? []).map((f) => {
    const s = state.sources[f];
    if (!s) {
      throw new Error(
        `Source image ${f} not uploaded. Run \`npm run upload-sources\` first.`,
      );
    }
    return s.uploadedUrl;
  });

  if (modelId === 'gpt-image-2') {
    if (m.mode === 'text-to-image') {
      return {
        model: MODELS.gptImageT2I,
        input: { prompt: m.prompt, nsfw_checker: false },
      };
    }
    return {
      model: MODELS.gptImageI2I,
      input: {
        prompt: m.prompt,
        input_urls: sourceUrls,
        nsfw_checker: false,
      },
    };
  }
  // nano-banana-2 — single endpoint
  const input: Record<string, unknown> = {
    prompt: m.prompt,
    aspect_ratio: 'auto',
    resolution: NANO_BANANA_RESOLUTION_DEFAULT,
    output_format: OUTPUT_FORMAT,
  };
  if (sourceUrls.length > 0) input['image_input'] = sourceUrls;
  return { model: MODELS.nanoBanana, input };
}

interface Unit {
  matchup: Matchup;
  modelId: ModelId;
}

function localImageRelPath(m: Matchup, modelId: ModelId): string {
  return path.posix.join('images', m.category, m.id, `${modelId}.${OUTPUT_FORMAT}`);
}

async function processUnit(
  mutator: StateMutator,
  unit: Unit,
  options: GenerateOptions,
): Promise<'done' | 'failed' | 'skipped'> {
  const m = unit.matchup;
  const ms = m.models[unit.modelId];

  if (ms.status === 'downloaded') return 'skipped';
  if (ms.status === 'failed' && !options.retryFailed) return 'skipped';
  if (ms.status === 'failed' && options.retryFailed) {
    // Reset to pending for retry
    await mutator.update(() => {
      ms.status = 'pending';
      ms.lastError = undefined;
    });
  }

  const tag = `${m.id} / ${unit.modelId}`;

  try {
    // Step 1: submit if pending.
    if (ms.status === 'pending') {
      const body = buildRequestInput(mutator.current, m, unit.modelId);
      const { taskId } = await createTask(body);
      await mutator.update(() => {
        ms.taskId = taskId;
        ms.submittedAt = new Date().toISOString();
        ms.attempts += 1;
        ms.status = 'submitted';
      });
      console.log(`[submit ] ${tag} -> ${taskId}`);
    }

    // Step 2: poll if not yet downloaded.
    if (
      (ms.status === 'submitted' || ms.status === 'polling') &&
      ms.taskId
    ) {
      if (ms.status === 'submitted') {
        await mutator.update(() => {
          ms.status = 'polling';
        });
      }
      console.log(`[poll   ] ${tag} taskId=${ms.taskId}`);
      const result = await pollTask(ms.taskId);
      if (result.state === 'fail') {
        await mutator.update(() => {
          ms.status = 'failed';
          ms.completedAt = new Date().toISOString();
          ms.costTimeMs = result.costTimeMs;
          ms.lastError = {
            code: result.failCode ?? 'fail',
            message: result.failMsg ?? 'Task reported failure with no message.',
            at: ms.completedAt,
          };
        });
        console.warn(`[fail   ] ${tag}: ${result.failMsg ?? 'unknown'}`);
        return 'failed';
      }
      if (result.resultUrls.length === 0) {
        throw new Error(`Task ${ms.taskId} succeeded but returned no resultUrls`);
      }
      await mutator.update(() => {
        ms.completedAt = new Date().toISOString();
        ms.costTimeMs = result.costTimeMs;
        ms.remoteUrl = result.resultUrls[0];
        ms.remoteUrlExpiresAt = new Date(
          Date.now() + IMAGE_URL_TTL_MS,
        ).toISOString();
      });
    }

    // Step 3: download if we have a remote URL but no local file.
    if (ms.remoteUrl && !ms.localPath) {
      let downloadUrl = ms.remoteUrl;
      const expiresAt = ms.remoteUrlExpiresAt
        ? Date.parse(ms.remoteUrlExpiresAt)
        : 0;
      const remainingMs = expiresAt - Date.now();
      if (remainingMs < IMAGE_URL_REFRESH_MARGIN_MS) {
        try {
          const refreshed = await refreshDownloadUrl(ms.remoteUrl);
          downloadUrl = refreshed.url;
        } catch (err) {
          console.warn(
            `[warn   ] ${tag}: refresh-url failed, trying original URL: ${(err as Error).message}`,
          );
        }
      }

      const relPath = localImageRelPath(m, unit.modelId);
      const dest = path.join(runDir(mutator.current.runId), relPath);
      const size = await downloadFile(downloadUrl, dest);
      await mutator.update(() => {
        ms.localPath = relPath;
        ms.fileSizeBytes = size;
        ms.status = 'downloaded';
      });
      console.log(`[done   ] ${tag} (${(size / 1024).toFixed(0)} KB)`);
      return 'done';
    }

    return 'skipped';
  } catch (err) {
    const message =
      err instanceof KieError
        ? `${err.message} (status=${err.status})`
        : (err as Error).message;
    await mutator.update(() => {
      ms.status = 'failed';
      ms.lastError = {
        code: err instanceof KieError ? String(err.status) : 'error',
        message,
        at: new Date().toISOString(),
      };
    });
    console.warn(`[error  ] ${tag}: ${message}`);
    return 'failed';
  }
}

export async function generate(opts: GenerateOptions = {}): Promise<void> {
  const runId = await resolveRunId(opts.runId);
  const state = await readState(runId);
  const mutator = new StateMutator(state);

  // Build the unit list, applying filters.
  let matchups = state.matchups;
  if (opts.only) {
    matchups = matchups.filter((m) => m.category === opts.only);
  }
  if (opts.limit) {
    matchups = matchups.slice(0, opts.limit);
  }
  const units: Unit[] = [];
  for (const m of matchups) {
    for (const modelId of state.config.models) {
      units.push({ matchup: m, modelId });
    }
  }

  // Pre-flight: warn about missing source uploads.
  for (const m of matchups) {
    if (m.mode !== 'image-to-image') continue;
    for (const f of m.sourceImages ?? []) {
      if (!state.sources[f]) {
        console.warn(
          `Warning: matchup ${m.id} references source ${f} which is not uploaded. Run \`npm run upload-sources\` first.`,
        );
      }
    }
  }

  console.log(
    `Run ${runId}: ${units.length} units (${matchups.length} matchups x ${state.config.models.length} models)`,
  );

  const limit = pLimit(CONCURRENT_CREATE);
  const results = await Promise.all(
    units.map((u) => limit(() => processUnit(mutator, u, opts))),
  );
  await mutator.flush();

  const tally = { done: 0, failed: 0, skipped: 0 };
  for (const r of results) tally[r] += 1;
  console.log(
    `\nGenerate complete. done=${tally.done} failed=${tally.failed} skipped=${tally.skipped}`,
  );
}
