# Private administration setup

The code is pinned to the dedicated Supabase project `gqbekbrxftmfpgnkqodo`. It uses Supabase Auth, a public `sb_publishable_…` key and narrowly scoped security-definer RPCs. There is no service-role key in the browser or Vercel.

## Current fail-closed blocker

The repository does not contain the project's public publishable key, and this task did not have authority to change the external Supabase project. Until an operator completes the steps below, `/api/config` returns `503 admin_not_configured` and the public dashboard remains read-only.

## One-time project setup

1. In the dedicated project's SQL editor/migration workflow, apply `0001_private_management.sql`, then `0002_authenticated_admin_rpc.sql`, then `0003_public_admin_rpc_wrappers.sql`, then `0004_private_management_summary.sql`. Do not apply them to another project.
2. In Supabase Auth, enable **anonymous sign-ins** but keep ordinary public email/password sign-up disabled. The administration page creates an anonymous Auth identity for each activated device. It also retains passwordless email magic links for the pre-created authorised email user and passes `should_create_user: false`. No password is collected by this app. Anonymous sign-in is the one required Supabase setting; this repository change does not enable it remotely.
3. For device activation, have the user select **Activate this device** and send the displayed short approval code to the private administrator. In Supabase Auth users, find the anonymous user whose UUID matches both portions of that code (the first four and last four hexadecimal characters, ignoring hyphens). Confirm its full UUID exactly matches the UUID displayed on the pending screen, then insert that exact UUID into `private_management.admin_memberships` with the required role (`admin` for Jacqui's device). Never approve from the short code alone if more than one user could match. The user then selects **Check approval**. For the email fallback, insert the authorised email user's UUID in the same table. Membership is authoritative; user-editable metadata is ignored.
4. Seed `private_management.sites` with each public slug used by `data/portfolio.json` (the UI manages only rows attached to one of these IDs).
5. Copy the project's modern **publishable** key (`sb_publishable_…`) from Supabase API settings into Vercel as `SUPABASE_PUBLISHABLE_KEY`. It is public by design. Never configure a service-role key, legacy secret key or JWT signing secret.
6. In Supabase Auth URL configuration, set the production site URL and add the exact production `https://…/admin.html` URL as an allowed redirect. Do not use a wildcard or add preview/local origins in production. Disable registrations after the user is created, and require MFA if the project plan supports it.
7. Keep the Supabase magic-link email template's confirmation URL intact. Supabase may return either its verified token hash or an access-token fragment; `/admin.html` handles both, validates the token's issuer/audience against the pinned project, and immediately removes all auth material from browser history.
8. Run the verification below, then open `/admin.html` on Jacqui's private iPhone. Select **Activate this device**, verify the workspace remains closed while membership is absent, approve the exact anonymous UUID as described above, and select **Check approval**. Reload and reopen the PWA to confirm the saved device session restores and refreshes. Also test the authorised email fallback and confirm it returns to exactly `https://directory-command-centre-pwa.vercel.app/admin.html`. Then use **Sign out** and confirm a reload returns to the activation form.

## Security model

- Direct table privileges remain revoked for `anon` and `authenticated`; RLS is enabled and forced with no permissive policies.
- The browser calls the public-schema `admin_list`, `admin_upsert` and `admin_delete` RPC wrappers so default-public PostgREST `/rest/v1/rpc` routes resolve. Those wrappers are `SECURITY INVOKER` and delegate directly to the private-management functions; each private function re-checks `auth.uid()` against strict memberships.
- Viewer can read; editor can write; only admin can delete. The first UI exposes listings, content and tasks only.
- The public dashboard's management panel remains locked and performs no backend request unless a complete saved trusted-device session exists. It refreshes that session before calling `admin_summary`; an absent, invalid, expired, revoked or non-member session leaves the panel locked and clears invalid local state.
- `admin_summary` returns aggregate totals and status counts for listings, content items and tasks plus the database refresh timestamp. It returns no row IDs, site IDs, names, titles, slugs, URLs, due dates, bodies or PII. It remains membership-gated, rate-limited, audited and callable only by `authenticated`.
- Every successful read/write emits an append-only audit event without record bodies. Database-backed per-user limits apply to reads and writes.
- Device activation creates an anonymous Supabase Auth user, but that identity has no administration access until its exact `auth.uid()` is manually added to `private_management.admin_memberships`. The same membership gate applies to the authorised email fallback. Only the Supabase access token, refresh token and expiry are stored in `localStorage` on that browser/device under a project-specific key. No email, password, service-role key, record data or JWT signing secret is stored. Redirect credentials are scrubbed immediately with `history.replaceState`; the service worker never caches the private page or API responses.
- Every accepted access token, including an anonymous device token, is checked for the exact pinned issuer, authenticated audience, subject and expiry. The app refreshes shortly before expiry, refreshes once after an unauthorised response, and removes the saved session on malformed state, expiry/revocation or refresh failure. Restoration refreshes through the pinned project before opening the workspace.
- **Sign out** calls Supabase logout with local scope to revoke this device's refresh-token family, then removes the local saved session even if the network request fails. If a device is lost, revoke the user's sessions in Supabase Auth; the next refresh fails closed and clears local state.
- Requests use bearer tokens, not ambient cookies, so CSRF tokens are not applicable. CSP pins connections to the dedicated project; `no-referrer`, `no-store`, and exact project checks reduce cross-origin leakage. Supabase Auth allowed URLs must still be restricted to the exact production URL. Do not activate shared or managed-by-others devices.
- Leads, claims, forms, transactions and all public collection stay disabled.

## Verification

```sh
node --test tests/*.test.js
python3 scripts/validate.py
node --check app.js
node --check auth.js
node --check admin.js
node --check dashboard-summary.js
node --check sw.js
find api -name '*.js' -print0 | xargs -0 -n1 node --check
git diff --check
```

After applying migrations, additionally verify in Supabase that `anon` cannot execute any admin RPC, an authenticated non-member receives `insufficient_role`, an editor cannot delete, an admin action creates one audit row, and the 26th write in one minute is refused.
