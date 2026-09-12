---
title: "OS-021-WordPress-CMS — WordPress CMS"
type: project-bootstrap
created: "2026-09-12"
---

# OS-021-WordPress-CMS — WordPress CMS

> **Bootstrap order — read these in order before doing any work in this project:**
>
> 1. `~/.claude/CLAUDE.md` → `Open-Memory-Vault/system/identity/MASTER-PROMPT.md` — Phil's identity (auto-loaded via symlink in Claude Code; other tools should mirror this).
> 2. `~/AGENT.md` → `agent-config/AGENT.md` — global operating manual (work style, skills routing, secrets policy, layering rules in §2.10).
> 3. `Open-Memory-Vault/AGENTS.md` — vault operating contract (read **only** if you will write to the vault during this session).
> 4. `Open-Memory-Vault/projects/OS-021-WordPress-CMS/README.md` — durable project page (status, decisions, recent activity, vault-side context).
> 5. **This file (`AGENTS.md`)** — project-specific overrides and live operational references (below). `CLAUDE.md` in this folder is a one-line `@AGENTS.md` shim so Claude Code loads it too.
>
> **The project's `AGENTS.md` is a bootstrap manifest, not a knowledge dump.** It points at everything else. Durable knowledge lives in the vault project page. Do not duplicate.

---

## At a glance

- **Code**: `OS-021`
- **Name**: WordPress CMS
- **Stakeholder**: Phil (self)
- **Type**: `aios`
- **Status**: `active`
- **Priority**: `medium`
- **Revenue lane**: `4-aios`
- **Autonomy mode**: `co-pilot` — Phil drives, agent assists. See master prompt.
- **Purpose** (one sentence): Make a WordPress CMS operable via an agent.
- **Client dashboard**: _(not applicable — internal AIOS infrastructure)_
- **Last touched**: `2026-09-12`

---

## Where things live

| Resource | Location |
|---|---|
| **Code root** | this folder (`dev/OS-021-WordPress-CMS/`) |
| **Project docs** | `./docs/` |
| **Vault project page** | `Open-Memory-Vault/projects/OS-021-WordPress-CMS/README.md` |
| **GitHub repo** | https://github.com/parrysan/OS-021-WordPress-CMS *(pending — gh auth broken at scaffold)* |
| **Research store** | [OG-Research/OS-021-WordPress-CMS](https://drive.google.com/drive/folders/1ksMgv9awpOYfn5i4LZTadjbdoo1Mua0y) (`research/`, `assets/`, `deliverables/`) |
| **External systems** | WordPress Studio (local WP instances); WP-CLI; ACF Local JSON |
| **Related** | `OS-000-RES` research `ai-wordpress-cms` (2026-08-23); `OS-012-Headless-CMS` (Sanity — different stack); `OG-019-Phil-v2` public narrative |

---

## Live references

> **Operational facts that should never have to be re-discovered.** Deployed URLs, store handles, theme IDs, API endpoints, credentials *location* (never the credentials themselves — those live in the global `.env`, see global AGENT.md §2.5). Update this section whenever a fact changes — it is the canonical source.

- **Production URL**: none yet
- **Client area**: `docs/client-area/` (Overview + Installed Plugins + Themes + Settings + ACF — Client Area style)
- **Staging / preview URL**: http://127.0.0.1:8022/docs/client-area/ (`python3 -m http.server 8022 --bind 127.0.0.1` from repo root); WordPress instance URL TBD once Studio site is linked
- **Platform handle / project ID**: none yet
- **Other identifiers**: architecture lock in `OS-000-RES/docs/intelligence/reports/2026-08-23-research-ai-wordpress-cms.md` — WP binding · Studio + MCP/skills · hybrid/block + ACF
- **Credentials**: stored in global `.env` under `WP_CMS_*` (none yet)
- **GitHub**: pending — create with `gh repo create parrysan/OS-021-WordPress-CMS --public --source=. --remote=origin --push` after `gh auth login`
- **NotebookLM**: (not provisioned — opt-in, add later)

---

## Tech stack

Depends on project scope — no default web stack. Define as needed.

Working defaults (from locked research, refine as facts emerge):
- **CMS binding**: WordPress (classic/hybrid + ACF; not ZipWP/Elementor Angie)
- **Agent loop**: WordPress Studio + Studio MCP/skills + WP-CLI
- **Operator UI**: Client Area under `docs/client-area/` (STR-style hub; tabs for Installed Plugins, Themes, Settings, ACF)
- **Front tokens**: OS-000 Design System (sites are theme-neutral + own brand — not OGANIKO green)

---

## Project-specific rules

> Domain rules, naming conventions, "do not" lists. Anything an LLM working in this project must know that isn't true globally.

- **WordPress is a binding, not a second design system.** Fronts pull OS-000 tokens; client sites are not OGANIKO green.
- **Do not collide with OS-012.** That project is Sanity headless CMS. Tartak stays on Sanity — do not rip it for WordPress.
- **Local Studio loop first.** Agents edit via WP-CLI / REST against a local WordPress Studio site before any production host.
- **Clients get fields, not the Site Editor.** Prefer ACF (Local JSON) + locked templates for client edit.
- **Reuse research, don't re-litigate.** Architecture locked 2026-08-23 in OS-000-RES; Winston / Magda Roka are greenfield WP candidates when prioritized.

---

## Skills

> List any project-specific skills in `./.claude/skills/`. If none, the project uses the global library at `~/OG/shared-skills/`. Do not duplicate the global skills inventory here — see global AGENT.md §2.2.

- **Project-local skills**: none — uses global library
- **Most relevant global skills for this project**: `og-project`, `meta-find-skills`, `og-research`

---

## Notes for the next session

> **Optional, ephemeral.** A 2–3 line free-form scratch pad of "where I left off" — not durable knowledge. Durable decisions belong in the vault project page. Wipe and rewrite freely.

Scaffolded 2026-09-12. Client Area (STR style) with Overview + Installed Plugins (+ Themes, Settings, ACF). Next: link a WordPress Studio instance and sync `src/wp/instance.json`.
