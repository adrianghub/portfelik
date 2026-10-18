# Local demo session provision PoC

**Not a production Edge Function, migration, or release configuration.**

Proves whether Supabase Admin `generateLink({ type: "magiclink" })` + client
`verifyOtp({ token_hash, type })` can issue an official session while
`GOTRUE_DISABLE_SIGNUP=true` and Anonymous Auth stay off.

`hashed_token` is a sensitive credential. Tests never print it, never write it to
findings JSON, and never put it in URLs.

Results: [demo-session-provision-poc.md](../../../../docs/architecture/flows/demo-session-provision-poc.md).

```sh
# From repository root — ordinary local stack must already be running
# with invite-only Auth (see supabase/config.toml).
python3 apps/web-svelte/experiments/demo-session-provision/run.py
```

Bounded findings (no secrets): `/tmp/jakstoimy-demo-session-poc-findings.json`.
