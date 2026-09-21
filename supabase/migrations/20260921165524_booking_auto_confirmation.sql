begin;
alter table public.business_settings add column auto_confirm_bookings boolean not null default false;
alter table public.orders add column assignment_confirmation_mode text not null default 'legacy'
  check (assignment_confirmation_mode in ('legacy','manual','automatic'));
comment on column public.business_settings.auto_confirm_bookings is 'Confirm new scheduled assignment versions immediately. Existing assignments retain their policy and response state.';
comment on column public.orders.assignment_confirmation_mode is 'Policy snapshot; automatic confirmation is not a personal contractor acceptance.';

commit;
