alter table public.orders add column invoice_due_date date;
comment on column public.orders.invoice_due_date is 'Optional client invoice due date set by staff; no implicit terms for existing orders.';
