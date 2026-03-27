# aim_web

`aim.laouuu.win` is a browser aim trainer with:

- a branded landing page and in-browser trainer
- click and tracking modes
- session history and personal records
- a Cloudflare Worker API for shared leaderboard storage
- a D1 database schema for persistent runs

## Files

- `index.html` - frontend app
- `src/worker.js` - Worker API + asset serving
- `schema.sql` - D1 schema
- `wrangler.jsonc` - Cloudflare config

## Deploy flow

1. Install dependencies:

```bash
npm install
```

2. Create a D1 database and replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc`.

3. Apply the schema:

```bash
npx wrangler d1 execute aim-web-db --file=schema.sql
```

4. Run locally:

```bash
npm run dev
```

5. Deploy:

```bash
npm run deploy
```

## API

- `GET /api/health`
- `GET /api/leaderboard?mode=click`
- `GET /api/leaderboard?mode=track`
- `POST /api/sessions`
