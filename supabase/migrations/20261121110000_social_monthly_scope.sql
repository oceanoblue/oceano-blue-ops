-- Terms apply to the full calendar months covered by the agreement. A change
-- takes effect in the current Eastern month and never restates a closed month.
create function public.social_valid_weekdays(days integer[]) returns boolean
language sql immutable set search_path = '' as $$
  select days <@ array[0,1,2,3,4,5,6] and cardinality(days)=(select count(distinct n) from unnest(days) n)
$$;
alter table public.social_accounts add column post_weekdays integer[] not null default '{}'
  check(public.social_valid_weekdays(post_weekdays));
create table public.social_scope_history (
  account_id uuid not null references public.social_accounts(id),
  effective_month date not null check (extract(day from effective_month) = 1),
  eligible boolean not null,
  term_start date,
  term_months integer not null,
  posts_per_month integer not null,
  reels_per_month integer not null,
  google_posts_per_month integer not null,
  post_weekdays integer[] not null default '{}',
  from_legacy_plan boolean not null default false,
  primary key(account_id,effective_month)
);
alter table public.social_scope_history enable row level security;
revoke all on public.social_scope_history from anon, authenticated;

create function public.social_record_scope(p_account uuid) returns void
language sql set search_path = '' as $$
  -- Serialize with concurrent program-term edits before reading both records.
  select p.id from public.social_programs p join public.social_accounts a on a.program_id=p.id
    where a.id=p_account for share of p;
  insert into public.social_scope_history
    (account_id,effective_month,eligible,term_start,term_months,posts_per_month,reels_per_month,google_posts_per_month,post_weekdays)
  select a.id, date_trunc('month', now() at time zone 'America/New_York')::date,
         a.is_active and p.status in ('active','onboarding'), p.term_start, p.term_months,
         a.posts_per_month, a.reels_per_month, a.google_posts_per_month, a.post_weekdays
    from public.social_accounts a join public.social_programs p on p.id=a.program_id
    where a.id=p_account
  on conflict (account_id,effective_month) do update set eligible=excluded.eligible,
    term_start=excluded.term_start, term_months=excluded.term_months,
    posts_per_month=excluded.posts_per_month, reels_per_month=excluded.reels_per_month,
    google_posts_per_month=excluded.google_posts_per_month, post_weekdays=excluded.post_weekdays, from_legacy_plan=false;
$$;
create function public.social_capture_scope_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name='social_accounts' then
    perform public.social_record_scope(new.id);
  else
    perform public.social_record_scope(a.id) from public.social_accounts a where a.program_id=new.id;
  end if;
  return new;
end $$;
create trigger social_account_scope_change after insert or update of posts_per_month,reels_per_month,google_posts_per_month,post_weekdays,is_active
  on public.social_accounts for each row execute function public.social_capture_scope_change();
create trigger social_program_scope_change after update of term_start,term_months,status
  on public.social_programs for each row execute function public.social_capture_scope_change();

-- Prior agreements were never versioned. Recover only slots evidenced in an
-- existing closed-month plan, without projecting those quantities into later months.
insert into public.social_scope_history
  (account_id,effective_month,eligible,term_months,posts_per_month,reels_per_month,google_posts_per_month,from_legacy_plan)
select account_id,month,true,0,
  count(*) filter(where kind='post'), count(*) filter(where kind='reel'),
  count(*) filter(where kind='google_post'),true
from public.social_content_items where month < date_trunc('month', now() at time zone 'America/New_York')::date
group by account_id,month;
select public.social_record_scope(id) from public.social_accounts;

create function public.social_month_scope(p_program uuid,p_month date)
returns table(account_id uuid,posts_per_month integer,reels_per_month integer,google_posts_per_month integer,from_legacy_plan boolean,post_dates date[],service_from date)
language sql stable set search_path = '' as $$
  select a.id, case when cardinality(h.post_weekdays)>0 then cardinality(cal.post_dates) else h.posts_per_month end,
         h.reels_per_month,h.google_posts_per_month,h.from_legacy_plan,cal.post_dates,greatest(p_month,h.term_start)
    from public.social_accounts a
    cross join lateral (
      select s.* from public.social_scope_history s
       where s.account_id=a.id and s.effective_month<=p_month
         and (not s.from_legacy_plan or s.effective_month=p_month)
       order by s.effective_month desc limit 1
    ) h
    cross join lateral (
      select array(select p_month+n from generate_series(0,((p_month+interval '1 month')::date-p_month)-1) n
        where extract(dow from p_month+n)::integer=any(h.post_weekdays)
          and p_month+n>=greatest(p_month,h.term_start) order by n) as post_dates
    ) cal
   where a.program_id=p_program and h.eligible
     and (h.term_start is null or
       (date_trunc('month',h.term_start)::date<=p_month and
        (h.term_months=0 or p_month<date_trunc('month',h.term_start)+make_interval(months=>h.term_months))));
$$;

create function public.social_plan_month(p_program uuid,p_month date,p_actor uuid)
returns integer language plpgsql set search_path = '' as $$
declare added integer;
begin
  if extract(day from p_month)<>1 then raise exception 'Invalid planning month'; end if;
  perform 1 from public.social_programs where id=p_program for share;
  if not found then raise exception 'Unknown client'; end if;
  perform 1 from public.social_accounts where program_id=p_program order by id for share;
  with scope as (
    select s.*, (row_number() over(order by a.name,a.id)-1)::integer as position
      from public.social_month_scope(p_program,p_month) s
      join public.social_accounts a on a.id=s.account_id
      where not s.from_legacy_plan
  ), formats as (
    select s.*, f.kind, f.quota, f.day_shift,
      (p_month+interval '1 month')::date-s.service_from as days
      from scope s cross join lateral (values ('post',s.posts_per_month,0),
        ('reel',s.reels_per_month,2),('google_post',s.google_posts_per_month,4)) f(kind,quota,day_shift)
  )
  insert into public.social_content_items(account_id,month,kind,slot,pillar,scheduled_for,updated_by)
    select account_id,p_month,kind,n,
      case kind when 'reel' then 'video' when 'google_post' then 'google_update'
        else (array['property_feature','local_event','property_feature','local_story','flexible'])[(n-1)%5+1] end,
      case when kind='post' and cardinality(post_dates)>0 then post_dates[n]
           else service_from+least(days-1,(n-1)*days/quota+(position+day_shift)%greatest(1,days/quota)) end,p_actor
    from formats cross join lateral generate_series(1,quota) n
    on conflict(account_id,month,kind,slot) do nothing;
  get diagnostics added=row_count;
  return added;
end $$;
-- Allocation and publication are separate dates: moving a post across months
-- does not consume a second slot, but it must appear on the new calendar.
create index social_content_items_calendar_idx on public.social_content_items(account_id,scheduled_for);
create function public.social_calendar_items(p_program uuid,p_month date)
returns setof public.social_content_items language sql stable set search_path = '' as $$
  select i.* from public.social_content_items i join public.social_accounts a on a.id=i.account_id
   where a.program_id=p_program and
     ((i.scheduled_for >= p_month and i.scheduled_for < p_month+interval '1 month')
       or (i.scheduled_for is null and i.month=p_month));
$$;
revoke all on function public.social_calendar_items(uuid,date) from public,anon,authenticated;
grant execute on function public.social_calendar_items(uuid,date) to service_role;
revoke all on function public.social_record_scope(uuid), public.social_capture_scope_change(),
  public.social_month_scope(uuid,date), public.social_plan_month(uuid,date,uuid) from public,anon,authenticated;
grant execute on function public.social_record_scope(uuid), public.social_month_scope(uuid,date),
  public.social_plan_month(uuid,date,uuid) to service_role;
grant select,insert,update on public.social_scope_history to service_role;
