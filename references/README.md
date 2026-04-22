# References

Populated automatically — no manual input needed.

`npm run upload-sources` pushes each file in `sources/` to kie.ai's file host and records the resulting public URL here (in `urls.json`). Those URLs are what the image-to-image matchups reference when the pipeline submits a task.

URLs expire in 3 days; the upload script auto-refreshes any that are within 1 hour of expiry on the next run.

Nothing in this folder is tracked by git.
