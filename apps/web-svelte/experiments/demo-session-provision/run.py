#!/usr/bin/env python3
"""Run demo session PoC against the ordinary local Supabase stack only.

Does not change Auth settings, create remote users, or deploy Edge Functions.
Requires: Docker socket, `supabase start`, pnpm deps in apps/web-svelte.
"""
from __future__ import annotations

import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[4]
WEB = ROOT / "apps/web-svelte"


def main() -> int:
    env_text = subprocess.check_output(
        ["supabase", "status", "-o", "env"],
        cwd=ROOT,
        text=True,
        stderr=subprocess.DEVNULL,
    )
    values = dict(re.findall(r'^([A-Z0-9_]+)="([^"]*)"$', env_text, re.M))
    api = values.get("API_URL", "")
    if not api.startswith("http://127.0.0.1:"):
        print("Refusing non-loopback API_URL from local supabase status.", file=sys.stderr)
        return 2
    auth_env = subprocess.check_output(
        ["docker", "exec", "supabase_auth_portfelik", "printenv"],
        text=True,
    )
    required = {
        "GOTRUE_DISABLE_SIGNUP": "true",
        "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true",
        "GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED": "false",
    }
    for key, expected in required.items():
        match = re.search(rf"^{key}=(.*)$", auth_env, re.M)
        if not match or match.group(1).strip() != expected:
            print(f"Local Auth misconfigured: need {key}={expected}. Restart after config.toml.", file=sys.stderr)
            return 2
    test_env = {
        **os.environ,
        "POC_SUPABASE_URL": api,
        "POC_ANON_KEY": values["ANON_KEY"],
        "POC_SERVICE_KEY": values["SERVICE_ROLE_KEY"],
    }
    print("Demo session PoC on local invite-only Auth (disable_signup=true).", flush=True)
    return subprocess.call(
        ["pnpm", "exec", "vitest", "run", "--config", "experiments/demo-session-provision/vitest.config.ts"],
        cwd=WEB,
        env=test_env,
    )


if __name__ == "__main__":
    raise SystemExit(main())
