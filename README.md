# OS-021-WordPress-CMS

> Make a WordPress CMS operable via an agent.

## Where to start

- **For working on this project**: read `AGENTS.md` in this folder. It is the canonical bootstrap manifest — it tells any agent (or human) which files to read and in what order. `CLAUDE.md` is a one-line shim that imports it.
- **For project status, decisions, and history**: see the vault project page at `vault/projects/OS-021-WordPress-CMS/README.md`.
- **Operator UI**: open `docs/project-page/index.html` — Overview + Installed Plugins (and more tabs as surfaces are wired).

## Quick facts

- **Project code**: OS-021-WordPress-CMS
- **Created**: 2026-09-12
- **GitHub**: https://github.com/parrysan/OS-021-WordPress-CMS *(pending auth)*

## Structure

```
.
├── AGENTS.md    # canonical bootstrap manifest — read this first
├── CLAUDE.md    # one-line @AGENTS.md shim (Claude Code compatibility)
├── README.md    # this file
├── src/         # application code
├── tests/       # tests
└── docs/        # technical docs + project-page operator UI
```

All durable knowledge — decisions, research, status narrative — lives in the vault project page, **not** in `docs/`. The code repo holds code, config, and build artefacts.
