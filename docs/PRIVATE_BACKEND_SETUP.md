# Private management backend setup (not connected)

This repository contains a **scaffold only**. It has not created or connected any external resource. The public dashboard remains read-only.

## Dedicated-project requirement

1. Create a fresh Supabase project dedicated to this dashboard. Do not reuse a client, patient, clinical or production directory database.
2. Apply `supabase/migrations/0001_private_management.sql` using the Supabase migration workflow. Confirm every table has RLS enabled and forced, and that `anon` and `authenticated` have no grants or policies.
3. Store the values in `.env.example` in the server platform's encrypted environment settings. Never place a service-role key, CSRF secret, JWT, lead, claim, form or transaction record in static files, client JavaScript, logs or browser storage.
4. Configure a separate admin origin and Supabase Auth. Put the `admin_role` (`viewer`, `editor`, or `admin`) in trusted `app_metadata`, never user-editable metadata. Issue tokens with the configured admin audience.
5. Implement and review three server-only adapters before enabling an endpoint: Supabase JWT verification (issuer, signature, expiry and audience), a repository using the service-role key, and a durable shared rate-limit store. `api/admin/[entity].js` intentionally supplies none and therefore returns `503`.
6. Use an `HttpOnly; Secure; SameSite=Strict` admin session. For mutating requests, mint a random `__Host-dcc-csrf` cookie and send its HMAC in `X-CSRF-Token`; enforce the exact Origin allow-list. Rotate sessions and CSRF material after sign-in or privilege change.
7. Add append-only audit events for authentication outcomes and every read/write. Do not log record bodies or contact fields. Configure retention, deletion and incident procedures before collection.
8. Run the checks below, then complete a security review before provisioning forms or management UI.

## Data boundary

Allowed records are operational directory data described by `schemas/private/protected-entities.schema.json`. **Do not collect health, patient, diagnosis, treatment, clinical, client-case or other special-category data.** Leads and forms must be minimal, consented, purpose-limited and deleted under a documented retention schedule.

The static `data/portfolio.json` is the only browser-readable data source. Private tables have no public select policy. Never add fake records or a localStorage fallback.

## Verification

```sh
node --test tests/*.test.js
python3 scripts/validate.py
node --check app.js
node --check sw.js
find api -name '*.js' -print0 | xargs -0 -n1 node --check
git diff --check
```
