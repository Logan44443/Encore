/**
 * Checks the database's privacy rules (Row Level Security, grants and the
 * sign-up trigger) the way the iOS app meets them: as the `authenticated` and
 * `anon` roles with a signed-in user id.
 *
 * Needs a throwaway plain Postgres 15+ database. It is wiped first, so this
 * refuses to run against Supabase:
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/encore_rls npx tsx scripts/rls-test.ts
 */
import assert from "node:assert/strict";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("Set TEST_DATABASE_URL to an empty local Postgres database.");
if (/supabase\.(co|com)/.test(url)) throw new Error("TEST_DATABASE_URL points at Supabase. Use a throwaway local database.");

const sql = postgres(url, { max: 1, onnotice: () => {} });

// A blank database with just enough of Supabase's auth schema and roles.
await sql.unsafe(`
  drop schema if exists public, private, auth, drizzle cascade;
  create schema public;
  do $$ begin
    create role anon nologin; exception when duplicate_object then null; end $$;
  do $$ begin
    create role authenticated nologin; exception when duplicate_object then null; end $$;
  do $$ begin
    create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email varchar(255), raw_user_meta_data jsonb,
    encrypted_password text, created_at timestamptz default now(), updated_at timestamptz default now());
  create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`);
await migrate(drizzle(sql), { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
// "badword" is blocked everywhere; "histword" only in names (like a historical figure).
await sql`insert into private.blocked_words (word, in_prose) values ('badword', true), ('histword', false)`;

const ALICE = "00000000-0000-0000-0000-00000000000a";
const BOB = "00000000-0000-0000-0000-00000000000b";
const CAROL = "00000000-0000-0000-0000-00000000000c";
const ENTRY = "10000000-0000-0000-0000-000000000001";
const SHOW = "20000000-0000-0000-0000-000000000001";

type Tx = postgres.TransactionSql;
/** Runs `fn` as the app would for `userId` (null: signed out). */
async function as<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${userId ? "authenticated" : "anon"}`);
    await tx`select set_config('request.jwt.claims', ${userId ? JSON.stringify({ sub: userId, role: "authenticated" }) : ""}, true)`;
    return fn(tx);
  })) as T;
}
const count = async (tx: Tx, table: string) => Number((await tx.unsafe(`select count(*)::int as n from ${table}`))[0].n);
const fails = (what: string, p: Promise<unknown>, message: RegExp) => assert.rejects(p, message, what);
const DENIED = /permission denied/;
const RLS = /row-level security/;

// ---- sign-up trigger ---------------------------------------------------------
await sql`insert into auth.users (id, email, raw_user_meta_data) values
  (${ALICE}, 'a@x', '{"username":"Alice","country":"gb"}'),
  (${BOB}, 'b@x', '{"username":"bob_1","display_name":"Bob"}'),
  (${CAROL}, 'c@x', '{"username":"carol"}')`;
await fails("too-short username", sql`insert into auth.users (email, raw_user_meta_data) values ('d@x', '{"username":"no"}')`, /./);
await fails("username taken in another case", sql`insert into auth.users (email, raw_user_meta_data) values ('e@x', '{"username":"ALICE"}')`, /./);
await fails("offensive username", sql`insert into auth.users (email, raw_user_meta_data) values ('f@x', '{"username":"b4dw0rd_fan"}')`, /./);
assert.deepEqual(
  [...await sql`select p.username, p.display_name, s.country from profiles p join user_settings s on s.user_id = p.id order by p.username`],
  [
    { username: "Alice", display_name: "Alice", country: "GB" },
    { username: "bob_1", display_name: "Bob", country: null },
    { username: "carol", display_name: "carol", country: null },
  ],
);

// What the API writes as the database owner.
await sql`insert into titles (tmdb_id, media_type, name) values (1, 'movie', 'Heat')`;
await sql`insert into friendships values (${ALICE}, ${BOB}), (${BOB}, ${ALICE})`;
await sql`insert into title_entries (id, user_id, title_id, media_type, genre_id, tier, position, score)
  values (${ENTRY}, ${ALICE}, 1, 'movie', 80, 'liked', 0, 8.4)`;

// ---- reviews, scores and private tables -------------------------------------
await as(ALICE, (tx) => tx`insert into entry_reviews (entry_id, user_id, review) values (${ENTRY}, ${ALICE}, 'Great film')`);
await fails("offensive review", as(ALICE, (tx) => tx`update entry_reviews set review = 'what a B4DW0RDS film' where entry_id = ${ENTRY}`), /./);
await as(ALICE, (tx) => tx`update entry_reviews set review = 'a film about histword' where entry_id = ${ENTRY}`);
await fails("changing your own score", as(ALICE, (tx) => tx`update title_entries set score = 10 where id = ${ENTRY}`), DENIED);
await as(ALICE, (tx) => tx`update title_entries set watched_at = '2026-01-01' where id = ${ENTRY}`);
await fails("reading the API cache", as(ALICE, (tx) => count(tx, "cache_entries")), DENIED);
assert.equal(await as(ALICE, (tx) => count(tx, "user_settings")), 1, "only your own settings");
await fails("forging another profile", as(ALICE, (tx) => tx`insert into profiles (id, username, display_name) values (gen_random_uuid(), 'fake', 'Fake')`), /./);

// ---- friends see entries and reviews; strangers don't ------------------------
assert.deepEqual(
  await as(BOB, async (tx) => [await count(tx, "title_entries"), await count(tx, "entry_reviews"), await count(tx, "ranked_entries")]),
  [1, 1, 1],
);
assert.equal((await as(BOB, (tx) => tx`update profiles set display_name = 'hacked' where id = ${ALICE}`)).count, 0);
assert.deepEqual(
  await as(CAROL, async (tx) => [await count(tx, "title_entries"), await count(tx, "entry_reviews"), await count(tx, "profiles")]),
  [0, 0, 3],
);

// ---- friend requests ---------------------------------------------------------
for (let i = 0; i < 2; i++) {
  await as(CAROL, (tx) => tx`insert into friend_requests (from_user_id, to_user_id) values (${CAROL}, ${ALICE}) on conflict do nothing`);
}
await fails("request forged from someone else", as(CAROL, (tx) => tx`insert into friend_requests (from_user_id, to_user_id) values (${BOB}, ${ALICE})`), RLS);
await fails("making yourself friends", as(CAROL, (tx) => tx`insert into friendships values (${CAROL}, ${ALICE})`), /./);
await as(ALICE, async (tx) => {
  const [req] = await tx`select id from friend_requests`;
  await tx`select accept_friend_request(${req.id})`;
  await tx`select accept_friend_request('99999999-0000-0000-0000-000000000000')`;
});
assert.equal(await as(CAROL, (tx) => count(tx, "title_entries")), 1, "carol sees alice's entries once friends");

// ---- review sharing and blocks -----------------------------------------------
await as(ALICE, (tx) => tx`update profiles set share_reviews = false where id = ${ALICE}`);
assert.deepEqual(await as(BOB, async (tx) => [await count(tx, "title_entries"), await count(tx, "entry_reviews")]), [1, 0]);
await as(ALICE, (tx) => tx`insert into blocks (blocker_id, blocked_id) values (${ALICE}, ${BOB})`);
assert.deepEqual(
  await as(BOB, async (tx) => [
    await count(tx, "title_entries"),
    await count(tx, "profiles where username = 'Alice'"),
    await count(tx, "blocks"),
    await count(tx, "friendships"),
    (await tx`select * from profile_by_username('alice')`).length,
  ]),
  [0, 0, 0, 0, 0],
  "a block hides everything both ways and ends the friendship",
);

// ---- watchlist upserts are idempotent ------------------------------------------
for (let i = 0; i < 2; i++) {
  await as(CAROL, (tx) => tx`insert into watchlist_items (user_id, kind, title_id) values (${CAROL}, 'movie', 1) on conflict (user_id, title_id) do nothing`);
}
assert.equal(await as(CAROL, (tx) => count(tx, "watchlist_items")), 1);
await fails("watchlist kind without a target", as(CAROL, (tx) => tx`insert into watchlist_items (user_id, kind, performer_id) values (${CAROL}, 'movie', null)`), /./);

// ---- signed out ----------------------------------------------------------------
assert.equal(await as(null, (tx) => count(tx, "titles")), 1);
await fails("anon reading profiles", as(null, (tx) => count(tx, "profiles")), DENIED);
assert.deepEqual(
  [...(await as(null, (tx) => tx`select username_available('CAROL') as carol, username_available('newbie') as newbie`))],
  [{ carol: false, newbie: true }],
);

// ---- deleting an account removes everything it owned ----------------------------
await sql`delete from auth.users where id = ${ALICE}`;
assert.deepEqual(
  (await sql`select (select count(*) from profiles)::int as profiles, (select count(*) from title_entries)::int as entries,
    (select count(*) from entry_reviews)::int as reviews, (select count(*) from friendships)::int as friendships,
    (select count(*) from friend_requests)::int as requests`)[0],
  { profiles: 2, entries: 0, reviews: 0, friendships: 0, requests: 0 },
);

// ---- live shows, notes and "watched with" tags ----------------------------------
await sql`insert into auth.users (id, email, raw_user_meta_data) values (${ALICE}, 'a@x', '{"username":"Alice"}')`;
await sql`delete from blocks`;
await sql`delete from friendships`;
await sql`insert into friendships values (${ALICE}, ${BOB}), (${BOB}, ${ALICE})`;
await sql`insert into performers (id, name) overriding system value values (1, 'Band')`;
await sql`insert into live_shows (id, user_id, date) values (${SHOW}, ${ALICE}, '2026-05-01')`;
const [slot] = await sql`insert into live_show_performers (show_id, performer_id, role, position) values (${SHOW}, 1, 'headliner', 0) returning id`;
const [song] = await sql`insert into live_show_songs (slot_id, position, title) values (${slot.id}, 0, 'Song') returning id`;
await sql`insert into title_entries (id, user_id, title_id, media_type, genre_id, tier, position, score)
  values (${ENTRY}, ${ALICE}, 1, 'movie', 80, 'liked', 0, 8.4)`;
await as(ALICE, async (tx) => {
  await tx`insert into live_show_song_notes (song_id, user_id, note) values (${song.id}, ${ALICE}, 'Loved it')`;
  await tx`insert into live_show_notes (show_id, user_id, notes) values (${SHOW}, ${ALICE}, 'Fun')`;
  await tx`insert into watch_companions (owner_id, title_entry_id, friend_id) values (${ALICE}, ${ENTRY}, ${BOB})`;
  await tx`insert into watch_companions (owner_id, title_entry_id, name) values (${ALICE}, ${ENTRY}, 'Mum')`;
});
await fails("tagging a non-friend", as(ALICE, (tx) => tx`insert into watch_companions (owner_id, title_entry_id, friend_id) values (${ALICE}, ${ENTRY}, ${CAROL})`), RLS);
assert.deepEqual(
  await as(BOB, async (tx) => [
    await count(tx, "watch_companions"),
    await count(tx, "live_show_performers"),
    await count(tx, "live_show_songs"),
    await count(tx, "live_show_song_notes"),
    await count(tx, "live_show_notes"),
  ]),
  [1, 1, 1, 1, 1],
  "a friend sees the show, its notes and their own tag, but not private names",
);
assert.equal((await as(BOB, (tx) => tx`update watch_companions set confirmed = true where friend_id = ${BOB}`)).count, 1);
await fails("moving a tag you were given", as(BOB, (tx) => tx`update watch_companions set title_entry_id = null where friend_id = ${BOB}`), DENIED);
assert.deepEqual(
  await as(CAROL, async (tx) => [await count(tx, "watch_companions"), await count(tx, "live_show_performers"), await count(tx, "ranked_entries")]),
  [0, 0, 0],
);
await sql`update profiles set profile_visibility = 'public' where id = ${ALICE}`;
assert.deepEqual(
  await as(CAROL, async (tx) => [
    await count(tx, "watch_companions"),
    await count(tx, "live_show_songs"),
    await count(tx, "live_show_song_notes"),
    await count(tx, "ranked_entries"),
  ]),
  [1, 1, 0, 1],
  "a public profile shows confirmed tags and the setlist, but notes stay with friends",
);
await fails("owner confirming for a friend", as(ALICE, (tx) => tx`update watch_companions set confirmed = false where friend_id is not null`), RLS);
await as(ALICE, (tx) => tx`update watch_companions set name = 'Mother' where name = 'Mum'`);
await as(ALICE, (tx) => tx`insert into blocks (blocker_id, blocked_id) values (${ALICE}, ${BOB})`);
assert.equal(Number((await sql`select count(*) as n from watch_companions where friend_id is not null`)[0].n), 0, "a block removes tags");

await sql.end();
console.log("RLS test passed ✔");
