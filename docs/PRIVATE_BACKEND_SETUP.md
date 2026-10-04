# Private administration setup

The code is pinned to the dedicated Supabase project `gqbekbrxftmfpgnkqodo`. It uses Supabase Auth, a public `sb_publishable_…` key and narrowly scoped security-definer RPCs. There is no service-role key in the browser or Vercel.

## Current fail-closed blocker

The repository does not contain the project's public publishable key, and this task did not have authority to change the external Supabase project. Until an operator completes the steps below, `/api/config` returns `503 admin_not_configured` and the public dashboard remains read-only.

## One-time project setup

1. In the dedicated project's SQL editor/migration workflow, apply `0001_private_management.sql`, then `0002_authenticated_admin_rpc.sql`. Do not apply them to another project.
2. In Supabase Auth, create only Jacqui's authorised user. The administration page uses passwordless email magic links and passes `should_create_user: false`; do not enable anonymous sign-in or public sign-up. No password is collected by this app.
3. Insert the user's UUID into `private_management.admin_memberships` with role `admin`. Membership in this table is authoritative; user-editable metadata is ignored.
4. Seed `private_management.sites` with each public slug used by `data/portfolio.json` (the UI manages only rows attached to one of these IDs).
5. Copy the project's modern **publishable** key (`sb_publishable_…`) from Supabase API settings into Vercel as `SUPABASE_PUBLISHABLE_KEY`. It is public by design. Never configure a service-role key, legacy secret key or JWT signing secret.
6. In Supabase Auth URL configuration, set the production site URL and add the exact production `https://…/admin.html` URL as an allowed redirect. Do not use a wildcard or add preview/local origins in production. Disable registrations after the user is created, and require MFA if the project plan supports it.
7. Keep the Supabase magic-link email template's confirmation URL intact. Supabase may return either its verified token hash or an access-token fragment; `/admin.html` handles both, validates the token's issuer/audience against the pinned project, and immediately removes all auth material from browser history.
8. Run the verification below, then open `/admin.html`. Request a link for the authorised account and confirm it returns to the production `/admin.html`. A reload intentionally signs the user out.

## Security model

- Direct table privileges remain revoked for `anon` and `authenticated`; RLS is enabled and forced with no permissive policies.
- The browser can execute only `admin_list`, `admin_upsert` and `admin_delete`. Each call re-checks `auth.uid()` against strict memberships.
- Viewer can read; editor can write; only admin can delete. The first UI exposes listings, content and tasks only.
- Every successful read/write emits an append-only audit event without record bodies. Database-backed per-user limits apply to reads and writes.
- The access/refresh tokens exist only in JavaScript memory. Redirect tokens are scrubbed immediately with `history.replaceState`. No localStorage, sessionStorage, IndexedDB, cookie or service-worker cache stores private data. Reloading/closing ends the session; expiry fails closed rather than silently persisting.
- Requests use bearer tokens, not ambient cookies, so CSRF tokens are not applicable. CSP pins connections to the dedicated project; `no-referrer`, `no-store`, and exact project checks reduce cross-origin leakage. Supabase Auth allowed URLs must still be restricted to production.
- Leads, claims, forms, transactions and all public collection stay disabled.

## Verification

```sh
node --test tests/*.test.js
python3 scripts/validate.py
node --check app.js
node --check admin.js
node --check sw.js
find api -name '*.js' -print0 | xargs -0 -n1 node --check
git diff --check
```

After applying migrations, additionally verify in Supabase that `anon` cannot execute any admin RPC, an authenticated non-member receives `insufficient_role`, an editor cannot delete, an admin action creates one audit row, and the 26th write in one minute is refused.
