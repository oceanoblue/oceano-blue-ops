-- products, pricing_tiers, product_recommended_addons had RLS ENABLED but ZERO
-- policies → default-deny. The dashboard reads the catalog via the user's
-- session (RLS-bound) and saw an empty catalog, while the booking wizard worked
-- because it uses the service-role admin client. Grant team read + admin write.

create policy products_select_team on public.products
  for select to authenticated using (is_team_member());
create policy products_write_admin on public.products
  for all to authenticated using (is_team_admin()) with check (is_team_admin());

create policy pricing_tiers_select_team on public.pricing_tiers
  for select to authenticated using (is_team_member());
create policy pricing_tiers_write_admin on public.pricing_tiers
  for all to authenticated using (is_team_admin()) with check (is_team_admin());

create policy prod_rec_addons_select_team on public.product_recommended_addons
  for select to authenticated using (is_team_member());
create policy prod_rec_addons_write_admin on public.product_recommended_addons
  for all to authenticated using (is_team_admin()) with check (is_team_admin());
