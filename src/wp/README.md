# WordPress instance feeds

OS-021 supports several named instances. The Client Area switches between them.

| File | Role |
|---|---|
| `instances.json` | Catalog (ids, names, status, feed paths, sync container) |
| `instances/<id>.json` | Tracked feed for that instance (placeholder hosts; no secrets) |
| `instances/<id>.seo.json` | Built-in SEO module data (keywords / totals); empty-state when none |
| `instances/<id>.local.json` | Gitignored overlay with real Studio / Tailscale host URLs |
| `sync-instance.sh` | Read-only WP-CLI sync against a Docker container |
| `wp-write.sh` (+ `wp_write.py`) | The agent write path: activity log, approval gate, draft/trash defaults |
| `instances/<id>.log.jsonl` | Gitignored, append-only activity log of agent writes (Activity tab) |
| `instances/<id>.pending/` | Gitignored risky writes waiting for a human approval |

The SEO Client Area tab is a **default OS-021 module** — every catalogued instance gets it automatically. New instances only need a catalog entry plus feeds; the SEO tab needs no extra wiring.

## Sync (read-only)

```bash
./src/wp/sync-instance.sh steve
```

Requires Docker and a running container named in `instances.json` → `sync.container`.
The script downloads WP-CLI into the container's `/tmp` if needed, reads plugins / themes /
settings / ACF (presence + field groups + blocks; never licence keys), and writes the feed.
Real hosts land only in `*.local.json`.

## Agent writes

Agents change a WordPress instance only through `wp-write.sh`, never raw `docker exec … wp`:

```bash
./src/wp/wp-write.sh <id> post create --post_title="Spring menu"   # lands as a draft
./src/wp/wp-write.sh <id> post delete 42                           # goes to the trash
./src/wp/wp-write.sh <id> plugin uninstall akismet                 # waits for approval (exit 3)
./src/wp/wp-write.sh <id> --pending                                # list waiting writes
./src/wp/wp-write.sh <id> --approve <token>                        # human, at a terminal: type yes
./src/wp/wp-write.sh <id> --reject <token>                         # discard
```

- **Activity log.** Every write (not reads such as `list` / `get`) appends one JSON line to
  `instances/<id>.log.jsonl`: time, actor (`WP_WRITE_ACTOR`, default `agent`), command,
  status (`applied`, `failed`, `awaiting_approval`, `rejected`), defaults applied, approval
  and a short output. Secret-looking values (`--user_pass=`, `*key*`, `*secret*`, `*token*`,
  generated passwords) are masked. The Client Area **Activity** tab shows the last 50.
- **Approval gate.** Deletes that skip the trash, `--force`, uninstalls, `db query` / `reset` /
  `import`, `search-replace` without `--dry-run`, `eval` / `shell` / `--exec`, and publishing
  (`--post_status=publish|future|private`) do not run. The wrapper prints a dry-run preview
  (the target's current state, read only), parks the write in `instances/<id>.pending/` and
  exits 3. Only a human at a terminal can apply it: `--approve` refuses when stdin is not a
  TTY and needs the word `yes`. Each token applies once.
- **Safe defaults.** `post create` / `post generate` get `--post_status=draft` unless a status
  is given. `post delete` and `comment delete` without `--force` go to the trash.

The container comes from `instances.json` → `sync.container`, or from the gitignored
`instances/<id>.local.json` → `sync.container` for a pilot that is not catalogued as
connected yet. Tests: `python3 -m unittest discover -s tests` (fake docker, no WordPress).

## Legacy

The single-file `instance.json` + `instance.local.json` shape is retired. Use the catalog +
per-instance feeds above.
