-- Social Studio: a private report link per client, and service agreements
-- that are sent, signed and countersigned inside the system. Additive only.
--
-- As with the rest of Social Studio, the browser never writes these tables:
-- the server validates every change and writes with the service role. The
-- public report and signing pages are read and written by the server only,
-- after it has matched the unguessable token in the link.

alter table public.social_programs
  -- The secret in the client's report link. Null means no link is switched on.
  add column report_token text unique check (report_token is null or length(report_token) between 32 and 128);

create table public.social_agreements (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.social_programs(id),
  title text not null check (length(title) between 1 and 200),
  -- Plain text. Lines starting with "# " or "## " are shown as headings.
  body text not null check (length(body) between 1 and 120000),
  -- draft: being written. sent: locked, waiting for the client.
  -- client_signed: waiting for our countersignature. signed: complete.
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'client_signed', 'signed', 'void')),
  -- The secret in the signing link. Set when the agreement is sent.
  token text unique check (token is null or length(token) between 32 and 128),
  -- SHA-256 of the title and body at the moment it was sent. Both signatures
  -- record this value, so the signed text can always be checked.
  document_hash text check (document_hash is null or document_hash ~ '^[a-f0-9]{64}$'),
  sent_at timestamptz,
  client_name text not null default '' check (length(client_name) <= 120),
  client_title text not null default '' check (length(client_title) <= 120),
  client_email text not null default '' check (length(client_email) <= 254),
  client_consent text not null default '' check (length(client_consent) <= 1000),
  client_signed_at timestamptz,
  -- SHA-256 of the signer's network address, kept as evidence without storing the address.
  client_ip_hash text check (client_ip_hash is null or client_ip_hash ~ '^[a-f0-9]{64}$'),
  counter_name text not null default '' check (length(counter_name) <= 120),
  counter_title text not null default '' check (length(counter_title) <= 120),
  counter_consent text not null default '' check (length(counter_consent) <= 1000),
  countersigned_at timestamptz,
  countersigned_by uuid references public.team_members(id),
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A signature never exists without the text it applies to.
  check (status in ('draft', 'void') or (token is not null and document_hash is not null and sent_at is not null)),
  check (status not in ('client_signed', 'signed') or (client_signed_at is not null and client_name <> '')),
  check (status <> 'signed' or (countersigned_at is not null and counter_name <> ''))
);

create index social_agreements_program_idx on public.social_agreements (program_id, created_at desc);

alter table public.social_agreements enable row level security;
revoke all on public.social_agreements from public, anon, authenticated;
grant select on public.social_agreements to authenticated;
grant select, insert, update on public.social_agreements to service_role;
create policy office_read on public.social_agreements for select to authenticated
  using (exists (
    select 1 from public.team_members t
    where t.id = (select auth.uid()) and t.is_active and t.role::text in ('admin', 'coordinator')
  ));
