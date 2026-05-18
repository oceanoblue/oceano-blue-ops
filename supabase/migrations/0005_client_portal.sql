-- =============================================================
-- Client portal — account-based access for agents
-- =============================================================
-- Adds:
--   1. clients.auth_user_id  → links a client row to a Supabase auth user
--   2. RLS policy that lets a client read THEIR OWN clients/listings/orders/
--      photos/order_services rows when logged in
--   3. RPC `link_client_account()` that the portal calls right after
--      magic-link login to bind the auth.user.id to the matching client
--      row (by email) on first sign-in.
-- =============================================================

alter table clients
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists clients_auth_user_idx on clients(auth_user_id);

-- Helper: get the client_id for the current logged-in user, if any.
create or replace function current_client_id()
returns uuid language sql stable security definer as $$
  select id from clients where auth_user_id = auth.uid() limit 1;
$$;

-- Client read policies (additive — team policies from 0002 still apply).
create policy "client read own row" on clients
  for select using (auth_user_id = auth.uid());

create policy "client read own listings" on listings
  for select using (client_id = current_client_id());

create policy "client read own orders" on orders
  for select using (client_id = current_client_id());

create policy "client read own order_services" on order_services
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_services.order_id and o.client_id = current_client_id()
    )
  );

create policy "client read own delivered photos" on photos
  for select using (
    exists (
      select 1 from orders o
      where o.id = photos.order_id
        and o.client_id = current_client_id()
        and photos.kind in ('processed', 'delivered')
        and photos.is_selected = true
    )
  );

-- Storage: let clients read their own delivery / processed photos.
create policy "client read own delivery files"
  on storage.objects for select
  using (
    bucket_id in ('delivery', 'processed-photos')
    and exists (
      select 1 from photos p
      join orders o on o.id = p.order_id
      where p.storage_path = storage.objects.name
        and p.bucket = storage.objects.bucket_id
        and o.client_id = current_client_id()
        and p.is_selected = true
        and p.kind in ('processed', 'delivered')
    )
  );

-- Called by the portal right after auth.signInWithOtp success.
-- Binds the just-authenticated user.id to the existing clients row that
-- shares the same email, if one exists. Idempotent.
create or replace function link_client_account()
returns clients language plpgsql security definer as $$
declare
  v_email text;
  v_client clients;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'not_authenticated';
  end if;

  update clients
    set auth_user_id = auth.uid()
    where email = v_email and (auth_user_id is null or auth_user_id = auth.uid())
    returning * into v_client;

  return v_client;
end;
$$;

grant execute on function link_client_account() to authenticated;
grant execute on function current_client_id() to authenticated;
