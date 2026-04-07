# Configuration Pattern

Use this pattern for skills that benefit from persistent defaults.

## Recommended Flow

1. Provide `scripts/setup.py` for one-time configuration
2. Save defaults under `~/.config/hoon-ch-skills/<skill-name>.json`
3. Set file mode to `600` when secrets may be stored
4. Resolve config in this order:
   - CLI flags
   - Environment variables
   - Persisted config
5. Provide a `doctor`, `validate`, or equivalent command for troubleshooting

## Design Rules

- Do not silently mutate shell profiles or global env files
- Make persistence explicit
- Let one-off CLI flags override saved values
- Keep response bodies and server errors visible when setup validation fails
