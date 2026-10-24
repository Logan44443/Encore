-- Encore on Supabase, part 2: everything Drizzle can't express.
-- 0000 (generated from src/db/schema.ts) created the tables; this adds
--   * the private schema with privacy and moderation helpers,
--   * the sign-up trigger that turns every Supabase Auth user into a profile,
--   * Row Level Security on every table with SELECT/INSERT/UPDATE/DELETE policies,
--   * column grants: the second lock on what the app may write,
--   * RPCs for the app and a security_invoker view.
--
-- The Encore API connects as `postgres`, the owner of these tables, so RLS
-- doesn't apply to it. The policies guard what the app reads and writes
-- directly through Supabase. A policy that says `false` means "only the API".
-- The moderation word list is loaded by scripts/migrate.ts from lib/moderation.ts.
-- -----------------------------------------------------------------------------
-- Private schema for helpers. Not in the Data API's exposed schemas.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
-- Policies run as the caller, so the caller needs USAGE to reach the helpers.
grant usage on schema private to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current.
-- -----------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================================
-- updated_at triggers
-- =============================================================================
create trigger profiles_updated_at         before update on public.profiles         for each row execute function private.set_updated_at();
create trigger user_settings_updated_at    before update on public.user_settings    for each row execute function private.set_updated_at();
create trigger title_entries_updated_at    before update on public.title_entries    for each row execute function private.set_updated_at();
create trigger entry_reviews_updated_at    before update on public.entry_reviews    for each row execute function private.set_updated_at();
create trigger season_entries_updated_at   before update on public.season_entries   for each row execute function private.set_updated_at();
create trigger episode_entries_updated_at  before update on public.episode_entries  for each row execute function private.set_updated_at();
create trigger live_shows_updated_at       before update on public.live_shows       for each row execute function private.set_updated_at();
create trigger live_show_notes_updated_at  before update on public.live_show_notes  for each row execute function private.set_updated_at();
create trigger song_notes_updated_at       before update on public.live_show_song_notes for each row execute function private.set_updated_at();
create trigger watchlist_items_updated_at  before update on public.watchlist_items  for each row execute function private.set_updated_at();

-- =============================================================================
-- MODERATION in the database, so direct writes can't skip the slur filter.
-- The word list is not written here: the migrate script copies it from
-- apps/api/src/lib/moderation.ts into private.blocked_words, so there is one list.
-- =============================================================================

create table private.blocked_words (
  word      text primary key,
  -- false for words that are also everyday English or history ("chink in the armour", WWII films).
  in_prose  boolean not null default true
);
alter table private.blocked_words enable row level security;  -- no policies: nobody but the owner reads it

-- Same as normalise() in moderation.ts: case, digits and symbols standing in for letters.
create function private.normalise_text(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(t), '0134578@$!|', 'oieastbasii'), '[^a-z]', '', 'g');
$$;

-- Each letter may be stretched, doubled letters must stay doubled: "nigeria" passes.
create function private.word_pattern(w text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(w, '(.)\1*', '\&+', 'g');
$$;

create function private.is_offensive_name(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.blocked_words b
    where private.normalise_text(t) ~ private.word_pattern(b.word)
  );
$$;

create function private.is_offensive_text(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from regexp_split_to_table(t, '[\s,;:/()"“”‘’?]+') as w(word)
    join private.blocked_words b on b.in_prose
    where private.normalise_text(w.word) <> ''
      and private.normalise_text(w.word) ~ ('^' || private.word_pattern(b.word) || '[sz]?$')
  );
$$;

create function private.check_profile_names() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_offensive_name(new.username) or private.is_offensive_name(new.display_name) then
    raise exception using errcode = 'P0001', message = 'name_not_allowed',
      detail = 'Pick a different name. That one isn''t allowed on Encore.';
  end if;
  return new;
end $$;
create trigger profiles_check_names before insert or update of username, display_name on public.profiles
  for each row execute function private.check_profile_names();

create function private.check_prose() returns trigger
language plpgsql set search_path = '' as $$
declare
  -- One trigger for all three note tables: read whichever text columns this row has.
  row_json jsonb := to_jsonb(new);
  body text := concat_ws(' ', row_json ->> 'review', row_json ->> 'liked', row_json ->> 'disliked',
                              row_json ->> 'notes', row_json ->> 'note');
begin
  if private.is_offensive_text(body) then
    raise exception using errcode = 'P0001', message = 'text_not_allowed',
      detail = 'That has language that isn''t allowed on Encore. Edit it and try again.';
  end if;
  return new;
end $$;
create trigger entry_reviews_check   before insert or update on public.entry_reviews        for each row execute function private.check_prose();
create trigger show_notes_check      before insert or update on public.live_show_notes      for each row execute function private.check_prose();
create trigger song_notes_check      before insert or update on public.live_show_song_notes for each row execute function private.check_prose();

-- =============================================================================
-- AUTH LINK: every Supabase Auth sign-up gets a profile and settings row.
-- The app sends username, display_name and country as user metadata.
-- A bad or taken username makes the sign-up fail as a whole, so there is never
-- an auth user without a profile. The API checks first to give a friendly error.
-- =============================================================================

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname    text  := btrim(meta ->> 'username');
  dname    text  := nullif(btrim(meta ->> 'display_name'), '');
  country  text  := upper(nullif(btrim(meta ->> 'country'), ''));
begin
  if uname is null or uname !~ '^[A-Za-z0-9_]{3,24}$' then
    raise exception using errcode = '22023', message = 'invalid_username';
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, uname, coalesce(dname, uname));
  insert into public.user_settings (user_id, country)
  values (new.id, case when country ~ '^[A-Z]{2}$' then country end);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- =============================================================================
-- PRIVACY HELPERS used by the policies. SECURITY DEFINER so they can read
-- blocks/friendships/profiles without those tables' own policies getting in
-- the way (and without recursion). STABLE so Postgres can cache per statement.
-- =============================================================================

create function private.blocked_either_way(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.friendships where user_id = a and friend_id = b);
$$;

-- Rankings, scores and live shows: yourself; anyone signed in if public; friends if friends-only.
create function private.can_view_content(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    owner = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = owner
        and not private.blocked_either_way(owner, auth.uid())
        and (p.profile_visibility = 'public'
             or (p.profile_visibility = 'friends' and private.are_friends(owner, auth.uid())))
    )
  );
$$;

-- Reviews and notes: yourself, and friends when you share them. Nobody else, ever.
create function private.can_view_reviews(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    owner = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = owner
        and p.share_reviews
        and private.are_friends(owner, auth.uid())
        and not private.blocked_either_way(owner, auth.uid())
    )
  );
$$;

-- Watchlists: yourself, and friends when shared and the profile isn't "Only me".
create function private.can_view_watchlist(owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    owner = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = owner
        and p.share_watchlist
        and p.profile_visibility <> 'private'
        and private.are_friends(owner, auth.uid())
        and not private.blocked_either_way(owner, auth.uid())
    )
  );
$$;

-- Whether someone's profile row is visible: not blocked, and searchable, a friend,
-- or someone you have a pending request with. Profile links to unsearchable
-- people go through public.profile_by_username() instead.
create function private.can_see_profile(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    target = auth.uid()
    or (
      not private.blocked_either_way(target, auth.uid())
      and (
        exists (select 1 from public.profiles p where p.id = target and p.searchable)
        or private.are_friends(target, auth.uid())
        or exists (
          select 1 from public.friend_requests r
          where (r.from_user_id = target and r.to_user_id = auth.uid())
             or (r.from_user_id = auth.uid() and r.to_user_id = target)
        )
      )
    )
  );
$$;

-- The owner of a live show, for policies on its child rows.
create function private.show_owner(show uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.live_shows where id = show;
$$;

create function private.slot_owner(slot integer) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.user_id
  from public.live_show_performers p
  join public.live_shows s on s.id = p.show_id
  where p.id = slot;
$$;

create function private.song_owner(song integer) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.user_id
  from public.live_show_songs g
  join public.live_show_performers p on p.id = g.slot_id
  join public.live_shows s on s.id = p.show_id
  where g.id = song;
$$;

create function private.entry_owner(entry uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.title_entries where id = entry;
$$;

revoke execute on all functions in schema private from public;
grant execute on function
  private.blocked_either_way(uuid, uuid),
  private.are_friends(uuid, uuid),
  private.can_view_content(uuid),
  private.can_view_reviews(uuid),
  private.can_view_watchlist(uuid),
  private.can_see_profile(uuid),
  private.show_owner(uuid),
  private.slot_owner(integer),
  private.song_owner(integer),
  private.entry_owner(uuid),
  private.is_offensive_name(text),
  private.is_offensive_text(text)
to authenticated;

-- Blocking someone ends the friendship, pending requests and "watched with" tags between you, in one step.
create function private.cut_ties_on_block() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.friendships
  where (user_id = new.blocker_id and friend_id = new.blocked_id)
     or (user_id = new.blocked_id and friend_id = new.blocker_id);
  delete from public.friend_requests
  where (from_user_id = new.blocker_id and to_user_id = new.blocked_id)
     or (from_user_id = new.blocked_id and to_user_id = new.blocker_id);
  delete from public.watch_companions
  where (owner_id = new.blocker_id and friend_id = new.blocked_id)
     or (owner_id = new.blocked_id and friend_id = new.blocker_id);
  return new;
end $$;
create trigger blocks_cut_ties after insert on public.blocks
  for each row execute function private.cut_ties_on_block();

-- =============================================================================
-- RPCs the app may call (public schema, so the Data API exposes them).
-- =============================================================================

-- Accept a request: both friendship rows plus deleting the request, atomically.
-- Idempotent: accepting twice, or after a double tap, is harmless.
create function public.accept_friend_request(request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  req public.friend_requests;
begin
  select * into req from public.friend_requests where id = request_id and to_user_id = auth.uid() for update;
  -- Already accepted (double tap) or withdrawn: nothing to do, not an error.
  if not found then
    return;
  end if;
  if private.blocked_either_way(req.from_user_id, req.to_user_id) then
    raise exception using errcode = '42501', message = 'blocked';
  end if;
  insert into public.friendships (user_id, friend_id)
  values (req.from_user_id, req.to_user_id), (req.to_user_id, req.from_user_id)
  on conflict do nothing;
  delete from public.friend_requests
  where (from_user_id = req.from_user_id and to_user_id = req.to_user_id)
     or (from_user_id = req.to_user_id and to_user_id = req.from_user_id);
end $$;

-- A profile by its link, even when it's not searchable. Never for blocked people.
create function public.profile_by_username(name text) returns setof public.profiles
language sql stable security definer set search_path = '' as $$
  select p.* from public.profiles p
  where lower(p.username) = lower(name)
    and auth.uid() is not null
    and not private.blocked_either_way(p.id, auth.uid());
$$;

-- Lets the sign-up form say "username taken" before submitting. Reveals only availability.
create function public.username_available(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select name ~ '^[A-Za-z0-9_]{3,24}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

revoke execute on function public.accept_friend_request(uuid)  from public, anon;
revoke execute on function public.profile_by_username(text)     from public, anon;
revoke execute on function public.username_available(text)      from public;
grant  execute on function public.accept_friend_request(uuid)  to authenticated;
grant  execute on function public.profile_by_username(text)     to authenticated;
grant  execute on function public.username_available(text)      to anon, authenticated;

-- =============================================================================
-- VIEWS. security_invoker so the caller's RLS applies, never the view owner's.
-- =============================================================================

-- Your own rankings with the title attached, for list screens. Other people's
-- rows appear only where title_entries' policies already let you see them.
create view public.ranked_entries with (security_invoker = true) as
select
  e.id, e.user_id, e.media_type, e.genre_id, e.tier, e.position, e.score, e.user_score,
  e.watched_at, e.created_at, e.updated_at,
  t.tmdb_id, t.name as title_name, t.year, t.poster_url, t.genres,
  r.review
from public.title_entries e
join public.titles t on t.id = e.title_id
left join public.entry_reviews r on r.entry_id = e.id;

-- =============================================================================
-- ROW LEVEL SECURITY: on for every table, four policies each.
-- (select auth.uid()) is wrapped so Postgres evaluates it once per statement.
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.user_settings        enable row level security;
alter table public.titles               enable row level security;
alter table public.cache_entries        enable row level security;
alter table public.performers           enable row level security;
alter table public.venues               enable row level security;
alter table public.title_entries        enable row level security;
alter table public.entry_reviews        enable row level security;
alter table public.season_entries       enable row level security;
alter table public.episode_entries      enable row level security;
alter table public.dismissed_titles     enable row level security;
alter table public.live_shows           enable row level security;
alter table public.live_show_notes      enable row level security;
alter table public.live_show_performers enable row level security;
alter table public.live_show_songs      enable row level security;
alter table public.live_show_song_notes enable row level security;
alter table public.watchlist_items      enable row level security;
alter table public.friend_requests      enable row level security;
alter table public.friendships          enable row level security;
alter table public.blocks               enable row level security;
alter table public.watch_companions     enable row level security;
alter table public.reports              enable row level security;
alter table public.catalog_imports      enable row level security;

-- ---- profiles ---------------------------------------------------------------
create policy "profiles: visible unless blocked or hidden" on public.profiles
  for select to authenticated using (private.can_see_profile(id));
create policy "profiles: created only by the sign-up trigger" on public.profiles
  for insert to authenticated with check (false);
create policy "profiles: you edit your own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: deleted only with the account" on public.profiles
  for delete to authenticated using (false);

-- ---- user_settings ----------------------------------------------------------
create policy "user_settings: only you read yours" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_settings: created only by the sign-up trigger" on public.user_settings
  for insert to authenticated with check (false);
create policy "user_settings: you edit your own" on public.user_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_settings: deleted only with the account" on public.user_settings
  for delete to authenticated using (false);

-- ---- titles / performers / venues: public catalog, API writes -------------
create policy "titles: anyone can read" on public.titles
  for select to anon, authenticated using (true);
create policy "titles: API only (insert)" on public.titles
  for insert to anon, authenticated with check (false);
create policy "titles: API only (update)" on public.titles
  for update to anon, authenticated using (false);
create policy "titles: API only (delete)" on public.titles
  for delete to anon, authenticated using (false);

create policy "performers: anyone can read" on public.performers
  for select to anon, authenticated using (true);
create policy "performers: API only (insert)" on public.performers
  for insert to anon, authenticated with check (false);
create policy "performers: API only (update)" on public.performers
  for update to anon, authenticated using (false);
create policy "performers: API only (delete)" on public.performers
  for delete to anon, authenticated using (false);

create policy "venues: anyone can read" on public.venues
  for select to anon, authenticated using (true);
create policy "venues: API only (insert)" on public.venues
  for insert to anon, authenticated with check (false);
create policy "venues: API only (update)" on public.venues
  for update to anon, authenticated using (false);
create policy "venues: API only (delete)" on public.venues
  for delete to anon, authenticated using (false);

-- ---- cache_entries: server only --------------------------------------------
create policy "cache: API only (select)" on public.cache_entries for select to anon, authenticated using (false);
create policy "cache: API only (insert)" on public.cache_entries for insert to anon, authenticated with check (false);
create policy "cache: API only (update)" on public.cache_entries for update to anon, authenticated using (false);
create policy "cache: API only (delete)" on public.cache_entries for delete to anon, authenticated using (false);

-- ---- title_entries ----------------------------------------------------------
-- Scores and positions are computed by the API, so the app may not insert rows
-- or change rank columns directly (see the column grants below).
create policy "entries: you, and whoever your privacy setting allows" on public.title_entries
  for select to authenticated using (user_id = (select auth.uid()) or private.can_view_content(user_id));
create policy "entries: only into your own list" on public.title_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "entries: only your own" on public.title_entries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "entries: delete only your own" on public.title_entries
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- entry_reviews ----------------------------------------------------------
create policy "reviews: you, and friends when you share them" on public.entry_reviews
  for select to authenticated using (user_id = (select auth.uid()) or private.can_view_reviews(user_id));
create policy "reviews: only on your own entries" on public.entry_reviews
  for insert to authenticated with check (user_id = (select auth.uid()) and private.entry_owner(entry_id) = (select auth.uid()));
create policy "reviews: edit only your own" on public.entry_reviews
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.entry_owner(entry_id) = (select auth.uid()));
create policy "reviews: delete only your own" on public.entry_reviews
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- season_entries / episode_entries --------------------------------------
create policy "seasons: you, and whoever your privacy setting allows" on public.season_entries
  for select to authenticated using (user_id = (select auth.uid()) or private.can_view_content(user_id));
create policy "seasons: only into your own list" on public.season_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "seasons: only your own" on public.season_entries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "seasons: delete only your own" on public.season_entries
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "episodes: you, and whoever your privacy setting allows" on public.episode_entries
  for select to authenticated using (user_id = (select auth.uid()) or private.can_view_content(user_id));
create policy "episodes: only into your own list" on public.episode_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "episodes: only your own" on public.episode_entries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "episodes: delete only your own" on public.episode_entries
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- dismissed_titles: only you --------------------------------------------
create policy "dismissed: only you" on public.dismissed_titles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "dismissed: only yours" on public.dismissed_titles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "dismissed: only yours (update)" on public.dismissed_titles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dismissed: only yours (delete)" on public.dismissed_titles
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- live_shows -------------------------------------------------------------
create policy "shows: you, and whoever your privacy setting allows" on public.live_shows
  for select to authenticated using (user_id = (select auth.uid()) or private.can_view_content(user_id));
create policy "shows: only your own" on public.live_shows
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "shows: edit only your own" on public.live_shows
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "shows: delete only your own" on public.live_shows
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "show notes: you, and friends when you share them" on public.live_show_notes
  for select to authenticated using (user_id = (select auth.uid()) or private.can_view_reviews(user_id));
create policy "show notes: only on your own shows" on public.live_show_notes
  for insert to authenticated with check (user_id = (select auth.uid()) and private.show_owner(show_id) = (select auth.uid()));
create policy "show notes: edit only your own" on public.live_show_notes
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.show_owner(show_id) = (select auth.uid()));
create policy "show notes: delete only your own" on public.live_show_notes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "lineup: visible with the show" on public.live_show_performers
  for select to authenticated using (
    private.show_owner(show_id) = (select auth.uid()) or private.can_view_content(private.show_owner(show_id)));
create policy "lineup: only on your own shows" on public.live_show_performers
  for insert to authenticated with check (private.show_owner(show_id) = (select auth.uid()));
create policy "lineup: edit only your own" on public.live_show_performers
  for update to authenticated using (private.show_owner(show_id) = (select auth.uid()))
  with check (private.show_owner(show_id) = (select auth.uid()));
create policy "lineup: delete only your own" on public.live_show_performers
  for delete to authenticated using (private.show_owner(show_id) = (select auth.uid()));

create policy "songs: visible with the show" on public.live_show_songs
  for select to authenticated using (
    private.slot_owner(slot_id) = (select auth.uid()) or private.can_view_content(private.slot_owner(slot_id)));
create policy "songs: only on your own shows" on public.live_show_songs
  for insert to authenticated with check (private.slot_owner(slot_id) = (select auth.uid()));
create policy "songs: edit only your own" on public.live_show_songs
  for update to authenticated using (private.slot_owner(slot_id) = (select auth.uid()))
  with check (private.slot_owner(slot_id) = (select auth.uid()));
create policy "songs: delete only your own" on public.live_show_songs
  for delete to authenticated using (private.slot_owner(slot_id) = (select auth.uid()));

create policy "song notes: you, and friends when you share them" on public.live_show_song_notes
  for select to authenticated using (user_id = (select auth.uid()) or private.can_view_reviews(user_id));
create policy "song notes: only on your own shows" on public.live_show_song_notes
  for insert to authenticated with check (user_id = (select auth.uid()) and private.song_owner(song_id) = (select auth.uid()));
create policy "song notes: edit only your own" on public.live_show_song_notes
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.song_owner(song_id) = (select auth.uid()));
create policy "song notes: delete only your own" on public.live_show_song_notes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- watchlist_items --------------------------------------------------------
create policy "watchlist: you, and friends when you share it" on public.watchlist_items
  for select to authenticated using (user_id = (select auth.uid()) or private.can_view_watchlist(user_id));
create policy "watchlist: only your own" on public.watchlist_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "watchlist: edit only your own" on public.watchlist_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "watchlist: delete only your own" on public.watchlist_items
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---- friend_requests --------------------------------------------------------
create policy "requests: the two people involved" on public.friend_requests
  for select to authenticated using ((select auth.uid()) in (from_user_id, to_user_id));
create policy "requests: send as yourself, to someone who accepts requests" on public.friend_requests
  for insert to authenticated with check (
    from_user_id = (select auth.uid())
    and to_user_id <> (select auth.uid())
    and not private.blocked_either_way(from_user_id, to_user_id)
    and not private.are_friends(from_user_id, to_user_id)
    and exists (select 1 from public.profiles p where p.id = to_user_id and p.allow_friend_requests)
  );
create policy "requests: never edited" on public.friend_requests
  for update to authenticated using (false);
create policy "requests: cancel yours or decline theirs" on public.friend_requests
  for delete to authenticated using ((select auth.uid()) in (from_user_id, to_user_id));

-- ---- friendships ------------------------------------------------------------
create policy "friendships: your own" on public.friendships
  for select to authenticated using ((select auth.uid()) in (user_id, friend_id));
create policy "friendships: only through accept_friend_request()" on public.friendships
  for insert to authenticated with check (false);
create policy "friendships: never edited" on public.friendships
  for update to authenticated using (false);
create policy "friendships: either friend can end it" on public.friendships
  for delete to authenticated using ((select auth.uid()) in (user_id, friend_id));

-- ---- blocks -----------------------------------------------------------------
-- Only the blocker sees a block; the blocked person is never told.
create policy "blocks: only the blocker sees it" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy "blocks: block as yourself" on public.blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()) and blocked_id <> (select auth.uid()));
create policy "blocks: never edited" on public.blocks
  for update to authenticated using (false);
create policy "blocks: unblock your own" on public.blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- ---- watch_companions -------------------------------------------------------
-- Free-text names: owner only. Friend tags: owner, the tagged friend, and
-- (once confirmed) anyone who can see the entry or show.
create policy "companions: owner, tagged friend, or viewers once confirmed" on public.watch_companions
  for select to authenticated using (
    owner_id = (select auth.uid())
    or friend_id = (select auth.uid())
    or (friend_id is not null and confirmed
        and private.can_view_content(owner_id)
        and not private.blocked_either_way(friend_id, (select auth.uid())))
  );
create policy "companions: tag your own entry or show; friends who allow tags" on public.watch_companions
  for insert to authenticated with check (
    owner_id = (select auth.uid())
    and confirmed = false
    and (title_entry_id is null or private.entry_owner(title_entry_id) = (select auth.uid()))
    and (live_show_id is null or private.show_owner(live_show_id) = (select auth.uid()))
    and (friend_id is null or (
      private.are_friends(owner_id, friend_id)
      and exists (select 1 from public.profiles p where p.id = friend_id and p.allow_tags)))
  );
-- The tagged friend confirms; the owner may only rename a free-text name, so an
-- owner can never confirm a tag on a friend's behalf. Column grants limit both to
-- `confirmed` and `name`.
create policy "companions: tagged friend confirms, owner renames" on public.watch_companions
  for update to authenticated
  using ((select auth.uid()) in (owner_id, friend_id))
  with check (
    friend_id = (select auth.uid())
    or (owner_id = (select auth.uid()) and friend_id is null and confirmed = false)
  );
create policy "companions: owner removes, tagged friend declines" on public.watch_companions
  for delete to authenticated using ((select auth.uid()) in (owner_id, friend_id));

-- ---- reports ----------------------------------------------------------------
create policy "reports: you see the ones you filed" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));
create policy "reports: file as yourself" on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()) and status = 'open' and resolved_at is null);
create policy "reports: resolved by moderators only" on public.reports
  for update to authenticated using (false);
create policy "reports: never deleted by users" on public.reports
  for delete to authenticated using (false);

-- ---- catalog_imports --------------------------------------------------------
create policy "imports: only you" on public.catalog_imports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "imports: API only (insert)" on public.catalog_imports
  for insert to authenticated with check (false);
create policy "imports: API only (update)" on public.catalog_imports
  for update to authenticated using (false);
create policy "imports: API only (delete)" on public.catalog_imports
  for delete to authenticated using (false);

-- =============================================================================
-- GRANTS: the second lock. Supabase grants everything to anon/authenticated
-- by default; start from nothing and open only what the app needs.
-- =============================================================================

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant select on public.titles, public.performers, public.venues to anon, authenticated;

grant select on public.profiles to authenticated;
grant update (username, display_name, profile_visibility, share_reviews, searchable,
              allow_friend_requests, allow_tags, share_watchlist)
  on public.profiles to authenticated;

grant select on public.user_settings to authenticated;
grant update (country, country_manual, services) on public.user_settings to authenticated;

-- Rank columns (tier, position, score, user_score, genre_id) stay API-only.
grant select, delete on public.title_entries to authenticated;
grant update (watched_at, favorite_episode, least_favorite_episode) on public.title_entries to authenticated;
grant select, insert, update, delete on public.entry_reviews to authenticated;
grant select on public.season_entries, public.episode_entries to authenticated;
grant select on public.ranked_entries to authenticated;

grant select, insert, delete on public.dismissed_titles to authenticated;

grant select, delete on public.live_shows to authenticated;
grant update (kind, name, date, tour_name, rating) on public.live_shows to authenticated;
grant select, insert, update, delete on public.live_show_notes to authenticated;
grant select on public.live_show_performers to authenticated;
grant select on public.live_show_songs to authenticated;
grant update (reaction) on public.live_show_songs to authenticated;
grant select, insert, update, delete on public.live_show_song_notes to authenticated;

grant select, delete on public.watchlist_items to authenticated;
grant insert (user_id, kind, title_id, performer_id, festival_name, festival_date, festival_city, festival_country, note)
  on public.watchlist_items to authenticated;
grant update (note, festival_date, festival_city, festival_country) on public.watchlist_items to authenticated;

grant select, insert (from_user_id, to_user_id), delete on public.friend_requests to authenticated;
grant select, delete on public.friendships to authenticated;
grant select, insert (blocker_id, blocked_id), delete on public.blocks to authenticated;

grant select, insert (owner_id, title_entry_id, live_show_id, friend_id, name), delete on public.watch_companions to authenticated;
grant update (confirmed, name) on public.watch_companions to authenticated;

grant select, insert (reporter_id, target_user_id, target_username, kind, target_id, reason, details)
  on public.reports to authenticated;

grant select on public.catalog_imports to authenticated;

-- cache_entries: no grants at all.


-- =============================================================================
-- OPTIONAL, only if bob approves profile photos (a new feature).
-- Public "avatars" bucket; each person may write only inside a folder named
-- after their user id: avatars/<uid>/avatar.jpg
-- =============================================================================
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);
--
-- create policy "avatars: anyone can view" on storage.objects
--   for select to anon, authenticated using (bucket_id = 'avatars');
-- create policy "avatars: upload into your own folder" on storage.objects
--   for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- create policy "avatars: replace your own" on storage.objects
--   for update to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text)
--   with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- create policy "avatars: delete your own" on storage.objects
--   for delete to authenticated using (bucket_id = 'avatars' and owner_id = (select auth.uid())::text);
