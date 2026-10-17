# First invite checklist

Operator checklist before inviting the first test users. Confirm against
production code and CI — not old design dumps.

## Before the first invite

- [ ] Latest invite-day work is on `main` and deployed to `app.jakstoimy.pl`
- [ ] Prod migrate CI parity green; Edge Functions for invites deployed
- [ ] Google OAuth + redirects for `app.jakstoimy.pl`; public sign-up off
- [ ] Resend API key and verified sender domain configured (`RESEND_API_KEY`,
  `GROUP_INVITATION_FROM_EMAIL`) in the target Supabase project
- [ ] Invite from Android and web to an address outside the sender account;
  verify delivery, acceptance, retry, cancellation, and history removal
- [ ] Staging smoke green (`dev` → staging Pages + staging Supabase)
- [ ] Privacy policy live and linked from login

## After invite

Watch import, first plan, group invite friction, and demo usage for 1–2 weeks.
Keep notes in issues — not in this file.

## Related

- [env-workflow.md](../architecture/env-workflow.md)
- [ops-access-lockdown.md](./ops-access-lockdown.md)
- [secret-rotation.md](./secret-rotation.md)

## Invitation delivery configuration

Google Play Internal testers control Android installation only. They do not
control group invitation recipients, Supabase sign-in, or Resend delivery.
Group owners can invite any valid email; the server checks ownership and send
quotas. `GROUP_INVITATION_RECIPIENT_ALLOWLIST` is retired and ignored. Remove
that obsolete secret when maintaining each environment.

A failed email still leaves a pending invitation visible to its sender, with a
retry action. Check the Resend sender domain and delivery logs when retry fails;
never tell the user to join the Play tester list to receive an invitation.
Expired invitations do not block new invitations. Owners can delete expired or
finished invitations; deleting an accepted invitation does not remove a member.
