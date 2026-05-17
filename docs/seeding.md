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
just api-seed
```

Full fake/demo dataset:

```sh
just api-seed-demo
```

Reset local DB, then seed reference data:

```sh
just api-db-fresh
```

Reset local DB, then seed full fake/demo data:

```sh
just api-db-fresh-demo
```

## Infisical commands

Reference data only:

```sh
export INFISICAL_TOKEN="your-token"
just api-seed-infisical your-project-id prod
```

Full fake/demo dataset:

```sh
export INFISICAL_TOKEN="your-token"
just api-seed-demo-infisical your-project-id prod
```

## Notes

- `db:seed` is dataset-based naming, not environment-based naming.
- `db:seed:demo` is acceptable for staging or production if you intentionally want fake/demo data for a learning or showcase deployment.
