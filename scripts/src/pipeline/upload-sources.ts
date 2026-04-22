import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  SOURCES_DIR,
  SOURCE_URL_TTL_MS,
  SOURCE_URL_REFRESH_MARGIN_MS,
} from '../config.js';
import { uploadFile } from '../kie/upload.js';
import { readState, resolveRunId } from '../state/store.js';
import { StateMutator } from './state-mutator.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function listSourceFiles(): Promise<string[]> {
  let entries: { name: string; isFile(): boolean }[];
  try {
    entries = await fs.readdir(SOURCES_DIR, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && IMAGE_EXTS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
}

async function sha256OfFile(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

interface UploadSourcesOptions {
  runId?: string;
}

export async function uploadSources(opts: UploadSourcesOptions = {}): Promise<void> {
  const runId = await resolveRunId(opts.runId);
  const state = await readState(runId);
  const mutator = new StateMutator(state);

  // Collect source filenames referenced by matchups.
  const referenced = new Set<string>();
  for (const m of state.matchups) {
    for (const f of m.sourceImages ?? []) referenced.add(f);
  }

  if (referenced.size === 0) {
    console.log('No source images referenced by any matchup. Nothing to upload.');
    return;
  }

  const onDisk = new Set(await listSourceFiles());
  const missing = [...referenced].filter((f) => !onDisk.has(f));
  if (missing.length > 0) {
    console.warn(
      `Warning: ${missing.length} referenced source(s) not found in sources/: ${missing.join(', ')}`,
    );
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const name of [...referenced].sort()) {
    if (!onDisk.has(name)) continue;
    const fullPath = path.join(SOURCES_DIR, name);
    const sha = await sha256OfFile(fullPath);
    const existing = state.sources[name];

    const expiresSoon = existing
      ? Date.parse(existing.expiresAt) - Date.now() < SOURCE_URL_REFRESH_MARGIN_MS
      : true;
    const shaChanged = existing ? existing.sha256 !== sha : true;
    const needsUpload = !existing || shaChanged || expiresSoon;

    if (!needsUpload) {
      console.log(`= ${name} (cached, expires ${existing!.expiresAt})`);
      skipped++;
      continue;
    }

    try {
      const result = await uploadFile(fullPath);
      const expiresAt =
        result.expiresAt && !Number.isNaN(Date.parse(result.expiresAt))
          ? new Date(Date.parse(result.expiresAt)).toISOString()
          : new Date(Date.now() + SOURCE_URL_TTL_MS).toISOString();
      await mutator.update((s) => {
        s.sources[name] = {
          uploadedUrl: result.fileUrl,
          expiresAt,
          sha256: sha,
          status: 'uploaded',
        };
      });
      console.log(`+ ${name} -> ${result.fileUrl}`);
      uploaded++;
    } catch (err) {
      console.error(`! ${name} failed:`, (err as Error).message);
      failed++;
    }
  }

  await mutator.flush();
  console.log(`\nDone. uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
}
