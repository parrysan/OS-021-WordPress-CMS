# WordPress instance snapshot

`instance.json` is the operator UI’s live config feed (`docs/project-page/`).

Populate from a linked WordPress Studio site, e.g.:

```bash
wp plugin list --format=json
wp theme list --format=json
wp option get blogname
```

Wire a small sync script here later; keep secrets out of this file (URLs only, no passwords).
