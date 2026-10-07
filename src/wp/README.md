# WordPress instance snapshot

`instance.json` is the operator UI’s live config feed (`docs/project-page/`).

Populate from a linked WordPress Studio site, e.g.:

```bash
wp plugin list --format=json
wp theme list --format=json
wp option get blogname
```

Wire a small sync script here later; keep secrets out of this file (URLs only, no passwords).

The tracked `instance.json` holds placeholder URLs (`<studio-tailnet-host>`) because this repo is public. To show the real host in the Client Area, put the real `site.url` / `site.admin_url` in `instance.local.json` next to it. That file is gitignored and overlays `instance.json` when present. Without it the Client Area shows "Host not configured" and hides the WP Admin link.
