# First invite checklist

Operator checklist before inviting the first test users. Confirm against
production code and CI — not old design dumps.

## Before the first invite

- [ ] Latest invite-day work is on `main` and deployed to `app.jakstoimy.pl`
- [ ] Prod migrate CI parity green; Edge Functions for invites deployed
- [ ] Google OAuth + redirects for `app.jakstoimy.pl`; public sign-up off
- [ ] Resend / invite email domain configured
- [ ] Staging smoke green (`dev` → staging Pages + staging Supabase)
- [ ] Privacy policy live and linked from login

## After invite

Watch import, first plan, group invite friction, and demo usage for 1–2 weeks.
Keep notes in issues — not in this file.

## Related

- [env-workflow.md](../architecture/env-workflow.md)
- [ops-access-lockdown.md](./ops-access-lockdown.md)
- [secret-rotation.md](./secret-rotation.md)
