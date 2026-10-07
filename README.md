# ball.

Draft five NBA players from any era, play an 82-game season and the playoffs, and climb the global leaderboard. Or challenge a friend to a best-of-seven from the same spins.

Live: https://ball-game.balldot.workers.dev

## Layout

| Path | What it is |
|---|---|
| `public/index.html`, `public/css/app.css` | The page and its styles |
| `public/js/app.js` | Everything you see: draft, season, playoffs, profiles, leaderboard |
| `public/js/engine.mjs` | Ratings, chemistry and the simulation. Shared with the server |
| `public/data/nba.json` | Players, teams and historical opponents |
| `worker.mjs` | Cloudflare Worker: serves `public/`, the API and link previews |
| `api/accounts.mjs` | Accounts, ranked runs, profiles, leaderboard (D1) |
| `api/handle.mjs` | Friend challenges (KV) |
| `migrations/` | D1 database schema |

## How ranked runs stay honest

A logged-in Classic run asks the server for a seed, and every spin comes from it. When the team is locked, the server replays the draft (rejecting picks the spins couldn't give), draws a new seed for the season, plays it with the same engine, and records the score. The game then plays the season from that seed, so you watch the exact result the server stored.

## Run locally

```bash
npx wrangler d1 migrations apply ball --local
npx wrangler dev
```

Open http://localhost:8787. Local data lives in `.wrangler/` (ignored by git).

## Deploy

Every push to `main` deploys through Cloudflare Workers Builds. Schema changes: add a file to `migrations/`, then run `npx wrangler d1 migrations apply ball --remote`.

Bindings (in `wrangler.jsonc`): `CHALLENGES` (KV), `DB` (D1), `ASSETS` (`public/`).
