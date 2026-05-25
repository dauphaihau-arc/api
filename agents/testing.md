# Testing

Use this file when changing behavior, fixing bugs, or adding features.

## Expectations

- Add or update tests when behavior changes.
- Prefer the nearest existing test style instead of introducing a new pattern.
- Verify the smallest relevant scope first, then run broader checks if needed.

## Useful Commands

```bash
cd api && pnpm test
```

## Practical Guidance

- For a local bug fix, start with the affected module tests.
- For use case or domain changes, verify both success and failure paths.
- For infrastructure or integration-sensitive changes, check whether existing docs or tests already cover the boundary before adding new abstractions.
