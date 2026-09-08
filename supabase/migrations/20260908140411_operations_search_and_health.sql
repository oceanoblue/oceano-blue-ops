begin;
set local lock_timeout = '5s';

create function public.search_operations_orders(p_statuses text[] default null, p_kind text default null,
  p_archived boolean default false, p_query text default '', p_sort text default 'scheduled',
  p_ascending boolean default false, p_page integer default 1, p_size integer default 50)
returns jsonb language sql stable security invoker set search_path=public as $$
with filtered as (
  select o.id,o.order_number,o.status,o.scheduled_at,o.rush,o.order_kind,o.project_type,o.listing_id,o.client_id,o.total_cents,o.download_paid_at,
    jsonb_build_object('address_line1',l.address_line1,'city',l.city,'state',l.state,'zip',l.zip) as listings,
    jsonb_build_object('full_name',c.full_name,'brokerage',c.brokerage) as clients,
    l.address_line1 as address_sort,c.full_name as client_sort
  from public.orders o left join public.listings l on l.id=o.listing_id left join public.clients c on c.id=o.client_id
  where (select public.is_team_member())
    and (p_statuses is null or o.status::text=any(p_statuses))
    and (p_kind is null or o.order_kind::text=p_kind)
    and ((p_archived and o.archived_at is not null) or (not p_archived and o.archived_at is null))
    and (p_query='' or concat_ws(' ',o.order_number::text,l.address_line1,l.city,c.full_name,c.brokerage) ilike '%'||left(p_query,100)||'%')
), ordered as (
  select * from filtered order by
    case when p_ascending and p_sort='order' then order_number end asc nulls last,
    case when not p_ascending and p_sort='order' then order_number end desc nulls last,
    case when p_ascending and p_sort='total' then total_cents end asc nulls last,
    case when not p_ascending and p_sort='total' then total_cents end desc nulls last,
    case when p_ascending and p_sort='address' then lower(address_sort) end asc nulls last,
    case when not p_ascending and p_sort='address' then lower(address_sort) end desc nulls last,
    case when p_ascending and p_sort='client' then lower(client_sort) end asc nulls last,
    case when not p_ascending and p_sort='client' then lower(client_sort) end desc nulls last,
    case when p_ascending and p_sort='status' then status::text end asc nulls last,
    case when not p_ascending and p_sort='status' then status::text end desc nulls last,
    case when p_ascending and p_sort='scheduled' then scheduled_at end asc nulls last,
    case when not p_ascending and p_sort='scheduled' then scheduled_at end desc nulls last,
    id asc
  limit least(greatest(p_size,1),100) offset (greatest(p_page,1)-1)*least(greatest(p_size,1),100)
)
select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(ordered)-'address_sort'-'client_sort') from ordered),'[]'::jsonb));
$$;
revoke all on function public.search_operations_orders(text[],text,boolean,text,text,boolean,int,int) from public,anon;
grant execute on function public.search_operations_orders(text[],text,boolean,text,text,boolean,int,int) to authenticated,service_role;

-- Cache the per-request identity instead of evaluating it for every row.
alter policy "contractor read own row" on public.contractors using (auth_user_id = (select auth.uid()));
-- These tables are currently small (each under 32KB); a bounded-lock
-- transaction can build the missing FK indexes without a maintenance window.
create index if not exists leads_client_id_idx on acq.leads(client_id);
create index if not exists leads_listing_id_idx on acq.leads(listing_id);
create index if not exists leads_order_id_idx on acq.leads(order_id);
create index if not exists sequence_steps_template_key_idx on acq.sequence_steps(template_key);
create index if not exists assignment_events_contractor_id_idx on public.assignment_events(contractor_id);
create index if not exists client_teams_created_by_idx on public.client_teams(created_by);
create index if not exists edit_jobs_created_by_idx on public.edit_jobs(created_by);
create index if not exists edit_jobs_worker_id_idx on public.edit_jobs(worker_id);
create index if not exists external_edit_batches_created_by_idx on public.external_edit_batches(created_by);
create index if not exists listing_deliverables_created_by_idx on public.listing_deliverables(created_by);
create index if not exists photo_qc_reports_created_by_idx on public.photo_qc_reports(created_by);
create index if not exists quotes_created_by_idx on public.quotes(created_by);
create index if not exists training_pairs_job_id_idx on public.training_pairs(job_id);
create index if not exists training_pairs_output_photo_id_idx on public.training_pairs(output_photo_id);
create index if not exists training_pairs_source_photo_id_idx on public.training_pairs(source_photo_id);
commit;
