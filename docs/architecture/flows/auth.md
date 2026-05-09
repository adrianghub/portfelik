# Auth flow

Google OAuth via Supabase GoTrue. JWT carries `app_metadata.role`, mirrored from `profiles.role` by an Edge Function.

## Sign-in sequence

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant SPA as SvelteKit SPA
    participant SB as Supabase Auth (GoTrue)
    participant G as Google OAuth
    participant DB as Postgres

    U->>SPA: GET /login
    SPA->>U: render login button
    U->>SPA: click "Continue with Google"
    SPA->>SB: signInWithOAuth({ provider: 'google' })
    SB->>U: 302 → Google consent
    U->>G: log in / consent
    G->>SB: 302 callback → /auth/v1/callback
    SB->>SPA: 302 → /auth/callback#access_token=...
    SPA->>SB: getSession() — parse hash
    SB-->>SPA: session { user, access_token (JWT) }

    Note over DB: First-time login only
    SB->>DB: INSERT INTO auth.users (...)
    DB->>DB: trigger on_auth_user_created<br/>handle_new_user()
    DB->>DB: INSERT INTO profiles (id, email, role='user', ...)

    SPA->>DB: SELECT * FROM profiles WHERE id = uid
    DB-->>SPA: profile row
    SPA->>SPA: registerServiceWorker() → autoSubscribePush(uid)<br/>(silent — only if Notification.permission === 'granted')
    SPA->>U: redirect to /transactions
```

Source: `apps/web-svelte/src/routes/+layout.svelte` (session bootstrap), `apps/web-svelte/src/routes/login/+page.svelte` (sign-in entry), `supabase/migrations/20260423000000_initial_schema.sql` (`handle_new_user`, `on_auth_user_created`).

Notes:

- Email/password sign-up is **disabled** in `config.toml`; Google is the only enabled provider for production. The smoke-test user uses email/password explicitly enabled for the staging instance via the Supabase dashboard.
- The session lives in `localStorage` (default Supabase behaviour). `onAuthStateChange()` keeps the SPA's reactive `userId` and `profile` in sync.
- `autoSubscribePush` never prompts; the prompt only fires from the user-gesture banner button (`requestAndSubscribePush`).

## Sign-out sequence

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant SPA as SvelteKit SPA
    participant SB as Supabase Auth
    participant DB as Postgres

    U->>SPA: click "Sign out"
    SPA->>SPA: unsubscribeFromPush()
    SPA->>DB: DELETE FROM push_subscriptions WHERE endpoint = ...
    SPA->>SB: auth.signOut()
    SB-->>SPA: SIGNED_OUT event
    SPA->>SPA: clear local profile + userId
    SPA->>U: redirect /login
```

The push-subscription cleanup happens **before** the GoTrue call so the DELETE still has a valid JWT.

## Role propagation (admin promote / demote)

```mermaid
sequenceDiagram
    autonumber
    actor A as Admin SPA
    participant DB as Postgres
    participant EF as sync-user-role
    participant Auth as auth.users.app_metadata
    actor T as Target User

    A->>DB: rpc('assign_admin_role', { p_user_id })
    Note over DB: SECURITY DEFINER<br/>checks is_admin()
    DB->>DB: UPDATE profiles SET role='admin'<br/>WHERE id = p_user_id
    DB->>DB: trigger profiles_role_change_sync<br/>(AFTER UPDATE OF role)
    DB->>EF: pg_net.http_post(<br/>  url=.../sync-user-role,<br/>  Bearer = vault.internal_trigger_secret,<br/>  body={userId, role}<br/>)
    EF->>Auth: supabase.auth.admin.updateUserById(<br/>  userId,<br/>  { app_metadata: { role: 'admin' } }<br/>)
    EF-->>DB: 200 ok
    DB->>DB: trigger profiles_role_change_notify<br/>→ INSERT INTO notifications
    DB->>EF: (separate trigger) → send-push fan-out

    T->>T: next JWT refresh<br/>(or sign in / re-auth)
    T->>DB: any RLS-checked query
    DB->>DB: read auth.jwt() ->> 'app_metadata' ->> 'role'<br/>→ 'admin'
```

Source: `supabase/functions/sync-user-role/index.ts`, `supabase/migrations/20260425000001_phase5_2_edge_function_hooks.sql` (the trigger + `pg_net` plumbing).

The role claim **takes effect at next JWT refresh**, not immediately. GoTrue refreshes on a 1-hour cadence by default; admin role changes that need to be visible immediately require the affected user to sign out and back in.

## RLS use of the JWT

Admin checks bypass `is_admin()` and read the JWT directly when feasible:

```sql
where (select auth.jwt() ->> 'app_metadata' ->> 'role') = 'admin'
```

For non-admin checks, the standard wrap is `user_id = (select auth.uid())`. Both forms ensure Postgres evaluates the auth function once per statement, not once per row.
