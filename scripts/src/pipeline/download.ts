import fs from 'node:fs/promises';
import path from 'node:path';
import { RETRY } from '../config.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function downloadFile(url: string, destPath: string): Promise<number> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY.maxAttempts; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Download ${res.status} for ${url}`);
      }
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      const tmp = `${destPath}.tmp`;
      await fs.writeFile(tmp, buf);
      await fs.rename(tmp, destPath);
      return buf.length;
    } catch (err) {
      lastErr = err;
      const wait = Math.min(RETRY.maxMs, RETRY.baseMs * 2 ** (attempt - 1));
      await sleep(wait);
    }
  }
  throw lastErr ?? new Error(`Download failed after ${RETRY.maxAttempts} attempts: ${url}`);
}
