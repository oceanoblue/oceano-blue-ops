alter table public.podcast_thumbnails drop constraint podcast_thumbnails_status_check;
alter table public.podcast_thumbnails add constraint podcast_thumbnails_status_check check(status in ('queued','generating','review','applying','ready','failed'));
-- Approval leases are isolated from generation so a retry cannot redraw approved artwork.
create or replace function public.complete_podcast_thumbnail(p_episode uuid,p_lease uuid,p_path text)
returns void language plpgsql security definer set search_path=public as $$
declare e podcast_episodes%rowtype;
begin
  update podcast_thumbnails set status='ready',storage_path=p_path,error=null,lease_expires_at=null,updated_at=now()
  where episode_id=p_episode and lease_token=p_lease and status in ('generating','applying') and lease_expires_at>now();
  if not found then raise exception 'Thumbnail lease expired'; end if;
  select * into e from podcast_episodes where id=p_episode for update;
  if e.status not in ('published','cancelled','archived','needs_revision') then
    update podcast_episodes set status='ready_to_publish' where id=e.id;
    update jobs set next_action='Review the video, thumbnail and copy, then approve publication' where id=e.job_id;
  end if;
  insert into production_events(job_id,actor_type,event_type,summary)
  values(e.job_id,'system','podcast_thumbnail_ready','Reviewed thumbnail saved and applied to YouTube');
end $$;
revoke all on function public.complete_podcast_thumbnail(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_podcast_thumbnail(uuid,uuid,text) to service_role;
