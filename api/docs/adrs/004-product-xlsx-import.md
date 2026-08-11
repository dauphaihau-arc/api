# ADR-004: Use Draft-Only Asynchronous XLSX Product Import

## Status

Proposed

## Date

2026-08-06

## Context

Sellers need to create many products from an uploaded Excel file. The product domain already has important boundaries around draft creation, categories, inventory, pricing, variants, product state, audit logging, and catalog projection. The seller UI should help sellers catch obvious file mistakes before upload, but the backend must remain authoritative because browser validation can be bypassed.

The existing order export flow provides a local precedent for long-running seller-owned file workflows: create a durable job record, process work asynchronously, publish progress, store generated artifacts privately, and expose authorized download endpoints.

The first version must keep scope small enough to implement safely while leaving room for variants, images, upserts, notifications, and import history later.

## Options Considered

### Option A: Synchronous import during upload

- Pros: simpler job model, immediate response when small files succeed.
- Cons: upload request can become long-running, no durable progress, harder retry behavior, weaker report recovery after browser/navigation failure.

### Option B: Frontend parses XLSX and uploads JSON rows

- Pros: simpler backend file handling, easy preview-to-submit mapping.
- Cons: backend correctness depends on browser parsing, client validation can be bypassed, parser behavior can drift between UI and API, original seller file is not preserved for processing/debugging.

### Option C: Backend parses uploaded XLSX asynchronously and creates drafts through product use cases

- Pros: backend remains authoritative, original XLSX is preserved, imports get durable status/reporting, existing product invariants are reused, row-level partial import and retry-safe processing are possible.
- Cons: requires import job persistence, private file storage, report generation, and worker wiring.

### Option D: Direct repository writes for imported rows

- Pros: potentially faster bulk insert path.
- Cons: bypasses existing product validation, audit logging, slug behavior, inventory/pricing rules, and catalog projection dispatch.

## Decision

We choose **backend-authoritative asynchronous XLSX import that creates draft products only**.

Product import v1 will:

1. Accept `.xlsx` uploads only.
2. Use SheetJS on the frontend for advisory preview.
3. Use SheetJS on the backend for authoritative parsing and backend-generated template creation.
4. Upload the original XLSX as multipart form data.
5. Store the source XLSX privately for asynchronous processing.
6. Create a durable Product Import Job and return its id from upload.
7. Process rows independently through existing product application use cases.
8. Create draft, non-variant products only.
9. Fail SKU conflicts at row level instead of updating existing products.
10. Generate a CSV report with row-level created/failed outcomes.

The v1 template is versioned as `product-import-v1`, includes a `Metadata` sheet and a `Products` sheet, and supports one row per non-variant product draft.

## Consequences

- Product import preserves existing product invariants by using current application use cases.
- Backend validation remains the source of truth even when the browser preview passes.
- Partial import is supported: valid rows can create drafts while invalid rows appear in the report.
- Job retries must be row-idempotent to avoid duplicate draft creation.
- Created drafts remain if a later job-level failure stops processing.
- V1 deliberately excludes variants, image import, product updates, category creation, publishing, import history UI, and completion notifications.
- Future versions can add variants, images, upsert modes, history, notifications, or larger limits without changing the core job/report architecture.

## Related Documents

- [Import Product Design](../../../../../docs/features/import-product-design/README.md)
- [Export Order Design](../../../../../docs/features/export-order-design/README.md)
