alter table public.property_sites
 add column agent_image_url text not null default '' check(length(agent_image_url)<=2000),
 add column social_video_urls text[] not null default '{}' check(cardinality(social_video_urls)<=6),
 add column url_slug text unique check(url_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(url_slug) between 3 and 120),
 add column brokerage text not null default '' check(length(brokerage)<=160),
 add column acreage numeric check(acreage between 0 and 1000000),
 add column mls_number text not null default '' check(length(mls_number)<=60),
 add column highlights text not null default '' check(length(highlights)<=2000),
 add column video_url text not null default '' check(length(video_url)<=2000),
 add column tour_url text not null default '' check(length(tour_url)<=2000),
 add column floor_plan_url text not null default '' check(length(floor_plan_url)<=2000),
 add column hero_photo_id uuid,
 add column photo_order uuid[] not null default '{}';
create table public.property_events (
 id uuid primary key,
 order_id uuid not null references public.property_sites(order_id) on delete cascade,
 session_id uuid not null,
 event text not null check(event in ('page_view','video_start','video_25','video_50','video_75','video_100','photo_click','showing_click','phone_click','email_click')),
 source text not null check(length(source)<=80), campaign text not null default '' check(length(campaign)<=120),
 created_at timestamptz not null default now()
);
create index property_events_report on public.property_events(order_id,created_at);
create table public.property_inquiries (
 id uuid primary key,
 order_id uuid not null references public.property_sites(order_id) on delete cascade,
 name text not null check(length(name) between 1 and 120), email text not null check(length(email)<=254),
 phone text not null default '' check(length(phone)<=40), message text not null check(length(message) between 1 and 3000),
 source text not null check(length(source)<=80), campaign text not null default '' check(length(campaign)<=120),
 consent_at timestamptz not null default now(), notification_status text not null default 'pending' check(notification_status in ('pending','sent','failed','not_configured','no_recipient')),
 created_at timestamptz not null default now()
);
create index property_inquiries_report on public.property_inquiries(order_id,created_at);
create table public.property_report_access (
 order_id uuid primary key references public.property_sites(order_id) on delete cascade,
 token_hash text not null unique check(length(token_hash)=64), expires_at timestamptz not null
);
alter table public.property_events enable row level security;
alter table public.property_inquiries enable row level security;
alter table public.property_report_access enable row level security;
revoke all on public.property_events,public.property_inquiries,public.property_report_access from public,anon,authenticated;
grant select on public.property_events,public.property_inquiries to authenticated;
grant all on public.property_events,public.property_inquiries,public.property_report_access to service_role;
create policy "staff read property events" on public.property_events for select to authenticated using(public.is_team_member());
create policy "staff read property inquiries" on public.property_inquiries for select to authenticated using(public.is_team_member());
create function public.property_performance(p_order_id uuid,p_start timestamptz,p_end timestamptz) returns jsonb
language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'counts',coalesce((select jsonb_object_agg(event,n) from (select event,count(*) n from property_events where order_id=p_order_id and created_at>=p_start and created_at<p_end group by event) c),'{}'::jsonb),
 'sessions',(select count(distinct session_id) from property_events where order_id=p_order_id and event='page_view' and created_at>=p_start and created_at<p_end),
 'daily',coalesce((select jsonb_agg(d order by "day") from (select to_char(created_at at time zone 'America/New_York','YYYY-MM-DD') as "day",count(*) views from property_events where order_id=p_order_id and event='page_view' and created_at>=p_start and created_at<p_end group by "day") d),'[]'::jsonb),
 'sources',coalesce((select jsonb_agg(s order by views desc) from (select source,count(*) views from property_events where order_id=p_order_id and event='page_view' and created_at>=p_start and created_at<p_end group by source) s),'[]'::jsonb),
 'inquiries',(select count(*) from property_inquiries where order_id=p_order_id and created_at>=p_start and created_at<p_end)
 );
$$;
revoke all on function public.property_performance(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.property_performance(uuid,timestamptz,timestamptz) to service_role;
