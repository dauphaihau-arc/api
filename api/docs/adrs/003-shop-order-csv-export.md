# ADR-003: Adopt Hybrid Shop Order CSV Export

## Status

Accepted

## Date

2026-08-05

## Context

Sellers need to export order data from the seller orders page as CSV for fulfillment, reconciliation, customer support, and offline reporting.

The export must support the same seller-facing filters as the order list, common date ranges, custom date ranges, and a choice between server-defined default columns and custom selected columns. Custom columns may include fields that are not visible in the table UI.

The implementation has several forces:

- exported rows are seller-owned shop orders and must use the same shop management authorization as list/detail endpoints
- small exports should feel immediate and not require polling or background job setup
- large exports can exceed HTTP timeout and memory limits if generated in one request
- generated CSV files contain private shop and customer data
- spreadsheet consumers can evaluate cell values as formulas, creating CSV injection risk
- export progress should be visible without requiring the seller to keep a modal open

This decision affects the shop order API, order query repositories, queue workers, private storage, notifications, and seller-facing realtime events.

## Options Considered

### Option A: Only synchronous CSV download

- Pros:
  - simplest API surface
  - no persisted export state
  - no queue, storage, progress, or retention workflow
- Cons:
  - vulnerable to request timeouts for large date ranges
  - holds the HTTP request open while generating the full CSV
  - makes progress and retry behavior opaque
  - pushes memory and response-size pressure onto the API process

### Option B: Only asynchronous export resources

- Pros:
  - one export lifecycle for every report size
  - avoids long-running HTTP responses
  - gives all exports durable status, progress, retry, and download behavior
- Cons:
  - makes small exports slower and more complex than necessary
  - requires queue and storage infrastructure for simple downloads
  - adds more frontend states for the most common path

### Option C: Hybrid synchronous and asynchronous exports

- Pros:
  - keeps small exports immediate
  - moves large exports out of the request lifecycle
  - gives larger reports durable status, progress, notification, and download behavior
  - lets both paths share filters, column allowlists, and CSV serialization rules
- Cons:
  - creates two API paths for the same user goal
  - requires size limits and frontend routing between direct download and background export
  - requires retention and cleanup policy for stored export files

## Decision

We adopt a **hybrid shop order CSV export model**.

Small exports use `GET /shops/:shop_id/orders/export`. This endpoint belongs to the shop order controller, reuses the seller order filters, accepts export metadata (`date_range`, `timezone`, `column_preset`, `columns`), and returns `text/csv`. The synchronous use case is capped so it remains suitable for the API request lifecycle.

Medium and large exports use asynchronous export resources:

- `POST /shops/:shop_id/orders/exports`
- `GET /shops/:shop_id/orders/exports/:export_id`
- `GET /shops/:shop_id/orders/exports/:export_id/download`

Asynchronous exports persist an `order_exports` record containing the filter snapshot, selected column IDs, requesting user, status, row counts, filename, storage key, error message, and expiry. A queue worker processes rows in batches, writes the generated CSV to private storage, updates progress, and publishes seller-scoped SSE events through `me/events`.

The API accepts only known column IDs. The default preset is server-defined, and custom exports are limited to the same allowlist. CSV output escapes all cells and prefixes spreadsheet formula-looking values to reduce CSV injection risk.

The frontend opens an export dialog from the seller orders page. It converts date presets and custom date input into concrete UTC `created_from` and `created_to` timestamps before starting the export. Small exports download directly. Medium and large exports show progress with SSE updates, and completed exports create an in-app notification that can download the CSV from the header notification popover.

## Rationale

The hybrid model matches the operational shape of the problem better than a single path.

Small exports are common and should not pay the complexity cost of durable background work. A direct CSV response is easy to understand, easy to test, and avoids storing private files when the result can be generated quickly.

Large exports need a different lifecycle. Persisting an export resource makes the operation durable across page navigation and request failures. Queue processing keeps expensive CSV generation out of the API request path. Private storage allows the generated file to be downloaded after completion without keeping the whole CSV in memory. SSE and in-app notifications give sellers visibility into progress and completion without requiring polling-heavy UI behavior.

Keeping both paths inside the shop order boundary preserves authorization consistency and keeps export filters aligned with seller order listing semantics. A server-owned column allowlist makes exported data explicit and prevents clients from requesting arbitrary fields.

## Consequences

- The list and export filters must remain aligned through a shared shop order filter helper.
- Adding a new exportable field requires updating the server allowlist and, if user-selectable, the seller dialog column list.
- The synchronous endpoint must stay capped and should not grow into the large-report path.
- Asynchronous exports introduce operational ownership of export status transitions, queue execution, storage writes, download authorization, expiry, and cleanup.
- Stored CSV files must remain private and downloadable only through shop management authorization.
- Queue jobs should be safe to retry by using persisted export state and a per-export deduplication key.
- Progress and completion events are best-effort UI signals; export status remains authoritative in the `order_exports` record.
- Failures must be persisted so sellers can see that an export failed instead of waiting indefinitely.

The result is more moving parts than a direct download-only design, but it avoids request timeouts for large reports while preserving a fast path for small exports.
