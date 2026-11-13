-- Social media client onboarding (/social/start).
-- A client sends one intake (answers) plus the brand files we need to start.
-- The public page never talks to the database directly: the server validates
-- every request and writes with the service role. Office users read through
-- RLS; nobody else can read or write these tables.

create table public.social_onboarding_submissions (
  -- Chosen by the browser so a retried request lands on the same row.
  id uuid primary key,
  request_hash text not null,
  -- sha256 of the secret the browser holds for adding files to this intake.
  upload_token_hash text not null,
  business_name text not null check (length(business_name) between 1 and 180),
  contact_name text not null check (length(contact_name) between 1 and 180),
  email text not null check (length(email) between 3 and 254),
  phone text not null default '',
  package text not null,
  answers jsonb not null,
  expected_files integer not null default 0 check (expected_files between 0 and 40),
  status text not null default 'new' check (status in ('new', 'reviewed')),
  reviewed_by uuid references public.team_members(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index social_onboarding_submissions_created_idx
  on public.social_onboarding_submissions (created_at desc);

create table public.social_onboarding_files (
  -- Chosen by the browser, same reason as above.
  id uuid primary key,
  submission_id uuid not null references public.social_onboarding_submissions(id),
  kind text not null check (kind in ('image', 'video', 'document', 'design')),
  original_name text not null check (length(original_name) between 1 and 255),
  storage_path text not null unique,
  content_type text not null default '',
  -- Size the browser declared when it asked to upload.
  declared_bytes bigint not null check (declared_bytes > 0),
  -- Size actually stored, recorded once the upload is confirmed.
  size_bytes bigint,
  status text not null default 'pending' check (status in ('pending', 'uploaded')),
  created_at timestamptz not null default now(),
  uploaded_at timestamptz
);
create index social_onboarding_files_submission_idx
  on public.social_onboarding_files (submission_id, created_at);
create index social_onboarding_files_created_idx
  on public.social_onboarding_files (created_at);

do $$ declare tbl text; begin
  foreach tbl in array array['social_onboarding_submissions', 'social_onboarding_files'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from public, anon, authenticated', tbl);
    execute format('grant select on public.%I to authenticated', tbl);
    execute format('grant select, insert, update on public.%I to service_role', tbl);
    execute format('create policy office_read on public.%I for select to authenticated using (exists (select 1 from public.team_members t where t.id = (select auth.uid()) and t.is_active and t.role::text in (''admin'', ''coordinator'')))', tbl);
  end loop;
end $$;

-- Private bucket. No anon/authenticated Storage policy is added: uploads only
-- happen through one-time signed upload URLs the server issues, and downloads
-- only through short-lived signed URLs issued to office users.
-- 2 GB per file. MIME types are left open because logo and design files
-- (.ai, .eps, .psd) arrive with inconsistent types; the server allowlists by
-- file extension before it signs an upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-onboarding', 'social-onboarding', false, 2147483648, null)
on conflict (id) do nothing;
