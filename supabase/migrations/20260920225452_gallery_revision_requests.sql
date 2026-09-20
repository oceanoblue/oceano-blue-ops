create table public.gallery_revision_requests (
  id uuid primary key,
  delivery_link_id uuid not null references public.delivery_links(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  note text not null check (length(btrim(note)) between 1 and 2000),
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  staff_response text not null default '' check (length(staff_response)<=2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gallery_revision_requests_order_idx on public.gallery_revision_requests(order_id,created_at desc);
create index gallery_revision_requests_link_idx on public.gallery_revision_requests(delivery_link_id);
create index gallery_revision_requests_photo_idx on public.gallery_revision_requests(photo_id);
alter table public.gallery_revision_requests enable row level security;
revoke all on public.gallery_revision_requests from anon,authenticated;
grant select on public.gallery_revision_requests to authenticated;
grant update(status,staff_response,updated_at) on public.gallery_revision_requests to authenticated;
grant all on public.gallery_revision_requests to service_role;
create policy "staff read gallery revisions" on public.gallery_revision_requests for select to authenticated using(public.is_team_member());
create policy "staff update gallery revisions" on public.gallery_revision_requests for update to authenticated using(public.is_team_member()) with check(public.is_team_member());
create trigger gallery_revision_requests_updated_at before update on public.gallery_revision_requests for each row execute function public.set_updated_at();
