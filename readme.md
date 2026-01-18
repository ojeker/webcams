# Webcams UI

Developer-focused notes for running, testing, and deploying the SPA and worker.

## Application intent

Webcams UI surfaces a curated set of webcams around a user-defined reference point. The UI focuses on quick visual scanning (preview image, elevation, distance, bearing) to find the upper limit of the fog. It keeps configuration in a single YAML file so the data set can be edited without touching code.

## Architecture
- The SPA fetches `webcams.yml`, parses/validates it with the shared `packages/config` schema, and renders webcam cards sorted by elevation.
- The worker acts as a fetch/preview helper for sources that need server-side access or transformation.
- Shared logic (coordinate math, bearing, distance, compass) lives in `packages/domain`.

## Project layout
- `apps/spa`: Vue 3 + Vite single-page app
- `apps/worker`: Cloudflare Worker (Wrangler)
- `packages/config`: YAML config parser + schema
- `packages/domain`: shared domain utilities
- `webcams.yml`: repo-root configuration consumed by the SPA

## Prerequisites
- Node.js 20 (matches CI)
- pnpm (version pinned in `package.json`)

## Install
```bash
pnpm install
```

## Local development
### Worker
```bash
pnpm dev
```
This runs the worker locally via Wrangler from `apps/worker`.

### SPA
```bash
pnpm -C apps/spa dev
```
The SPA loads `webcams.yml` from the repo root through the Vite dev server.

## Configuration
`webcams.yml` is validated by the schema in `packages/config`. A minimal shape:
- `settings.user_coord_ch2056`: `{ e, n }`
- `settings.worker_base_url`: URL string
- `settings.refresh_minutes`: number
- `webcams[]`: `{ id, name, elevation_m_asl, coord_ch2056, source, ... }`

`id` values can be numeric or string; they are coerced to strings during parsing.

## Testing
Run all tests:
```bash
pnpm test:all
```

Run specific packages:
```bash
pnpm -C apps/spa test
pnpm -C apps/worker test
```

Watch mode (example):
```bash
pnpm -C apps/worker test:watch
```

## Build / package
Build the SPA (bundles dependencies into `apps/spa/dist`):
```bash
pnpm -C apps/spa build
```

## CI / Deploy
`ci.yml` runs on pushes to `main` and:
- Tests and builds the SPA, then deploys it to GitHub Pages
- Tests and deploys the worker using Wrangler

Required secrets for the worker job:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
