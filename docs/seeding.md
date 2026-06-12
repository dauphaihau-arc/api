# Seeding

This project has two seed modes:

- `db:seed`
  Seeds reference data only.
  Includes roles, permissions, and category taxonomy.
- `db:seed:demo`
  Seeds the full fake/demo dataset.
  Includes demo users, passwords, shops, products, coupons, and reference data.

## When to use which

- Use `db:seed` when you only want baseline application data.
- Use `db:seed:demo` when you want a populated learning/demo environment.

## Local commands

Reference data only:

```sh
just db-seed
```

Full fake/demo dataset:

```sh
just db-seed-demo
```

Reset local DB, then seed reference data:

```sh
just db-fresh
```

Reset local DB, then seed full fake/demo data:

```sh
just db-fresh-demo
```

Reset local DB, seed full fake/demo data, then clear and re-upload seeded assets:

```sh
just seed-full
```

Upload seeded assets to object storage:

```sh
just storage-seed
```

Clear seeded assets from object storage:

```sh
just storage-clear
```

Flush the configured Redis database:

```sh
just redis-clear
```

Clear and re-upload seeded assets:

```sh
just storage-fresh
```

## Infisical commands

Clear the target database schema:

```sh
export INFISICAL_TOKEN="your-token"
just db-clear-infisical your-project-id prod
```

Clear, migrate, then seed reference data:

```sh
export INFISICAL_TOKEN="your-token"
just db-fresh-infisical your-project-id prod
```

Clear, migrate, then seed full fake/demo data:

```sh
export INFISICAL_TOKEN="your-token"
just db-fresh-demo-infisical your-project-id prod
```

Clear, migrate, seed full fake/demo data, then clear and re-upload seeded assets:

```sh
export INFISICAL_TOKEN="your-token"
just seed-full-infisical your-project-id prod
```

Reference data only:

```sh
export INFISICAL_TOKEN="your-token"
just db-seed-infisical your-project-id prod
```

Full fake/demo dataset:

```sh
export INFISICAL_TOKEN="your-token"
just db-seed-demo-infisical your-project-id prod
```

Upload seeded assets to object storage:

```sh
export INFISICAL_TOKEN="your-token"
just storage-seed-infisical your-project-id prod
```

Clear seeded assets from object storage:

```sh
export INFISICAL_TOKEN="your-token"
just storage-clear-infisical your-project-id prod
```

Flush the configured Redis database:

```sh
export INFISICAL_TOKEN="your-token"
just redis-clear-infisical your-project-id prod
```

Clear and re-upload seeded assets:

```sh
export INFISICAL_TOKEN="your-token"
just storage-fresh-infisical your-project-id prod
```

## Notes

- `db:seed` is dataset-based naming, not environment-based naming.
- `db:seed:demo` is acceptable for staging or production if you intentionally want fake/demo data for a learning or showcase deployment.
- `seed-full` is the convenience command for a full demo reset plus seeded asset refresh.
- `redis-clear` flushes the selected Redis database, including cache, queue, and rate-limit state.
- `storage-clear` deletes only seeded asset objects resolved from the current seeded categories and products, not every object in the bucket.
- For local-only heavy seed data, use `seed-data/shops.local.tsv`, `seed-data/products.local.tsv`, `seed-data/product-inventory.local.tsv`, and `seed-data/images/products-local/`, then ignore them with `.git/info/exclude`.
