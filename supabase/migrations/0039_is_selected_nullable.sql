-- 0039_is_selected_nullable.sql
-- Reliability + correctness: photos.is_selected is NOT NULL, but the Review UI
-- and /api/photos/decide implement a TRI-STATE — approve (true), reject (false),
-- and reset/undecided (null). The 'reset' path (e.g. un-approving a photo) wrote
-- NULL into a NOT NULL column, which throws at runtime: un-approve was broken.
--
-- Drop the NOT NULL so the neutral state is representable. Default stays true
-- (the keeper/opt-out model is unchanged), so existing rows and new inserts are
-- unaffected; only the previously-crashing reset path is fixed. Delivery still
-- filters is_selected = true, so neutral (null) is excluded as intended.

alter table public.photos alter column is_selected drop not null;
