# Encore

Track and rank what you watch and who you've seen live — a mix of Letterboxd and Beli.

> **Taking over this project?** Start with [`HANDOFF.md`](./HANDOFF.md): current status, the iOS app, what's new since this README was written, known issues, and the path to production.

- **Movies & TV** — log a title, pick the genre it competes in, give a gut reaction (liked / fine / didn't like), then answer a few "which did you like more?" questions against titles you've already ranked *in that genre*. Your list orders itself and every title gets a 0–10 score. For shows, save your favorite and least favorite episodes.
- **Live** — concerts, festivals, DJ sets, theatre, comedy. Record the lineup (headliner + support acts, with photos), the venue and its location, each act's setlist (imported from setlist.fm or typed in) with songs you loved / liked / didn't like, a rating, and what worked and what didn't.
- **Discover** — trending and top-rated charts driven by what Encore members actually log and how they score it.
- **Picks** — per-genre recommendations: Encore's highest-rated titles in the genre, "because you loved …" picks seeded from your top title in that genre, and critically acclaimed titles — all excluding what you've already ranked.
- **Watchlist** — movies and TV to watch, artists you want to see live, and festivals you don't want to miss. Bookmark a poster, add an artist from MusicBrainz, or type a festival. Ranking a title or logging a show/festival drops it off the list.

## Architecture

```
apps/
  api/        Hono REST API · Drizzle ORM · Postgres (PGlite embedded in dev)
  web/        Next.js 16 (App Router) · Tailwind v4 · TanStack Query · installable PWA
  mobile/     Expo SDK 57 · React Native · expo-router — the iOS app (npm run ios -w @encore/mobile)
packages/
  shared/     Types, Zod schemas, ranking algorithm, typed fetch client — used by web and mobile
```

**Why this shape**

- **API is separate from the website.** Web and a future iOS/Android app talk to the same REST API with bearer-token auth (no cookies), so the mobile app needs zero backend changes.
- **`@encore/shared` holds everything platform-agnostic**: request validation (the API validates with the exact same Zod schemas the clients use), response types, the ranking algorithm, and the API client (plain `fetch`, pluggable token storage).
- **Zero-setup database.** Without `DATABASE_URL` the API runs embedded Postgres (PGlite) on disk in `apps/api/.data`. Set `DATABASE_URL` and the same migrations run against real Postgres.

### Data sources

| Domain | Source | Key needed |
| --- | --- | --- |
| Movies & TV (search, genres, seasons, episodes, posters) | [TMDB](https://www.themoviedb.org/settings/api) | Free API key. Without it, a built-in demo catalog of 46 popular titles is served |
| Demo-catalog posters | Wikipedia (films) and [TVmaze](https://www.tvmaze.com/api) (series), resolved once by `apps/api/scripts/resolve-demo-posters.ts` into `seed-posters.json` | None |
| Performers | [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) | None (rate-limited to 1 req/s; the API throttles and caches) |
| Performer photos | [Deezer public API](https://developers.deezer.com/api) (exact-name matches only) | None |
| Setlists + venue locations | [setlist.fm](https://api.setlist.fm/docs/1.0/index.html) | Free API key. Without it, songs and venues are entered manually |

TMDB is the single source for both movies and TV (search, posters, backdrops, genres, seasons, episodes, recommendations, genre charts). The Wikipedia/TVmaze posters only exist so the offline demo looks right; once a TMDB key is set they're never used.

Title metadata is cached in the `titles` table (refreshed weekly, and immediately if it came from a different provider — so demo rows are replaced with TMDB data the first time they're viewed after adding a key), so lists and profiles never call TMDB.

### Caching (why popular pages load instantly)

Three layers, checked in order:

1. **Browser** — TanStack Query persists catalog queries (trending, top rated, picks, search, title pages) to `localStorage` for 24h, so a returning visitor sees the last result immediately while a fresh copy loads in the background.
2. **API memory** — `apps/api/src/lib/swr-cache.ts` keeps third-party responses in process with *stale-while-revalidate*: inside the "fresh" window it answers from memory; inside the "stale" window it still answers instantly and refreshes in the background; concurrent misses share one upstream request.
3. **Database** — the same entries are written to `cache_entries`, so restarts and additional API instances start warm instead of re-hitting TMDB.

| Data | Fresh for | Served stale up to |
| --- | --- | --- |
| TMDB trending | 3 h | 3 days |
| TMDB details, seasons, genre charts, recommendations | 1 day | 14 days |
| TMDB search | 1 h | 1 day |
| MusicBrainz search / Deezer photos / setlist.fm | 1 day / 7 days / 6 h | 14 / 30 / 7 days |

On startup the API also pre-warms weekly trending plus every genre's acclaimed chart (72 lists). Measured locally: a cold TMDB call is ~300 ms–6 s; cached trending/picks responses are 2–20 ms, and a restart re-warms in ~50 ms from the database. Community charts (computed from Encore rankings) are cached for 2 minutes and invalidated the moment anyone ranks something.

### Connecting TMDB (movies & TV)

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup) and verify your email.
2. Go to **Settings → API** ([direct link](https://www.themoviedb.org/settings/api)), request a **Developer** key, and fill in the short form (personal / non-commercial use, any app URL such as `http://localhost:3000`).
3. Copy either the **API Key** or the longer **API Read Access Token** into `apps/api/.env`:
   ```
   TMDB_API_KEY=your_key_here
   # or
   TMDB_READ_TOKEN=your_read_access_token_here
   ```
4. Restart `npm run dev`. The API log prints `TMDB connected — full movie & TV catalog enabled` (or a clear error if the key is wrong), and the yellow "Demo catalog" note disappears from the site.

TMDB requires crediting them in production ("This product uses the TMDB API but is not endorsed or certified by TMDB") — add it to a footer/about page before launch. Third-party search results are cached in memory with TTLs and request de-duplication.

### Live shows data model

`live_shows` (kind, date, rating, liked/disliked/notes) → `venues` (name, city, region, country, lat/lng — de-duplicated, setlist.fm-linked) and `live_show_performers` (billing order + role: headliner / support / guest) → `performers` (MusicBrainz-backed or manual, with photo). Songs hang off the lineup slot (`live_show_songs`), so every act at a show has its own setlist. This supports "most-seen performers", "cities visited", and per-venue history without schema changes.

### How trending works

`apps/api/src/services/discover.ts`, per media type, cached for 2 minutes and invalidated whenever someone ranks something:

- **heat** = Σ e^(−age / 72h) over logs from the last 14 days. Every recent log counts; today's counts ≈2.7× a log from 3 days ago.
- **quality** = Bayesian average score = (3·m + Σscores) / (3 + n), where m is the site-wide mean. A single 10/10 can't dominate.
- **trending** = heat × (0.5 + quality / 10). Popularity drives the chart; strong ratings can lift a title up to 3× over a poorly rated one.
- Slots not filled by Encore activity are topped up from TMDB's weekly trending list, so the chart is never empty.
- **Top rated** = highest Bayesian average among titles with ≥ 2 logs.

### How ranking works

Each user has one ranked list per **(media type, genre, reaction tier)**. Tiers own non-overlapping score bands: liked 6.8–10, fine 3.5–6.7, didn't like 0–3.4.

1. The client fetches the list for the chosen genre + tier (`GET /entries/candidates`).
2. It runs a **binary insertion** locally — at most ⌈log₂(n+1)⌉ questions (7 questions for 100 titles), no network round-trips per question.
3. It sends only the final neighbour (`aboveEntryId`). The API stores a **fractional position** (a midpoint between neighbours, so an insert writes one row) and rescores that single list with one windowed `UPDATE`. Scores are stored denormalised so every read is a plain indexed `SELECT`.

The algorithm lives in `packages/shared/src/ranking.ts` (unit-tested) and the SQL mirror in `apps/api/src/services/entries.ts`.

## Getting started

Requires Node 20+.

```bash
npm install
cp apps/api/.env.example apps/api/.env      # add TMDB_API_KEY / SETLISTFM_API_KEY when you have them
npm run dev                                 # API on :4000, web on :3000
```

Open http://localhost:3000. Migrations run automatically on API start.

### Useful scripts

```bash
npm run typecheck                           # all workspaces
npm test -w @encore/shared                  # ranking algorithm tests
npm run db:generate                         # after editing apps/api/src/db/schema.ts
API_URL=http://localhost:4000 npx tsx apps/api/scripts/smoke.ts   # end-to-end API test
npm run build                               # production builds
```

## API overview

| Method & path | Purpose |
| --- | --- |
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | Accounts (scrypt hashes, 30-day JWT) |
| `GET /catalog/search?type=movie\|tv&q=` | Find titles |
| `GET /catalog/trending?type=` · `GET /catalog/top-rated?type=` | Community charts (with per-title log counts and average score) |
| `GET /catalog/genres?type=` · `GET /catalog/recommendations?type=&genreId=` | Genres (with your/community counts) and per-genre picks |
| `GET /catalog/:type/:tmdbId` | Title details (+ your entry if signed in) |
| `GET /catalog/tv/:tmdbId/season/:n` | Episodes for favorite/least-favorite pickers |
| `GET /entries/candidates?mediaType&genreId&tier` | The list to compare against |
| `POST /entries` · `PUT /entries/:id/rank` · `PATCH /entries/:id` · `DELETE /entries/:id` | Rank, re-rank, edit review/episodes, remove |
| `GET /entries?mediaType&genreId` | Your rankings |
| `GET /music/performers/search?q=` · `GET /music/performers/:mbid/setlists?date=` | Performers (with photos) & setlists (with venue coordinates) |
| `GET/POST /live` · `GET/PATCH/DELETE /live/:id` | Live shows: kind, venue, lineup, per-act setlists and song reactions |
| `GET /users/:username` (+ `/entries`, `/live`) | Public profile |

## Deploying

- **Database:** any managed Postgres (Neon, Supabase, RDS). Set `DATABASE_URL`.
- **API:** `npm run build -w @encore/api` → `node dist/index.js` (run from `apps/api` so it finds `drizzle/`). Set `NODE_ENV=production`, `JWT_SECRET`, `CORS_ORIGINS`. Fits Fly.io, Railway, Render, or a container.
- **Web:** deploy `apps/web` to Vercel (or `next build && next start`) with `NEXT_PUBLIC_API_URL`.
- **Scaling:** the API is stateless except for the in-memory third-party cache (`apps/api/src/lib/cache.ts`); swap it for Redis when running multiple instances.

## Mobile app

The iOS app lives in `apps/mobile` (Expo, runs in Expo Go). Start the API with `npm run dev`, then `npm run ios -w @encore/mobile`. It now has features the website doesn't yet (season ranking, recommended feed, Picks tabs, where to watch); see [`HANDOFF.md`](./HANDOFF.md) for the full list and the newer API endpoints.

The website is also an installable PWA (manifest + standalone display + safe-area-aware bottom tab bar).

## Roadmap ideas

Follows and activity feed · rewatches · ranking live shows head-to-head like titles · "most-loved songs" per performer across users · map of every venue you've been to · Letterboxd CSV import · httpOnly cookie sessions for web.
