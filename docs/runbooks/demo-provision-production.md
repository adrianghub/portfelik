# Production demo accounts

Production uses `emqzcygfwcvbmhxhfkcc` and `https://app.jakstoimy.pl`.
Staging keys and its opt-in flags must stay on staging.

## Configuration before promotion

1. Create a production Cloudflare Turnstile widget. Allow `app.jakstoimy.pl`
   and the native app's `localhost` hostname, then verify the widget on both
   targets. Do not use Cloudflare test keys for a public release.
2. Set GitHub environment **Production** variable `PUBLIC_TURNSTILE_SITE_KEY`
   to that widget's public site key. Both Pages and Play Internal builds use it;
   both fail when it is missing or a standard test key.
3. In production Supabase Edge Function secrets, set the matching
   `DEMO_TURNSTILE_SECRET` and a unique, randomly generated
   `DEMO_PROVISION_CLIENT_SALT`. Never put these values in a PR, log, or chat.
4. Set `DEMO_PROVISION_REQUIRE_TURNSTILE=true`. Keep
   `DEMO_PROVISION_TRUSTED_IP_HEADER` unset: without verified ingress, the shared
   rate-limit bucket is intentional. Initial limits are 5 attempts per 60 seconds
   globally and 500 active demo identities, with a 180-second reservation hold
   (the handler defaults). Set explicit lower limits if operating capacity
   requires them. Do not copy staging's lease or persistent opt-in flags.
5. Keep `DEMO_PROVISION_ENABLED=false` until configuration is ready. Enabling
   public provisioning is a separate, explicit operational action. Deployment
   must never automatically override an operator's emergency kill switch.

## Release and activation

Promote through `scripts/promote.sh --merge` after staging and review are green.
The production workflow manages `open-demo-account`; changes to its source,
Supabase configuration, or the production workflow cause it to be deployed.
Configuration/workflow changes reconcile all managed functions.

After confirming the keys and safeguards above, set
`DEMO_PROVISION_ENABLED=true` in production Supabase. A request containing a
caller-selected identity, for example `{"userId":"release-probe"}`, must return
HTTP 400 with `identity_not_accepted`. This validation happens before provisioning
and does not create an account. HTTP 503 `demo_provision_disabled` means the kill
switch is still off; a missing function or gateway JWT error is also a release
blocker. Do not send anonymous provisioning probes until Turnstile is required.

Verify one real browser demo flow through Turnstile, then reload and confirm the
same demo session persists. Check retry after a script download error and test
the signed Android build on a physical device. Test group invitations using
ordinary test identities; demo identities intentionally cannot join a group.
Never describe isolated browser tests as physical-device validation.

## Disable or roll back

Set `DEMO_PROVISION_ENABLED=false` immediately to stop new provisioning. This
does not delete existing demo identities or revoke their sessions. Preserve the
operation journal, reservations, and orphan records; use the guarded cleanup
procedures in [the staging runbook](demo-provision-staging.md) only with a reviewed
production scope. A subsequent application deployment leaves the kill switch
unchanged.
