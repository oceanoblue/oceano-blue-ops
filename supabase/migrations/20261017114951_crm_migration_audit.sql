-- Evidence queue for the HoneyBook transition. Review never changes a project,
-- reconciles a payment, starts a workflow, or sends a client message.
create table public.crm_migration_observations (
 id uuid primary key default gen_random_uuid(),
 source_system text not null check(length(trim(source_system)) between 1 and 80),
 source_kind text not null check(source_kind in ('project','payment','appointment','settings')),
 source_id text not null check(length(trim(source_id)) between 1 and 240),
 source_url text not null default '' check(source_url='' or (length(source_url)<=2000 and source_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$' and source_url !~ '[[:cntrl:]]')),
 title text not null check(length(trim(title)) between 1 and 240),observed_at timestamptz not null,
 project_date date,starts_at timestamptz,ends_at timestamptz,
 facts jsonb not null check(jsonb_typeof(facts)='object' and octet_length(facts::text)<=60000),
 flags text[] not null default '{}' check(cardinality(flags)<=30),
 linked_ops_project uuid references public.projects(id),
 review_state text not null default 'pending' check(review_state in ('pending','active','history','resolved')),
 priority text not null default 'normal' check(priority in ('normal','urgent')),
 next_action text not null default '' check(length(next_action)<=4000),owner_id uuid references public.team_members(id),follow_up_at timestamptz,
 version integer not null default 1,created_by uuid not null references public.team_members(id),import_id uuid not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(ends_at is null or (starts_at is not null and ends_at>starts_at)),unique(source_system,source_kind,source_id)
);
create index crm_migration_review_queue_idx on public.crm_migration_observations(review_state,priority,follow_up_at);
create index crm_migration_project_date_idx on public.crm_migration_observations(project_date);
create index crm_migration_starts_idx on public.crm_migration_observations(starts_at);
create index crm_migration_owner_idx on public.crm_migration_observations(owner_id);
create index crm_migration_linked_project_idx on public.crm_migration_observations(linked_ops_project);
create index crm_migration_created_by_idx on public.crm_migration_observations(created_by);
create table public.crm_migration_reviews (
 id uuid primary key default gen_random_uuid(),observation_id uuid not null references public.crm_migration_observations(id),
 actor_id uuid not null references public.team_members(id),reason text not null check(length(trim(reason)) between 1 and 2000),
 before_snapshot jsonb not null,after_snapshot jsonb not null,created_at timestamptz not null default now()
);
create index crm_migration_reviews_observation_idx on public.crm_migration_reviews(observation_id,created_at desc);
create index crm_migration_reviews_actor_idx on public.crm_migration_reviews(actor_id);
do $$ declare tbl text;begin
 foreach tbl in array array['crm_migration_observations','crm_migration_reviews'] loop
  execute format('alter table public.%I enable row level security',tbl);
  execute format('revoke all on public.%I from public,anon,authenticated',tbl);
  execute format('grant select on public.%I to authenticated',tbl);
  execute format('create policy office_read on public.%I for select to authenticated using(exists(select 1 from public.team_members t where t.id=(select auth.uid()) and t.is_active and t.role::text in (''admin'',''coordinator'')))',tbl);
 end loop;
end $$;
grant select,insert,update on public.crm_migration_observations to service_role;
grant select,insert on public.crm_migration_reviews to service_role;
create function public.crm_migration_observation_guard() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if row(old.id,old.source_system,old.source_kind,old.source_id,old.source_url,old.title,old.observed_at,old.project_date,old.starts_at,old.ends_at,old.facts,old.flags,old.created_by,old.import_id,old.created_at)
 is distinct from row(new.id,new.source_system,new.source_kind,new.source_id,new.source_url,new.title,new.observed_at,new.project_date,new.starts_at,new.ends_at,new.facts,new.flags,new.created_by,new.import_id,new.created_at) then raise exception 'Source observations are immutable';end if;
 return new;
end $$;
revoke all on function public.crm_migration_observation_guard() from public,anon,authenticated;
create trigger crm_migration_source_guard before update on public.crm_migration_observations for each row execute function public.crm_migration_observation_guard();
create trigger crm_migration_review_guard before update or delete on public.crm_migration_reviews for each row execute function public.crm_history_guard();

create function public.crm_migration_action(p_actor uuid,p_action text,p_id uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item jsonb;obs public.crm_migration_observations%rowtype;before_state jsonb;after_state jsonb;inserted uuid;added integer:=0;skipped integer:=0;pid uuid;cid uuid;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 if octet_length(p_data::text)>2000000 then return jsonb_build_object('error','Import is too large.');end if;
 if p_action='import' then
  if jsonb_typeof(p_data->'records') is distinct from 'array' or jsonb_array_length(p_data->'records') not between 1 and 200 then return jsonb_build_object('error','Import 1–200 source observations at a time.');end if;
  -- Validate office assignments before changing any row; failures are atomic.
  for item in select value from jsonb_array_elements(p_data->'records') loop
   if nullif(item->>'owner_id','') is not null and not exists(select 1 from public.team_members where id=(item->>'owner_id')::uuid and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Choose an active office owner.');end if;
   if jsonb_typeof(coalesce(item->'flags','[]')) is distinct from 'array' or exists(select 1 from jsonb_array_elements_text(coalesce(item->'flags','[]')) f where length(trim(f)) not between 1 and 100) then return jsonb_build_object('error','Check observation flags.');end if;
  end loop;
  for item in select value from jsonb_array_elements(p_data->'records') loop
   insert into public.crm_migration_observations(source_system,source_kind,source_id,source_url,title,observed_at,project_date,starts_at,ends_at,facts,flags,linked_ops_project,review_state,priority,next_action,owner_id,follow_up_at,created_by,import_id)
   values(item->>'source_system',item->>'source_kind',item->>'source_id',coalesce(item->>'source_url',''),item->>'title',(item->>'observed_at')::timestamptz,nullif(item->>'project_date','')::date,nullif(item->>'starts_at','')::timestamptz,nullif(item->>'ends_at','')::timestamptz,item->'facts',array(select jsonb_array_elements_text(coalesce(item->'flags','[]'))),nullif(item->>'linked_ops_project','')::uuid,coalesce(item->>'review_state','pending'),coalesce(item->>'priority','normal'),coalesce(item->>'next_action',''),nullif(item->>'owner_id','')::uuid,nullif(item->>'follow_up_at','')::timestamptz,p_actor,p_id)
   on conflict(source_system,source_kind,source_id) do nothing returning id into inserted;
   if found then added:=added+1;else skipped:=skipped+1;end if;
  end loop;
  return jsonb_build_object('id',p_id,'imported',added,'skipped',skipped);
 elsif p_action='review' then
  if nullif(trim(p_data->>'reason'),'') is null then return jsonb_build_object('error','Record a reason for this review.');end if;
  if nullif(p_data->>'owner_id','') is not null and not exists(select 1 from public.team_members where id=(p_data->>'owner_id')::uuid and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Choose an active office owner.');end if;
  select * into obs from public.crm_migration_observations where id=p_id for update;
  if not found then return jsonb_build_object('error','Observation not found.');end if;
  if obs.version is distinct from p_version then return jsonb_build_object('error','Record changed. Reload before saving.');end if;
  before_state:=jsonb_build_object('review_state',obs.review_state,'priority',obs.priority,'next_action',obs.next_action,'owner_id',obs.owner_id,'follow_up_at',obs.follow_up_at,'linked_ops_project',obs.linked_ops_project,'version',obs.version);
  update public.crm_migration_observations set review_state=p_data->>'review_state',priority=p_data->>'priority',next_action=coalesce(p_data->>'next_action',''),owner_id=nullif(p_data->>'owner_id','')::uuid,follow_up_at=nullif(p_data->>'follow_up_at','')::timestamptz,linked_ops_project=nullif(p_data->>'linked_ops_project','')::uuid,version=version+1,updated_at=now() where id=p_id returning * into obs;
  after_state:=jsonb_build_object('review_state',obs.review_state,'priority',obs.priority,'next_action',obs.next_action,'owner_id',obs.owner_id,'follow_up_at',obs.follow_up_at,'linked_ops_project',obs.linked_ops_project,'version',obs.version);
  insert into public.crm_migration_reviews(observation_id,actor_id,reason,before_snapshot,after_snapshot) values(p_id,p_actor,p_data->>'reason',before_state,after_state);
  if obs.linked_ops_project is not null then
   select client_id into cid from public.crm_opportunities where project_id=obs.linked_ops_project;
   insert into public.crm_events(client_id,project_id,actor_id,kind,body,details) values(cid,obs.linked_ops_project,p_actor,'migration_review',left('Migration review: '||obs.title,1000),jsonb_build_object('observation_id',obs.id,'review_state',obs.review_state,'reason',p_data->>'reason'));
  end if;
  return jsonb_build_object('id',obs.id,'version',obs.version);
 end if;
 return jsonb_build_object('error','Unknown migration action.');
end $$;
revoke all on function public.crm_migration_action(uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.crm_migration_action(uuid,text,uuid,integer,jsonb) to service_role;

create function public.crm_migration_page(p_actor uuid,p_query text default '',p_page integer default 0,p_year integer default null,p_status text default 'unresolved',p_kind text default 'all') returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;needle text;
begin
 if not exists(select 1 from public.team_members where id=p_actor and is_active and role::text in ('admin','coordinator')) then return jsonb_build_object('error','Office access required.');end if;
 if p_page not between 0 and 100000 or length(p_query)>120 or (p_year is not null and p_year not between 2000 and 2100) or p_status not in ('all','unresolved','pending','active','history','resolved') or p_kind not in ('all','project','payment','appointment','settings') then return jsonb_build_object('error','Check review filters.');end if;
 needle:=lower(trim(coalesce(p_query,'')));
 with filtered as (
  select o.* from public.crm_migration_observations o where
   (needle='' or strpos(lower(o.title||' '||o.source_id||' '||o.source_system),needle)>0)
   and (p_status='all' or (p_status='unresolved' and o.review_state in ('pending','active')) or o.review_state=p_status)
   and (p_kind='all' or o.source_kind=p_kind)
   and (p_year is null or extract(year from coalesce(o.project_date,(o.starts_at at time zone 'America/New_York')::date))=p_year)
 ), page_rows as (
  select * from filtered order by (priority='urgent') desc,follow_up_at asc nulls last,project_date desc nulls last,observed_at desc,id limit 50 offset p_page*50
 ) select jsonb_build_object(
  'observations',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('reviews',coalesce((select jsonb_agg(to_jsonb(h)) from (select r.id,r.reason,t.full_name actor_name,r.created_at,r.after_snapshot->>'review_state' review_state,r.after_snapshot->>'next_action' next_action from public.crm_migration_reviews r left join public.team_members t on t.id=r.actor_id where r.observation_id=o.id order by r.created_at desc,r.id limit 5) h),'[]'::jsonb))) from page_rows o),'[]'::jsonb),
  'total',(select count(*) from filtered),'page',p_page,'page_size',50,
  'counts',(select jsonb_build_object('total',count(*),'pending',count(*) filter(where review_state='pending'),'active',count(*) filter(where review_state='active'),'history',count(*) filter(where review_state='history'),'resolved',count(*) filter(where review_state='resolved'),'urgent',count(*) filter(where priority='urgent' and review_state in ('pending','active')),'overdue',count(*) filter(where follow_up_at<now() and review_state in ('pending','active')),'unassigned',count(*) filter(where owner_id is null and review_state in ('pending','active'))) from public.crm_migration_observations),
  'owners',coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name) order by full_name) from public.team_members where is_active and role::text in ('admin','coordinator')),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function public.crm_migration_page(uuid,text,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.crm_migration_page(uuid,text,integer,integer,text,text) to service_role;
