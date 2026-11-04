-- Property showcase: richer public listing pages.
-- gallery_urls: public HTTPS photo links shown when an order has no finished
--   photos of its own (client-supplied listing photos), or in addition to them.
-- hero_image_url: optional full-bleed hero (a graded film still, for example).
-- community / facts / area_description: presentation copy that is not on the listing row.
alter table public.property_sites
 add column gallery_urls text[] not null default '{}' check(cardinality(gallery_urls)<=150),
 add column hero_image_url text not null default '' check(length(hero_image_url)<=2000),
 add column community text not null default '' check(length(community)<=120),
 add column tagline text not null default '' check(length(tagline)<=200),
 add column facts text not null default '' check(length(facts)<=2000),
 add column area_description text not null default '' check(length(area_description)<=3000),
 add column agent_names text not null default '' check(length(agent_names)<=160);
