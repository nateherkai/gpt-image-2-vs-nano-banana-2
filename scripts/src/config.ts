import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolves to the project root (the dir containing this workspace).
// From scripts/src/config.ts → up 2 = project root.
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const PROMPTS_DIR = path.join(PROJECT_ROOT, 'prompts');
export const SOURCES_DIR = path.join(PROJECT_ROOT, 'sources');
export const RUNS_DIR = path.join(PROJECT_ROOT, 'runs');

// kie.ai endpoints
export const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
export const KIE_UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-stream-upload';

export const KIE = {
  createTask: `${KIE_BASE_URL}/jobs/createTask`,
  recordInfo: (taskId: string) =>
    `${KIE_BASE_URL}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
  credits: `${KIE_BASE_URL}/chat/credit`,
  refreshDownloadUrl: `${KIE_BASE_URL}/common/download-url`,
} as const;

// Model strings
export const MODELS = {
  gptImageT2I: 'gpt-image-2-text-to-image',
  gptImageI2I: 'gpt-image-2-image-to-image',
  nanoBanana: 'nano-banana-2',
} as const;

// Anthropic
export const ANTHROPIC_MODEL = 'claude-opus-4-7';

// Rate limits (kie.ai documents 20 createTask requests per 10 seconds).
// Token bucket: 20 capacity, refill 2/sec.
export const RATE_LIMIT_CREATE = {
  capacity: 20,
  refillPerSecond: 2,
} as const;

// Polling — separate, more conservative bucket.
export const RATE_LIMIT_POLL = {
  capacity: 10,
  refillPerSecond: 5,
} as const;

// Concurrency caps (well below documented "100+ concurrent tasks").
export const CONCURRENT_CREATE = 8;
export const CONCURRENT_POLL = 30;
export const CONCURRENT_DOWNLOAD = 6;
export const CONCURRENT_JUDGE_DEFAULT = 1;

// Polling cadence
export const POLL_INTERVAL_MS = 3_000;
export const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

// URL TTLs from kie.ai docs.
export const IMAGE_URL_TTL_MS = 20 * 60 * 1000; // result URLs expire after 20 min
export const SOURCE_URL_TTL_MS = 3 * 24 * 60 * 60 * 1000; // upload URLs expire after 3 days
export const SOURCE_URL_REFRESH_MARGIN_MS = 60 * 60 * 1000; // re-upload if < 1h left
export const IMAGE_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000; // refresh if < 5min left

// Retry policy — exponential backoff, capped.
export const RETRY = {
  maxAttempts: 5,
  baseMs: 2_000,
  maxMs: 60_000,
} as const;

// Default Nano Banana 2 resolution. 2K is a good middle ground for video display.
export const NANO_BANANA_RESOLUTION_DEFAULT = '2K' as const;

// Image output format (we want PNG for Claude judging fidelity).
export const OUTPUT_FORMAT = 'png' as const;
