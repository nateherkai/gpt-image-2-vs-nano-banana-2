import {
  KIE,
  RATE_LIMIT_CREATE,
  RATE_LIMIT_POLL,
  RETRY,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
} from '../config.js';
import { TokenBucket } from './rate-limiter.js';

const createBucket = new TokenBucket(
  RATE_LIMIT_CREATE.capacity,
  RATE_LIMIT_CREATE.refillPerSecond,
);
const pollBucket = new TokenBucket(
  RATE_LIMIT_POLL.capacity,
  RATE_LIMIT_POLL.refillPerSecond,
);

const apiKey = (): string => {
  const key = process.env['KIE_API_KEY'];
  if (!key) throw new Error('KIE_API_KEY missing from environment.');
  return key;
};

interface KieEnvelope<T> {
  code: number;
  msg?: string;
  data: T;
}

export class KieError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number | string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'KieError';
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function isHardFail(status: number): boolean {
  return status === 401 || status === 402 || status === 422;
}

async function kieFetch<T>(
  url: string,
  init: RequestInit & { kind: 'create' | 'poll' | 'other' },
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY.maxAttempts; attempt++) {
    if (init.kind === 'create') await createBucket.acquire();
    if (init.kind === 'poll') await pollBucket.acquire();

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          ...(init.body && !(init.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (err) {
      lastErr = err;
      const wait = Math.min(
        RETRY.maxMs,
        RETRY.baseMs * 2 ** (attempt - 1),
      );
      await sleep(wait);
      continue;
    }

    if (res.ok) {
      const json = (await res.json()) as KieEnvelope<T>;
      if (json.code !== 200) {
        throw new KieError(
          `kie.ai returned business code ${json.code}: ${json.msg ?? 'unknown'}`,
          200,
          json.code,
          json,
        );
      }
      return json.data;
    }

    // HTTP error
    const text = await res.text().catch(() => '');
    if (isHardFail(res.status)) {
      throw new KieError(
        `kie.ai ${res.status}: ${text}`,
        res.status,
        undefined,
        text,
      );
    }
    if (!isRetryable(res.status)) {
      throw new KieError(
        `kie.ai ${res.status}: ${text}`,
        res.status,
        undefined,
        text,
      );
    }
    // 429 or 5xx — back off and retry
    const wait = Math.min(RETRY.maxMs, RETRY.baseMs * 2 ** (attempt - 1));
    lastErr = new KieError(
      `kie.ai ${res.status} on attempt ${attempt}: ${text}`,
      res.status,
      undefined,
      text,
    );
    await sleep(wait);
  }
  throw lastErr ?? new Error('kie.ai retry exhaustion');
}

export interface CreateTaskInput {
  model: string;
  input: Record<string, unknown>;
  callBackUrl?: string;
}

export interface CreateTaskResponse {
  taskId: string;
}

export async function createTask(
  body: CreateTaskInput,
): Promise<CreateTaskResponse> {
  return kieFetch<CreateTaskResponse>(KIE.createTask, {
    method: 'POST',
    body: JSON.stringify(body),
    kind: 'create',
  });
}

export type TaskState =
  | 'waiting'
  | 'queuing'
  | 'generating'
  | 'success'
  | 'fail';

export interface RecordInfoResponse {
  taskId: string;
  model: string;
  state: TaskState;
  /** JSON string: `{"resultUrls":["https://..."]}` */
  resultJson?: string;
  failCode?: string;
  failMsg?: string;
  /** ms */
  costTime?: number;
  createTime?: number;
  completeTime?: number;
  updateTime?: number;
  progress?: number;
}

export async function getTask(taskId: string): Promise<RecordInfoResponse> {
  return kieFetch<RecordInfoResponse>(KIE.recordInfo(taskId), {
    method: 'GET',
    kind: 'poll',
  });
}

export interface PollResult {
  state: 'success' | 'fail';
  resultUrls: string[];
  costTimeMs: number | undefined;
  failCode?: string;
  failMsg?: string;
}

/** Poll until terminal state, with a timeout. */
export async function pollTask(taskId: string): Promise<PollResult> {
  const startedAt = Date.now();
  let transientErrors = 0;
  while (true) {
    let res: RecordInfoResponse;
    try {
      res = await getTask(taskId);
    } catch (err) {
      // Cloudflare 504s and other transient 5xx on /recordInfo happen
      // periodically — the task is likely still running on kie.ai's side.
      // Keep polling until the overall timeout kicks in.
      const isTransient =
        err instanceof KieError &&
        (err.status === 429 || (err.status >= 500 && err.status < 600));
      if (!isTransient) throw err;
      transientErrors += 1;
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new Error(
          `Task ${taskId} polling timed out after ${POLL_TIMEOUT_MS / 1000}s (transient errors: ${transientErrors}, last: ${err.message})`,
        );
      }
      await sleep(POLL_INTERVAL_MS * 2);
      continue;
    }
    if (res.state === 'success') {
      let urls: string[] = [];
      if (res.resultJson) {
        try {
          const parsed = JSON.parse(res.resultJson) as { resultUrls?: string[] };
          urls = parsed.resultUrls ?? [];
        } catch {
          throw new Error(
            `Could not parse resultJson for task ${taskId}: ${res.resultJson}`,
          );
        }
      }
      return {
        state: 'success',
        resultUrls: urls,
        costTimeMs: res.costTime,
      };
    }
    if (res.state === 'fail') {
      return {
        state: 'fail',
        resultUrls: [],
        costTimeMs: res.costTime,
        failCode: res.failCode,
        failMsg: res.failMsg,
      };
    }
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error(
        `Task ${taskId} polling timed out after ${POLL_TIMEOUT_MS / 1000}s in state=${res.state}`,
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export interface CreditsResponse {
  /** Always returned as a number; semantics are kie.ai-internal credits. */
  balance: number;
}

export async function getCredits(): Promise<CreditsResponse> {
  const balance = await kieFetch<number>(KIE.credits, {
    method: 'GET',
    kind: 'other',
  });
  return { balance };
}

export interface RefreshUrlResponse {
  url: string;
}

/** Refresh a kie.ai-generated URL that's about to expire. */
export async function refreshDownloadUrl(url: string): Promise<RefreshUrlResponse> {
  const data = await kieFetch<{ url?: string } | string>(KIE.refreshDownloadUrl, {
    method: 'POST',
    body: JSON.stringify({ url }),
    kind: 'other',
  });
  // The kie.ai docs are unclear whether `data` is a string or an object — handle both.
  if (typeof data === 'string') return { url: data };
  if (data && typeof data === 'object' && 'url' in data && data.url) {
    return { url: data.url };
  }
  throw new Error(`Unexpected refresh-url response shape: ${JSON.stringify(data)}`);
}
