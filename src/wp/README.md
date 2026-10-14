# WordPress instance feeds

OS-021 supports several named instances. The Client Area switches between them.

| File | Role |
|---|---|
| `instances.json` | Catalog (ids, names, status, feed paths, sync container) |
| `instances/<id>.json` | Tracked feed for that instance (placeholder hosts; no secrets) |
| `instances/<id>.local.json` | Gitignored overlay with real Studio / Tailscale host URLs |
| `sync-instance.sh` | Read-only WP-CLI sync against a Docker container |

## Sync (read-only)

```bash
./src/wp/sync-instance.sh steve
```

Requires Docker and a running container named in `instances.json` → `sync.container`.
The script downloads WP-CLI into the container's `/tmp` if needed, reads plugins / themes /
settings / ACF (presence + field groups + blocks; never licence keys), and writes the feed.
Real hosts land only in `*.local.json`.

## Legacy

The single-file `instance.json` + `instance.local.json` shape is retired. Use the catalog +
per-instance feeds above.
