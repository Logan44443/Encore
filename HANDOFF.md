# Encore — handoff

Status as of 30 Sep 2026. Read this first, then `README.md` for the original web-app architecture notes (ranking maths, trending formula, caching tables, data sources).

## TL;DR

- **Encore** tracks and ranks movies, TV and live shows (Letterboxd × Beli). It is an npm-workspaces monorepo: a Hono + Postgres **API**, a Next.js **website**, an Expo **iOS app**, and a **shared** TypeScript package both clients use.
- The **iOS app** (`apps/mobile`) is a full port of the website and has since gone further: season-vs-season ranking, a personal "Recommended for you" feed, Picks tabs, "Where to watch" with a streaming country, and a reworked live-show form.
- The **website has not been updated** with those newer features (see [Web vs iOS parity](#web-vs-ios-parity)). The API supports them, so it is client work only.
- Everything runs locally today. **Nothing is deployed, and the git repo has no commits yet** — see [Do these first](#do-these-first).
- Typecheck passes in all four workspaces, the iOS bundle builds, ranking unit tests pass, and the new backend features were smoke-tested against a throwaway API (details in [What has been verified](#what-has-been-verified)).

## Do these first

1. **Commit the code.** `main` has no commits; every file is untracked. `.gitignore` already excludes `node_modules`, `.env`, `.data*` (the local database) and build output, so `git add -A && git commit` is safe. Push it somewhere (GitHub or Cursor-hosted).
2. **Copy secrets out of the current machine.** `apps/api/.env` holds the TMDB key and is intentionally not committed. The next person needs their own copy (template: `apps/api/.env.example`).
3. **Decide on setlist.fm.** No `SETLISTFM_API_KEY` is set, so "Find the setlist on setlist.fm" currently says import isn't configured. A free key fixes it (non-commercial use; commercial use needs setlist.fm's permission).

## Repository layout

```
apps/
  api/      Hono REST API on Node · Drizzle ORM · Postgres (embedded PGlite in dev) · port 4000
  web/      Next.js 16 App Router · Tailwind v4 · TanStack Query · installable PWA · port 3000
  mobile/   Expo SDK 57 · React Native 0.86 · expo-router · TanStack Query  (package @encore/mobile)
packages/
  shared/   @encore/shared — types, Zod schemas, ranking algorithm, typed API client
```

Key idea: **the API validates with the same Zod schemas the clients use, and both clients call it through the same typed client** (`packages/shared/src/client.ts`). Change a response type and both apps fail to typecheck until they're updated.

## Running it locally

Requires Node 20+ (developed on Node 22) and, for iOS, Xcode with a simulator (Xcode 26.2 was used).

```bash
npm install
cp apps/api/.env.example apps/api/.env     # add TMDB_API_KEY (or TMDB_READ_TOKEN), optionally SETLISTFM_API_KEY
npm run dev                                # API on :4000 + website on :3000
```

In a second terminal, for the iOS app:

```bash
npm run ios -w @encore/mobile              # starts Expo and opens the iOS simulator in Expo Go
```

Press `r` in the Expo terminal to reload after changes. The app runs in **Expo Go**, so there is no native build step; every native module used (secure-store, image, localization, router) ships with Expo Go.

- **API address:** the app uses `EXPO_PUBLIC_API_URL` if set, otherwise the Expo dev server's host on port 4000. The simulator just works. A **physical iPhone** needs to be on the same Wi-Fi, and the Mac's firewall must allow port 4000. `NSAllowsLocalNetworking` is enabled in `app.json` for plain-HTTP local development.
- **Database:** with `DATABASE_URL` empty, the API uses embedded Postgres stored in `apps/api/.data/pglite`. Delete that folder to reset all local data. `docker-compose.yml` runs a real Postgres if you want production-like testing.
- **Migrations** in `apps/api/drizzle/` run automatically on API start. After editing `apps/api/src/db/schema.ts`, run `npm run db:generate -w @encore/api -- --name what_changed`.
- **Without a TMDB key** the API serves a built-in 46-title demo catalog (no streaming data in demo mode).

Useful checks:

```bash
npm run typecheck                          # all workspaces (mobile included)
npm test -w @encore/shared                 # ranking algorithm tests
cd apps/mobile && npx expo export --platform ios --output-dir /tmp/encore-export   # proves the iOS bundle builds
curl localhost:4000/health                 # shows whether TMDB is live and setlist.fm is configured
```

## Environment variables (`apps/api/.env`)

| Variable | Needed | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Production | Empty = embedded PGlite. Any Postgres URL works (Supabase, Neon, RDS). |
| `JWT_SECRET` | Production | Dev falls back to an insecure fixed secret and logs a warning; production refuses to start without it. |
| `TRUST_PROXY` | Behind a proxy | Set to `1` on Railway/Fly/Render so login rate limits use the real client IP from `X-Forwarded-For`. |
| `TMDB_API_KEY` or `TMDB_READ_TOKEN` | Strongly recommended | Movies, TV, posters, similar titles, streaming availability. |
| `SETLISTFM_API_KEY` | Optional | Setlist import. Currently **not set**. |
| `MUSICBRAINZ_USER_AGENT` | Recommended | MusicBrainz requires an identifying agent: `AppName/version (contact)`. |
| `CORS_ORIGINS` | Optional | Defaults to `*` (acceptable because auth is bearer tokens, not cookies). |
| `PORT`, `PGLITE_DIR` | Optional | Defaults 4000 and `./.data/pglite`. |

Mobile: `EXPO_PUBLIC_API_URL` (optional locally, required once the API is hosted).

## What was built, in order

The website, API and shared package existed first; this work added:

1. **iOS app** mirroring the website: Home, Discover, Watchlist, Rankings (lists), Live, Profile tabs; title pages; the head-to-head ranking flow; live-show logging; public profiles; login/register. The token is stored in the iOS keychain (expo-secure-store).
2. **Season ranking.** When someone ranks a TV show (or a single season), they also rank its seasons against each other using the same comparison flow as genres. After ranking a new show, the app goes straight into ranking every season watched. The title page has "Rank a season", re-rank, and remove. New `season_entries` table and `/entries/seasons` endpoints.
3. **UI fixes** requested after first use:
   - The orange "E" logo is used for the app icon and the header wordmark. The header is one piece of text ("**E**ncore"), not an image next to text.
   - The back button says "Back" instead of "(tabs)".
   - Smaller count numbers on genre chips.
4. **Live-show form rework:**
   - An emoji per show type (🎤 concert, 🎪 festival, 🎛️ DJ set, 🎭 theatre, 😂 comedy, 🎟️ other).
   - A 0–10 rating **slider** in 0.5 steps, with − / + nudges.
   - Only **show type, performers and rating** are required, each marked with a ★. Saving with any missing turns them red, shows a banner, and scrolls to the top.
   - "When and where" is just **date, venue, city**. A blank date means today.
   - Fixed a Save button that silently did nothing (it had required a valid date without saying so).
5. **Swipe-to-go-back is disabled everywhere.** Leaving a screen only happens with the Back button, because the edge swipe fought the rating slider. Set in `headerOptions` in `apps/mobile/src/theme.ts`.
6. **"Recommended for you" feed** (movies and TV) replaces "Trending movies" on Home. Each card shows a reason and has "Not interested" with undo; "See all" opens a full screen. Details in [How the recommended feed works](#how-the-recommended-feed-works).
7. **Picks by genre has two tabs:**
   - **Trending now:** hot in the genre this week, plus Encore's community favourites.
   - **Recommended for you:** your feed narrowed to the genre, then "Because you loved…", critically acclaimed titles, and your top titles in the genre.
8. **"Where to watch" on every title page:** Stream / Free / Rent / Buy logos for the user's country, from JustWatch via TMDB. Includes a **streaming country** setting (Profile → Streaming country). Details in [How "Where to watch" and country work](#how-where-to-watch-and-country-work).

## How the key systems work

### Title ranking (existing, unchanged)

One ranked list per user × media type × genre × reaction tier (liked 6.8–10, fine 3.5–6.7, didn't like 0–3.4). The client runs a binary insertion locally (about 7 questions for 100 titles) and sends only the neighbour it lands next to. The server stores a fractional position, spreads positions out again when gaps get too small, and recomputes scores for that one list with SQL window functions.

- Algorithm: `packages/shared/src/ranking.ts`
- SQL side: `apps/api/src/services/entries.ts`

### Season ranking (new)

Same algorithm, one list per user × show × tier. The server checks the season exists on the show, rejects duplicates (409), and removes the show from the watchlist.

- Server: `apps/api/src/services/seasons.ts`
- Mobile UI: `apps/mobile/src/components/SeasonRank.tsx`, with three modes: rank every watched season, rank one season, or re-rank a season.

### How the recommended feed works

`apps/api/src/services/feed.ts`, served at `GET /catalog/feed` (signed-in only).

- **Candidates and points:**
  - **"More like this"** for your top 8 liked titles: 3 × seed score ÷ 10.
  - **Liked by people with your taste** (users who liked at least 2 of the same titles): up to 2.
  - **Acclaimed titles in your strongest genres:** up to 1.2.
  - **Watchlist nudges:** 1.5 each, at most 3 in the feed.
- **Boosts and penalties:**
  - Plus genre affinity, community score, and a small bonus for releases in the last 2 years.
  - Minus points for sharing 2+ genres with titles you marked "Not interested".
- **Always excluded:** anything you've ranked or dismissed.
- **Mixing:** never 3 of the same media type in a row while the other type is available; avoids the same reason back to back; at most 4 picks per seed title.
- **New users** (fewer than 3 liked titles) get Encore top-rated plus trending, labelled "Popular on Encore". `personalized: false` tells the app to show a "rank a few titles" hint.
- **Caching:** cached per user for 15 minutes, and cleared for that user when they rank or change their watchlist (hooks in `routes/entries.ts` and `routes/watchlist.ts`).
- **"Not interested"** writes to `dismissed_titles` (`POST /catalog/feed/dismiss`); undo is `DELETE /catalog/feed/dismiss`.
- Live music is **not** in the feed yet.

### Picks tabs

`GET /catalog/recommendations?type&genreId` now also returns:

- `trending`: the same heat × quality formula as the main chart, limited to the genre, topped up from TMDB's most-popular-in-genre list via the new `catalog.popularInGenre`.
- `forYou`: the user's feed filtered to the genre, added in `routes/catalog.ts`.

Mobile screen: `apps/mobile/app/picks.tsx`. The tab is kept in the `?tab=` URL parameter.

### How "Where to watch" and country work

- **Data:** `GET /catalog/:type/:tmdbId/providers?country=US` pulls TMDB's watch-providers endpoint, which has every country in one response. It's cached 3 hours fresh and served stale up to 3 days, then trimmed to the requested country.
- **Country list:** `GET /catalog/regions` lists countries that have data.
- **The user's country** is stored on `users.country`, with a `country_manual` flag:
  - The app reads the **device region** from iOS Settings using `expo-localization`. This is not GPS: no permission prompt, and travelling doesn't change it.
  - It's sent at sign-up and re-synced on each app launch while `country_manual = false`.
  - When the user picks a country (Profile → Streaming country), `country_manual = true` and device syncs are ignored from then on. This covers VPNs and people living abroad.
  - "Use my phone's region" sends `reset: true` to go back to automatic.
- **Privacy:** only the two-letter code is stored. Public profiles use a `PublicUser` type that leaves out the country.
- **Required credit:** the title page shows "Streaming data from JustWatch", as TMDB's terms require for this data.

### My services

- Profile → **My services** lists the streaming services in the user's country (`GET /catalog/services`, TMDB's provider list for movies and TV combined). Tapping one saves the whole list to `users.services` (TMDB provider ids, migration `0009_user_services.sql`).
- **Feed:** the 60 best candidates are checked against the user's services in their country, using the same cached watch-provider data as title pages. Streamable ones (stream or free) score 20% + 0.5 higher and carry `onServices`, shown as "On Netflix" on feed cards and in Picks → "Recommended for you". Changing services or country clears the user's cached feed.
- **Where to watch:** the user's services are listed first with a green outline and "Yours".
- Services are private: public profiles don't include them.

### Setlist import

1. The performer search hits MusicBrainz (falling back to Deezer) and returns each artist's MusicBrainz ID.
2. "Find the setlist on setlist.fm" appears only for performers picked from search results. It queries setlist.fm by that ID, filtered to the show date if one was entered; otherwise it returns the 20 most recent setlists.
3. Picking one fills in the date, venue, city, venue coordinates and tour name, plus that performer's songs with encores marked (tape interludes are skipped). The headliner's setlist.fm ID is saved.
4. Results are cached 6 hours fresh, up to 7 days stale.

Code: `apps/api/src/providers/setlistfm.ts` and `SetlistImporter` in `apps/mobile/src/components/LiveForm.tsx`.

### Caching and auth (existing)

- **Third-party responses:** in-memory stale-while-revalidate plus a `cache_entries` table, so restarts start warm.
- **Community charts:** 2-minute memory cache, cleared on every ranking change.
- **Accounts:** scrypt password hashes and 30-day JWTs, with no refresh tokens yet.

## Data model changes made in this phase

| Migration | Change |
| --- | --- |
| `0004_season_entries.sql` | `season_entries` (user, title, season number, tier, position, score). Unique per user+show+season. |
| `0005_dismissed_titles.sql` | `dismissed_titles` (user, media type, TMDB id, genre ids). Unique per user+title. |
| `0006_user_country.sql` | `users.country` (nullable text) and `users.country_manual` (boolean, default false). |

Earlier migrations (`0000`–`0003`) are the original web app: titles, entries, live shows, venues, performers, response cache, watchlist.

## New or changed API endpoints

| Method & path | Purpose |
| --- | --- |
| `GET /entries/seasons?tmdbId=` | Your ranked seasons of a show |
| `GET /entries/seasons/candidates?tmdbId&tier&excludeEntryId` | Seasons to compare against |
| `POST /entries/seasons` · `PUT /entries/seasons/:id/rank` · `DELETE /entries/seasons/:id` | Rank, re-rank, remove a season |
| `GET /catalog/feed` | Personal recommended feed (auth) |
| `POST /catalog/feed/dismiss` · `DELETE /catalog/feed/dismiss?mediaType&tmdbId` | Not interested / undo (auth) |
| `GET /catalog/recommendations` | Now also returns `trending` and `forYou` |
| `GET /catalog/:type/:tmdbId/providers?country=` | Where to watch in a country |
| `GET /catalog/regions` | Countries with streaming data |
| `PUT /auth/me/country` | `{ country, manual, reset? }` |
| `PUT /auth/me/services` | `{ providerIds }` — "My services", replaces the saved list (auth) |
| `GET /catalog/services?country=` | Streaming services in a country, most popular first |
| `POST /auth/register` | Now accepts an optional `country` |
| `GET /auth/me` etc. | `User` now includes `country` and `countryManual` |

## iOS app map (`apps/mobile`)

- `app/` — screens (expo-router file routes):
  - `(tabs)/`: `index` (Home), `discover`, `watchlist`, `lists`, `live`, `profile`
  - Stack screens: `title/[type]/[id]`, `picks`, `recommended`, `country`, `show/new`, `show/[id]`, `user/[username]`, `login`, `register`
  - `_layout.tsx`: the root stack and the list of screen titles
- `src/`:
  - Setup: `api.ts` (client plus keychain token), `auth.tsx` (auth context, country sync, `useCountry`), `region.ts` (device region, country names, flags)
  - Styling and helpers: `theme.ts` (colours, header options with swipe-back off), `format.ts`, `watchlist.ts`, `live-form.ts` (form state, validation, show-type emoji)
- `src/components/`:
  - `ui.tsx`: shared building blocks
  - Ranking: `RankSheet.tsx` (title ranking flow), `SeasonRank.tsx`
  - Live shows: `LiveForm.tsx`, `RatingSlider.tsx`
  - Discovery: `Feed.tsx` (feed cards, dismiss/undo), `WhereToWatch.tsx`, `Poster.tsx`, `EntryRow.tsx`, `Logo.tsx`
- `metro.config.js` watches the monorepo root so `@encore/shared` resolves. The `@/*` path alias maps to `src/*`.
- App config: name Encore, bundle id `app.encore.mobile`, dark UI, scheme `encore`.

## Web vs iOS parity

The website still matches the **original** feature set. Missing on web:

- Season ranking
- The recommended feed (Home still shows "Trending movies")
- Picks tabs (Trending now / Recommended for you)
- Where to watch and the streaming country setting
- The reworked live-show form: emoji, slider, required-field validation, trimmed "When and where"

The API already serves all of it. Porting is client work in `apps/web`, reusing the same client methods.

## Known issues and limitations

**Product**
- "Not interested" only affects the feed and Picks → "Picked for you". Dismissed titles can still appear in Discover charts and the other Picks lists.
- The "people with your taste" signal needs other users with overlapping likes. With one account, the feed runs on "more like this", genres and the watchlist.
- Other users' feeds can be up to 15 minutes stale after someone else ranks something.
- Live shows aren't in the feed.
- Setlist search:
  - The date is a typed `YYYY-MM-DD` field, and a malformed date returns an error instead of results.
  - With no date, only the 20 newest setlists show, with no "load more".
  - Festival bills need a separate search per performer.
- The TMDB attribution line ("uses the TMDB API but is not endorsed…") is shown on the iOS Discover screen but not yet on the website. It's required before launch.

**Engineering**
- **Testing:** there are no automated tests beyond 3 ranking unit tests in `packages/shared`. `apps/api/scripts/smoke.ts` predates the feed, seasons and country work.
- **iOS verification:** the app was verified with typecheck and bundle export. UI testing was done by hand in the simulator by the product owner. Android is configured but untested.
- **Migrations** run on every API boot. Before production, move them to a deploy step.
- **Scaling:** the in-memory caches (charts, feed, third-party responses) assume a single API instance. Move them to Redis before scaling out.
- **Auth:** no refresh tokens and no password reset. Login, sign-up and searches are rate-limited in memory (per IP, and per account for login). Sign in with Apple becomes mandatory for the App Store only if social logins are added.
- **Deployment setup:** there's no CI, no error tracking (Sentry), and no staging environment.

## Production readiness (recommended path)

The decision so far: **keep the Hono API and use Supabase (or Neon) only as managed Postgres.** Moving logic into Supabase's direct-to-database model would mean rewriting the transactional ranking, feed and third-party integrations, and weakening the single place where security checks live.

1. **Database:** create a Supabase or Neon project and set `DATABASE_URL`, using the pooled connection. Turn on backups, ideally point-in-time restore.
2. **API hosting:** deploy the API to Railway, Fly.io or Render.
   - Build and start with `npm run build -w @encore/api`, then `node dist/index.js`, run from `apps/api` so it finds `drizzle/`.
   - Set `NODE_ENV=production`, a long random `JWT_SECRET`, the TMDB and setlist.fm keys, `MUSICBRAINZ_USER_AGENT` and `CORS_ORIGINS`.
3. **Migrations:** run them as a release step instead of at boot.
4. **Website:** deploy `apps/web` to Vercel with `NEXT_PUBLIC_API_URL`.
5. **iOS:**
   - Set `EXPO_PUBLIC_API_URL` to the hosted https API. `app.config.ts` then drops the plain-HTTP exceptions (iOS local networking, Android cleartext) automatically.
   - Set up EAS Build, build, and ship through TestFlight. This needs an Apple Developer account.
6. **Hardening:** rate-limit auth, add refresh tokens and password reset, add Sentry to the API and both apps, and add CI that runs typecheck and tests on every push.
7. **Legal:** add TMDB attribution; keep the JustWatch credit; get setlist.fm's permission if the app becomes commercial.

## Third-party terms to respect

- **TMDB:** free for non-commercial use with attribution. Commercial use needs a TMDB agreement.
- **JustWatch** (watch-provider data via TMDB): must be credited (already done in the app).
- **setlist.fm:** free key for non-commercial use.
- **MusicBrainz:** identifying User-Agent, and at most 1 request per second (the API throttles and caches).
- **Deezer:** public API, used only for performer photos.

## What has been verified

- `npm run typecheck`: shared, API, web and mobile all pass.
- `npm test -w @encore/shared`: 3/3 ranking tests pass.
- `npx expo export --platform ios`: the bundle builds.
- **Feed smoke test** on a throwaway in-memory API with demo data:
  - A new account gets 30 popular picks.
  - A user with likes gets 30 personalized picks with reasons, and movies and TV mix correctly.
  - Dismissing removes a title, and undo restores it.
- **Country smoke test:**
  - Sign-up saves the device country.
  - A device sync updates it while automatic.
  - A manual pick survives later device syncs.
  - Reset returns to automatic.
  - The public profile doesn't expose the country.
- **Live TMDB checks** on the dev API:
  - Genre trending returns current titles.
  - Breaking Bad in the US shows Netflix (stream) and four stores (buy).
  - The region list loads.

## Suggested next steps

1. Commit and push; set up CI (typecheck and tests).
2. Bring the website up to parity with iOS.
3. Deploy: managed Postgres, API host, Vercel, TestFlight.
4. Add the TMDB attribution and a setlist.fm key.
5. Expand setlist import: a date picker, "load more", and multiple performers at once.
7. Add live shows to the recommended feed (artists similar to ones you rated highly, upcoming shows).
8. Write API tests for season ranking, feed exclusions and country rules.
