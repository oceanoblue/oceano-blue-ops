-- =============================================================
-- 0034: Own the enhance tooling — drop the external placeholder catalog
-- entries now that enhancement runs in-platform.
-- =============================================================
-- The AI enhance pipeline is now native to POS (GPT Image 2.0 default,
-- Nano Banana 2 / Pro secondary), so the old external photo-editing
-- tool/integration placeholders are obsolete.
--
-- Idempotent + FK-safe: tools.key and integrations.provider are unique text
-- columns with no inbound foreign keys, and no application code references
-- these rows by key.
-- =============================================================

-- Register the owned in-platform enhance tool (no-op if 0024 already seeded it).
insert into tools (key, name, tool_type, risk_level, requires_approval, description) values
  ('oceano_enhance', 'Oceano Enhance', 'oceano_enhance_job', 'medium', false,
   'In-platform AI photo enhancement (GPT Image 2.0 default; Nano Banana 2/Pro).')
on conflict (key) do nothing;

-- Remove the external editing placeholders.
delete from tools where key = 'fotello_edit';
delete from integrations where provider = 'fotello';
