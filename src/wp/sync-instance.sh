#!/usr/bin/env bash
# Read-only WP-CLI sync into src/wp/instances/<id>.json (+ gitignored *.local.json).
# No secrets: no passwords, no licence keys. Tailnet hosts go only in *.local.json.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CATALOG="${ROOT}/instances.json"
PLACEHOLDER_HOST="<studio-tailnet-host>"
WP_PHAR_URL="https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar"

usage() {
  echo "Usage: $0 <instance-id>" >&2
  echo "  Reads container from instances.json sync.container; writes instances/<id>.json" >&2
  echo "  and instances/<id>.local.json (gitignored real host overlay)." >&2
  exit 1
}

[[ $# -eq 1 ]] || usage
INSTANCE_ID="$1"

command -v docker >/dev/null || { echo "docker required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 required" >&2; exit 1; }

META="$(python3 - "$CATALOG" "$INSTANCE_ID" <<'PY'
import json, sys
catalog = json.load(open(sys.argv[1]))
iid = sys.argv[2]
for inst in catalog["instances"]:
    if inst["id"] == iid:
        sync = inst.get("sync") or {}
        if not sync.get("container"):
            print(f"instance {iid!r} has no sync.container (not connected)", file=sys.stderr)
            sys.exit(2)
        print(sync["container"])
        print(sync.get("wp_path") or "/var/www/html")
        print(inst.get("name") or iid)
        print(inst.get("project") or "")
        sys.exit(0)
print(f"unknown instance id: {iid!r}", file=sys.stderr)
sys.exit(2)
PY
)"
CONTAINER="$(printf '%s\n' "$META" | sed -n '1p')"
WP_PATH="$(printf '%s\n' "$META" | sed -n '2p')"
INSTANCE_NAME="$(printf '%s\n' "$META" | sed -n '3p')"
INSTANCE_PROJECT="$(printf '%s\n' "$META" | sed -n '4p')"
OUT_TRACKED="${ROOT}/instances/${INSTANCE_ID}.json"
OUT_LOCAL="${ROOT}/instances/${INSTANCE_ID}.local.json"

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "container not found: $CONTAINER" >&2
  exit 1
fi

# Ensure WP-CLI phar exists in the container /tmp (ephemeral; does not edit site files).
docker exec "$CONTAINER" bash -c "
  if [[ ! -f /tmp/wp-cli.phar ]]; then
    curl -sS -o /tmp/wp-cli.phar '${WP_PHAR_URL}'
  fi
  php /tmp/wp-cli.phar --info --path='${WP_PATH}' >/dev/null
"

WP="php /tmp/wp-cli.phar --path=${WP_PATH} --allow-root"

wp() {
  docker exec "$CONTAINER" bash -c "${WP} $*"
}

SITEURL="$(wp option get siteurl)"
HOMEURL="$(wp option get home)"
# Prefer siteurl for admin/dashboard links.
BASE="${SITEURL%/}"

# Build tracked + local JSON via python (sanitise host; never write licence options).
python3 - "$OUT_TRACKED" "$OUT_LOCAL" "$INSTANCE_ID" "$INSTANCE_NAME" "$INSTANCE_PROJECT" "$CONTAINER" "$PLACEHOLDER_HOST" "$BASE" <<'PY'
import json, subprocess, datetime, re, sys, os

out_tracked, out_local, iid, iname, iproj, container, placeholder, base = sys.argv[1:9]

def wp(args: str) -> str:
    cmd = ["docker", "exec", container, "bash", "-c",
           f"php /tmp/wp-cli.phar --path=/var/www/html --allow-root {args}"]
    return subprocess.check_output(cmd, text=True).strip()

m = re.match(r"https?://([^/]+)", base)
real_host = m.group(1) if m else ""
sanitized = f"https://{placeholder}"
if ":" in real_host:
    sanitized = f"https://{placeholder}:{real_host.split(':', 1)[1]}"

plugins_raw = json.loads(wp("plugin list --fields=name,status,version,update,title --format=json"))
themes_raw = json.loads(wp("theme list --fields=name,status,version,update,title --format=json"))

def norm_update(u):
    if u is False or u is None or u == "" or u == "none":
        return "none"
    if u is True or u == "available":
        return "available"
    return str(u)

plugins = [{
    "name": p.get("title") or p.get("name"),
    "slug": p.get("name"),
    "version": p.get("version") or "",
    "status": p.get("status"),
    "update": norm_update(p.get("update")),
} for p in plugins_raw]

themes = [{
    "name": t.get("title") or t.get("name"),
    "stylesheet": t.get("name"),
    "version": t.get("version") or "",
    "status": t.get("status"),
    "update": norm_update(t.get("update")),
} for t in themes_raw]

acf_active = False
acf_pro = False
acf_version = ""
try:
    acf_meta = wp('''eval '
$out = ["active"=>false,"pro"=>false,"version"=>""];
if (function_exists("is_plugin_active")) {
  foreach (get_plugins() as $file => $data) {
    if (stripos($data["Name"], "Advanced Custom Fields") !== false) {
      $out["active"] = is_plugin_active($file);
      $out["version"] = $data["Version"];
      $out["pro"] = (defined("ACF_PRO") && ACF_PRO) || (stripos($data["Name"], "PRO") !== false);
    }
  }
}
echo json_encode($out);
' ''')
    meta = json.loads(acf_meta)
    acf_active = bool(meta.get("active"))
    acf_pro = bool(meta.get("pro"))
    acf_version = meta.get("version") or ""
except Exception:
    pass

groups, blocks, local_json = [], [], ""
if acf_active:
    try:
        groups = json.loads(wp('''eval '
echo json_encode(array_map(function($x){
  return ["key"=>$x["key"],"title"=>$x["title"],"local"=>$x["local"]??null,"active"=>!empty($x["active"])];
}, acf_get_field_groups()));
' '''))
    except Exception:
        groups = []
    try:
        blocks = json.loads(wp('''eval '
$blocks = [];
foreach (WP_Block_Type_Registry::get_instance()->get_all_registered() as $name => $t) {
  if (str_starts_with($name, "acf/")) $blocks[] = ["name"=>$name,"title"=>$t->title ?? ""];
}
echo json_encode($blocks);
' '''))
    except Exception:
        blocks = []
    try:
        local_json = wp('''eval 'echo (string) acf_get_setting("save_json");' ''')
        # Prefer path relative to wp root when under /var/www/html
        if local_json.startswith("/var/www/html/"):
            local_json = local_json[len("/var/www/html/"):]
    except Exception:
        local_json = ""

# SEO summary: instance-specific helpers when present (Steve staging demo); never call paid APIs.
seo_summary = None
seo_notes = "Per-instance SEO dashboard URL. Populate summary from the site's own dashboard code when available; do not start rank tracking or spend DataForSEO credit from this sync."
seo_nature = "none"
seo_label = "SEO dashboard"
seo_page = ""
try:
    if wp('''eval 'echo function_exists("steve_seo_totals") ? "yes" : "no";' ''') == "yes":
        seo_summary = json.loads(wp('''eval 'echo json_encode(steve_seo_totals());' '''))
        if isinstance(seo_summary, dict) and "checks" in seo_summary:
            seo_summary = {
                "keywords": seo_summary.get("keywords"),
                "ranking": seo_summary.get("ranking"),
                "top40": seo_summary.get("top40"),
                "top10": seo_summary.get("top10"),
                "impressions": seo_summary.get("impressions"),
                "clicks": seo_summary.get("clicks"),
                "cited": seo_summary.get("cited"),
                "mentioned": seo_summary.get("mentioned"),
                "aeo_checks": seo_summary.get("checks"),
            }
        seo_nature = "dummy"
        seo_label = "SEO tracking (wp-admin, staging demo)"
        seo_page = "/wp-admin/admin.php?page=steve-seo-tracking"
        seo_notes = (
            "Staging Open Search-style keyword tracking (mu-plugin). "
            "Hand-set demonstration values; nothing is tracked or fetched. "
            "Opt-in when WP_ENVIRONMENT_TYPE=staging."
        )
except Exception:
    pass

env_type = ""
try:
    env_type = wp('''eval 'echo defined("WP_ENVIRONMENT_TYPE") ? WP_ENVIRONMENT_TYPE : "";' ''')
except Exception:
    pass

# Production URL heuristics (public site, not the Studio host).
prod = ""
if iid == "steve":
    prod = "https://steveapps.co/"
elif iid == "oganiko":
    prod = "https://oganiko.com/"

synced_at = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

feed = {
    "id": iid,
    "name": iname,
    "project": iproj,
    "status": "connected",
    "source": f"read-only sync from {container} (Docker on Studio; Tailscale Serve)",
    "synced_at": synced_at,
    "site": {
        "url": sanitized + "/",
        "admin_url": sanitized + "/wp-admin/",
        "wp_version": wp("core version"),
        "php_version": wp("eval 'echo PHP_VERSION;'"),
        "environment": f"Docker · {env_type or 'local'} · Tailscale Serve",
        "production_url": prod,
    },
    "plugins": plugins,
    "themes": themes,
    "settings": {
        "blogname": wp("option get blogname"),
        "blogdescription": wp("option get blogdescription"),
        "permalink_structure": wp("option get permalink_structure"),
        "timezone_string": wp("option get timezone_string"),
        "date_format": wp("option get date_format"),
        "start_of_week": wp("option get start_of_week"),
    },
    "acf": {
        "active": acf_active,
        "pro": acf_pro,
        "version": acf_version,
        "local_json_path": local_json or "",
        "field_groups": groups,
        "blocks": blocks,
    } if acf_active or groups else None,
    "seo": {
        "dashboard_url": (sanitized + seo_page) if seo_page else "",
        "dashboard_label": seo_label,
        "data_nature": seo_nature,
        "notes": seo_notes,
        "summary": seo_summary,
    },
}

# Refuse to write secrets into tracked output
blob = json.dumps(feed).lower()
for bad in ("password", "licence_key", "license_key", "acf_pro_license", "auth_key", "secure_auth"):
    if bad in blob:
        print(f"refusing to write tracked feed: matched secret-like token {bad!r}", file=sys.stderr)
        sys.exit(3)
if real_host and real_host.split(":")[0] in json.dumps(feed):
    print("refusing to write tracked feed: real host leaked", file=sys.stderr)
    sys.exit(3)

local = {
    "site": {
        "url": base + "/",
        "admin_url": base + "/wp-admin/",
    },
    "seo": {
        "dashboard_url": (base + seo_page) if seo_page else "",
    },
}

os.makedirs(os.path.dirname(out_tracked), exist_ok=True)
with open(out_tracked, "w") as f:
    json.dump(feed, f, indent=2)
    f.write("\n")
with open(out_local, "w") as f:
    json.dump(local, f, indent=2)
    f.write("\n")

print(f"wrote {out_tracked}")
print(f"wrote {out_local} (gitignored)")
print(f"plugins={len(plugins)} themes={len(themes)} acf_groups={len(groups)} acf_blocks={len(blocks)}")
PY

# Keep catalog status in sync for known ids
python3 - "$CATALOG" "$INSTANCE_ID" <<'PY'
import json, sys
path, iid = sys.argv[1], sys.argv[2]
data = json.load(open(path))
for inst in data["instances"]:
    if inst["id"] == iid:
        inst["status"] = "connected"
json.dump(data, open(path, "w"), indent=2)
open(path, "a").write("\n")
print(f"updated {path} status for {iid}")
PY
