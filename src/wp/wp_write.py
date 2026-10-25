#!/usr/bin/env python3
"""Agent write path for an OS-021 WordPress instance (called via wp-write.sh).

Every write is appended to instances/<id>.log.jsonl. Risky writes (deletes that skip
the trash, SQL, uninstalls, --force, publishing, arbitrary PHP) do not run: they are
parked in instances/<id>.pending/ with a dry-run preview until a human approves them
from a terminal. New posts land as drafts; post/comment deletes go to the trash.
Both state paths are gitignored (the repo is public).
"""
import datetime
import getpass
import json
import os
import re
import secrets
import shlex
import subprocess
import sys

ROOT = os.environ.get("WP_WRITE_ROOT") or os.path.dirname(os.path.abspath(__file__))
DOCKER = os.environ.get("WP_WRITE_DOCKER") or "docker"
WP_PHAR_URL = "https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar"

EXIT_FAILED, EXIT_USAGE, EXIT_AWAITING = 1, 2, 3

READ_VERBS = {
    "list", "get", "exists", "count", "is-active", "is-installed", "status", "path",
    "version", "search", "verify-checksums", "check-update", "info", "pluck", "diff",
    "tables", "size", "prefix", "columns",
}
READ_NOUNS = {"help", "cli"}
TRASHABLE = {"post", "comment"}
TRASH_STATUS_FIELD = {"post": "post_status", "comment": "comment_approved"}
ALREADY_TRASHED = {"post": {"trash"}, "comment": {"trash", "spam"}}
DRAFT_DEFAULT = {("post", "create"), ("post", "generate")}
PUBLISH_STATUSES = {"publish", "future", "private"}
RISKY_VERBS = {"delete", "uninstall", "reset", "empty", "drop", "clean"}
RISKY_DB = {"query", "reset", "drop", "import", "clean", "cli", "create"}
CODE_NOUNS = {"eval", "eval-file", "shell"}
CODE_FLAGS = ("--exec", "--require")
NESTED = {"meta", "term"}
PREVIEW_FIELDS = {
    "post": "ID,post_title,post_status,post_type",
    "comment": "comment_ID,comment_author,comment_approved",
    "user": "ID,user_login,roles",
    "plugin": "name,status,version",
    "theme": "name,status,version",
}
SECRET_WORDS = ("pass", "key", "secret", "token", "salt")
TOKEN_RE = re.compile(r"^[0-9a-f]{8}$")


def die(msg, code=EXIT_USAGE):
    print(msg, file=sys.stderr)
    sys.exit(code)


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def resolve_instance(iid):
    catalog = json.load(open(os.path.join(ROOT, "instances.json")))
    entry = next((i for i in catalog["instances"] if i["id"] == iid), None)
    if not entry:
        die(f"unknown instance id: {iid!r}")
    sync = entry.get("sync") or {}
    local_path = os.path.join(ROOT, "instances", f"{iid}.local.json")
    if not sync.get("container") and os.path.exists(local_path):
        sync = json.load(open(local_path)).get("sync") or {}
    if not sync.get("container"):
        die(f"instance {iid!r} has no sync.container (not connected)")
    return sync["container"], sync.get("wp_path") or "/var/www/html"


def positionals(args):
    return [a for a in args if not a.startswith("-")]


def flag_value(args, name):
    for a in args:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return None


def has_flag(args, name):
    return any(a == f"--{name}" or a.startswith(f"--{name}=") for a in args)


def command_words(args):
    """(noun, verb): `post meta delete` -> ("post", "delete")."""
    pos = positionals(args)
    noun = pos[0] if pos else ""
    verb = pos[1] if len(pos) > 1 else ""
    if verb in NESTED and len(pos) > 2:
        verb = pos[2]
    return noun, verb


def is_trash_delete(args):
    pos = positionals(args)
    return len(pos) > 1 and pos[0] in TRASHABLE and pos[1] == "delete" and not has_flag(args, "force")


def classify(args):
    """Return (kind, reason): kind is read, write or risky."""
    noun, verb = command_words(args)
    if noun in CODE_NOUNS or any(a.startswith(CODE_FLAGS) for a in args):
        return "risky", "runs arbitrary PHP"
    if noun == "db" and verb in RISKY_DB:
        return "risky", f"database {verb} (raw SQL write)"
    if noun == "search-replace" and not has_flag(args, "dry-run"):
        return "risky", "bulk SQL write (use --dry-run to preview)"
    if has_flag(args, "force"):
        return "risky", "--force skips safety checks (deletes skip the trash)"
    pos = positionals(args)
    risky_at = next((i for i, w in enumerate(pos[1:4], 1) if w in RISKY_VERBS), None)
    if risky_at and not is_trash_delete(args):
        return "risky", f"{shlex.join(pos[:risky_at + 1])} is permanent (no trash)"
    if noun == "post" and verb not in READ_VERBS and (flag_value(args, "post_status") or "") in PUBLISH_STATUSES:
        return "risky", f"makes content public (post_status={flag_value(args, 'post_status')})"
    if noun in READ_NOUNS or verb in READ_VERBS or (noun and not verb):
        return "read", ""
    return "write", ""


def apply_defaults(args):
    """Return (args, defaults applied) for safe defaults on non-risky writes."""
    if tuple(positionals(args)[:2]) in DRAFT_DEFAULT and not has_flag(args, "post_status"):
        return args + ["--post_status=draft"], ["post_status=draft"]
    if is_trash_delete(args):
        return args, ["sent to trash"]
    return args, []


def is_secret(name):
    return any(w in name.lower() for w in SECRET_WORDS)


def redact_args(args):
    """Hide secret-looking flag values and values of secret-named options/meta."""
    out, pos = [], []
    for a in args:
        if a.startswith("--") and "=" in a and is_secret(a[2:].split("=", 1)[0]):
            a = a.split("=", 1)[0] + "=***"
        elif not a.startswith("-"):
            pos.append(a)
            if len(pos) > 1 and is_secret(pos[-2]) and pos[0] in ("option", "post", "user", "config"):
                a = "***"
        out.append(a)
    return out


def redact_output(text, args=()):
    if has_flag(args, "porcelain") and any("password" in w for w in positionals(args)[:3]):
        return "***"
    text = re.sub(r"(?i)(password:\s*)\S+", r"\1***", text or "")
    return text.strip()[:500]


class Instance:
    def __init__(self, iid):
        self.id = iid
        self.container, self.wp_path = resolve_instance(iid)
        self.log_path = os.path.join(ROOT, "instances", f"{iid}.log.jsonl")
        self.pending_dir = os.path.join(ROOT, "instances", f"{iid}.pending")

    def wp(self, args):
        # WP-CLI lives in the container's ephemeral /tmp (same as sync-instance.sh).
        ensure = subprocess.run(
            [DOCKER, "exec", self.container, "bash", "-c",
             f"[ -f /tmp/wp-cli.phar ] || curl -sS -o /tmp/wp-cli.phar '{WP_PHAR_URL}'"],
            capture_output=True, text=True,
        )
        if ensure.returncode != 0:
            return ensure
        # argv straight to docker exec: no shell, so agent args are never re-parsed.
        cmd = [DOCKER, "exec", self.container, "php", "/tmp/wp-cli.phar",
               f"--path={self.wp_path}", "--allow-root", *args]
        return subprocess.run(cmd, capture_output=True, text=True)

    def log(self, **entry):
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        record = {"ts": now(), "instance": self.id, **entry}
        with open(self.log_path, "a") as f:
            f.write(json.dumps(record) + "\n")

    def permanent_delete_reason(self, args):
        """Why a trash delete would be permanent after all, or None when it goes to the trash."""
        days = self.wp(["eval", "echo (int) EMPTY_TRASH_DAYS;"])
        if days.returncode != 0 or not days.stdout.strip().isdigit():
            return "could not confirm the trash is enabled (EMPTY_TRASH_DAYS)"
        if int(days.stdout.strip()) == 0:
            return "trash is disabled (EMPTY_TRASH_DAYS=0); delete would be permanent"
        pos = positionals(args)
        noun = pos[0]
        for target in pos[2:]:
            res = self.wp([noun, "get", target, f"--field={TRASH_STATUS_FIELD[noun]}"])
            status = res.stdout.strip()
            if res.returncode != 0 or not status:
                return f"could not read {noun} {target} status; delete might be permanent"
            if status in ALREADY_TRASHED[noun]:
                return f"{noun} {target} is already in {status}; delete would be permanent"
        return None

    def preview(self, args):
        """Best-effort dry run: what the risky command would touch. Reads only."""
        pos = positionals(args)
        lines = [f"would run: wp {shlex.join(redact_args(args))}"]
        if len(pos) > 2 and pos[0] in PREVIEW_FIELDS and pos[1] in RISKY_VERBS | {"update"}:
            for target in pos[2:12]:
                res = self.wp([pos[0], "get", target, f"--fields={PREVIEW_FIELDS[pos[0]]}", "--format=json"])
                lines.append(f"{pos[0]} {target}: " + redact_output(res.stdout or res.stderr)[:300])
        if pos[:2] == ["db", "query"] and len(pos) > 2:
            lines.append(f"sql: {pos[2]}")
        return lines

    def pending_path(self, token):
        if not TOKEN_RE.match(token or ""):
            die(f"invalid approval token: {token!r}")
        return os.path.join(self.pending_dir, f"{token}.json")


def actor():
    return os.environ.get("WP_WRITE_ACTOR") or "agent"


def run_and_log(inst, args, kind, reason, defaults, approval=None):
    res = inst.wp(args)
    out = res.stdout if res.returncode == 0 else (res.stderr or res.stdout)
    entry = {
        "actor": actor() if not approval else approval["requested_by"],
        "command": "wp " + shlex.join(redact_args(args)),
        "kind": kind,
        "status": "applied" if res.returncode == 0 else "failed",
        "exit": res.returncode,
        "output": redact_output(out, args),
    }
    if reason:
        entry["reason"] = reason
    if defaults:
        entry["defaults"] = defaults
    if approval:
        entry["approval"] = {"token": approval["token"], "approved_by": approval["approved_by"]}
    inst.log(**entry)
    sys.stdout.write(res.stdout)
    sys.stderr.write(res.stderr)
    return 0 if res.returncode == 0 else (res.returncode or EXIT_FAILED)


def cmd_write(inst, args):
    kind, reason = classify(args)
    if kind == "read":
        res = inst.wp(args)
        sys.stdout.write(res.stdout)
        sys.stderr.write(res.stderr)
        return res.returncode
    if kind == "write" and is_trash_delete(args):
        reason = inst.permanent_delete_reason(args)
        if reason:
            kind = "risky"
    if kind == "risky":
        token = secrets.token_hex(4)
        preview = inst.preview(args)
        os.makedirs(inst.pending_dir, exist_ok=True)
        record = {"token": token, "created": now(), "requested_by": actor(),
                  "args": args, "reason": reason, "preview": preview}
        with open(inst.pending_path(token), "w") as f:
            json.dump(record, f, indent=2)
        inst.log(actor=actor(), command="wp " + shlex.join(redact_args(args)), kind=kind,
                 status="awaiting_approval", reason=reason, preview=preview,
                 approval={"token": token})
        print(f"approval required: {reason}")
        print("\n".join(preview))
        print(f"not applied. A human approves with: ./src/wp/wp-write.sh {inst.id} --approve {token}")
        return EXIT_AWAITING
    args, defaults = apply_defaults(args)
    return run_and_log(inst, args, kind, reason, defaults)


def load_pending(inst, token):
    path = inst.pending_path(token)
    if not os.path.exists(path):
        die(f"no pending write {token!r} for {inst.id}", EXIT_FAILED)
    return path, json.load(open(path))


def cmd_approve(inst, token):
    path, record = load_pending(inst, token)
    if not sys.stdin.isatty():
        die("approval needs a human at a terminal (stdin is not a TTY); not applied", EXIT_FAILED)
    print(f"pending write {token} from {record['requested_by']} ({record['created']})")
    print(f"reason: {record['reason']}")
    print("\n".join(record["preview"]))
    sys.stdout.write("Type yes to apply: ")
    sys.stdout.flush()
    if sys.stdin.readline().strip() != "yes":
        print("not approved; still pending")
        return EXIT_FAILED
    os.remove(path)
    approval = {"token": token, "requested_by": record["requested_by"],
                "approved_by": os.environ.get("WP_WRITE_APPROVER") or getpass.getuser()}
    return run_and_log(inst, record["args"], "risky", record["reason"], [], approval)


def cmd_reject(inst, token):
    path, record = load_pending(inst, token)
    os.remove(path)
    inst.log(actor=record["requested_by"], command="wp " + shlex.join(redact_args(record["args"])),
             kind="risky", status="rejected", reason=record["reason"],
             approval={"token": token, "rejected_by": os.environ.get("WP_WRITE_APPROVER") or getpass.getuser()})
    print(f"rejected {token}; nothing applied")
    return 0


def cmd_pending(inst):
    if not os.path.isdir(inst.pending_dir):
        return 0
    for name in sorted(os.listdir(inst.pending_dir)):
        if name.endswith(".json"):
            r = json.load(open(os.path.join(inst.pending_dir, name)))
            print(f"{r['token']}  {r['created']}  {r['requested_by']}  wp {shlex.join(redact_args(r['args']))}  ({r['reason']})")
    return 0


USAGE = """Usage:
  wp-write.sh <id> [--] <wp-cli args...>   agent write (logged; risky writes wait for approval)
  wp-write.sh <id> --pending               list writes waiting for approval
  wp-write.sh <id> --approve <token>       human, at a terminal: apply a waiting write
  wp-write.sh <id> --reject <token>        discard a waiting write"""


def main(argv):
    if len(argv) < 2:
        die(USAGE)
    inst = Instance(argv[0])
    rest = argv[1:]
    if rest[0] == "--pending":
        return cmd_pending(inst)
    if rest[0] in ("--approve", "--reject"):
        if len(rest) != 2:
            die(USAGE)
        return (cmd_approve if rest[0] == "--approve" else cmd_reject)(inst, rest[1])
    if rest[0] == "--":
        rest = rest[1:]
    if not rest:
        die(USAGE)
    return cmd_write(inst, rest)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
