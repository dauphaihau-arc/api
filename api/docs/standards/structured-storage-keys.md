# Structured Storage Keys

This codebase uses structured object keys for uploaded assets instead of arbitrary flat filenames.

## Purpose

Structured storage keys make uploaded assets easier to organize, reason about, and manage across environments and business domains.

This convention helps with:

- separating development, test, and production assets
- distinguishing public and private files
- grouping files under domain-owned paths
- making asset locations predictable across modules
- avoiding ad hoc key formats in upload flows

## Format

Storage keys are built in a fixed segment order:

```text
{env}/{visibility}/{domain}/{id}/{domain}/{id}/{collection}/{assetType}/{filename}.{extension}
```

Current builder inputs are defined in:

- [storage-key.types.ts](../../src/integrations/storage/app/storage-key.types.ts)
- [storage-key-builder.ts](../../src/integrations/storage/app/storage-key-builder.ts)

## Segment Meanings

- `env` - normalized runtime environment segment such as `dev`, `test`, or `prod`
- `visibility` - object visibility boundary, currently `public` or `private`
- `path` - one or more domain path nodes such as `shops/{shopId}` or `products/{productId}`
- `collection` - logical asset grouping such as `images`
- `assetType` - asset variant such as `original`, `thumbnail`, `medium`, or `large`
- `filename` - generated or supplied asset identifier
- `extension` - normalized file extension

## Example

The storage key builder test shows this concrete example:

```text
prod/public/shops/shop-1/products/product-1/images/original/asset-1.webp
```

Reference:

- [storage-key-builder.spec.ts](../../src/integrations/storage/app/storage-key-builder.spec.ts)

## Product Upload Flow

The product image upload flow uses this convention when issuing upload URLs:

- [issue-product-image-upload-url.use-case.ts](../../src/domains/product/app/use-cases/issue-product-image-upload-url/issue-product-image-upload-url.use-case.ts)

That flow builds keys using:

- environment segment from `NODE_ENV`
- `public` visibility
- domain path nodes for shop and product
- `images` collection
- asset type variant
- resolved image extension
- generated public identifier as filename

## Rules

- always use the shared storage key builder instead of constructing keys inline
- always include at least one domain path node
- choose visibility deliberately based on access requirements
- keep path nodes aligned with the owning business domain
- use normalized asset variants instead of ad hoc suffixes

## Why It Matters

- improves consistency across upload and storage flows
- reduces accidental key-shape drift between modules
- keeps object storage easier to inspect and debug
- supports cleaner future policies for lifecycle, access, and cleanup
