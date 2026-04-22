import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pLimit from 'p-limit';
import { MODELS, PROMPTS_DIR, SOURCES_DIR } from '../config.js';
import { createTask, KieError, pollTask } from '../kie/client.js';
import { SourceImageManifestSchema, type SourceImageDef } from '../state/schema.js';
import { downloadFile } from './download.js';

interface GenerateSourcesOptions {
  only?: string | undefined;
  force?: boolean;
}

async function loadManifest(): Promise<SourceImageDef[]> {
  const raw = await fs.readFile(path.join(PROMPTS_DIR, 'source-images.json'), 'utf8');
  const obj = JSON.parse(raw) as Record<string, unknown>;
  delete obj['$schema'];
  const parsed = SourceImageManifestSchema.parse(obj);
  return parsed.sources;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      reject(new Error(`ffmpeg spawn failed: ${err.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr}`));
    });
  });
}

async function convertPngToJpg(pngPath: string, jpgPath: string): Promise<void> {
  await runFfmpeg(['-y', '-loglevel', 'error', '-i', pngPath, '-q:v', '2', jpgPath]);
}

async function processEntry(
  entry: SourceImageDef,
  opts: GenerateSourcesOptions,
): Promise<'done' | 'skipped' | 'failed'> {
  const dest = path.join(SOURCES_DIR, entry.filename);
  const exists = await fileExists(dest);
  if (exists && !opts.force) {
    console.log(`= ${entry.filename} (already exists; use --force to regenerate)`);
    return 'skipped';
  }

  console.log(`[submit] ${entry.filename}`);
  try {
    const { taskId } = await createTask({
      model: MODELS.gptImageT2I,
      input: { prompt: entry.prompt, nsfw_checker: false },
    });
    console.log(`[poll  ] ${entry.filename} taskId=${taskId}`);
    const result = await pollTask(taskId);
    if (result.state === 'fail') {
      console.warn(
        `[fail  ] ${entry.filename}: ${result.failMsg ?? 'unknown'} (code=${result.failCode ?? 'n/a'})`,
      );
      return 'failed';
    }
    const url = result.resultUrls[0];
    if (!url) {
      console.warn(`[fail  ] ${entry.filename}: no resultUrls returned`);
      return 'failed';
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gvn-src-'));
    const tmpPng = path.join(tmpDir, `${entry.filename}.png`);
    try {
      await downloadFile(url, tmpPng);
      await fs.mkdir(SOURCES_DIR, { recursive: true });
      if (/\.png$/i.test(entry.filename)) {
        await fs.rename(tmpPng, dest);
      } else {
        await convertPngToJpg(tmpPng, dest);
      }
      const stat = await fs.stat(dest);
      console.log(
        `[done  ] ${entry.filename} (${(stat.size / 1024).toFixed(0)} KB, ${((result.costTimeMs ?? 0) / 1000).toFixed(1)}s)`,
      );
      return 'done';
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    const msg =
      err instanceof KieError
        ? `${err.message} (status=${err.status})`
        : (err as Error).message;
    console.warn(`[error ] ${entry.filename}: ${msg}`);
    return 'failed';
  }
}

export async function generateSources(
  opts: GenerateSourcesOptions = {},
): Promise<void> {
  const manifest = await loadManifest();
  const filtered = opts.only
    ? manifest.filter((e) => e.filename === opts.only)
    : manifest;

  if (filtered.length === 0) {
    const valid = manifest.map((e) => e.filename).join(', ');
    throw new Error(
      `No source images match --only=${opts.only}. Valid filenames: ${valid}`,
    );
  }

  console.log(
    `Generating ${filtered.length} source image(s) with GPT Image 2 → ${SOURCES_DIR}`,
  );

  const limit = pLimit(6);
  const results = await Promise.all(
    filtered.map((e) => limit(() => processEntry(e, opts))),
  );

  const tally = { done: 0, failed: 0, skipped: 0 };
  for (const r of results) tally[r] += 1;
  console.log(
    `\nGenerate-sources complete. done=${tally.done} failed=${tally.failed} skipped=${tally.skipped}`,
  );
  if (tally.failed > 0) {
    process.exitCode = 1;
  }
}
