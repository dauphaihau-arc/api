Seed images used by the database seeders live here.

Expected layout:

- `seed-assets/categories/`
- `seed-assets/products/<shop-slug>/<product-slug>/`

Rules:

- Files under `seed-assets/categories/` are uploaded to the `categories/` object prefix.
- Product images are auto-discovered from the folder derived from `shopName` and `title` in [product.seed.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seeds/product.seed.ts:41).
- Product images should live under shop and product slug directories, for example `seed-assets/products/olive-atelier/linen-weekend-dress/`.
- Each product folder must contain one `hero.*` image. Additional images should be named `detail-*` and are uploaded after `hero.*`.
- Supported product image extensions are `.jpg`, `.jpeg`, `.png`, and `.webp`.
- Keep filenames aligned with the relative keys referenced in [category.data.ts](/Volumes/Local/dev/pj-personal/apps/arc/codebase/apps/api/api/database/seeds/category.data.ts:62).
- Hidden files like `.DS_Store` are ignored.

Usage:

```bash
just r2-upload-assets
```
