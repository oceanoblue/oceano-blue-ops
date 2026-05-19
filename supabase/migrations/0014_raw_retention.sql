-- RAW retention: how many days to keep ARW / CR2 / NEF / DNG / RAF / RW2 / ORF
-- originals after an order is delivered. The daily cron cleans up anything
-- older than this. 0 = never auto-delete.

alter table business_settings
add column if not exists raw_retention_days int not null default 30;
