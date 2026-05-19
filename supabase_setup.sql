-- ═══════════════════════════════════════════
-- CALSPACE — Supabase Database Setup
-- Paste this into: Supabase → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════

-- ── PROFILES TABLE ──
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  bio         text default '',
  avatar_url  text default '',
  role        text default 'user' check (role in ('user', 'admin')),
  created_at  timestamptz default now()
);

-- ── POSTS TABLE ──
create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade not null,
  title       text not null,
  body_html   text default '',
  excerpt     text default '',
  tags        text[] default '{}',
  thumbnail   text default '',
  photos      jsonb default '[]',
  status      text default 'draft' check (status in ('draft', 'pending', 'published')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── ROW LEVEL SECURITY ──
alter table profiles enable row level security;
alter table posts    enable row level security;

-- Profiles: anyone can read, only owner can update
create policy "Public profiles are viewable by everyone"
  on profiles for select using (true);

create policy "Users can insert their own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update using (auth.uid() = id);

-- Posts: published posts are public, others only to owner/admin
create policy "Published posts are viewable by everyone"
  on posts for select using (status = 'published');

create policy "Users can view their own posts"
  on posts for select using (auth.uid() = user_id);

create policy "Logged in users can insert posts"
  on posts for insert with check (auth.uid() = user_id);

create policy "Users can update their own posts"
  on posts for update using (auth.uid() = user_id);

create policy "Users can delete their own posts"
  on posts for delete using (auth.uid() = user_id);

-- ── ADMIN ROLE (run this AFTER you create your account) ──
-- Replace 'your-username-here' with your actual username
-- update profiles set role = 'admin' where username = 'your-username-here';

-- ── AUTO-UPDATE updated_at ──
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger posts_updated_at
  before update on posts
  for each row execute function update_updated_at();
