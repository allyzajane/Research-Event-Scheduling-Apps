/**
 * Run once: creates all required tables in Supabase if they don't exist.
 * Execute with: pnpm --filter @workspace/api-server run setup-db
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient(url, key);

const SQL = /* sql */`
-- profiles (mirrors auth.users)
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

-- RLS
alter table public.profiles enable row level security;
drop policy if exists "profiles_service_all" on public.profiles;
create policy "profiles_service_all" on public.profiles
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

-- landing_page_config (single row, id='default')
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
drop policy if exists "landing_page_config_all" on public.landing_page_config;
create policy "landing_page_config_all" on public.landing_page_config using (true) with check (true);

-- seed default config if empty
insert into public.landing_page_config (id, hospital_name, hospital_name_ar)
values ('default', 'Taif Children''s Hospital', 'مستشفى الطائف للأطفال')
on conflict (id) do nothing;

-- landing_page_sections
create table if not exists public.landing_page_sections (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  title_ar text,
  description text,
  description_ar text,
  display_order integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.landing_page_sections enable row level security;
drop policy if exists "sections_all" on public.landing_page_sections;
create policy "sections_all" on public.landing_page_sections using (true) with check (true);

-- documents
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
drop policy if exists "documents_all" on public.documents;
create policy "documents_all" on public.documents using (true) with check (true);

-- articles
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
drop policy if exists "articles_all" on public.articles;
create policy "articles_all" on public.articles using (true) with check (true);

-- calendar_events
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
drop policy if exists "calendar_events_all" on public.calendar_events;
create policy "calendar_events_all" on public.calendar_events using (true) with check (true);

-- theme_settings (single row id='default')
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
drop policy if exists "theme_settings_all" on public.theme_settings;
create policy "theme_settings_all" on public.theme_settings using (true) with check (true);

insert into public.theme_settings (id, primary_color, style, font_family)
values ('default', '#2f9acb', 'modern', 'Plus Jakarta Sans')
on conflict (id) do nothing;

-- storage bucket
insert into storage.buckets (id, name, public)
values ('hospital-files', 'hospital-files', true)
on conflict (id) do nothing;

drop policy if exists "hospital_files_public_read" on storage.objects;
create policy "hospital_files_public_read" on storage.objects
  for select using (bucket_id = 'hospital-files');

drop policy if exists "hospital_files_auth_write" on storage.objects;
create policy "hospital_files_auth_write" on storage.objects
  for insert with check (bucket_id = 'hospital-files');

drop policy if exists "hospital_files_auth_delete" on storage.objects;
create policy "hospital_files_auth_delete" on storage.objects
  for delete using (bucket_id = 'hospital-files');
`;

async function setup() {
  console.log("Setting up Supabase database...");
  // Execute SQL via REST API
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql: SQL }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("RPC exec_sql failed:", text);
    // Try the pg endpoint directly
    const pgRes = await fetch(`${url}/pg`, {
      method: "POST",
      headers: {
        "apikey": key,
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: SQL }),
    });
    if (!pgRes.ok) {
      const pgText = await pgRes.text();
      console.error("PG endpoint failed:", pgText);
      console.log("\n=== Please run this SQL in the Supabase SQL Editor ===");
      console.log(SQL);
      process.exit(1);
    }
  }

  console.log("Database setup complete!");
}

setup().catch(console.error);
