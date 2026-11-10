create or replace function public.claim_podcast_thumbnail(p_show_slug text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t podcast_thumbnails%rowtype; e podcast_episodes%rowtype;
begin
  -- Reconcile unpublished episodes. Repair of a published episode must be
  -- explicitly queued so existing public thumbnails are never replaced in bulk.
  insert into podcast_thumbnails(episode_id,youtube_id)
  select distinct on (ep.id) ep.id,l.external_id
  from podcast_episodes ep join podcast_shows s on s.id=ep.show_id
  join external_links l on l.job_id=ep.job_id and l.link_type='youtube_video'
  where s.slug=p_show_slug and s.metadata->>'thumbnail_required'='true'
    and ep.status not in ('cancelled','archived','needs_revision')
    and ep.status<>'published'
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
