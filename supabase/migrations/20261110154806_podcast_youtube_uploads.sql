-- Server-only credentials and resumable upload queue. No browser role can read
-- tokens or resumable session URLs. Staff APIs return an explicit safe projection.
create table public.podcast_youtube_connections (
  show_id uuid primary key references public.podcast_shows(id) on delete cascade,
  channel_id text not null,
  channel_title text not null,
  refresh_token text not null,
  connected_by uuid not null,
  connected_at timestamptz not null default now()
);
create table public.podcast_youtube_uploads (
  episode_id uuid primary key references public.podcast_episodes(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','uploading','failed','uploaded')),
  session_url text,
  source_url text,
  source_etag text,
  total_bytes bigint,
  uploaded_bytes bigint not null default 0,
  youtube_id text,
  privacy text,
  error text,
  attempts integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.podcast_youtube_connections enable row level security;
alter table public.podcast_youtube_uploads enable row level security;
revoke all on public.podcast_youtube_connections, public.podcast_youtube_uploads from public, anon, authenticated;
grant all on public.podcast_youtube_connections, public.podcast_youtube_uploads to service_role;
create index podcast_youtube_uploads_pending_idx on public.podcast_youtube_uploads(next_attempt_at) where status in ('queued','uploading');

create function public.claim_podcast_youtube_upload(p_lease uuid)
returns setof public.podcast_youtube_uploads language sql security invoker set search_path = '' as $$
  update public.podcast_youtube_uploads set lease_id=p_lease, lease_until=now()+interval '5 minutes', updated_at=now()
  where episode_id=(select episode_id from public.podcast_youtube_uploads
    where status in ('queued','uploading') and next_attempt_at<=now()
      and (lease_until is null or lease_until<now())
    order by created_at for update skip locked limit 1)
  returning *;
$$;
revoke all on function public.claim_podcast_youtube_upload(uuid) from public, anon, authenticated;
grant execute on function public.claim_podcast_youtube_upload(uuid) to service_role;

-- Atomic, idempotent completion: a replay repairs the review gate without
-- uploading again or resetting a previous human decision.
create function public.record_podcast_youtube_upload(p_episode uuid, p_video text, p_privacy text)
returns void language plpgsql security invoker set search_path = '' as $$
declare ep public.podcast_episodes; video_url text; policy uuid;
begin
  if p_video is null or p_video !~ '^[A-Za-z0-9_-]{11}$' or p_privacy is null or p_privacy not in ('unlisted','private') then raise exception 'Invalid review upload'; end if;
  select * into strict ep from public.podcast_episodes where id=p_episode for update;
  if ep.job_id is null then raise exception 'Episode has no job'; end if;
  if ep.status in ('cancelled','archived','needs_revision') then raise exception 'Episode is paused or awaiting revisions'; end if;
  if exists(select 1 from public.external_links where job_id=ep.job_id and link_type='youtube_video' and external_id is distinct from p_video) then
    raise exception 'Episode already linked to a different video';
  end if;
  video_url:='https://youtu.be/'||p_video;
  if not exists(select 1 from public.external_links where job_id=ep.job_id and link_type='youtube_video') then
    insert into public.external_links(job_id,link_type,url,external_id,label) values(ep.job_id,'youtube_video',video_url,p_video,'YouTube ('||p_privacy||')');
  end if;
  if not exists(select 1 from public.delivery_versions where job_id=ep.job_id and delivery_type='podcast_episode') then
    insert into public.delivery_versions(job_id,delivery_type,status,title,external_url)
      values(ep.job_id,'podcast_episode','internal_review',coalesce(ep.metadata->'copy'->>'title',ep.title),video_url);
  end if;
  if not exists(select 1 from public.podcast_deliverables where episode_id=ep.id and deliverable_type='full_episode_video') then
    insert into public.podcast_deliverables(episode_id,deliverable_type,status,external_url)
      values(ep.id,'full_episode_video','internal_review',video_url);
  end if;
  select id into policy from public.approval_policies where key='publish_content' limit 1;
  if not exists(select 1 from public.approvals where job_id=ep.job_id and policy_id is not distinct from policy) then
    insert into public.approvals(job_id,policy_id,status,notes) values(ep.job_id,policy,'pending','Review the YouTube draft and generated copy before publishing.');
  end if;
  if ep.status not in ('published','cancelled','archived','needs_revision') then
    update public.podcast_episodes set status='ready_to_publish' where id=ep.id;
    update public.jobs set next_action='Review YouTube draft and approve publishing' where id=ep.job_id;
  end if;
  update public.podcast_youtube_uploads set status='uploaded',youtube_id=p_video,privacy=p_privacy,
    uploaded_bytes=coalesce(total_bytes,uploaded_bytes),error=null,session_url=null,lease_id=null,lease_until=null,updated_at=now() where episode_id=ep.id;
end;
$$;
revoke all on function public.record_podcast_youtube_upload(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_podcast_youtube_upload(uuid,text,text) to service_role;

create function public.confirm_podcast_youtube_publication(p_episode uuid,p_video text)
returns void language plpgsql security invoker set search_path='' as $$
declare ep public.podcast_episodes;
begin
  select * into strict ep from public.podcast_episodes where id=p_episode for update;
  if ep.status in ('cancelled','archived','needs_revision') then raise exception 'Episode is paused or awaiting revisions'; end if;
  if (select status from public.approvals where job_id=ep.job_id order by created_at desc limit 1) is distinct from 'approved' then
    raise exception 'Human publish approval required';
  end if;
  if not exists(select 1 from public.external_links where job_id=ep.job_id and link_type='youtube_video' and external_id=p_video) then
    raise exception 'Video does not match episode';
  end if;
  update public.podcast_episodes set status='published' where id=ep.id;
  update public.jobs set next_action=null where id=ep.job_id;
  update public.external_links set label='YouTube (public)' where job_id=ep.job_id and link_type='youtube_video';
  update public.delivery_versions set status='published' where job_id=ep.job_id and delivery_type='podcast_episode';
  update public.podcast_deliverables set status='published' where episode_id=ep.id and deliverable_type='full_episode_video';
end;
$$;
revoke all on function public.confirm_podcast_youtube_publication(uuid,text) from public,anon,authenticated;
grant execute on function public.confirm_podcast_youtube_publication(uuid,text) to service_role;
