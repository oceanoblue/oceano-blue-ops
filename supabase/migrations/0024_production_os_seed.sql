-- =============================================================
-- Production OS — Seed Data
-- =============================================================
-- Seeds job types, workflow templates, agents, AI models, tools, and
-- integrations. Idempotent: re-running is safe (ON CONFLICT DO NOTHING on
-- the natural keys).
-- =============================================================

-- -----------------------------------------------------------------
-- JOB TYPES
-- -----------------------------------------------------------------
insert into job_types (key, name, category, sort_order) values
  ('real_estate_photo',   'Real Estate Photo',      'photography', 10),
  ('real_estate_video',   'Real Estate Video',      'video',       20),
  ('portrait_headshot',   'Portrait / Headshot',    'photography', 30),
  ('commercial_photo',    'Commercial Photo',       'photography', 40),
  ('commercial_video',    'Commercial Video',       'video',       50),
  ('restaurant_reel',     'Restaurant Reel',        'video',       60),
  ('podcast_episode',     'Podcast Episode',        'podcast',     70),
  ('podcast_clip_package','Podcast Clip Package',   'podcast',     80),
  ('testimonial',         'Testimonial',            'video',       90),
  ('event_highlight',     'Event Highlight',        'video',      100),
  ('homepage_hero',       'Homepage Hero',          'video',      110),
  ('social_cutdown',      'Social Cutdown',         'video',      120),
  ('legal_tv_commercial', 'Legal TV Commercial',    'video',      130),
  ('training_video',      'Training Video',         'video',      140)
on conflict (key) do nothing;

-- -----------------------------------------------------------------
-- WORKFLOW TEMPLATES  (definitions mirror /workflows/*.json)
-- -----------------------------------------------------------------
insert into workflow_templates (key, name, job_type_id, description)
select v.key, v.name, jt.id, v.description
from (values
  ('real_estate_photo_standard', 'Real Estate Photo Standard', 'real_estate_photo',
    'Ingest → bracket grouping → processing → QC → export → delivery.'),
  ('podcast_episode_standard',   'Podcast Episode Standard',   'podcast_episode',
    'Ingest → transcript → show notes → clips → delivery → publishing package.'),
  ('commercial_video_standard',  'Commercial Video Standard',  'commercial_video',
    'Ingest → proxy → transcript → edit recipe → review → QC → delivery.'),
  ('portrait_headshot_standard', 'Portrait / Headshot Standard','portrait_headshot',
    'Ingest → selects → retouch → QC → delivery.'),
  ('restaurant_reel_standard',   'Restaurant Reel Standard',   'restaurant_reel',
    'Ingest → edit recipe → review → QC → delivery.')
) as v(key, name, job_type_key, description)
left join job_types jt on jt.key = v.job_type_key
on conflict (key) do nothing;

-- -----------------------------------------------------------------
-- AI MODELS
-- -----------------------------------------------------------------
insert into ai_models (key, provider, name, roles) values
  ('gpt-image-1',     'openai',    'GPT Image 1',
    array['photo_qc']),
  ('gpt-4o',          'openai',    'GPT-4o',
    array['creative_strategy','script_generation','caption_generation','client_communication','workflow_planning']),
  ('claude-opus',     'anthropic', 'Claude Opus',
    array['creative_strategy','script_generation','code_generation','video_edit_recipe','transcript_analysis','workflow_planning']),
  ('claude-sonnet',   'anthropic', 'Claude Sonnet',
    array['script_generation','caption_generation','transcript_analysis','client_communication'])
on conflict (key) do nothing;

-- -----------------------------------------------------------------
-- AGENTS
-- -----------------------------------------------------------------
insert into agents (key, name, description) values
  ('ai_producer',            'AI Producer',                 'Plans jobs, briefs, and workflows.'),
  ('client_brain',           'Client Brain Agent',          'Applies client DNA / preferences.'),
  ('re_photo_qc',            'Real Estate Photo QC Agent',  'Checks real estate photo quality.'),
  ('bracket_grouping',       'Bracket Grouping Agent',      'Groups bracketed exposures with confidence.'),
  ('podcast_producer',       'Podcast Producer Agent',      'Drives podcast production and deliverables.'),
  ('video_edit_recipe',      'Video Edit Recipe Agent',     'Produces structured edit recipes.'),
  ('social_cutdown',         'Social Cutdown Agent',        'Plans short-form clips from long-form.'),
  ('delivery_assistant',     'Delivery Assistant',          'Prepares delivery messages and packages.'),
  ('automation_supervisor',  'Automation Supervisor',       'Watches Make.com scenarios and tool runs.'),
  ('davinci_timeline',       'DaVinci Timeline Agent',      'Plans DaVinci Resolve timelines (future).'),
  ('editor_instruction',     'Editor Instruction Agent',    'Generates instructions for outsourced editors.')
on conflict (key) do nothing;

-- -----------------------------------------------------------------
-- TOOLS  (registry with risk levels / approval requirements)
-- -----------------------------------------------------------------
insert into tools (key, name, tool_type, risk_level, requires_approval, description) values
  ('raw_conversion',     'RAW Conversion',        'local_worker',          'low',      false, 'Convert RAW files to working format.'),
  ('thumbnail_generate', 'Thumbnail Generation',  'local_worker',          'low',      false, 'Generate thumbnails / contact sheets.'),
  ('bracket_detection',  'Bracket Detection',     'local_worker',          'low',      false, 'Detect HDR bracket groups.'),
  ('transcription',      'Transcription',         'local_worker',          'low',      false, 'Transcribe audio/video.'),
  ('imagen_enhance',     'Imagen AI Enhance',     'imagen_job',            'medium',   false, 'Imagen AI photo enhancement.'),
  ('evoto_edit',         'Evoto Edit',            'evoto_job',             'medium',   false, 'Evoto photo editing.'),
  ('oceano_enhance',     'Oceano Enhance',        'oceano_enhance_job',    'medium',   false, 'In-platform AI photo enhancement (GPT Image 2.0 default; Nano Banana 2/Pro).'),
  ('higgsfield_gen',     'Higgsfield Generation', 'higgsfield_generation', 'medium',   false, 'Generative media via Higgsfield.'),
  ('make_scenario',      'Make.com Scenario',     'make_scenario',         'medium',   false, 'Run a Make.com automation scenario.'),
  ('frame_io_review',    'Frame.io Review',       'frame_io_review',       'medium',   false, 'Create a Frame.io review link.'),
  ('pixieset_delivery',  'Pixieset Delivery',     'pixieset_delivery',     'high',     true,  'Deliver a gallery to a client.'),
  ('vimeo_upload',       'Vimeo Upload',          'vimeo_upload',          'high',     true,  'Publish/upload to Vimeo.'),
  ('client_email',       'Client Email',          'email_send',            'high',     true,  'Send an email to a client.'),
  ('archive_final',      'Archive Final Job',     'manual_action',         'critical', true,  'Archive a finalized job/deliverable.')
on conflict (key) do nothing;

-- -----------------------------------------------------------------
-- INTEGRATIONS  (all start not_connected)
-- -----------------------------------------------------------------
insert into integrations (provider, name) values
  ('make',            'Make.com'),
  ('frame_io',        'Frame.io'),
  ('monday',          'Monday.com'),
  ('google_drive',    'Google Drive'),
  ('dropbox',         'Dropbox'),
  ('vimeo',           'Vimeo'),
  ('pixieset',        'Pixieset'),
  ('notion',          'Notion'),
  ('higgsfield',      'Higgsfield'),
  ('imagen',          'Imagen AI'),
  ('evoto',           'Evoto'),
  ('davinci_resolve', 'DaVinci Resolve'),
  ('lightroom',       'Lightroom')
on conflict (provider) do nothing;

-- -----------------------------------------------------------------
-- APPROVAL POLICIES  (high-risk actions require human approval)
-- -----------------------------------------------------------------
insert into approval_policies (key, name, action, required_role) values
  ('publish_content',    'Publish Content',        'publish',           'producer'),
  ('send_to_client',     'Send to Client',         'send_to_client',    'producer'),
  ('delete_files',       'Delete Files',           'delete',            'admin'),
  ('overwrite_exports',  'Overwrite Exports',      'overwrite',         'producer'),
  ('trigger_paid_tool',  'Trigger Paid Tool',      'trigger_paid_tool', 'producer'),
  ('send_invoice',       'Send Invoice',           'send_invoice',      'admin'),
  ('archive_final_job',  'Archive Final Job',      'archive_final',     'producer')
on conflict (key) do nothing;
