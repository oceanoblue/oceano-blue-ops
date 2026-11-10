-- Make renders the art; Ops owns the queue, stored preview and publish gate.
create table public.podcast_thumbnails (
  episode_id uuid primary key references public.podcast_episodes(id) on delete cascade,
  youtube_id text not null check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  status text not null default 'queued' check (status in ('queued','generating','ready','failed')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  storage_path text,
  error text,
  updated_at timestamptz not null default now()
);
alter table public.podcast_thumbnails enable row level security;
revoke all on public.podcast_thumbnails from anon, authenticated;
grant select on public.podcast_thumbnails to authenticated;
grant all on public.podcast_thumbnails to service_role;
create policy "team read podcast thumbnails" on public.podcast_thumbnails for select to authenticated using (public.is_team_member());

-- Only this show's Make scenario has a configured brand and identity reference.
update public.podcast_shows set metadata=coalesce(metadata,'{}'::jsonb)||'{"thumbnail_required":true}'::jsonb where slug='mind-your-health';

create function public.claim_podcast_thumbnail(p_show_slug text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t podcast_thumbnails%rowtype; e podcast_episodes%rowtype;
begin
  -- Reconcile uploads from both Ops and the legacy Make callback. Published
  -- direct uploads are included to repair the original missing handoff.
  insert into podcast_thumbnails(episode_id,youtube_id)
  select distinct on (ep.id) ep.id,l.external_id
  from podcast_episodes ep join podcast_shows s on s.id=ep.show_id
  join external_links l on l.job_id=ep.job_id and l.link_type='youtube_video'
  left join podcast_youtube_uploads u on u.episode_id=ep.id
  where s.slug=p_show_slug and s.metadata->>'thumbnail_required'='true'
    and ep.status not in ('cancelled','archived','needs_revision')
    and (ep.status<>'published' or u.status='uploaded')
    and l.external_id ~ '^[A-Za-z0-9_-]{11}$'
  on conflict(episode_id) do nothing;

  update podcast_thumbnails set status='failed',error='Thumbnail generation timed out. Retry from the episode page.',updated_at=now()
  where status='generating' and lease_expires_at<now() and attempts>=3;
  select pt.* into t from podcast_thumbnails pt
  join podcast_episodes ep on ep.id=pt.episode_id join podcast_shows s on s.id=ep.show_id
  where s.slug=p_show_slug and ep.status not in ('cancelled','archived','needs_revision')
    and (pt.status='queued' or (pt.status='generating' and pt.lease_expires_at<now() and pt.attempts<3))
  order by pt.updated_at for update of pt skip locked limit 1;
  if not found then return '{}'::jsonb; end if;
  update podcast_thumbnails set status='generating', attempts=attempts+1,
    lease_token=gen_random_uuid(), lease_expires_at=now()+interval '20 minutes',error=null,updated_at=now()
    where episode_id=t.episode_id returning * into t;
  select * into e from podcast_episodes where id=t.episode_id;
  return jsonb_build_object('id',e.id,'lease_token',t.lease_token,'youtube_id',t.youtube_id,
    'title',coalesce(e.metadata->'copy'->>'title',e.title),
    'description',coalesce(e.metadata->'copy'->>'youtube_description',''),
    'filename',coalesce(e.metadata->>'filename',''));
end $$;
revoke all on function public.claim_podcast_thumbnail(text) from public,anon,authenticated;
grant execute on function public.claim_podcast_thumbnail(text) to service_role;

create function public.complete_podcast_thumbnail(p_episode uuid,p_lease uuid,p_path text)
returns void language plpgsql security definer set search_path=public as $$
declare e podcast_episodes%rowtype;
begin
  update podcast_thumbnails set status='ready',storage_path=p_path,error=null,lease_expires_at=null,updated_at=now()
  where episode_id=p_episode and lease_token=p_lease and status='generating' and lease_expires_at>now();
  if not found then raise exception 'Thumbnail lease expired'; end if;
  select * into e from podcast_episodes where id=p_episode for update;
  if e.status not in ('published','cancelled','archived','needs_revision') then
    update podcast_episodes set status='ready_to_publish' where id=e.id;
    update jobs set next_action='Review the video, thumbnail and copy, then approve publication' where id=e.job_id;
  end if;
  insert into production_events(job_id,actor_type,event_type,summary)
  values(e.job_id,'system','podcast_thumbnail_ready','Custom thumbnail saved and applied to YouTube');
end $$;
revoke all on function public.complete_podcast_thumbnail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_podcast_thumbnail(uuid,uuid,text) to service_role;

-- Upload completion must no longer advertise readiness before thumbnail completion.
create function public.podcast_thumbnail_readiness_guard() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.status='ready_to_publish' and exists(select 1 from podcast_shows where id=new.show_id and metadata->>'thumbnail_required'='true')
    and not exists(select 1 from podcast_thumbnails where episode_id=new.id and status='ready' and storage_path is not null) then
    new.status='needs_review';
  end if;
  return new;
end $$;
create trigger podcast_thumbnail_readiness before insert or update of status on public.podcast_episodes
for each row execute function public.podcast_thumbnail_readiness_guard();
