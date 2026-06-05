-- =============================================================
-- Taif Children's Hospital Research Platform
-- Complete Database Schema — paste into Supabase SQL Editor
-- Safe to run on a fresh project (uses IF NOT EXISTS / ON CONFLICT)
-- =============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. PROFILES  (mirrors auth.users)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid        primary key references auth.users(id) on delete cascade,
  email         text        not null,
  full_name     text,
  full_name_ar  text,
  role          text        not null default 'staff'
                            check (role in ('admin','ceo','director','doctor','nurse','staff')),
  department    text,
  avatar_url    text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Service role full access profiles" on public.profiles;
create policy "Service role full access profiles" on public.profiles
  using (true) with check (true);

-- Auto-create profile row whenever a new auth user signs up
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


-- ─────────────────────────────────────────────────────────────
-- 2. LANDING PAGE CONFIG  (single row, id = 'default')
-- ─────────────────────────────────────────────────────────────
create table if not exists public.landing_page_config (
  id               text        primary key default 'default',
  hospital_name    text        not null default 'Taif Children''s Hospital',
  hospital_name_ar text        default 'مستشفى الطائف للأطفال',
  logo_url         text,
  background_url   text,
  theme_colors     text[]      default array['#2f9acb'],
  nav_items        jsonb       default '[]'::jsonb,
  updated_at       timestamptz not null default now()
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


-- ─────────────────────────────────────────────────────────────
-- 3. LANDING PAGE SECTIONS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.landing_page_sections (
  id             uuid        primary key default gen_random_uuid(),
  title          text        not null,
  title_ar       text,
  description    text,
  description_ar text,
  order_index    integer     not null default 0,
  is_visible     boolean     not null default true,
  created_at     timestamptz not null default now()
);

alter table public.landing_page_sections enable row level security;

drop policy if exists "Public read sections" on public.landing_page_sections;
create policy "Public read sections" on public.landing_page_sections
  for select using (true);

drop policy if exists "Service write sections" on public.landing_page_sections;
create policy "Service write sections" on public.landing_page_sections
  for all using (true) with check (true);


-- ─────────────────────────────────────────────────────────────
-- 4. DOCUMENTS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  file_name   text        not null,
  file_url    text        not null,
  file_type   text        not null default 'other'
              check (file_type in ('pdf','excel','csv','word','image','other')),
  file_size   bigint      not null default 0,
  mime_type   text,
  storage_path text,
  uploaded_by uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.documents enable row level security;

drop policy if exists "Authenticated read documents" on public.documents;
create policy "Authenticated read documents" on public.documents
  for select using (true);

drop policy if exists "Service write documents" on public.documents;
create policy "Service write documents" on public.documents
  for all using (true) with check (true);


-- ─────────────────────────────────────────────────────────────
-- 5. ARTICLES
-- ─────────────────────────────────────────────────────────────
create table if not exists public.articles (
  id              uuid        primary key default gen_random_uuid(),
  title           text        not null,
  title_ar        text,
  content         text        not null default '',
  content_ar      text,
  excerpt         text,
  excerpt_ar      text,
  cover_image_url text,
  is_published    boolean     not null default false,
  author_id       uuid        references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.articles enable row level security;

drop policy if exists "Authenticated read articles" on public.articles;
create policy "Authenticated read articles" on public.articles
  for select using (true);

drop policy if exists "Service write articles" on public.articles;
create policy "Service write articles" on public.articles
  for all using (true) with check (true);


-- ─────────────────────────────────────────────────────────────
-- 6. CALENDAR EVENTS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.calendar_events (
  id             uuid        primary key default gen_random_uuid(),
  title          text        not null,
  title_ar       text,
  description    text,
  description_ar text,
  event_type     text        not null default 'event'
                 check (event_type in ('event','meeting','conference','announcement')),
  organizer      text,
  venue          text,
  location       text,
  participants   jsonb       not null default '[]'::jsonb,
  event_status   text        not null default 'active'
                 check (event_status in ('active','canceled','rescheduled')),
  start_time     timestamptz not null,
  end_time       timestamptz,
  all_day        boolean     not null default false,
  color          text        default '#2f9acb',
  created_by     uuid        references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.calendar_events enable row level security;

drop policy if exists "Authenticated read events" on public.calendar_events;
create policy "Authenticated read events" on public.calendar_events
  for select using (true);

drop policy if exists "Service write events" on public.calendar_events;
create policy "Service write events" on public.calendar_events
  for all using (true) with check (true);


-- ─────────────────────────────────────────────────────────────
-- 7. THEME SETTINGS  (single row, id = 'default')
-- ─────────────────────────────────────────────────────────────
create table if not exists public.theme_settings (
  id             text        primary key default 'default',
  primary_color  text        not null default '#2f9acb',
  theme_colors   text[]      default array['#2f9acb'],
  style          text        not null default 'modern'
                 check (style in ('minimalist','modern','animated')),
  font_family    text        not null default 'Plus Jakarta Sans',
  logo_url       text,
  background_url text,
  updated_at     timestamptz not null default now()
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


-- ─────────────────────────────────────────────────────────────
-- 8. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  type       text        not null default 'system'
             check (type in ('document','article','event','user','system')),
  title      text        not null,
  title_ar   text,
  body       text        not null,
  body_ar    text,
  link       text,
  is_read    boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx    on public.notifications(user_id);
create index if not exists notifications_is_read_idx    on public.notifications(user_id, is_read);
create index if not exists notifications_created_at_idx on public.notifications(created_at);

alter table public.notifications enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select using (true);

drop policy if exists "Service write notifications" on public.notifications;
create policy "Service write notifications" on public.notifications
  for all using (true) with check (true);

-- Enable Realtime so the frontend receives instant push notifications
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;


-- ─────────────────────────────────────────────────────────────
-- 9. STORAGE BUCKET
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('hospital-files', 'hospital-files', true)
on conflict (id) do nothing;

drop policy if exists "Public read hospital-files"  on storage.objects;
create policy "Public read hospital-files" on storage.objects
  for select using (bucket_id = 'hospital-files');

drop policy if exists "Auth upload hospital-files"  on storage.objects;
create policy "Auth upload hospital-files" on storage.objects
  for insert with check (bucket_id = 'hospital-files');

drop policy if exists "Auth delete hospital-files"  on storage.objects;
create policy "Auth delete hospital-files" on storage.objects
  for delete using (bucket_id = 'hospital-files');


-- ─────────────────────────────────────────────────────────────
-- 10. ROLE DASHBOARD CONFIGS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.role_dashboard_configs (
  role       text        primary key
             check (role in ('admin','ceo','director','doctor','nurse','staff')),
  widgets    text[]      not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.role_dashboard_configs enable row level security;

drop policy if exists "Public read role_dashboard_configs" on public.role_dashboard_configs;
create policy "Public read role_dashboard_configs" on public.role_dashboard_configs
  for select using (true);

drop policy if exists "Service write role_dashboard_configs" on public.role_dashboard_configs;
create policy "Service write role_dashboard_configs" on public.role_dashboard_configs
  for all using (true) with check (true);


-- ─────────────────────────────────────────────────────────────
-- 11. NOTIFICATION BROADCASTS  (admin broadcast history)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.notification_broadcasts (
  id              uuid        primary key default gen_random_uuid(),
  created_by      uuid        not null references public.profiles(id) on delete cascade,
  title           text        not null,
  title_ar        text,
  body            text        not null,
  body_ar         text,
  type            text        not null default 'system',
  target_role     text        not null default 'all',
  link            text,
  recipient_count integer     not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists notification_broadcasts_created_at_idx on public.notification_broadcasts(created_at desc);

alter table public.notification_broadcasts enable row level security;

drop policy if exists "Admin read broadcasts" on public.notification_broadcasts;
create policy "Admin read broadcasts" on public.notification_broadcasts
  for select using (true);

drop policy if exists "Service write broadcasts" on public.notification_broadcasts;
create policy "Service write broadcasts" on public.notification_broadcasts
  for all using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- 12. CLEANUP FUNCTION  (free-tier DB size management)
-- ─────────────────────────────────────────────────────────────
-- Deletes notifications older than 30 days and caps each user at 50.
-- Called automatically by the API after every bulk notification fan-out.
-- You can also run it manually: SELECT public.cleanup_old_notifications();

create or replace function public.cleanup_old_notifications()
returns void language plpgsql security definer as $$
begin
  -- Remove notifications older than 30 days
  delete from public.notifications
  where created_at < now() - interval '30 days';

  -- Per user: keep only the 50 most recent notifications
  delete from public.notifications
  where id in (
    select id from (
      select id,
             row_number() over (partition by user_id order by created_at desc) as rn
      from public.notifications
    ) ranked
    where rn > 50
  );
end;
$$;

-- Run once immediately to start with a clean slate
select public.cleanup_old_notifications();

-- ─────────────────────────────────────────────────────────────
-- 13. DOCUMENT SIGNATURES
-- ─────────────────────────────────────────────────────────────
create table if not exists public.document_signatures (
  id            uuid default gen_random_uuid() primary key,
  document_id   uuid references public.documents(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete cascade,
  signature_url text not null,
  notes         text,
  signed_at     timestamptz default now(),
  unique (document_id, user_id)
);

alter table public.document_signatures enable row level security;

create policy "users can view all signatures"
  on public.document_signatures for select using (true);

create policy "users can insert own signature"
  on public.document_signatures for insert
  with check (auth.uid() = user_id);

create policy "users can update own signature"
  on public.document_signatures for update
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 14. DOCUMENT SIGNATURE REQUESTS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.document_signature_requests (
  id                 uuid default gen_random_uuid() primary key,
  document_id        uuid references public.documents(id) on delete cascade,
  requested_user_id  uuid references public.profiles(id) on delete cascade,
  requested_by       uuid references public.profiles(id) on delete set null,
  status             text default 'pending' check (status in ('pending','signed','declined')),
  message            text,
  requested_at       timestamptz default now(),
  responded_at       timestamptz,
  unique (document_id, requested_user_id)
);

alter table public.document_signature_requests enable row level security;

create policy "users can view their own signature requests"
  on public.document_signature_requests for select
  using (auth.uid() = requested_user_id or auth.uid() = requested_by);

create policy "admins can insert signature requests"
  on public.document_signature_requests for insert
  with check (true);

-- ─────────────────────────────────────────────────────────────
-- 15. DUAL SIGNATURE COLUMNS
-- Run this in Supabase SQL editor to enable the dual signature system.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists signature_drawn_url    text,
  add column if not exists signature_active_type  text default 'uploaded'
    check (signature_active_type in ('uploaded', 'drawn'));

-- ─────────────────────────────────────────────────────────────
-- 16. CUSTOM ROLES TABLE
-- Run this in Supabase SQL editor to enable custom role management.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique
               check (name ~ '^[a-z][a-z0-9_]*$' and length(name) >= 2),
  label        text not null,
  color        text not null default 'gray'
               check (color in ('teal','purple','indigo','blue','pink','gray','orange','red','emerald','amber','cyan','violet')),
  is_system    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Seed the six built-in system roles
insert into public.roles (name, label, color, is_system) values
  ('admin',    'Administrator', 'teal',   true),
  ('ceo',      'CEO',           'purple', true),
  ('director', 'Director',      'indigo', true),
  ('doctor',   'Doctor',        'blue',   true),
  ('nurse',    'Nurse',         'pink',   true),
  ('staff',    'Staff',         'gray',   true)
on conflict (name) do nothing;

alter table public.roles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'public_read_roles' and tablename = 'roles') then
    create policy "public_read_roles" on public.roles for select using (true);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Section 17: Attendance table
-- Run this in Supabase SQL editor to enable the Attendance page.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.attendance (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  date       date        not null,
  clock_in   timestamptz not null,
  clock_out  timestamptz,
  status     text        not null default 'present'
             check (status in ('present', 'late', 'half_day', 'absent')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, date)
);

create index if not exists attendance_user_id_idx on public.attendance(user_id);
create index if not exists attendance_date_idx    on public.attendance(date desc);

alter table public.attendance enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'attendance_select' and tablename = 'attendance') then
    create policy "attendance_select" on public.attendance
      for select using (
        auth.uid() = user_id
        or exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('admin', 'ceo', 'director')
        )
      );
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Section 18: Meeting Attendance Forms
-- Run this in Supabase SQL editor to enable Meeting Attendance Forms.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.meeting_attendance_forms (
  id           uuid        primary key default gen_random_uuid(),
  event_id     uuid        references public.calendar_events(id) on delete set null,
  meeting_no   integer     not null,
  is_active    boolean     not null default true,
  window_start timestamptz,
  window_end   timestamptz,
  created_by   uuid        references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists maf_event_id_idx   on public.meeting_attendance_forms(event_id);
create index if not exists maf_created_at_idx on public.meeting_attendance_forms(created_at desc);

alter table public.meeting_attendance_forms enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'maf_service_all' and tablename = 'meeting_attendance_forms') then
    create policy "maf_service_all" on public.meeting_attendance_forms using (true) with check (true);
  end if;
end $$;

create table if not exists public.meeting_attendance_submissions (
  id            uuid        primary key default gen_random_uuid(),
  form_id       uuid        not null references public.meeting_attendance_forms(id) on delete cascade,
  user_id       uuid        not null references public.profiles(id) on delete cascade,
  submission_no integer     not null,
  signature_url text,
  submitted_at  timestamptz not null default now(),
  remarks       text,
  unique(form_id, user_id)
);

create index if not exists mas_form_id_idx on public.meeting_attendance_submissions(form_id);

alter table public.meeting_attendance_submissions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'mas_service_all' and tablename = 'meeting_attendance_submissions') then
    create policy "mas_service_all" on public.meeting_attendance_submissions using (true) with check (true);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────
-- 19. COLUMN PATCHES  (safe to re-run — adds missing columns)
-- Run this if any column-not-found errors appear in the app.
-- ─────────────────────────────────────────────────────────────

alter table public.calendar_events
  add column if not exists description    text,
  add column if not exists description_ar text,
  add column if not exists location       text,
  add column if not exists venue          text,
  add column if not exists organizer      text,
  add column if not exists participants   jsonb        not null default '[]'::jsonb,
  add column if not exists event_status   text         not null default 'active',
  add column if not exists all_day        boolean      not null default false,
  add column if not exists color          text         default '#2f9acb',
  add column if not exists title_ar       text;

alter table public.profiles
  add column if not exists signature_url         text,
  add column if not exists signature_drawn_url   text,
  add column if not exists signature_active_type text default 'uploaded',
  add column if not exists last_seen_at          timestamptz;


-- ─────────────────────────────────────────────────────────────
-- 20. DOCUMENT DOWNLOAD PERMISSIONS
-- Stores per-document, per-user download grants set by admins.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.document_download_permissions (
  id          uuid        primary key default gen_random_uuid(),
  document_id uuid        not null references public.documents(id) on delete cascade,
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  granted_by  uuid        references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  unique(document_id, user_id)
);

alter table public.document_download_permissions enable row level security;

-- Users can view their own grants (so the frontend knows which docs they can download).
drop policy if exists "Users see own download perms" on public.document_download_permissions;
create policy "Users see own download perms" on public.document_download_permissions
  for select
  using (auth.uid() = user_id);

-- Service role (backend) can manage all rows.
drop policy if exists "Service manage download perms" on public.document_download_permissions;
create policy "Service manage download perms" on public.document_download_permissions
  for all using (true) with check (true);


-- ─────────────────────────────────────────────────────────────
-- 21. TIGHTER RLS FOR DIRECT SUPABASE API WRITES
-- Restricts calendar_events, articles, and documents writes
-- when users call the Supabase API directly with their JWT.
-- (Service-role backend bypasses RLS automatically.)
-- ─────────────────────────────────────────────────────────────

-- Helper: admin role check via JWT user_metadata
-- Returns true for admin / ceo / director.

-- calendar_events — restrict direct inserts/updates/deletes to admin roles
drop policy if exists "Admin direct write events" on public.calendar_events;
create policy "Admin direct write events" on public.calendar_events
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );

drop policy if exists "Admin direct update events" on public.calendar_events;
create policy "Admin direct update events" on public.calendar_events
  for update to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );

drop policy if exists "Admin direct delete events" on public.calendar_events;
create policy "Admin direct delete events" on public.calendar_events
  for delete to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );

-- articles — restrict direct inserts/updates/deletes to admin roles
drop policy if exists "Admin direct write articles" on public.articles;
create policy "Admin direct write articles" on public.articles
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );

drop policy if exists "Admin direct update articles" on public.articles;
create policy "Admin direct update articles" on public.articles
  for update to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );

drop policy if exists "Admin direct delete articles" on public.articles;
create policy "Admin direct delete articles" on public.articles
  for delete to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );

-- documents — restrict direct inserts/updates/deletes to admin roles
drop policy if exists "Admin direct write documents" on public.documents;
create policy "Admin direct write documents" on public.documents
  for insert to authenticated
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );

drop policy if exists "Admin direct update documents" on public.documents;
create policy "Admin direct update documents" on public.documents
  for update to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );

drop policy if exists "Admin direct delete documents" on public.documents;
create policy "Admin direct delete documents" on public.documents
  for delete to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'ceo', 'director')
  );


-- ─────────────────────────────────────────────────────────────
-- 22. ATTENDANCE ACTIVATIONS
-- Stores admin-controlled per-event, per-attendee submission
-- windows with automatic expiry.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.attendance_activations (
  id               uuid        primary key default gen_random_uuid(),
  event_id         uuid        not null references public.calendar_events(id) on delete cascade,
  user_id          uuid        not null references public.profiles(id) on delete cascade,
  activated_by     uuid        references public.profiles(id) on delete set null,
  activated_at     timestamptz not null default now(),
  expires_at       timestamptz not null,
  duration_seconds int         not null,
  submitted_at     timestamptz,
  unique(event_id, user_id)
);

alter table public.attendance_activations enable row level security;

drop policy if exists "Users see own activations" on public.attendance_activations;
create policy "Users see own activations" on public.attendance_activations
  for select using (auth.uid() = user_id);

drop policy if exists "Service manage activations" on public.attendance_activations;
create policy "Service manage activations" on public.attendance_activations
  for all using (true) with check (true);
