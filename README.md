# Directory Command Centre

A dependency-free, mobile-first static PWA for evidence-led management of Jacqui's directory portfolio. It provides portfolio views and hash-routed per-site workspaces for Overview, Sites, SEO, Monetisation, Listings, Content, Leads, and Claims & Forms.

## Architecture

- `index.html`: accessible application shell.
- `app.js`: safe DOM construction using `textContent`/attributes; routing, filtering and derived totals.
- `data/portfolio.json`: versioned source of truth. Legacy fields remain during migration; `metrics` carries field-level source, date, freshness and explicit state.
- `data/portfolio.schema.json`: machine-readable JSON Schema contract.
- `sw.js`: network-first runtime with a cache fallback. Portfolio data is always requested with `no-store`; corrected data is not trapped behind cache-first behaviour.
- `vercel.json`: CSP and defensive response headers, plus revalidation for data and the service worker.
- `scripts/validate.py`: semantic, safety and compatibility checks.

No backend or browser storage is used. Leads and claims/forms are intentionally non-functional until a secure authenticated backend exists.

## Data semantics

Traffic is only the ChatGPT Sites Analytics period **4 September–3 October 2026**. Visitor counts are site-level and portfolio totals are not deduplicated. GA4 and Search Console values describe coverage only. They are never presented as the traffic source. Unknown values are `null` with an explicit state, never converted to zero.

Permitted states: `verified`, `unavailable`, `not_connected`, `pending_period`, `stale`, `failed_collection`.

Monetisation distinguishes actual revenue from readiness. Paid placement must remain separate from organic ranking. Listings and content display only verified counts; otherwise they say **Not yet recorded**.

## Local validation

```sh
python3 scripts/validate.py
node --check app.js
node --check sw.js
git diff --check
```

Serve over HTTP rather than opening `index.html` as a file (for example, `python3 -m http.server`).

## Integration boundaries

A production data collector must authenticate outside this static app, validate against the schema, redact all PII/health data, write atomically, and set source/as-of/freshness/state per metric. Revenue, listing, content, lead and claim records are not integrated. Secure server-side access control, audit logging, retention policy and consent handling are required before sensitive workflows are enabled.

## Private management scaffold

Private management is explicitly **not connected**. The fail-closed server boundary is under `api/`; protected record contracts are under `schemas/private/`; and a locked-down fresh-project migration is under `supabase/migrations/`. These materials are excluded from the static deployment bundle where appropriate. See `docs/PRIVATE_BACKEND_SETUP.md` before any future provisioning. No fake records, browser-storage fallback, health/patient/client data, or external resources are included.
