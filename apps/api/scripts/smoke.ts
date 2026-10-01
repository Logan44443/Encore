/**
 * End-to-end smoke test against a running API (demo catalog is enough).
 *   API_URL=http://localhost:4000 npx tsx scripts/smoke.ts
 */
import assert from "node:assert/strict";
import { createApiClient } from "@encore/shared";

const baseUrl = process.env.API_URL ?? "http://localhost:4000";
let token: string | null = null;
const api = createApiClient({ baseUrl, getToken: () => token });

const suffix = Math.random().toString(36).slice(2, 8);
const auth = await api.auth.register({
  email: `smoke_${suffix}@example.com`,
  username: `smoke_${suffix}`,
  password: "correct-horse",
});
token = auth.token;
assert.equal((await api.auth.me()).user.username, `smoke_${suffix}`);

const THRILLER = 53;
// Rank three thrillers in the "liked" tier: Se7en > Prisoners > Gone Girl.
// The first two titles in a list get their score from the slider; later ones are ranked by comparison.
const a = await api.entries.create({ mediaType: "movie", tmdbId: 146233, genreId: THRILLER, tier: "liked", aboveEntryId: null, score: 8 });
const b = await api.entries.create({ mediaType: "movie", tmdbId: 807, genreId: THRILLER, tier: "liked", aboveEntryId: null, score: 9.4 });
assert.equal(b.rank, 1, "a set score places the title by score");
await assert.rejects(
  api.entries.create({ mediaType: "movie", tmdbId: 210577, genreId: THRILLER, tier: "liked", aboveEntryId: null, score: 9 }),
  (err: { status?: number }) => err.status === 409,
  "the slider is only for the first titles in a list",
);
const c = await api.entries.create({
  mediaType: "movie",
  tmdbId: 210577,
  genreId: THRILLER,
  tier: "liked",
  aboveEntryId: a.entry.id,
});
assert.equal(c.rank, 3);

const { candidates } = await api.entries.candidates({ mediaType: "movie", genreId: THRILLER, tier: "liked" });
assert.deepEqual(
  candidates.map((x) => x.title.name),
  ["Se7en", "Prisoners", "Gone Girl"],
);
// Set scores stay put; Gone Girl spreads toward the bottom of the tier (6.8).
assert.deepEqual(candidates.map((x) => x.score), [9.4, 8, 7.4]);
console.log("thriller ranking:", candidates.map((x) => `${x.title.name} ${x.score}`).join(", "));

// A disliked thriller must score below every liked one
const d = await api.entries.create({ mediaType: "movie", tmdbId: 419430, genreId: THRILLER, tier: "disliked", aboveEntryId: null });
assert.ok(d.entry.score <= 3.4);
assert.equal(d.rank, 4);

// Move Gone Girl to the top by comparison: halfway between Se7en's 9.4 and the top of the tier
const moved = await api.entries.rerank(c.entry.id, { genreId: THRILLER, tier: "liked", aboveEntryId: null });
assert.equal(moved.rank, 1);
assert.equal(moved.entry.score, 9.7);

// Duplicate is rejected
await assert.rejects(
  api.entries.create({ mediaType: "movie", tmdbId: 807, genreId: THRILLER, tier: "fine", aboveEntryId: null }),
  /already ranked/,
);

// TV with favourite / least favourite episodes
const { episodes } = await api.catalog.season(1396, 5);
const bb = await api.entries.create({
  mediaType: "tv",
  tmdbId: 1396,
  genreId: 18,
  tier: "liked",
  aboveEntryId: null,
  review: "All-time great.",
  favoriteEpisode: { season: 5, episode: episodes[13].episode, name: episodes[13].name },
  leastFavoriteEpisode: { season: 3, episode: 10, name: "Fly" },
});
assert.equal(bb.entry.favoriteEpisode?.episode, 14);

const title = await api.catalog.title("tv", 1396);
assert.equal(title.myEntry?.id, bb.entry.id);

await api.entries.remove(b.entry.id);
const after = await api.entries.list({ mediaType: "movie", genreId: THRILLER });
assert.equal(after.entries.length, 3);

// Live show: headliner with setlist + a manually-added support act, at a located venue
const { show } = await api.live.create({
  kind: "concert",
  date: "2025-11-14",
  venue: { name: "Unipol Arena", city: "Bologna", country: "Italy", lat: 44.49, lng: 11.34 },
  rating: 9.5,
  liked: "Encore was unreal",
  lineup: [
    {
      role: "headliner",
      performer: { mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711", name: "Radiohead" },
      songs: [
        { title: "Let Down", reaction: "loved" },
        { title: "Lucky", reaction: "liked" },
        { title: "Karma Police", encore: true },
      ],
    },
    { role: "support", performer: { name: `Local Opener ${suffix}` }, songs: [{ title: "Opening Song" }] },
  ],
});
assert.equal(show.lineup.length, 2);
assert.equal(show.lineup[0].songs.length, 3);
assert.equal(show.lineup[0].songs[2].encore, true);
assert.equal(show.lineup[1].performer.mbid, null);
assert.equal(show.venue?.city, "Bologna");
console.log("headliner photo:", show.lineup[0].performer.imageUrl ?? "(none — offline?)");

const updated = await api.live.update(show.id, {
  lineup: [{ role: "headliner", performer: show.lineup[0].performer, songs: [{ title: "Creep", reaction: "disliked" }] }],
});
assert.equal(updated.show.lineup.length, 1);
assert.equal(updated.show.lineup[0].songs[0].title, "Creep");
assert.equal(updated.show.venue?.name, "Unipol Arena");

// Watchlist: movie, show, artist and festival; ranking / logging crosses items off
const INTERSTELLAR = 157336;
const wlMovie = await api.watchlist.add({ kind: "movie", tmdbId: INTERSTELLAR, note: "Rewatch in IMAX" });
const again = await api.watchlist.add({ kind: "movie", tmdbId: INTERSTELLAR });
assert.equal(again.item.id, wlMovie.item.id, "adding twice is idempotent");
await api.watchlist.add({ kind: "tv", tmdbId: 66732 });
await api.watchlist.add({
  kind: "performer",
  performer: { mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbc9298a", name: "Arctic Monkeys" },
});
const wlFest = await api.watchlist.add({ kind: "festival", name: "Glastonbury", date: "2027-06-23", city: "Pilton", country: "UK" });
assert.equal(wlFest.item.festival?.city, "Pilton");
assert.equal((await api.watchlist.list()).items.length, 4);
assert.equal((await api.catalog.title("movie", INTERSTELLAR)).watchlistItemId, wlMovie.item.id);

await api.entries.create({ mediaType: "movie", tmdbId: INTERSTELLAR, genreId: 878, tier: "liked", aboveEntryId: null });
await api.live.create({
  kind: "festival",
  name: "glastonbury",
  date: "2027-06-24",
  lineup: [{ role: "headliner", performer: { mbid: "ada7a83c-e3e1-40f1-93f9-3e73dbc9298a", name: "Arctic Monkeys" } }],
});
const remaining = (await api.watchlist.list()).items;
assert.deepEqual(
  remaining.map((i) => i.kind),
  ["tv"],
  "ranked movie, seen artist and attended festival are crossed off",
);
await api.watchlist.remove(remaining[0].id);
assert.equal((await api.watchlist.list()).items.length, 0);

const profile = await api.users.profile(`smoke_${suffix}`);
assert.deepEqual(profile.stats, { movies: 4, series: 1, liveShows: 2, performers: 2, cities: 1 });

// Community discovery: this user's fresh logs should lead the trending chart
const { results: trendingMovies } = await api.catalog.trending("movie");
assert.ok(trendingMovies[0].community && trendingMovies[0].community.recentLogs >= 1);
const trendingIds = trendingMovies.filter((t) => t.community).map((t) => t.tmdbId);
assert.ok(trendingIds.includes(210577) && trendingIds.includes(146233));

// A second user rating Prisoners makes it eligible for "top rated" (needs ≥2 ratings)
token = (await api.auth.register({ email: `smoke2_${suffix}@example.com`, username: `smoke2_${suffix}`, password: "correct-horse" })).token;
await api.entries.create({ mediaType: "movie", tmdbId: 146233, genreId: THRILLER, tier: "liked", aboveEntryId: null });
const { results: top } = await api.catalog.topRated("movie");
const prisoners = top.find((t) => t.tmdbId === 146233);
assert.ok(prisoners && prisoners.community!.totalLogs >= 2);
console.log("top rated:", top.slice(0, 3).map((t) => `${t.name} ${t.community?.avgScore}`).join(", "));

// Genre recommendations for user 2 (who has only ranked Prisoners)
const { genres } = await api.catalog.genres("movie");
assert.equal(genres[0].id, THRILLER);
assert.equal(genres[0].yourCount, 1);
const recs = await api.catalog.recommendations("movie", THRILLER);
assert.equal(recs.genre.name, "Thriller");
assert.ok(!recs.community.some((t) => t.tmdbId === 146233), "already-ranked titles are excluded");
assert.ok(recs.community.some((t) => t.tmdbId === 210577), "other users' favourites are recommended");
assert.equal(recs.becauseYouLoved?.title.tmdbId, 146233);
assert.ok(recs.becauseYouLoved!.results.length > 0);
assert.ok(recs.acclaimed.length > 0 && !recs.acclaimed.some((t) => t.tmdbId === 146233));
console.log(
  "thriller picks:",
  recs.community.map((t) => t.name).join(", "),
  "| because you loved Prisoners:",
  recs.becauseYouLoved!.results.slice(0, 3).map((t) => t.name).join(", "),
);

// Security: shared records, private notes, dates, expired sessions
await assert.rejects(
  api.live.create({ date: "2024-02-31", rating: 5, lineup: [{ performer: { name: "Anyone" } }] }),
  (err: { status?: number }) => err.status === 400,
  "an impossible date is a 400, not a server error",
);
const renamed = await api.live.create({
  date: "2025-01-10",
  rating: 5,
  lineup: [{ performer: { mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711", name: "Not Radiohead", imageUrl: "https://example.com/x.jpg" } }],
});
assert.equal(renamed.show.lineup[0].performer.name, "Radiohead", "one user can't rename a shared artist");

// Friends: profiles are friends-only by default, so user 2 sees nothing until user 1 says yes
const user1 = `smoke_${suffix}`;
const user2 = `smoke2_${suffix}`;
const locked = await api.users.profile(user1);
assert.equal(locked.canView, false);
assert.equal(locked.relationship, "none");
assert.equal(locked.topMovies.length, 0);
await assert.rejects(api.users.entries(user1), (err: { status?: number }) => err.status === 403);
const found = await api.users.search(user1.slice(0, 8));
assert.ok(found.users.some((u) => u.username === user1));
assert.equal((await api.friends.request({ username: user1 })).relationship, "requested");
assert.equal((await api.users.profile(user1)).relationship, "requested");

token = auth.token; // back to user 1
const { incoming } = await api.friends.requests();
assert.equal(incoming[0]?.user.username, user2);
assert.equal((await api.users.profile(user2)).relationship, "incoming");
await api.friends.accept(incoming[0].id);
assert.equal((await api.friends.list()).friends[0].username, user2);

token = (await api.auth.login({ login: user2, password: "correct-horse" })).token;
const friendProfile = await api.users.profile(user1);
assert.equal(friendProfile.canView, true);
assert.equal(friendProfile.relationship, "friend");
assert.ok(friendProfile.recentLiveShows.some((s) => s.liked === "Encore was unreal"), "friends see notes by default");
assert.ok((await api.users.entries(user1, "tv")).entries.some((e) => e.review === "All-time great."));

// Turning off "share reviews" hides them from friends too
token = auth.token;
assert.equal((await api.account.updatePrivacy({ shareReviews: false })).user.privacy.shareReviews, false);
token = (await api.auth.login({ login: user2, password: "correct-horse" })).token;
const publicProfile = await api.users.profile(user1);
assert.ok(publicProfile.recentLiveShows.length > 0);
assert.ok(publicProfile.recentLiveShows.every((s) => s.liked === null && s.notes === null), "notes stay private");

// Public profiles: anyone signed in sees rankings, never notes; nobody signed out sees anything
token = auth.token;
await api.account.updatePrivacy({ profileVisibility: "public", shareReviews: true });
const stranger = await api.auth.register({ email: `smoke3_${suffix}@example.com`, username: `smoke3_${suffix}`, password: "correct-horse" });
token = stranger.token;
const seen = await api.users.profile(user1);
assert.equal(seen.canView, true);
assert.ok(seen.topMovies.length > 0 && seen.topShows.every((e) => e.review === null), "reviews are for friends only");
token = null;
await assert.rejects(api.users.profile(user1), (err: { status?: number }) => err.status === 401);

// Blocking: user 1 blocks the stranger, who then can't find, view or request them
token = auth.token;
await api.safety.block({ userId: stranger.user.id });
assert.equal((await api.safety.blocked()).users[0].id, stranger.user.id);
token = stranger.token;
await assert.rejects(api.users.profile(user1), (err: { status?: number }) => err.status === 404);
await assert.rejects(api.friends.request({ username: user1 }), (err: { status?: number }) => err.status === 404);
assert.ok(!(await api.users.search(user1)).users.some((u) => u.username === user1));
await api.safety.report({ userId: auth.user.id, reason: "spam", details: "smoke test" });

// Unfriending, and names that aren't allowed
token = auth.token;
await api.safety.unblock(stranger.user.id);
const friendId = (await api.friends.list()).friends[0].id;
await api.friends.remove(friendId);
assert.equal((await api.friends.list()).friends.length, 0);
await assert.rejects(api.account.updateProfile({ displayName: "H1tler fan" }), (err: { status?: number }) => err.status === 400);
await api.account.updatePrivacy({ profileVisibility: "friends" });
let expired = 0;
const stale = createApiClient({ baseUrl, getToken: () => "not-a-real-token", onUnauthorized: () => expired++ });
await assert.rejects(stale.auth.me(), (err: { status?: number }) => err.status === 401);
assert.equal(expired, 1, "clients are told when their session is no longer valid");

console.log("smoke test passed ✔");
