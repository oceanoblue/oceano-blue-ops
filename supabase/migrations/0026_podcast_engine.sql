-- =============================================================
-- Podcast Production Engine v1
-- =============================================================
-- Small, additive schema for wrapping the existing Make.com podcast
-- pipeline. Make stays the runtime; Production OS is the source of truth.
-- No existing columns are changed; everything else fits existing jsonb/text.
-- =============================================================

-- Show registry moves into POS. `slug` is the lookup key Make sends; `metadata`
-- holds non-secret config (dropbox watch path, airtable show id, youtube defaults).
alter table podcast_shows
  add column if not exists slug text;
alter table podcast_shows
  add column if not exists metadata jsonb not null default '{}';

create unique index if not exists podcast_shows_slug_key on podcast_shows(slug);

-- Transcript chapters / provider id (AssemblyAI auto_chapters) ride in metadata.
alter table transcripts
  add column if not exists metadata jsonb not null default '{}';

-- -----------------------------------------------------------------
-- Seed: one GENERIC Make scenario keyed by show_slug (decision #3),
-- plus the Defining Wealth show. Idempotent.
-- -----------------------------------------------------------------
insert into automation_scenarios (provider, name, trigger, status, config)
select 'make', 'Podcast Publish (generic)', 'dropbox:new_file', 'active',
       '{"keyed_by":"show_slug","callback_event":"podcast_publish","youtube_privacy":"unlisted","require_approval_before_publish":true}'::jsonb
where not exists (
  select 1 from automation_scenarios where provider = 'make' and name = 'Podcast Publish (generic)'
);

insert into podcast_shows (slug, name, default_language, publishing_platforms, metadata)
select 'defining-wealth', 'Defining Wealth', 'en', '["youtube"]'::jsonb, '{}'::jsonb
where not exists (select 1 from podcast_shows where slug = 'defining-wealth');
