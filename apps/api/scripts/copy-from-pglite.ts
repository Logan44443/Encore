/**
 * One-time copy of the old embedded database (apps/api/.data/pglite) into
 * Supabase, keeping every id so links between rows survive.
 *   npm run db:copy-from-pglite -w @encore/api            (reads ./.data/pglite)
 *   npm run db:copy-from-pglite -w @encore/api -- <dir>   (another folder)
 *
 * Run `npm run db:migrate` first. Safe to run twice: rows already copied are
 * skipped. Passwords can't be copied (Supabase Auth hashes its own), so
 * everyone signs in once with "Forgot password?". The old folder is only read.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { env } from "../src/env";
import { supabaseAdmin } from "../src/lib/supabase";

const dir = path.resolve(process.argv[2] ?? ".data/pglite");
if (!existsSync(dir)) throw new Error(`No old database at ${dir}. Pass its folder as the first argument.`);
const old = new PGlite(dir);
const pg = postgres(env.databaseUrl, { max: 1, onnotice: () => {} });

type Row = Record<string, unknown>;
/** Rows exactly as the old database prints them as JSON, so dates and numbers round-trip untouched. */
async function rows(query: string): Promise<Row[]> {
  const res = await old.query<{ rows: Row[] | null }>(`select json_agg(t) as rows from (${query}) t`);
  return res.rows[0]?.rows ?? [];
}

// ---- accounts -------------------------------------------------------------------
const users = await rows("select * from users order by created_at");
const existing = new Set((await pg<{ id: string }[]>`select id from auth.users`).map((r) => r.id));
const skipped: string[] = [];
for (const u of users) {
  if (existing.has(u.id as string)) continue;
  const { error } = await supabaseAdmin.auth.admin.createUser({
    id: u.id as string,
    email: u.email as string,
    email_confirm: true,
    user_metadata: { username: u.username, display_name: u.display_name, country: u.country },
  });
  if (error) skipped.push(`${u.username} (${u.email}): ${error.message}`);
}
// The sign-up trigger made a profile and settings row; bring over everything else about the account.
await pg`
  update public.profiles p set
    profile_visibility = o.profile_visibility, share_reviews = o.share_reviews, searchable = o.searchable,
    allow_friend_requests = o.allow_friend_requests, allow_tags = o.allow_tags, share_watchlist = o.share_watchlist,
    created_at = o.created_at
  from jsonb_to_recordset(${pg.json(users as postgres.JSONValue)}) as o(
    id uuid, profile_visibility public.profile_visibility, share_reviews boolean, searchable boolean,
    allow_friend_requests boolean, allow_tags boolean, share_watchlist boolean, created_at timestamptz)
  where p.id = o.id`;
await pg`
  update public.user_settings s set country_manual = o.country_manual, services = o.services
  from jsonb_to_recordset(${pg.json(users as postgres.JSONValue)}) as o(id uuid, country_manual boolean, services jsonb)
  where s.user_id = o.id`;
const copied = new Set((await pg<{ id: string }[]>`select id from public.profiles`).map((r) => r.id));

// ---- everything else, parents before children -----------------------------------------
/** Columns holding a user id: a row is copied only if every one is an account that made it across. */
const userColumns: Record<string, string[]> = {
  title_entries: ["user_id"],
  season_entries: ["user_id"],
  episode_entries: ["user_id"],
  dismissed_titles: ["user_id"],
  live_shows: ["user_id"],
  watchlist_items: ["user_id"],
  friend_requests: ["from_user_id", "to_user_id"],
  friendships: ["user_id", "friend_id"],
  blocks: ["blocker_id", "blocked_id"],
  watch_companions: ["owner_id", "friend_id"],
  catalog_imports: ["user_id"],
  reports: ["reporter_id", "target_user_id"],
  entry_reviews: ["user_id"],
  live_show_notes: ["user_id"],
  live_show_song_notes: ["user_id"],
};
const tables: [table: string, query: string][] = [
  ["titles", "select * from titles"],
  ["performers", "select * from performers"],
  ["venues", "select * from venues"],
  ["title_entries", "select * from title_entries"],
  ["entry_reviews", "select id as entry_id, user_id, review, created_at, updated_at from title_entries where coalesce(btrim(review), '') <> ''"],
  ["season_entries", "select * from season_entries"],
  ["episode_entries", "select * from episode_entries"],
  ["dismissed_titles", "select * from dismissed_titles"],
  ["live_shows", "select * from live_shows"],
  ["live_show_notes", `select id as show_id, user_id, liked, disliked, notes, created_at, updated_at from live_shows
    where coalesce(btrim(liked), '') <> '' or coalesce(btrim(disliked), '') <> '' or coalesce(btrim(notes), '') <> ''`],
  ["live_show_performers", "select * from live_show_performers"],
  ["live_show_songs", "select * from live_show_songs"],
  ["live_show_song_notes", `select s.id as song_id, l.user_id, s.note from live_show_songs s
    join live_show_performers p on p.id = s.slot_id join live_shows l on l.id = p.show_id
    where coalesce(btrim(s.note), '') <> ''`],
  ["watchlist_items", "select * from watchlist_items"],
  ["friend_requests", "select * from friend_requests"],
  ["friendships", "select * from friendships"],
  ["watch_companions", "select * from watch_companions"],
  // After friendships and tags: a block removes the friendship and tags between the two, as it did before.
  ["blocks", "select * from blocks"],
  ["reports", "select * from reports"],
  ["catalog_imports", "select * from catalog_imports"],
];
/** Rows whose parent didn't make it across (its account was skipped) stay behind too. */
const parents: Record<string, string[]> = {
  entry_reviews: ["exists (select 1 from public.title_entries p where p.id = r.entry_id)"],
  live_show_notes: ["exists (select 1 from public.live_shows p where p.id = r.show_id)"],
  live_show_performers: ["exists (select 1 from public.live_shows p where p.id = r.show_id)"],
  live_show_songs: ["exists (select 1 from public.live_show_performers p where p.id = r.slot_id)"],
  live_show_song_notes: ["exists (select 1 from public.live_show_songs p where p.id = r.song_id)"],
  watch_companions: [
    "(r.title_entry_id is null or exists (select 1 from public.title_entries p where p.id = r.title_entry_id))",
    "(r.live_show_id is null or exists (select 1 from public.live_shows p where p.id = r.live_show_id))",
  ],
};
/** Free-text tables the database's slur filter checks; rows it would refuse are left behind and counted. */
const prose: Record<string, string> = {
  entry_reviews: "r.review",
  live_show_notes: "concat_ws(' ', r.liked, r.disliked, r.notes)",
  live_show_song_notes: "r.note",
};

const report: string[] = [];
await pg.begin(async (tx) => {
  for (const [table, query] of tables) {
    const keep = (r: Row) => (userColumns[table] ?? []).every((c) => r[c] == null || copied.has(r[c] as string));
    const all = await rows(query);
    const source = all.filter(keep);
    if (!source.length) continue;
    const [{ cols }] = await tx<{ cols: string }[]>`
      select string_agg(quote_ident(column_name), ', ' order by ordinal_position) as cols
      from information_schema.columns
      where table_schema = 'public' and table_name = ${table} and column_name = any(${Object.keys(source[0])})`;
    const where = [...(parents[table] ?? []), ...(prose[table] ? [`not private.is_offensive_text(${prose[table]})`] : [])];
    const result = await tx.unsafe(`
      insert into public.${table} (${cols}) overriding system value
      select ${cols} from json_populate_recordset(null::public.${table}, '${JSON.stringify(source).replaceAll("'", "''")}'::json) r
      ${where.length ? `where ${where.join(" and ")}` : ""}
      on conflict do nothing`);
    report.push(`${table}: ${result.count} of ${all.length} copied`);
  }
  // Identity columns continue after the highest copied id.
  for (const table of ["titles", "performers", "venues", "live_show_performers", "live_show_songs"]) {
    await tx.unsafe(
      `select setval(pg_get_serial_sequence('public.${table}', 'id'), greatest((select max(id) from public.${table}), 1))`,
    );
  }
});

console.log(`accounts: ${copied.size} in Supabase, ${users.length} in the old database`);
for (const line of report) console.log(line);
if (skipped.length) console.log(`\nAccounts not copied (their data was left behind too):\n  ${skipped.join("\n  ")}`);
console.log("\nEveryone signs in once with \"Forgot password?\" to set a password on Supabase.");
await old.close();
await pg.end();
