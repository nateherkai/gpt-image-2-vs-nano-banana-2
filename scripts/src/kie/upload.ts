import fs from 'node:fs/promises';
import path from 'node:path';
import { KIE_UPLOAD_URL, RETRY } from '../config.js';

const apiKey = (): string => {
  const key = process.env['KIE_API_KEY'];
  if (!key) throw new Error('KIE_API_KEY missing from environment.');
  return key;
};

export interface UploadResponse {
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  /** Canonical public URL for the uploaded file. Normalized from kie.ai's `downloadUrl`. */
  fileUrl: string;
  /** ISO timestamp; URL valid for 3 days from upload. May be absent — consumers should fall back to 3-day default. */
  expiresAt?: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Upload a file from disk to kie.ai's stream-upload endpoint. */
export async function uploadFile(filePath: string): Promise<UploadResponse> {
  const buffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const mimeType =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY.maxAttempts; attempt++) {
    try {
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(buffer)], { type: mimeType }),
        fileName,
      );
      form.append('uploadPath', 'images');
      form.append('fileName', fileName);

      const res = await fetch(KIE_UPLOAD_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey()}` },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (res.status === 401 || res.status === 422) {
          throw new Error(`Upload ${res.status}: ${text}`);
        }
        throw new Error(`Upload ${res.status} on attempt ${attempt}: ${text}`);
      }
      const wrapper = (await res.json()) as {
        code?: number;
        msg?: string;
        data?: Record<string, unknown>;
      };
      const raw = (wrapper.data ?? (wrapper as unknown as Record<string, unknown>));
      const fileUrl =
        (raw['downloadUrl'] as string | undefined) ??
        (raw['fileUrl'] as string | undefined);
      if (!fileUrl) {
        throw new Error(
          `Upload returned no downloadUrl: ${JSON.stringify(wrapper)}`,
        );
      }
      return {
        fileName: (raw['fileName'] as string) ?? fileName,
        fileSize: raw['fileSize'] as number | undefined,
        mimeType: raw['mimeType'] as string | undefined,
        fileUrl,
        expiresAt: raw['expiresAt'] as string | undefined,
      };
    } catch (err) {
      lastErr = err;
      const wait = Math.min(RETRY.maxMs, RETRY.baseMs * 2 ** (attempt - 1));
      await sleep(wait);
    }
  }
  throw lastErr ?? new Error('Upload retry exhaustion');
}
