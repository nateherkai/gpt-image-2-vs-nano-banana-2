# Source Images

Source images for the 12 image-to-image matchups in `prompts/image-to-image.json`. Drop `.jpg` files here with the exact filenames listed below.

| Filename | Used by | Notes |
|---|---|---|
| `portrait-base.jpg` | style-transfer (×3), character-consistency (×3), object-edit (change shirt color) | A clear, well-lit portrait of one person. Ideally facing the camera, neutral expression, casual clothing. 1024×1024 or larger. |
| `cafe-scene.jpg` | object-edit (add coffee cup) | A photo of someone sitting at a table in a café with the table surface clearly visible (empty, no cup yet). |
| `street-scene.jpg` | object-edit (remove background object) | A photo of a residential or city street with a parked car clearly visible somewhere in frame. |
| `product-iphone-shot.jpg` | photo-enhance (iPhone → studio) | A casual iPhone-style snapshot of a product. Imperfect lighting, mixed color temperatures, hand-held look. |
| `dim-room.jpg` | photo-enhance (low-light → professional) | A dim, grainy interior photo of a room or scene. Should clearly read as low-light. |
| `casual-snapshot.jpg` | photo-enhance (casual → LinkedIn) | A casual snapshot of a person — selfie, candid, etc. Will be transformed into a headshot. |

## Constraints

- **Format**: `.jpg` (other formats may work but `.jpg` is the standard tested path)
- **Size**: under 30 MB per file (kie.ai limit). Aim for 1024–2048 px on the long edge.
- **Public visibility**: these will be uploaded to kie.ai's file host (`kieai.redpandaai.co`) and assigned a public URL valid for 3 days. Don't drop anything sensitive here.

## After dropping files

```bash
npm run upload-sources
```

The script will upload each file, compute its SHA-256, and write the resulting public URL into `runs/<run-id>/state.json`. If a file's SHA changes, the script re-uploads. If the public URL is within 1 hour of expiry, the script re-uploads.

## Don't have these yet?

```bash
npm run generate-sources
```

Generates all 6 files in this folder using GPT Image 2 via kie.ai. Prompts live at `prompts/source-images.json` and can be tweaked. Costs roughly $0.12 total.

Flags:
- `--only=<filename>` — regenerate one file
- `--force` — regenerate even if the file already exists

If you don't like one of the results, `rm sources/<filename>` and re-run — the command skips files that already exist.
