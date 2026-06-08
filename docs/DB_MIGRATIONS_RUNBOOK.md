# Database Migrations Runbook (production)

How to apply Supabase migrations to the **live** project using the manual
GitHub Actions workflow `.github/workflows/db-migrate.yml`.

> This workflow is **manual only** (`workflow_dispatch`) — it never runs on push
> or PR. No secrets are stored in the repo; everything comes from GitHub Actions
> / Environment secrets. It defaults to a **dry run** and requires you to type
> the target project ref to confirm, so it can't apply to the wrong project by
> accident.

---

## 1. Secrets you need to add

| Secret | Required | What it is |
|--------|----------|------------|
| `SUPABASE_ACCESS_TOKEN` | ✅ | A Supabase **personal access token** (Supabase dashboard → Account → Access Tokens). Authenticates the CLI. |
| `SUPABASE_PROJECT_REF` | ✅ | The target project's **ref** (Project Settings → General → "Reference ID", e.g. `abcdefghijklmnop`). |
| `SUPABASE_DB_PASSWORD` | ✅ | The project's **database password** (Project Settings → Database). Needed for non-interactive `supabase link` / `db push`. |

No other values are required. **Never commit any of these to the repo.**

## 2. Where to add them in GitHub

Recommended: scope them to a protected **Environment** named `production`
(the workflow uses `environment: production`):

1. GitHub → the repo → **Settings → Environments → New environment** → name it
   `production`.
2. (Recommended) Under that environment, add **Required reviewers** so a human
   must approve each run, and optionally restrict to the `main` branch.
3. In the `production` environment, **Add secret** for each of the three secrets
   above.

Alternative: **Settings → Secrets and variables → Actions → New repository
secret** (repo-wide). Environment secrets are preferred because they add the
approval gate and keep production scoped.

## 3. How to manually trigger the workflow

1. GitHub → **Actions** → **"DB Migrate (manual)"** → **Run workflow**.
2. Inputs:
   - **confirm_project_ref**: type the exact project ref (must equal the
     `SUPABASE_PROJECT_REF` secret, or the run aborts).
   - **dry_run**: leave **checked** for a preview first. Run once with dry-run to
     see the pending migrations, then run again with dry-run **unchecked** to
     apply.
3. If the `production` environment has required reviewers, approve the run when
   prompted.

The job installs the Supabase CLI, links to the project, lists local-vs-remote
migrations, and then either previews (`supabase db push --dry-run`) or applies
(`supabase db push`) per the repo convention.

## 4. How to verify migrations 0015–0025

- In the workflow logs, the **"List migrations"** / **"Post-apply migration
  list"** steps should show `0015`–`0025` as applied (present on remote).
- Or locally/CLI: `supabase migration list` — confirm `0015`–`0025` appear on the
  remote side.
- These migrations are **additive and idempotent**; re-running is safe.

## 5. How to confirm the thumbnails bucket and new tables exist

Run in the **Supabase SQL editor** after applying:

```sql
-- 40 new Production OS tables → expect 40
select count(*) from information_schema.tables
where table_schema = 'public' and table_name in (
 'user_profiles','project_members','client_profiles','projects','job_types','jobs',
 'storage_locations','assets','asset_versions','asset_groups','asset_group_items',
 'workflow_templates','workflow_runs','workflow_steps','tool_runs',
 'ai_models','agents','prompt_templates','ai_tasks','tools','integrations','external_links','approval_policies','approvals',
 'automation_scenarios','podcast_shows','podcast_episodes','podcast_deliverables','transcripts','edit_recipes','resolve_projects',
 'review_sessions','review_comments','qc_reports','quality_score_events','delivery_versions',
 'local_workers','worker_tasks','editor_assignments','production_events');

-- seed data → expect 14, 5, 11, 4, 14, 14, 7
select (select count(*) from job_types), (select count(*) from workflow_templates),
       (select count(*) from agents), (select count(*) from ai_models),
       (select count(*) from tools), (select count(*) from integrations),
       (select count(*) from approval_policies);

-- RLS active on new tables → expect true
select bool_and(relrowsecurity) from pg_class
where relname in ('jobs','assets','projects','tool_runs','delivery_versions','production_events');

-- thumbnails private bucket → expect one row, public = false
select id, public from storage.buckets where id = 'thumbnails';
```

Then load the app: `/dashboard` (existing real estate — still works) and
`/dashboard/command-center` (new Production OS — should render instead of erroring).

## 6. How to avoid running against the wrong Supabase project

- The workflow **requires** you to type `confirm_project_ref`, and **aborts**
  unless it exactly matches the `SUPABASE_PROJECT_REF` secret.
- It **defaults to dry-run**; applying requires explicitly unchecking dry-run.
- Use the protected `production` **Environment** with required reviewers so a
  second person approves each apply.
- `concurrency` prevents two migration runs at once.
- Double-check the ref in **Project Settings → General → Reference ID** before
  configuring the secret.

---

### Notes
- Migrations `0015`–`0025` are additive (no destructive operations); legacy
  real-estate tables are untouched; bridge columns are nullable with no backfill.
- If the project's migration history was not previously CLI-tracked, the first
  `db push` may report already-applied legacy migrations — review the dry-run
  output. As a fallback you can paste `0015`→`0025` (in order) into the SQL
  editor; they are idempotent.
