# Weekly automation migration contract

## Compatibility window

Schema `2.0.0` preserves the original site fields (`rank`, `name`, `url`, `uniqueVisitors`, `pageViews`, `decision`, `status`, `snapshotPeriod`, routes, `source`, GA4/Search Console coverage, sitemap count, and `isNew`). Existing automation may continue updating them, but must also update the matching structured metric.

## Required writer behaviour

1. Read the current document and reject unsupported major schema versions.
2. Match sites by stable `id` (preferred) or `slug`; never by rank or display name.
3. Preserve every unmodified site and unknown field. Never recreate the file from a partial response.
4. For traffic, write `metrics.traffic.visitors`, `views`, `period`, `source`, `asOf`, `freshness`, and `state` together. Mirror visitors/views/period/source to legacy fields during the compatibility window.
5. Use `pending_period` for launches without a complete comparable period. Use `unavailable` for a known absence of reporting data, `not_connected` for missing integrations, `stale` for evidence outside policy, and `failed_collection` after a failed attempt. Never write zero to represent any of these states.
6. Only set `verified` when the value and provenance were collected. Each metric must carry source, as-of date and freshness.
7. Do not infer SEO reporting from Search Console coverage or traffic from GA4 coverage.
8. Do not write PII, health information, leads, claims or form submissions to this repository.
9. Validate the candidate file, then replace `data/portfolio.json` atomically. Keep the previous valid version for rollback outside the public deployment artefact.

## Suggested hand-off

Run `python3 scripts/validate.py` in CI before deployment. A future collector should additionally validate against `data/portfolio.schema.json` with a Draft 2020-12 implementation. Remove legacy fields only in a documented major schema release after all writers and readers have migrated.
