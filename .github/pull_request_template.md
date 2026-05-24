## Summary

-

## Why

-

## Gates

- [ ] `pnpm exec svelte-check --tsconfig ./tsconfig.json` is 0/0
- [ ] `pnpm lint` is clean
- [ ] `pnpm format:check` is clean
- [ ] `pnpm test:unit` is green
- [ ] RLS suite run if schema or policies changed
- [ ] Secret scan is clean

## Migrations

- [ ] New migration names are idempotent and not amended after apply
- [ ] RLS is enabled on new tables
- [ ] Applied migrations were not modified
- [ ] Not applicable

## Paraglide

- [ ] Recompiled Paraglide if `messages/pl.json` changed
- [ ] Not applicable

## Branch Sync

- [ ] Branch was synced from `origin/main` / `origin/dev` per `CLAUDE.md`
