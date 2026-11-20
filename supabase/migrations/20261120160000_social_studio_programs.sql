-- Social Studio: what each client program was sold (fee, term, rates), where
-- its onboarding stands, and the terms its content must avoid. Additive only.

alter table public.social_programs
  -- Agreed monthly fee, in cents.
  add column monthly_fee_cents integer not null default 0 check (monthly_fee_cents between 0 and 100000000),
  -- What one account adds to or removes from the fee when the list changes.
  add column account_rate_cents integer not null default 0 check (account_rate_cents between 0 and 100000000),
  -- The fee never drops below this, however many accounts leave.
  add column minimum_fee_cents integer not null default 0 check (minimum_fee_cents between 0 and 100000000),
  add column term_start date,
  add column term_months integer not null default 0 check (term_months between 0 and 60),
  -- Day of the month the client's media is due for the following month.
  add column media_due_day integer check (media_due_day between 1 and 28),
  add column agreement_url text not null default '' check (length(agreement_url) <= 500),
  -- Onboarding checklist: step key -> date it was completed (YYYY-MM-DD).
  add column onboarding jsonb not null default '{}'::jsonb check (jsonb_typeof(onboarding) = 'object'),
  -- Words or phrases no caption in this program may use (brand rules).
  add column avoid_terms text[] not null default '{}' check (cardinality(avoid_terms) <= 40);

alter table public.social_accounts
  add column avoid_terms text[] not null default '{}' check (cardinality(avoid_terms) <= 40);
