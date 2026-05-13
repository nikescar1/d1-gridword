# d1-gridword

Cloudflare Worker + D1 backing the Gridword daily leaderboard. Replaces the previous JSONBin.io integration.

These files are shaped to drop into the `nikescar1/d1-gridword` repo that the Cloudflare dashboard scaffolded. Replace the template files (`src/index.ts`, `src/renderHtml.ts`, `migrations/0001_create_comments_table.sql`, `wrangler.json`) with the ones in this directory. Keep the existing `worker-configuration.d.ts`, `package-lock.json`, and `.gitignore`.

## Endpoints

- `GET  /lb` — last-30-day record, shape `{ "YYYY-MM-DD_daily": [{n,s,w,t}, ...] }`. Each list capped at 50.
- `POST /lb/submit` — body `{ dateKey, diff, name, score, wordCount }`. Validates, upserts (keeps higher score per name), prunes >30d, returns top-50 for that day/diff.
- `GET  /` — health check.

CORS is wide open (`*`); the leaderboard data is non-sensitive.

## Setup

```
npm install
npx wrangler login
```

The `wrangler.json` already points at the existing D1 (`d1-gridword-database`, id `b2ea98df-...`). Apply migrations locally and remotely:

```
npm run seedLocalD1
npx wrangler d1 migrations apply DB --remote
```

## Local dev

```
npm run dev
```

Worker runs on `http://localhost:8787`. Temporarily point `WORKER_BASE` in `../gridword/gridword-11.html` at it.

Smoke test:

```
curl http://localhost:8787/lb
curl -X POST http://localhost:8787/lb/submit \
  -H 'content-type: application/json' \
  -d '{"dateKey":"2026-05-12","diff":"daily","name":"WES","score":42,"wordCount":7}'
```

## Deploy

```
npm run deploy
```

`predeploy` will run `wrangler d1 migrations apply DB --remote` automatically. Note the `*.workers.dev` URL (likely `https://d1-gridword.<account>.workers.dev`) and set `WORKER_BASE` in `../gridword/gridword-11.html` to it.

## Regenerating worker-configuration.d.ts

The TypeScript `Env` type comes from `worker-configuration.d.ts`. If you change bindings in `wrangler.json`, regenerate it:

```
npm run cf-typegen
```
