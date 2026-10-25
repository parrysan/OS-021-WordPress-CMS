"""Behavioural tests for src/wp/wp-write.sh against a fake docker (no WordPress needed).

Run: python3 -m unittest discover -s tests
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(REPO, "src", "wp", "wp-write.sh")

FAKE_DOCKER = textwrap.dedent("""\
    #!/usr/bin/env python3
    import json, os, sys
    args = sys.argv[1:]
    with open(os.environ["FAKE_DOCKER_CALLS"], "a") as f:
        f.write(json.dumps(args) + "\\n")
    wp = args[args.index("--allow-root") + 1:] if "--allow-root" in args else []
    if wp[:1] == ["fail"]:
        print("Error: boom", file=sys.stderr)
        sys.exit(1)
    if wp[:2] == ["post", "get"]:
        print(json.dumps({"ID": int(wp[2]), "post_title": "Hello", "post_status": "publish"}))
    elif wp[:2] == ["user", "create"]:
        print("Success: Created user 7.\\nPassword: s3cretGenerated")
    elif wp:
        print("Success: ok")
    """)


def read_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f]


def read_text(path):
    with open(path) as f:
        return f.read()


class WpWriteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.tmp, "instances"))
        with open(os.path.join(self.tmp, "instances.json"), "w") as f:
            json.dump({"instances": [
                {"id": "pilot", "sync": {"container": "pilot-wp"}},
                {"id": "overlay", "sync": None},
                {"id": "stub", "sync": None},
            ]}, f)
        with open(os.path.join(self.tmp, "instances", "overlay.local.json"), "w") as f:
            json.dump({"sync": {"container": "overlay-wp"}}, f)
        self.docker = os.path.join(self.tmp, "docker")
        with open(self.docker, "w") as f:
            f.write(FAKE_DOCKER)
        os.chmod(self.docker, 0o755)
        self.calls = os.path.join(self.tmp, "calls.jsonl")
        self.env = {**os.environ, "WP_WRITE_ROOT": self.tmp, "WP_WRITE_DOCKER": self.docker,
                    "FAKE_DOCKER_CALLS": self.calls, "WP_WRITE_ACTOR": "test-agent",
                    "WP_WRITE_APPROVER": "phil"}

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_write(self, *args, stdin=subprocess.DEVNULL):
        return subprocess.run([SCRIPT, *args], env=self.env, capture_output=True, text=True, stdin=stdin)

    def approve_at_terminal(self, token, answer):
        master, slave = os.openpty()
        try:
            os.write(master, (answer + "\n").encode())
            return subprocess.run([SCRIPT, "pilot", "--approve", token], env=self.env,
                                  capture_output=True, text=True, stdin=slave)
        finally:
            os.close(master)
            os.close(slave)

    def wp_calls(self):
        if not os.path.exists(self.calls):
            return []
        calls = read_jsonl(self.calls)
        return [c[c.index("--allow-root") + 1:] for c in calls if "--allow-root" in c]

    def log(self, iid="pilot"):
        path = os.path.join(self.tmp, "instances", f"{iid}.log.jsonl")
        return read_jsonl(path) if os.path.exists(path) else []

    def pending(self):
        d = os.path.join(self.tmp, "instances", "pilot.pending")
        return sorted(os.listdir(d)) if os.path.isdir(d) else []

    def park(self, *args):
        res = self.run_write("pilot", *args)
        self.assertEqual(res.returncode, 3, res.stderr)
        return self.log()[-1]["approval"]["token"]

    # Safe defaults
    def test_post_create_lands_as_draft(self):
        res = self.run_write("pilot", "post", "create", "--post_title=Hi")
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(self.wp_calls(), [["post", "create", "--post_title=Hi", "--post_status=draft"]])
        entry = self.log()[-1]
        self.assertEqual(entry["status"], "applied")
        self.assertEqual(entry["defaults"], ["post_status=draft"])
        self.assertEqual(entry["actor"], "test-agent")

    def test_explicit_draft_or_pending_status_is_kept(self):
        self.run_write("pilot", "post", "create", "--post_status=pending")
        self.assertEqual(self.wp_calls(), [["post", "create", "--post_status=pending"]])

    def test_post_delete_goes_to_trash_without_approval(self):
        res = self.run_write("pilot", "post", "delete", "12")
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(self.wp_calls(), [["post", "delete", "12"]])
        self.assertEqual(self.log()[-1]["defaults"], ["sent to trash"])

    # Approval gate
    def test_risky_writes_wait_and_do_not_run(self):
        cases = [
            ["post", "delete", "12", "--force"],
            ["post", "create", "--post_status=publish"],
            ["post", "update", "12", "--post_status=publish"],
            ["db", "query", "DELETE FROM wp_posts"],
            ["plugin", "uninstall", "akismet"],
            ["plugin", "delete", "hello"],
            ["user", "delete", "3"],
            ["option", "delete", "blogname"],
            ["post", "meta", "delete", "12", "price"],
            ["search-replace", "old", "new"],
            ["eval", "echo 1;"],
            ["plugin", "list", "--exec=unlink('x');"],
        ]
        for args in cases:
            with self.subTest(args=args):
                self.park(*args)
                self.assertNotIn(args, self.wp_calls())
                self.assertEqual(self.log()[-1]["status"], "awaiting_approval")
        self.assertEqual(len(self.pending()), len(cases))

    def test_dry_run_preview_reads_the_target(self):
        res = self.run_write("pilot", "post", "delete", "12", "--force")
        self.assertIn("approval required", res.stdout)
        self.assertIn('"post_title": "Hello"', res.stdout)
        self.assertIn("--approve", res.stdout)
        self.assertTrue(all(c[1] == "get" for c in self.wp_calls()))

    def test_search_replace_dry_run_is_not_gated(self):
        res = self.run_write("pilot", "search-replace", "old", "new", "--dry-run")
        self.assertEqual(res.returncode, 0, res.stderr)

    def test_approve_refused_without_a_terminal(self):
        token = self.park("post", "delete", "12", "--force")
        res = self.run_write("pilot", "--approve", token)
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("TTY", res.stderr)
        self.assertNotIn(["post", "delete", "12", "--force"], self.wp_calls())
        self.assertEqual(self.pending(), [f"{token}.json"])

    def test_approve_at_terminal_applies_once(self):
        token = self.park("post", "delete", "12", "--force")
        res = self.approve_at_terminal(token, "yes")
        self.assertEqual(res.returncode, 0, res.stderr + res.stdout)
        self.assertIn(["post", "delete", "12", "--force"], self.wp_calls())
        entry = self.log()[-1]
        self.assertEqual(entry["status"], "applied")
        self.assertEqual(entry["actor"], "test-agent")
        self.assertEqual(entry["approval"], {"token": token, "approved_by": "phil"})
        self.assertEqual(self.pending(), [])
        self.assertNotEqual(self.approve_at_terminal(token, "yes").returncode, 0)

    def test_approve_needs_the_word_yes(self):
        token = self.park("plugin", "uninstall", "akismet")
        res = self.approve_at_terminal(token, "y")
        self.assertNotEqual(res.returncode, 0)
        self.assertNotIn(["plugin", "uninstall", "akismet"], self.wp_calls())
        self.assertEqual(self.pending(), [f"{token}.json"])

    def test_approved_publish_is_not_forced_to_draft(self):
        token = self.park("post", "create", "--post_status=publish")
        self.approve_at_terminal(token, "yes")
        self.assertIn(["post", "create", "--post_status=publish"], self.wp_calls())

    def test_reject_discards(self):
        token = self.park("user", "delete", "3")
        res = self.run_write("pilot", "--reject", token)
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(self.log()[-1]["status"], "rejected")
        self.assertEqual(self.pending(), [])
        self.assertNotIn(["user", "delete", "3"], self.wp_calls())

    def test_pending_lists_waiting_writes(self):
        token = self.park("plugin", "delete", "hello")
        res = self.run_write("pilot", "--pending")
        self.assertIn(token, res.stdout)
        self.assertIn("plugin delete hello", res.stdout)

    def test_token_cannot_escape_the_pending_dir(self):
        res = self.run_write("pilot", "--reject", "../../instances")
        self.assertEqual(res.returncode, 2)
        self.assertIn("invalid approval token", res.stderr)

    # Activity log
    def test_reads_run_without_logging(self):
        res = self.run_write("pilot", "post", "list")
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(self.wp_calls(), [["post", "list"]])
        self.assertEqual(self.log(), [])

    def test_failed_write_is_logged(self):
        res = self.run_write("pilot", "fail", "now")
        self.assertEqual(res.returncode, 1)
        entry = self.log()[-1]
        self.assertEqual(entry["status"], "failed")
        self.assertIn("boom", entry["output"])

    def test_log_redacts_secrets(self):
        self.run_write("pilot", "user", "create", "bob", "b@example.test", "--user_pass=hunter2")
        self.run_write("pilot", "option", "update", "stripe_secret_key", "sk_live_abc")
        blob = read_text(os.path.join(self.tmp, "instances", "pilot.log.jsonl"))
        for secret in ("hunter2", "sk_live_abc", "s3cretGenerated"):
            self.assertNotIn(secret, blob)
        self.assertIn("--user_pass=***", blob)

    def test_args_reach_docker_without_a_shell(self):
        self.run_write("pilot", "post", "create", "--post_title=$(touch /tmp/x); `id`")
        self.assertEqual(self.wp_calls()[0][2], "--post_title=$(touch /tmp/x); `id`")

    # Instance resolution
    def test_container_from_gitignored_overlay(self):
        res = self.run_write("overlay", "post", "create", "--post_title=Hi")
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertIn("overlay-wp", read_text(self.calls))
        self.assertEqual(len(self.log("overlay")), 1)

    def test_unconnected_instance_refused(self):
        res = self.run_write("stub", "post", "create")
        self.assertEqual(res.returncode, 2)
        self.assertIn("not connected", res.stderr)


if __name__ == "__main__":
    unittest.main()
