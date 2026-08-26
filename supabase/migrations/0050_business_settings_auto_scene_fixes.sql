-- Sky/window/lawn auto-fixes on by default (optional). When on, the auto-enhance
-- chains the NON-DESTRUCTIVE scene fixes (sky_replace, window_pull, lawn_enhance)
-- where vision flags them. Destructive ops (declutter/twilight/virtual_stage)
-- always stay opt-in per photo.
alter table public.business_settings
  add column if not exists auto_scene_fixes boolean not null default true;

comment on column public.business_settings.auto_scene_fixes is
  'When on (default), auto-enhance chains NON-DESTRUCTIVE scene fixes (sky replace, window pull, lawn) where vision flags them. Destructive ops stay opt-in.';
