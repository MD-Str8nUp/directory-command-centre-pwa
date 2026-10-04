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

The public dashboard remains static and read-only. A separate `/admin.html` first-phase interface can use the dedicated Supabase project for listings, content and tasks after operator setup. It uses a public publishable key and memory-only Auth sessions; leads and claims/forms remain intentionally non-functional.

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

## Private administration

The implementation is pinned to Supabase project `gqbekbrxftmfpgnkqodo`, but fails closed until its migrations, Jacqui's Auth user/membership and `SUPABASE_PUBLISHABLE_KEY` are configured by an operator. Vercel and the browser require no service-role or secret key. Strict membership checks, default-deny RLS, scoped security-definer RPCs, append-only audit events and database-backed rate limits protect the first-phase listings/content/tasks UI. See `docs/PRIVATE_BACKEND_SETUP.md`. No fake records, persistent browser-storage fallback, health/patient/client data, public lead intake or form collection are included.
