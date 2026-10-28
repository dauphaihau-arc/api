---
name: local-shop-seed-data
description: Handles this project's local shop seed-data workflow, including TSV seed files, seed image folders, and seeder constraints. Use when adding or updating sellers, shops, products, inventory, or debugging seed failures in this repo.
---

# Local Shop Seed Data

Project-scoped skill for this API workspace.

## Quick Start

Use this skill when the request involves:

- `seed-data/*.tsv` or `seed-data/*.local.tsv`
- `seed-data/images/products*`
- `api/database/seeds/*`
- `just db-seed`, `just db-seed-demo`, `storage-seed`
- adding sellers, shops, products, inventory, or fixing seed errors

Do not use this skill for general explanation-only questions when no edits are wanted. Use `ask` for read-only Q&A.

## Working Rules

1. Read existing seed files before editing.
2. Preserve current TSV headers and column ordering exactly.
3. Prefer local-only files for machine-specific or experimental data:
   - `seed-data/auth-users.local.tsv`
   - `seed-data/shops.local.tsv`
   - `seed-data/products.local.tsv`
   - `seed-data/product-inventory.local.tsv`
4. Keep shop ownership consistent across:
   - auth user email
   - `owner_email`
   - `shop_slug`
5. Every product must have at least one matching inventory row.
6. SKU uniqueness is enforced per shop.
7. Variant modeling:
   - `none` for single-SKU products
   - `single` for one option group like `Color`
   - `combine` for two option groups like `Color + Size`
8. For `combine`, each inventory row must provide both `option_value_1` and `option_value_2`.
9. For `draft` products, image folders may be empty or absent.
10. For `active` products, the seed expects a real image folder with `hero.*` or `main.*`.
11. When adding a product, pre-create the local image folder path under `seed-data/images/products-local/<shop-slug>/<product-slug>/` by default.
12. If the user is adding a product for local seeding, prefer setting it to `active` so they can drop images into the pre-created folder immediately.
13. If the user indicates they will add the images themselves, still keep the product `active` by default, create the folder, and clearly remind them that seeding will fail until they place a real `hero.*` or `main.*` image there.

## Project Conventions

- Auth users are seeded from `auth-users.tsv` plus `auth-users.local.tsv`.
- Shops are seeded from `shops.tsv` plus `shops.local.tsv`.
- Products are seeded from `products.tsv` plus `products.local.tsv`.
- Inventory is seeded from `product-inventory.tsv` plus `product-inventory.local.tsv`.
- Product image lookup checks:
  - `seed-data/images/products-local/<shop-slug>/<product-slug>/`
  - then `seed-data/images/products/<shop-slug>/<product-slug>/`
- Product slugs are derived from the product title.
- Hidden files like `.DS_Store` are ignored for image discovery.

## Seed Error Checklist

When `db-seed` or `db-seed-demo` fails:

1. Identify the failing seed table or entity from the stack trace.
2. Check whether the issue is:
   - missing owner user
   - missing shop
   - missing inventory rows
   - duplicate SKU within a shop
   - invalid variant shape
   - missing image folder for an active product
   - missing category path
3. Read the relevant seeder in `api/database/seeds/` before changing data.
4. Fix the narrowest cause first.
5. If a product is intentionally incomplete, prefer `draft` over fake image data.

## Typical Workflows

### Add a seller and shop

1. Add seller to `auth-users.local.tsv`
2. Add shop to `shops.local.tsv`
3. Use the seller email as `owner_email`

### Add a product

1. Choose the correct `shop_slug`
2. Choose the closest supported category path already present in seed categories
3. Add a product row to `products.local.tsv`
4. Add matching inventory rows to `product-inventory.local.tsv`
5. Create the image folder under `seed-data/images/products-local/<shop-slug>/<product-slug>/`
6. Default new local products to `active` and leave the folder ready for `hero.*` or `main.*`
7. Use `draft` only when the user explicitly wants an incomplete non-public seed row
8. If the user says they will add images later, do not downgrade the product to `draft` just for that reason; keep it `active` and call out the required image filename pattern.

### Add variants

1. Set `variant_type`
2. Set `variant_group_name`
3. Optionally set `variant_sub_group_name`
4. Add one inventory row per SKU and option combination

## Output Expectations

When making changes with this skill:

- state whether the product is `draft` or `active`
- call out image requirements if `active`
- if the user plans to add images later, explicitly note that the folder is prepared and that a real `hero.*` or `main.*` file is still required before running the seed successfully
- mention any inferred values from external listing content
- verify that product and inventory rows align
