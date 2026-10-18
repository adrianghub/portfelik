# Local Anonymous Auth security experiment

**Not a production feature, migration, session broker or release configuration.**
The experiment demonstrates both working controls and security gaps. A green test
asserting that an anonymous account can become permanent is evidence of a gap,
not permission to enable Anonymous Auth.

Results, decision matrix and costs:
[Anonymous Auth PoC](../../../../docs/architecture/flows/anonymous-auth-poc.md).

From the repository root, with the ordinary local Supabase Docker stack running:

```sh
docker pull public.ecr.aws/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b
python3 apps/web-svelte/experiments/anonymous-auth/run.py
```

Requirements: Docker local socket, Python 3, pnpm, installed web dependencies and
the normal `supabase_db_portfelik`, `supabase_auth_portfelik`,
`supabase_rest_portfelik` containers. No remote Supabase credentials are used.

The runner copies only public/Auth/extension schema definitions and Auth migration
version history into a new random `jakstoimy_auth_poc_<suffix>` database. It copies
no users, financial rows, Vault secrets or scheduled jobs. Auth v2.197.0 and REST
run in separate containers on loopback ports. Test keys use the local stack's
signing configuration; they are API fixture keys, never an implementation that
issues demo user sessions using service-role. User sessions are issued by GoTrue.

The experiment alone sets global signup on, anonymous sign-in on, email
confirmation on and the private hook on. It initially tests the unchanged
`profiles.email NOT NULL` constraint, then permits null only in the disposable
copy to continue the anonymous security audit. The ordinary stack and
`supabase/config.toml` are not changed by this runner.

The private hook defaults to denial for non-anonymous creation. An experimental
server-only grant adapter is tested after the existing Edge handler verifies the
invitation token and recipient. Hashes, invitation ID, operation, expiry,
consumption time and the generated user ID are stored server-side. Neither a
pending email address nor editable metadata alone grants permission. The two
other private tables are fault-injection and observation fixtures, not a proposed
production data model.

No UI, demo seed/reset, retention job or production endpoint is added. The suite
is deliberately separate from normal unit/RLS tests; it requires its disposable
services. The standard RLS suite still tests ordinary invitation-only Auth.

The runner removes only the database and containers it created in `finally`.
An OS kill can interrupt `finally`; inspect names before manually removing any
leftover `jakstoimy_auth_poc_*` resources. No broad cleanup command is provided.
A bounded, non-secret findings JSON is written to
`/tmp/jakstoimy-anonymous-poc-findings.json`.
