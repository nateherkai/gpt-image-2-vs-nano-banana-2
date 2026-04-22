import type { JudgmentFile, RunState } from './types';

export interface RunBundle {
  state: RunState;
  judgments: Record<string, JudgmentFile>;
  invalid: string[];
}

export async function fetchRuns(): Promise<string[]> {
  const res = await fetch('/api/runs');
  if (!res.ok) throw new Error(`GET /api/runs failed: ${res.status}`);
  return (await res.json()) as string[];
}

export async function fetchRunBundle(runId: string): Promise<RunBundle> {
  const res = await fetch(`/api/run/${encodeURIComponent(runId)}`);
  if (!res.ok) throw new Error(`GET /api/run/${runId} failed: ${res.status}`);
  const body = (await res.json()) as RunBundle | { error: string };
  if ('error' in body) throw new Error(body.error);
  return body;
}

export function imageUrl(runId: string, localPath: string): string {
  // localPath is run-relative, e.g. "images/text-typography/.../gpt-image-2.png".
  const parts = localPath.split(/[\\/]+/).map(encodeURIComponent).join('/');
  return `/runs/${encodeURIComponent(runId)}/${parts}`;
}
