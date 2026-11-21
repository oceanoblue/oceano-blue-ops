-- A successful reconnect can rotate a credential, but cannot silently replace
-- the identity previously verified for this account. Legacy rows require recheck.
alter table public.social_channel_connections add column verified_profile_url text;

create function public.social_guard_meta_identity() returns trigger
language plpgsql set search_path = '' as $$
declare account public.social_accounts;
begin
  if tg_op='UPDATE' and (old.account_id,old.platform,old.remote_id) is distinct from
    (new.account_id,new.platform,new.remote_id) then
    raise exception using errcode='P0001',message='Remove the existing Meta connection before linking a different profile.';
  end if;
  select * into account from public.social_accounts where id=new.account_id for share;
  if account.id is null or not account.is_active or not(new.platform=any(account.platforms))
     or nullif(new.verified_profile_url,'') is null
     or (account.profile_links->>new.platform) is distinct from new.verified_profile_url then
    raise exception using errcode='P0001',message='Profile settings changed. Reload the account and reconnect.';
  end if;
  return new;
end $$;
create trigger social_guard_meta_identity before insert or update on public.social_channel_connections
  for each row execute function public.social_guard_meta_identity();
revoke all on function public.social_guard_meta_identity() from public,anon,authenticated;
