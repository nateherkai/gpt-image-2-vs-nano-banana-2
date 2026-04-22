import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(PROJECT_ROOT, 'runs');

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
};

function endJson(res: Parameters<Connect.NextHandleFunction>[1], body: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function listRuns(): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(RUNS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function readJsonIfPresent(file: string): Promise<unknown | null> {
  try {
    const raw = await fs.promises.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function loadRunBundle(runId: string): Promise<unknown> {
  const runDir = path.join(RUNS_DIR, runId);
  const state = await readJsonIfPresent(path.join(runDir, 'state.json'));
  if (!state) {
    return { error: `Run not found: ${runId}` };
  }
  const judgmentsDir = path.join(runDir, 'judgments');
  const judgments: Record<string, unknown> = {};
  const invalid: string[] = [];
  try {
    const files = await fs.promises.readdir(judgmentsDir);
    await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const id = f.replace(/\.json$/, '');
          try {
            const data = await readJsonIfPresent(path.join(judgmentsDir, f));
            if (data) judgments[id] = data;
          } catch {
            invalid.push(id);
          }
        }),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return { state, judgments, invalid };
}

function runsDataPlugin(): Plugin {
  return {
    name: 'gpt-vs-nano-runs',
    configureServer(server) {
      // /api/runs — list run IDs
      server.middlewares.use('/api/runs', async (req, res, next) => {
        if (req.method !== 'GET' || req.url !== '/') return next();
        try {
          endJson(res, await listRuns());
        } catch (err) {
          endJson(res, { error: (err as Error).message }, 500);
        }
      });

      // /api/run/:id — bundle of state.json + all valid judgment files
      server.middlewares.use('/api/run', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = req.url || '/';
        const id = decodeURIComponent(url.replace(/^\/+/, '').split('/')[0] ?? '');
        if (!id) return next();
        try {
          endJson(res, await loadRunBundle(id));
        } catch (err) {
          endJson(res, { error: (err as Error).message }, 500);
        }
      });

      // /runs/<id>/images/... — stream image files directly from the runs/ folder
      server.middlewares.use('/runs', (req, res, next) => {
        if (req.method !== 'GET') return next();
        const url = decodeURIComponent(req.url || '/');
        const rel = url.replace(/^\/+/, '');
        const abs = path.resolve(RUNS_DIR, rel);
        if (!abs.startsWith(RUNS_DIR + path.sep) && abs !== RUNS_DIR) {
          res.statusCode = 403;
          return res.end('Forbidden');
        }
        fs.stat(abs, (err, stat) => {
          if (err || !stat.isFile()) return next();
          const ext = path.extname(abs).toLowerCase();
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
          res.setHeader('Content-Length', String(stat.size));
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(abs).pipe(res);
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwind(), runsDataPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [PROJECT_ROOT],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '..', 'scripts', 'src'),
    },
  },
});
