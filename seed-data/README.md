Seed images used by the database seeders live here.

Expected layout:

- `seed-data/shops.tsv`
- `seed-data/shops.local.tsv` (optional, local-only)
- `seed-data/auth-roles.tsv`
- `seed-data/auth-permissions.tsv`
- `seed-data/auth-role-permissions.tsv`
- `seed-data/auth-users.tsv`
- `seed-data/products.tsv`
- `seed-data/products.local.tsv` (optional, local-only)
- `seed-data/product-inventory.tsv`
- `seed-data/product-inventory.local.tsv` (optional, local-only)
- `seed-data/coupons.tsv`
- `seed-data/coupon-products.tsv`
- `seed-data/images/categories/`
- `seed-data/images/products/<shop-slug>/<product-slug>/`
- `seed-data/images/products-local/<shop-slug>/<product-slug>/` (optional, local-only)

Rules:

- Files under `seed-data/images/categories/` are uploaded to the `categories/` object prefix.
- Auth reference data lives in `seed-data/auth-roles.tsv`, `seed-data/auth-permissions.tsv`, and `seed-data/auth-role-permissions.tsv`.
- Seeded auth users live in `seed-data/auth-users.tsv`.
- Shop metadata lives in `seed-data/shops.tsv` and should use `shop_slug` as the stable seed identifier.
- Optional local-only shops can live in `seed-data/shops.local.tsv`.
- Product metadata lives in `seed-data/products.tsv`.
- Optional local-only product rows can live in `seed-data/products.local.tsv`.
- Product inventory and variant rows live in `seed-data/product-inventory.tsv`.
- Optional local-only inventory rows can live in `seed-data/product-inventory.local.tsv`.
- Coupon metadata lives in `seed-data/coupons.tsv`.
- Coupon-to-product mappings live in `seed-data/coupon-products.tsv`.
- Product images are auto-discovered from the folder derived from `shop_slug` and `title` in [product.seed.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seeds/product.seed.ts:41).
- Product images should live under shop and product slug directories, for example `seed-data/images/products/olive-atelier/linen-weekend-dress/`.
- Local-only product images can live under `seed-data/images/products-local/` with the same shop/product slug structure. The local folder is checked before the tracked folder.
- Each product folder must contain one `hero.*` image. Additional images should be named `detail-*` and are uploaded after `hero.*`.
- Supported product image extensions are `.jpg`, `.jpeg`, `.png`, and `.webp`.
- `product-inventory.tsv` should contain one row per SKU. Non-variant products still need one inventory row.
- Keep filenames aligned with the relative keys referenced in [category.data.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seeds/category.data.ts:62).
- Hidden files like `.DS_Store` are ignored.

Usage:

```bash
just r2-upload-assets
```

Local-only workflow:

- Add machine-specific ignore rules to `.git/info/exclude` instead of `.gitignore`.
- Put extra local products in `seed-data/products.local.tsv`.
- Put matching local inventory rows in `seed-data/product-inventory.local.tsv`.
- Put matching local images in `seed-data/images/products-local/<shop-slug>/<product-slug>/`.
- Put local-only shops in `seed-data/shops.local.tsv` when products need a new local `shop_slug`.
