-- =============================================================
-- Taif Children's Hospital Research Platform - Database Schema
-- Run this in your Supabase SQL Editor
-- =============================================================

-- 1. profiles (mirrors auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  full_name_ar text,
  role text not null default 'staff'
    check (role in ('admin','ceo','director','doctor','nurse','staff')),
  department text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Service role full access profiles" on public.profiles;
create policy "Service role full access profiles" on public.profiles
  using (true) with check (true);

-- trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'staff'),
    coalesce(new.raw_user_meta_data->>'full_name', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. landing_page_config (single row, id='default')
create table if not exists public.landing_page_config (
  id text primary key default 'default',
  hospital_name text not null default 'Taif Children''s Hospital',
  hospital_name_ar text default 'مستشفى الطائف للأطفال',
  logo_url text,
  background_url text,
  theme_colors text[] default array['#2f9acb'],
  nav_items jsonb default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.landing_page_config enable row level security;

drop policy if exists "Public read landing_page_config" on public.landing_page_config;
create policy "Public read landing_page_config" on public.landing_page_config
  for select using (true);

drop policy if exists "Service write landing_page_config" on public.landing_page_config;
create policy "Service write landing_page_config" on public.landing_page_config
  for all using (true) with check (true);

insert into public.landing_page_config (id, hospital_name, hospital_name_ar)
values ('default', 'Taif Children''s Hospital', 'مستشفى الطائف للأطفال')
on conflict (id) do nothing;

-- 3. landing_page_sections
create table if not exists public.landing_page_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ar text,
  description text,
  description_ar text,
  order_index integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.landing_page_sections enable row level security;

drop policy if exists "Public read sections" on public.landing_page_sections;
create policy "Public read sections" on public.landing_page_sections
  for select using (true);

drop policy if exists "Service write sections" on public.landing_page_sections;
create policy "Service write sections" on public.landing_page_sections
  for all using (true) with check (true);

-- 4. documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_name text not null,
  file_url text not null,
  file_type text not null default 'other'
    check (file_type in ('pdf','excel','csv','word','image','other')),
  file_size bigint not null default 0,
  mime_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "Authenticated read documents" on public.documents;
create policy "Authenticated read documents" on public.documents
  for select using (true);

drop policy if exists "Service write documents" on public.documents;
create policy "Service write documents" on public.documents
  for all using (true) with check (true);

-- 5. articles
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ar text,
  content text not null default '',
  content_ar text,
  excerpt text,
  excerpt_ar text,
  cover_image_url text,
  is_published boolean not null default false,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.articles enable row level security;

drop policy if exists "Authenticated read articles" on public.articles;
create policy "Authenticated read articles" on public.articles
  for select using (true);

drop policy if exists "Service write articles" on public.articles;
create policy "Service write articles" on public.articles
  for all using (true) with check (true);

-- 6. calendar_events
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ar text,
  event_type text not null default 'event'
    check (event_type in ('event','meeting','announcement')),
  start_time timestamptz not null,
  end_time timestamptz,
  all_day boolean not null default false,
  location text,
  color text default '#2f9acb',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

drop policy if exists "Authenticated read events" on public.calendar_events;
create policy "Authenticated read events" on public.calendar_events
  for select using (true);

drop policy if exists "Service write events" on public.calendar_events;
create policy "Service write events" on public.calendar_events
  for all using (true) with check (true);

-- 7. theme_settings (single row id='default')
create table if not exists public.theme_settings (
  id text primary key default 'default',
  primary_color text not null default '#2f9acb',
  style text not null default 'modern'
    check (style in ('minimalist','modern','animated')),
  font_family text not null default 'Plus Jakarta Sans',
  logo_url text,
  background_url text,
  updated_at timestamptz not null default now()
);

alter table public.theme_settings enable row level security;

drop policy if exists "Public read theme_settings" on public.theme_settings;
create policy "Public read theme_settings" on public.theme_settings
  for select using (true);

drop policy if exists "Service write theme_settings" on public.theme_settings;
create policy "Service write theme_settings" on public.theme_settings
  for all using (true) with check (true);

insert into public.theme_settings (id, primary_color, style, font_family)
values ('default', '#2f9acb', 'modern', 'Plus Jakarta Sans')
on conflict (id) do nothing;

-- 8. notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null default 'system'
    check (type in ('document','article','event','user','system')),
  title text not null,
  title_ar text,
  body text not null,
  body_ar text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_is_read_idx on public.notifications(user_id, is_read);

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select using (true);

drop policy if exists "Service write notifications" on public.notifications;
create policy "Service write notifications" on public.notifications
  for all using (true) with check (true);

-- 9. Storage bucket
insert into storage.buckets (id, name, public)
values ('hospital-files', 'hospital-files', true)
on conflict (id) do nothing;

drop policy if exists "Public read hospital-files" on storage.objects;
create policy "Public read hospital-files" on storage.objects
  for select using (bucket_id = 'hospital-files');

drop policy if exists "Auth upload hospital-files" on storage.objects;
create policy "Auth upload hospital-files" on storage.objects
  for insert with check (bucket_id = 'hospital-files');

drop policy if exists "Auth delete hospital-files" on storage.objects;
create policy "Auth delete hospital-files" on storage.objects
  for delete using (bucket_id = 'hospital-files');
