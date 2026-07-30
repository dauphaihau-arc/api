# API Conventions

Use this file when adding or changing HTTP API contracts.

## Naming Convention

- Request JSON uses `snake_case`.
- Response JSON uses `snake_case`.
- Query parameters use `snake_case`.
- Multipart form field names use `snake_case`.
- Internal TypeScript code uses `camelCase`.
- Database column naming is a separate concern. `snake_case` is preferred unless an existing schema dictates otherwise.

## Official Conversion Layer

- DTOs and serializers are the official conversion layer between external API contracts and internal application code.
- Request DTOs define the external `snake_case` contract.
- Response DTOs or serializers define the external `snake_case` output.
- Controllers should map request DTOs into internal `camelCase` use-case inputs explicitly.
- Controllers should not return app or domain types directly.

## Boundary Rule

- Keep transport naming concerns in the HTTP layer.
- Keep use cases, domain models, repositories, and shared application types in `camelCase`.
- Do not rename internal models to match external API field naming.

## Practical Guidance

- Prefer explicit `fromDomain`, `toResponse`, or equivalent mapping helpers for response shaping.
- When adding list or pagination responses, convert metadata fields to `snake_case` as part of the response DTO or serializer.
- When adding sortable or filterable query params, expose `snake_case` names externally and map them to internal field names in the controller or DTO mapping layer.
- Keep multipart field names aligned with the same convention, for example `avatar_file`.
