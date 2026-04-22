# kie.ai API Reference

Everything the rig calls. All endpoints live on kie.ai; the client wrapper is in `scripts/src/kie/client.ts`.

## Auth

```
Authorization: Bearer ${KIE_API_KEY}
```

Loaded from `.env` at the project root. All requests include it.

## Base

```
https://api.kie.ai/api/v1
```

Upload endpoint lives on a different host (`https://kieai.redpandaai.co`) — see below.

---

## `POST /jobs/createTask`

Create an image-generation task. Returns a `taskId` you then poll.

**Request**

```http
POST /jobs/createTask HTTP/1.1
Content-Type: application/json

{
  "model": "gpt-image-2-text-to-image",
  "input": { "prompt": "...", "nsfw_checker": false }
}
```

**Response**

```json
{ "code": 200, "msg": "success", "data": { "taskId": "abc123..." } }
```

### Model strings

| Scenario                        | `model`                            | Required input                         |
|---------------------------------|------------------------------------|----------------------------------------|
| GPT Image 2, text-to-image      | `gpt-image-2-text-to-image`        | `prompt`, `nsfw_checker: false`        |
| GPT Image 2, image-to-image     | `gpt-image-2-image-to-image`       | `prompt`, `input_urls: string[]`, `nsfw_checker: false` |
| Nano Banana 2 (single endpoint) | `nano-banana-2`                    | `prompt` + optional `image_input`       |

Nano Banana 2 switches modes by the presence of `image_input` — no separate t2i / i2i model names.

### Nano Banana 2 input options used by the rig

```json
{
  "prompt": "...",
  "image_input": ["https://..."],   // optional; present = edit mode
  "aspect_ratio": "auto",           // default
  "resolution": "2K",               // rig default (1K|2K|4K)
  "output_format": "png"            // rig default (jpg default on kie.ai)
}
```

---

## `GET /jobs/recordInfo?taskId=<id>`

Poll a task. The rig calls this every 3s until terminal state, with a 10-minute cap.

**Response**

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "abc123",
    "model": "gpt-image-2-text-to-image",
    "state": "success",
    "resultJson": "{\"resultUrls\":[\"https://...\"]}",
    "costTime": 4215,
    "createTime": 1713796000000,
    "completeTime": 1713796004215,
    "updateTime": 1713796004215
  }
}
```

`state` is one of: `waiting`, `queuing`, `generating`, `success`, `fail`. The client treats `success` and `fail` as terminal; anything else = keep polling.

`resultJson` is a string (not an object). `JSON.parse` it to read `.resultUrls[0]`.

On failure, `failCode` and `failMsg` explain why; the rig records both on the unit's `lastError`.

---

## `GET /chat/credit`

Your account's kie.ai credit balance.

**Response**

```json
{ "code": 200, "msg": "success", "data": 5363 }
```

Note: `data` is the raw credit number. Denomination (USD vs proprietary unit) is not documented in the envelope. Confirm against your kie.ai dashboard before assuming it's dollars.

---

## `POST /common/download-url`

Refresh a kie.ai-generated URL that's near expiry. Only works for URLs kie.ai issued.

**Request**

```json
{ "url": "https://original-kie-ai-url" }
```

**Response** — shape varies; the client handles both:

```json
{ "code": 200, "data": "https://new-url-valid-20min" }
```

or

```json
{ "code": 200, "data": { "url": "https://new-url-valid-20min" } }
```

The rig calls this when `remoteUrlExpiresAt` has less than 5 minutes remaining.

---

## `POST https://kieai.redpandaai.co/api/file-stream-upload`

Upload a source file for image-to-image matchups. Different host, different content-type.

**Request** — `multipart/form-data`

| Field         | Value                                        |
|---------------|----------------------------------------------|
| `file`        | The binary file                              |
| `uploadPath`  | `gpt-vs-nano/sources` (arbitrary — the rig uses this) |
| `fileName`    | Original filename                            |

**Response**

```json
{
  "code": 200,
  "data": {
    "fileUrl": "https://kieai.redpandaai.co/.../portrait-base.jpg",
    "downloadUrl": "https://...",
    "expiresAt": "2026-04-24T19:27:00Z"
  }
}
```

Result URLs are valid for **3 days**. The rig's `upload-sources` pipeline checks every source's `expiresAt` and re-uploads files that are within 1 hour of expiry or whose SHA-256 has changed.

---

## Error codes

| HTTP | Meaning                        | Rig behavior                                  |
|------|--------------------------------|-----------------------------------------------|
| 200  | Business envelope              | Check `code` in body; 200 = OK                |
| 401  | Bad/missing API key            | Hard fail                                     |
| 402  | Out of credits                 | Hard fail; user should top up                 |
| 422  | Bad request body               | Hard fail; log full response for debugging    |
| 429  | Rate limited                   | Exponential backoff, up to 5 attempts         |
| 5xx  | kie.ai server error            | Exponential backoff, up to 5 attempts         |

The business envelope always looks like `{ code, msg, data }`; a 200 HTTP with `code !== 200` is treated as an error too.

---

## TTLs and timeouts

| Thing                          | TTL              |
|--------------------------------|------------------|
| Image result URL               | 20 minutes       |
| Uploaded source URL            | 3 days           |
| Poll timeout (rig-enforced)    | 10 minutes       |
| Task state polling cadence     | 3 seconds        |

If the process sleeps past any of these boundaries, re-running `generate` or `upload-sources` refreshes the relevant URLs. See `docs/runbook.md` for specific recovery.
