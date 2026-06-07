-- =============================================================
-- Production OS — Indexes, updated_at triggers, and RLS
-- =============================================================
-- Performance indexes (section 17 of the handoff), updated_at triggers
-- reusing the existing set_updated_at() function, and conservative
-- internal-only Row Level Security for every new table.
-- =============================================================

-- -----------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------
create index if not exists projects_client_idx on projects(client_id);
create index if not exists projects_status_idx on projects(status);

create index if not exists jobs_client_idx on jobs(client_id);
create index if not exists jobs_project_idx on jobs(project_id);
create index if not exists jobs_type_idx on jobs(job_type_id);
create index if not exists jobs_status_idx on jobs(status);
create index if not exists jobs_due_idx on jobs(due_date);
create index if not exists jobs_assigned_idx on jobs(assigned_to);

create index if not exists assets_job_idx on assets(job_id);
create index if not exists assets_project_idx on assets(project_id);
create index if not exists assets_media_type_idx on assets(media_type);
create index if not exists assets_status_idx on assets(status);
create index if not exists asset_versions_asset_idx on asset_versions(asset_id);
create index if not exists asset_groups_job_idx on asset_groups(job_id);
create index if not exists asset_group_items_group_idx on asset_group_items(group_id);
create index if not exists asset_group_items_asset_idx on asset_group_items(asset_id);

create index if not exists workflow_runs_job_idx on workflow_runs(job_id);
create index if not exists workflow_steps_run_idx on workflow_steps(workflow_run_id);
create index if not exists tool_runs_job_idx on tool_runs(job_id);
create index if not exists tool_runs_status_idx on tool_runs(status);
create index if not exists tool_runs_provider_idx on tool_runs(provider);

create index if not exists ai_tasks_job_idx on ai_tasks(job_id);
create index if not exists ai_tasks_status_idx on ai_tasks(status);
create index if not exists external_links_job_idx on external_links(job_id);
create index if not exists approvals_job_idx on approvals(job_id);
create index if not exists approvals_status_idx on approvals(status);

create index if not exists podcast_episodes_show_idx on podcast_episodes(show_id);
create index if not exists podcast_deliverables_episode_idx on podcast_deliverables(episode_id);
create index if not exists transcripts_job_idx on transcripts(job_id);
create index if not exists edit_recipes_job_idx on edit_recipes(job_id);
create index if not exists resolve_projects_job_idx on resolve_projects(job_id);

create index if not exists review_sessions_job_idx on review_sessions(job_id);
create index if not exists review_sessions_status_idx on review_sessions(status);
create index if not exists review_comments_session_idx on review_comments(review_session_id);
create index if not exists qc_reports_job_idx on qc_reports(job_id);
create index if not exists quality_score_events_job_idx on quality_score_events(job_id);
create index if not exists delivery_versions_job_idx on delivery_versions(job_id);
create index if not exists delivery_versions_status_idx on delivery_versions(status);

create index if not exists worker_tasks_worker_idx on worker_tasks(worker_id);
create index if not exists worker_tasks_status_idx on worker_tasks(status);
create index if not exists editor_assignments_job_idx on editor_assignments(job_id);
create index if not exists production_events_job_idx on production_events(job_id);
create index if not exists production_events_created_idx on production_events(created_at desc);

-- -----------------------------------------------------------------
-- updated_at triggers (reuse existing set_updated_at())
-- -----------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'user_profiles','client_profiles','projects','jobs',
    'storage_locations','assets','asset_groups',
    'workflow_templates','workflow_runs','workflow_steps','tool_runs',
    'ai_models','agents','prompt_templates','ai_tasks','tools','integrations',
    'approval_policies','approvals',
    'automation_scenarios','podcast_shows','podcast_episodes','podcast_deliverables',
    'transcripts','edit_recipes','resolve_projects',
    'review_sessions','review_comments','qc_reports','delivery_versions',
    'local_workers','worker_tasks','editor_assignments'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format(
      'create trigger %I before update on %I for each row execute procedure set_updated_at()',
      t || '_updated_at', t
    );
  end loop;
end $$;

-- -----------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Phase 1: conservative internal-only access. An "internal user" is any
-- active team_member (existing model) or any active user_profile holding
-- an internal role. Client/external-editor scoping comes in a later phase.
-- -----------------------------------------------------------------
create or replace function is_internal_user()
returns boolean language sql stable security definer as $$
  select
    exists (
      select 1 from team_members
      where id = auth.uid() and is_active = true
    )
    or exists (
      select 1 from user_profiles
      where id = auth.uid() and is_active = true
        and role in ('owner','admin','producer','editor','photo_editor','video_editor')
    );
$$;

do $$
declare
  t text;
  tables text[] := array[
    'user_profiles','client_profiles','projects','project_members','job_types','jobs',
    'storage_locations','assets','asset_versions','asset_groups','asset_group_items',
    'workflow_templates','workflow_runs','workflow_steps','tool_runs',
    'ai_models','agents','prompt_templates','ai_tasks','tools','integrations',
    'external_links','approval_policies','approvals',
    'automation_scenarios','podcast_shows','podcast_episodes','podcast_deliverables',
    'transcripts','edit_recipes','resolve_projects',
    'review_sessions','review_comments','qc_reports','quality_score_events','delivery_versions',
    'local_workers','worker_tasks','editor_assignments','production_events'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', 'internal rw ' || t, t);
    execute format(
      'create policy %I on %I for all using (is_internal_user()) with check (is_internal_user())',
      'internal rw ' || t, t
    );
  end loop;
end $$;
