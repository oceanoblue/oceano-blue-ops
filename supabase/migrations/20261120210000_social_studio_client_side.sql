-- Social Studio: what a client can do from their private page. Additive only.
--
-- A client can approve a piece or ask for a change, and send the team a note.
-- As everywhere in Social Studio, the browser never writes these tables: the
-- server checks the secret in the client's link, checks the piece belongs to
-- that client, and writes with the service role.

alter table public.social_programs
  -- Where the client sends photos and video (for example a shared folder).
  add column media_upload_url text not null default '' check (length(media_upload_url) <= 500);

alter table public.social_content_items
  -- The client's latest answer on this piece. Blank when there is none, or
  -- when the office has dealt with it.
  add column client_decision text not null default '' check (client_decision in ('', 'approved', 'changes')),
  add column client_note text not null default '' check (length(client_note) <= 2000),
  -- The name the person typed. A client page has no sign-in, so this is what they told us.
  add column client_reviewer text not null default '' check (length(client_reviewer) <= 120),
  add column client_reviewed_at timestamptz;

create table public.social_client_notes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.social_programs(id),
  -- The sub-account the note is about, when the client picked one.
  account_id uuid references public.social_accounts(id),
  author text not null check (length(author) between 1 and 120),
  message text not null check (length(message) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.team_members(id)
);

create index social_client_notes_program_idx on public.social_client_notes (program_id, status, created_at desc);

alter table public.social_client_notes enable row level security;
revoke all on public.social_client_notes from public, anon, authenticated;
grant select on public.social_client_notes to authenticated;
grant select, insert, update on public.social_client_notes to service_role;
create policy office_read on public.social_client_notes for select to authenticated
  using (exists (
    select 1 from public.team_members t
    where t.id = (select auth.uid()) and t.is_active and t.role::text in ('admin', 'coordinator')
  ));
