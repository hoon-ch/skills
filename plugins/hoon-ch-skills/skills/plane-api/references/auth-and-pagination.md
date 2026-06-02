# Auth And Pagination

## Authentication

This skill supports both official Plane auth styles:

- API key via `X-API-Key`
- OAuth bearer token via `Authorization: Bearer <token>`

Configuration priority is:

1. CLI flags
2. Environment variables
3. Persisted config file at `~/.config/hoon-ch-skills/plane-api.json`

Supported inputs:

- `--base-url` or `PLANE_BASE_URL`
- `--workspace` or `PLANE_WORKSPACE_SLUG`
- `--api-key` or `PLANE_API_KEY`
- `--oauth-token` or `PLANE_OAUTH_TOKEN`
- `--no-persisted-config` to bypass the saved config for one run

Behavior:

- Within each source layer, OAuth is preferred over API key
- Across source layers, CLI wins over environment variables and environment variables win over persisted config
- If an OAuth token is selected, the client sends bearer auth
- Otherwise it sends `X-API-Key`
- If neither is present, the CLI exits with a configuration error

The recommended first-run path is:

```bash
python scripts/setup.py
python scripts/plane_api.py doctor --test
```

## Query Controls

The generic client supports common Plane query parameters:

- `--fields`
- `--expand`
- `--per-page`
- `--cursor`
- `--limit`
- `--offset`
- `--order-by`
- `--query key=value` for arbitrary query parameters

These are passed through without hiding the server response shape.

## Pagination

Plane uses more than one pagination style across endpoints.

Typical patterns:

- Cursor pagination with `cursor` and `per_page`
- Offset pagination with `limit` and `offset`
- Non-paginated responses for detail endpoints and some small collections

The catalog stores a `pagination_mode` hint, but the CLI does not try to abstract response pagination away. It leaves the raw server contract visible.

## Rate Limits

When Plane returns rate-limit headers, pretty output includes:

- `remaining`
- `reset`

This is derived from:

- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

If those headers are absent, no rate-limit section is added.

## Error Interpretation

The CLI keeps raw error bodies intact and adds a short inferred reason:

- `401` or `403`: auth failure or missing permission
- `404`: wrong identifier or endpoint mismatch
- `429`: rate limit exceeded
- `5xx`: server-side failure

Do not discard the response body. Plane often returns useful validation details there.
