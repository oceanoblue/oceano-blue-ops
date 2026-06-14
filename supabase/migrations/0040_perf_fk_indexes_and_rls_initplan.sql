-- 0040_perf_fk_indexes_and_rls_initplan.sql
-- Performance only — no behavior or authorization change.
--
-- (1) Covering indexes for every foreign key that lacked one (Supabase perf
--     advisor: 61 unindexed_foreign_keys). FK joins and ON DELETE/UPDATE
--     cascades do sequential scans without these; they bite hard at scale.
-- (2) RLS auth_rls_initplan fix for the 5 flagged policies: wrap auth.uid() /
--     is_team_member() in a scalar subselect so Postgres evaluates them ONCE
--     per statement (initplan) instead of once per row. Identical predicate
--     logic — only the evaluation strategy changes.
--
-- All additive / idempotent.

-- ─── (1) Foreign-key covering indexes ──────────────────────────────────────
create index if not exists ix_activity_log_order_id on public.activity_log (order_id);
create index if not exists ix_activity_log_listing_id on public.activity_log (listing_id);
create index if not exists ix_agents_default_model_id on public.agents (default_model_id);
create index if not exists ix_ai_jobs_created_by on public.ai_jobs (created_by);
create index if not exists ix_ai_tasks_tool_run_id on public.ai_tasks (tool_run_id);
create index if not exists ix_ai_tasks_created_by on public.ai_tasks (created_by);
create index if not exists ix_ai_tasks_agent_id on public.ai_tasks (agent_id);
create index if not exists ix_ai_tasks_model_id on public.ai_tasks (model_id);
create index if not exists ix_approvals_ai_task_id on public.approvals (ai_task_id);
create index if not exists ix_approvals_policy_id on public.approvals (policy_id);
create index if not exists ix_approvals_tool_run_id on public.approvals (tool_run_id);
create index if not exists ix_approvals_requested_by on public.approvals (requested_by);
create index if not exists ix_approvals_decided_by on public.approvals (decided_by);
create index if not exists ix_asset_groups_reviewed_by on public.asset_groups (reviewed_by);
create index if not exists ix_asset_versions_created_by on public.asset_versions (created_by);
create index if not exists ix_assets_created_by on public.assets (created_by);
create index if not exists ix_assets_storage_location_id on public.assets (storage_location_id);
create index if not exists ix_delivery_links_created_by on public.delivery_links (created_by);
create index if not exists ix_delivery_links_order_id on public.delivery_links (order_id);
create index if not exists ix_delivery_versions_storage_location_id on public.delivery_versions (storage_location_id);
create index if not exists ix_delivery_versions_created_by on public.delivery_versions (created_by);
create index if not exists ix_delivery_versions_approved_by on public.delivery_versions (approved_by);
create index if not exists ix_edit_recipes_approved_by on public.edit_recipes (approved_by);
create index if not exists ix_edit_recipes_created_by on public.edit_recipes (created_by);
create index if not exists ix_editor_assignments_editor_user_id on public.editor_assignments (editor_user_id);
create index if not exists ix_editor_assignments_edit_recipe_id on public.editor_assignments (edit_recipe_id);
create index if not exists ix_external_links_created_by on public.external_links (created_by);
create index if not exists ix_external_links_project_id on public.external_links (project_id);
create index if not exists ix_external_links_asset_id on public.external_links (asset_id);
create index if not exists ix_jobs_created_by on public.jobs (created_by);
create index if not exists ix_order_items_product_id on public.order_items (product_id);
create index if not exists ix_orders_photographer_id on public.orders (photographer_id);
create index if not exists ix_orders_editor_id on public.orders (editor_id);
create index if not exists ix_orders_coordinator_id on public.orders (coordinator_id);
create index if not exists ix_photos_parent_photo_id on public.photos (parent_photo_id);
create index if not exists ix_photos_uploaded_by on public.photos (uploaded_by);
create index if not exists ix_podcast_deliverables_asset_id on public.podcast_deliverables (asset_id);
create index if not exists ix_podcast_episodes_job_id on public.podcast_episodes (job_id);
create index if not exists ix_podcast_shows_client_id on public.podcast_shows (client_id);
create index if not exists ix_product_recommended_addons_addon_id on public.product_recommended_addons (addon_id);
create index if not exists ix_production_events_project_id on public.production_events (project_id);
create index if not exists ix_project_members_user_id on public.project_members (user_id);
create index if not exists ix_projects_created_by on public.projects (created_by);
create index if not exists ix_prompt_templates_agent_id on public.prompt_templates (agent_id);
create index if not exists ix_qc_reports_asset_id on public.qc_reports (asset_id);
create index if not exists ix_qc_reports_reviewed_by on public.qc_reports (reviewed_by);
create index if not exists ix_quality_score_events_asset_id on public.quality_score_events (asset_id);
create index if not exists ix_quality_score_events_qc_report_id on public.quality_score_events (qc_report_id);
create index if not exists ix_resolve_projects_edit_recipe_id on public.resolve_projects (edit_recipe_id);
create index if not exists ix_review_sessions_created_by on public.review_sessions (created_by);
create index if not exists ix_schedule_blocks_team_member_id on public.schedule_blocks (team_member_id);
create index if not exists ix_tool_runs_created_by on public.tool_runs (created_by);
create index if not exists ix_tool_runs_workflow_step_id on public.tool_runs (workflow_step_id);
create index if not exists ix_transcripts_asset_id on public.transcripts (asset_id);
create index if not exists ix_transcripts_episode_id on public.transcripts (episode_id);
create index if not exists ix_user_profiles_team_member_id on public.user_profiles (team_member_id);
create index if not exists ix_worker_tasks_job_id on public.worker_tasks (job_id);
create index if not exists ix_workflow_runs_created_by on public.workflow_runs (created_by);
create index if not exists ix_workflow_runs_workflow_template_id on public.workflow_runs (workflow_template_id);
create index if not exists ix_workflow_steps_assignee_id on public.workflow_steps (assignee_id);
create index if not exists ix_workflow_templates_job_type_id on public.workflow_templates (job_type_id);

-- ─── (2) RLS initplan fix (wrap auth calls in a scalar subselect) ───────────
drop policy if exists "client read own row" on public.clients;
create policy "client read own row" on public.clients
  for select to public
  using (auth_user_id = (select auth.uid()));

drop policy if exists "self read calendar connection" on public.team_calendar_connections;
create policy "self read calendar connection" on public.team_calendar_connections
  for select to public
  using (
    (team_member_id = (select auth.uid()))
    or exists (
      select 1 from public.team_members tm
      where tm.id = (select auth.uid()) and tm.role = 'admin'::team_role
    )
  );

drop policy if exists "self rw calendar connection" on public.team_calendar_connections;
create policy "self rw calendar connection" on public.team_calendar_connections
  for all to public
  using (
    (team_member_id = (select auth.uid()))
    or exists (
      select 1 from public.team_members tm
      where tm.id = (select auth.uid()) and tm.role = 'admin'::team_role
    )
  )
  with check (
    (team_member_id = (select auth.uid()))
    or exists (
      select 1 from public.team_members tm
      where tm.id = (select auth.uid()) and tm.role = 'admin'::team_role
    )
  );

drop policy if exists "team_members admin update" on public.team_members;
create policy "team_members admin update" on public.team_members
  for update to public
  using (
    ((select auth.uid()) = id)
    or exists (
      select 1 from public.team_members tm
      where tm.id = (select auth.uid()) and tm.role = 'admin'::team_role
    )
  );

drop policy if exists "team_members self select" on public.team_members;
create policy "team_members self select" on public.team_members
  for select to public
  using (((select auth.uid()) = id) or (select is_team_member()));
