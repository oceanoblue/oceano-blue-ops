-- Demo data so the dashboard isn't empty on first run.
-- Run AFTER you've added at least one team_member.

insert into clients (email, full_name, brokerage, phone) values
  ('agent1@example.com', 'Marcus Wright', 'Coastline Realty', '555-0100'),
  ('agent2@example.com', 'Priya Patel', 'Bay Group', '555-0101')
on conflict (email) do nothing;

insert into listings (client_id, address_line1, city, state, zip, bedrooms, bathrooms, sqft, status)
select c.id, '124 Sea Glass Way', 'Asbury Park', 'NJ', '07712', 4, 2.5, 2150, 'active'
from clients c where c.email = 'agent1@example.com'
on conflict do nothing;

insert into listings (client_id, address_line1, city, state, zip, bedrooms, bathrooms, sqft, status)
select c.id, '88 Beach Plum Ln', 'Long Beach', 'NY', '11561', 3, 2, 1620, 'active'
from clients c where c.email = 'agent2@example.com'
on conflict do nothing;

insert into orders (listing_id, client_id, status, scheduled_at, package_name)
select l.id, l.client_id, 'scheduled', now() + interval '2 days', 'Premium'
from listings l where l.address_line1 = '124 Sea Glass Way'
on conflict do nothing;

insert into orders (listing_id, client_id, status, scheduled_at, package_name)
select l.id, l.client_id, 'processing', now() - interval '1 day', 'Essential'
from listings l where l.address_line1 = '88 Beach Plum Ln'
on conflict do nothing;
