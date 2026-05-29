# MVP Hardening Backlog

Living record of pre-MVP polish for Portfelik (excluding `/dashboard`). Complements [intent-oriented-ui.md](./intent-oriented-ui.md).

## Product decisions (locked for MVP)

| Decision | Choice |
|----------|--------|
| List → transaction | Complete list with optional expense tx (default ON) |
| Transaction → list linking | **Not shipped** — bank-import duplicate detection reconciles |
| Index list mode pills | Removed from cards; mode pill stays on detail only |
| Index section label | **Na dziś** (not “Aktywne”) for active bucket |
| Categories | Per-user, fully editable/deletable (seeded defaults) |
| Recurring | Frequency UI: daily / weekly / monthly / yearly + preview |
| Push disable | Per-device localStorage opt-out survives re-login |

## Shipped increments

### Transactions
- Whole-month date labels + locative empty states
- Category filter search + form combobox
- Recurring frequency engine + form UI + detail summary
- Filter/search-aware empty states + category filter chips
- Attach-to-list UI removed

### Shopping lists
- Optional tx on complete (`p_create_transaction`)
- Portal kebab menu (escapes card overflow)
- DoneView honest copy when tx skipped; post-complete “Dodaj transakcję”
- Archived delete confirm copy; section renamed “Na dziś”

### Settings & shell
- Per-user categories migration
- Profile push enable/disable/blocked UI + opt-out loop
- Notifications mobile Sheet
- Category FAB + dark mobile list; FK delete toast
- Offline banner below header on mobile
- SW push deep links to `/transactions?txId=…`

## Verification checklist

- [x] Shopping list kebab → edit/delete on mobile
- [x] Notifications Sheet on mobile
- [x] Settings tabs reachable; profile edit + push toggle
- [x] Push disable persists after re-login
- [x] Month label / locative empty state
- [x] Recurring frequency UI + detail summary
- [x] DoneView honest when tx skipped; add-tx recovery
- [x] No attach-to-list UI
- [x] Filter-aware transaction empty states
- [x] Category in-use delete toast

## Deferred (post-MVP)

- Dexie offline write outbox
- DayPicker presets (Dziś / Wczoraj)
- Virtualized transaction / bank-import tables
- Dashboard hardening
- Install prompt UX
- Attach shopping list from transaction (RPC exists, UI deferred)

## Branch promotion notes

Migrations to promote with this bundle (if not already on staging/prod):

- `20260604000000_complete_list_optional_tx.sql`
- `20260605000000_categories_per_user.sql`
- `20260606000000_recurring_frequency.sql`

After deploy: run `pnpm exec paraglide-js compile`, full gates, targeted E2E on shopping-lists + transactions.
