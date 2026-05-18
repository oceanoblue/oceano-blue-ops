-- Add gallery image array on products. Cover image already exists.
alter table products
  add column if not exists gallery_image_urls text[] not null default array[]::text[];
