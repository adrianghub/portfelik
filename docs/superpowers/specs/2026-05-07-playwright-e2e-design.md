# Playwright E2E Test Suite — Design Spec

**Date:** 2026-05-07  
**Project:** Portfelik (SvelteKit + Supabase)  
**Scope:** Phase 8 hardening — e2e test coverage for core user flows

---

## Context

- SvelteKit `adapter-static`, no SSR
- Supabase auth: Google OAuth only (no email/password)
- Auth guard in `+layout.svelte`: `supabase.auth.getSession()` on mount → redirect to `/login` if no session
- Deployed to Cloudflare Pages; CI via GitHub Actions

---

## Auth Strategy: Mock Session Injection

Google OAuth cannot be automated in CI. Instead:

1. **`page.addInitScript()`** injects a fake Supabase session into `localStorage` before any page script runs. Key: `sb-emqzcygfwcvbmhxhfkcc-auth-token`.
2. `supabase.auth.getSession()` reads from localStorage and returns the session without a network call (token not expired → no refresh attempt).
3. All Supabase network calls (`**/rest/v1/**`, `**/auth/v1/**`) are intercepted via `page.route()` and fulfilled with fixture JSON — no real Supabase connection needed.
4. Push/service-worker registration calls are also intercepted and suppressed.

**Fake session shape:**
```json
{
  "access_token": "fake-access-token",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": <now + 3600>,
  "refresh_token": "fake-refresh-token",
  "user": {
    "id": "00000000-0000-0000-0000-000000000001",
    "aud": "authenticated",
    "role": "authenticated",
    "email": "test@portfelik.test",
    "app_metadata": { "provider": "google" },
    "user_metadata": { "name": "Test User" }
  }
}
```

---

## File Structure

```
apps/web-svelte/
├── playwright.config.ts
└── e2e/
    ├── helpers/
    │   ├── mock-auth.ts      # injectFakeSession(), mockSupabaseAPI()
    │   └── fixtures.ts       # typed mock data (transactions, categories, lists)
    └── tests/
        ├── login.spec.ts
        ├── transactions.spec.ts
        └── shopping-lists.spec.ts
```

---

## Playwright Config

```ts
// playwright.config.ts
{
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',   // dev server (local)
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    env: {
      PUBLIC_SUPABASE_URL: 'https://emqzcygfwcvbmhxhfkcc.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: 'placeholder',
      PUBLIC_VAPID_KEY: 'placeholder',
    },
  },
}
```

CI overrides `baseURL` to `http://localhost:4173` (preview server) and runs `pnpm build && pnpm preview` before the Playwright job.

---

## Helpers

### `e2e/helpers/mock-auth.ts`

- `injectFakeSession(page)` — calls `page.addInitScript()` to set the localStorage key
- `mockSupabaseAPI(page)` — registers `page.route()` handlers:
  - `GET **/rest/v1/profiles**` → fixture profile
  - `GET **/rest/v1/transactions_with_category**` → fixture transactions array
  - `GET **/rest/v1/categories**` → fixture categories array
  - `POST **/rest/v1/transactions**` → `201` with new transaction object
  - `DELETE **/rest/v1/transactions**` → `204`
  - `GET **/rest/v1/shopping_lists_summary**` → fixture lists array
  - `GET **/rest/v1/shopping_lists**` (with items) → fixture list detail
  - `POST **/rest/v1/shopping_list_items**` → `201`
  - `PATCH **/rest/v1/shopping_list_items**` → `200`
  - `POST **/rest/v1/shopping_lists**` → `201` with new list object
  - `POST **/rest/v1/rpc/complete_shopping_list**` → `200`
  - `GET/POST **/auth/v1/**` → `200` with minimal user payload
  - `POST **push**` / `**service-worker**` → `200` (suppress)

### `e2e/helpers/fixtures.ts`

Typed mock data matching app's `TransactionWithCategory`, `ShoppingListSummary`, `Category`, `Profile` types.

---

## Test Cases

### `login.spec.ts` (3 tests)

| # | Test | Steps |
|---|------|-------|
| 1 | Unauthenticated redirect | Navigate to `/transactions` without session → assert URL is `/login` |
| 2 | Login page renders | Navigate to `/login` → assert Google sign-in button visible |
| 3 | Authenticated redirect | Inject session → navigate to `/login` → assert redirect to `/transactions` |

### `transactions.spec.ts` (5 tests)

Each test: inject session + mock API in `beforeEach`.

| # | Test | Key assertions |
|---|------|----------------|
| 1 | List renders | Fixture transactions visible in table/cards |
| 2 | Add transaction | Open dialog → fill date/description/amount/category → submit → success toast |
| 3 | Single delete | Click delete on row → confirm dialog → confirm → success toast |
| 4 | Bulk select | Click checkboxes on 2 rows → "Delete selected (2)" button appears |
| 5 | Bulk delete | Select rows → click delete button → confirm → success toast |

### `shopping-lists.spec.ts` (5 tests)

Each test: inject session + mock API in `beforeEach`.

| # | Test | Key assertions |
|---|------|----------------|
| 1 | Lists page renders | Fixture active lists visible |
| 2 | Create list | Click "+ Add" → fill name → submit → success toast |
| 3 | List detail loads | Click list card → detail page → fixture items visible |
| 4 | Check off item | Click checkbox on item → item has line-through style |
| 5 | Complete list | Click "Complete list" → fill amount + category → submit → success toast |

---

## CI Integration

Add `e2e` job to existing `.github/workflows/ci.yml`:

```yaml
e2e:
  name: Playwright E2E
  needs: ci
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - uses: pnpm/action-setup@v5
      with: { version: 9 }
    - uses: actions/setup-node@v6
      with: { node-version: '22', cache: 'pnpm' }
    - run: pnpm install --frozen-lockfile
    - run: pnpm exec playwright install --with-deps chromium
      working-directory: apps/web-svelte
    - name: Build app
      working-directory: apps/web-svelte
      env:
        PUBLIC_SUPABASE_URL: https://emqzcygfwcvbmhxhfkcc.supabase.co
        PUBLIC_SUPABASE_ANON_KEY: placeholder
        PUBLIC_VAPID_KEY: placeholder
      run: pnpm build
    - name: Run Playwright tests
      working-directory: apps/web-svelte
      run: pnpm exec playwright test
      env:
        CI: true
        BASE_URL: http://localhost:4173
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: apps/web-svelte/playwright-report/
        retention-days: 7
```

`deploy` job gains `needs: [ci, e2e]` so deploy only runs when e2e passes.

---

## Out of Scope

- Mobile viewport tests
- Settings / admin / navigation tests
- Visual regression
- Cross-browser (Firefox, Safari)
- Real Supabase integration tests
