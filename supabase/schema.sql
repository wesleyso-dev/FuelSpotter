create extension if not exists postgis with schema extensions;

-- ───────────── Tables ─────────────
create table public.sightings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  brand       text not null check (brand in ('red_bull','monster','celsius','other')),
  location    geography(Point, 4326) not null,
  address     text,
  photo_url   text not null,
  captured_at timestamptz not null,                         -- device clock at shutter
  created_at  timestamptz not null default now(),           -- server clock
  expires_at  timestamptz not null default now() + interval '45 minutes',
  upvotes     int not null default 0,                       -- "Still here"
  downvotes   int not null default 0,                       -- "Gone"
  is_active   boolean not null default true
);

create index sightings_location_idx on public.sightings using gist (location);
create index sightings_active_idx   on public.sightings (expires_at) where is_active;

create table public.sighting_votes (
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vote        text not null check (vote in ('still_here','gone')),
  created_at  timestamptz not null default now(),
  primary key (sighting_id, user_id)                        -- one vote per user per pin
);

-- ───────────── RLS ─────────────
alter table public.sightings      enable row level security;
alter table public.sighting_votes enable row level security;

-- Read-only for clients. We deliberately don't filter on is_active/expires_at here:
-- Realtime applies RLS to change events, so a row that flips to inactive would
-- vanish from the stream and clients would never hear it was retired.
-- Active filtering happens in get_nearby_sightings() and on the client.
create policy "read sightings" on public.sightings
  for select to authenticated using (true);
-- No insert/update/delete policies: all writes go through the RPCs below.

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public)
values ('sighting-photos', 'sighting-photos', true)
on conflict (id) do nothing;

create policy "upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'sighting-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ───────────── RPC: nearby active sightings ─────────────
create or replace function public.get_nearby_sightings(
  user_lat double precision,
  user_lng double precision,
  radius_meters int default 15000
)
returns table (
  id uuid, brand text, address text, photo_url text,
  created_at timestamptz, expires_at timestamptz,
  upvotes int, downvotes int, is_active boolean,
  latitude double precision, longitude double precision,
  distance_meters double precision
)
language sql stable
set search_path = public, extensions
as $$
  select s.id, s.brand, s.address, s.photo_url,
         s.created_at, s.expires_at, s.upvotes, s.downvotes, s.is_active,
         st_y(s.location::geometry) as latitude,
         st_x(s.location::geometry) as longitude,
         st_distance(s.location, origin.g) as distance_meters
  from public.sightings s,
       lateral (select st_setsrid(st_makepoint(user_lng, user_lat), 4326)::geography as g) origin
  where s.is_active
    and s.expires_at > now()
    and st_dwithin(s.location, origin.g, radius_meters)
  order by s.created_at desc
  limit 200;
$$;

-- ───────────── RPC: create sighting ─────────────
-- Inserting via RPC means clients can't write arbitrary rows, and we can
-- sanity-check the capture before accepting it.
create or replace function public.create_sighting(
  p_brand text, p_lat double precision, p_lng double precision,
  p_address text, p_photo_url text, p_captured_at timestamptz
)
returns uuid
language plpgsql security definer
set search_path = public, extensions
as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- "Live" check: the shutter timestamp must be within 2 minutes of server time.
  if abs(extract(epoch from (now() - p_captured_at))) > 120 then
    raise exception 'capture timestamp is stale';
  end if;

  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;

  -- Crude rate limit: 5 reports per 10 minutes per user.
  if (select count(*) from public.sightings
      where user_id = auth.uid() and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'rate limit: slow down';
  end if;

  insert into public.sightings (user_id, brand, location, address, photo_url, captured_at)
  values (auth.uid(), p_brand,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
          p_address, p_photo_url, p_captured_at)
  returning id into new_id;

  return new_id;
end $$;

-- ───────────── RPC: vote ─────────────
-- "Still here": +15 min, but total life is capped at 2 hours.
-- "Gone": 3+ gone votes that outnumber still-here votes retires the pin.
create or replace function public.vote_sighting(p_sighting_id uuid, p_vote text)
returns void
language plpgsql security definer
set search_path = public, extensions
as $$
declare prev text; s public.sightings;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_vote not in ('still_here','gone') then raise exception 'bad vote'; end if;

  select vote into prev from public.sighting_votes
   where sighting_id = p_sighting_id and user_id = auth.uid();

  insert into public.sighting_votes (sighting_id, user_id, vote)
  values (p_sighting_id, auth.uid(), p_vote)
  on conflict (sighting_id, user_id) do update set vote = excluded.vote;

  update public.sightings set
    upvotes   = (select count(*) from public.sighting_votes where sighting_id = p_sighting_id and vote = 'still_here')::int,
    downvotes = (select count(*) from public.sighting_votes where sighting_id = p_sighting_id and vote = 'gone')::int,
    expires_at = case
      when p_vote = 'still_here' and prev is distinct from 'still_here'
      then least(expires_at + interval '15 minutes', created_at + interval '2 hours')
      else expires_at end
  where id = p_sighting_id and is_active and expires_at > now()
  returning * into s;

  if s.id is null then raise exception 'sighting not found or already expired'; end if;

  if s.downvotes >= 3 and s.downvotes > s.upvotes then
    update public.sightings set is_active = false where id = p_sighting_id;
  end if;
end $$;

grant execute on function public.get_nearby_sightings, public.create_sighting, public.vote_sighting
  to authenticated;

-- ───────────── Realtime ─────────────
alter publication supabase_realtime add table public.sightings;

-- ───────────── Optional: sweep expired rows every minute ─────────────
-- create extension if not exists pg_cron;
-- select cron.schedule('expire-sightings', '* * * * *',
--   $$ update public.sightings set is_active = false where is_active and expires_at <= now() $$);