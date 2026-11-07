import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { computeQuoteItems } from './pricing';

type Product = { id: string; slug: string; name: string; base_price_cents: number };
function client(products: Product[] = []) {
  const rpc = vi.fn().mockResolvedValue({ data: 60000 });
  return {
    admin: {
      from: () => ({ select: () => ({ in: async () => ({ data: products }) }) }),
      rpc,
    } as unknown as Parameters<typeof computeQuoteItems>[0],
    rpc,
  };
}

it('uses catalog names and the video size tier for a walkthrough with a floor plan', async () => {
  const { admin, rpc } = client([
    { id: 'video', slug: 'cinematic_video', name: 'Listing Walkthrough Video', base_price_cents: 65000 },
    { id: 'floor', slug: 'floor_plan', name: 'Floor Plan', base_price_cents: 10000 },
  ]);
  const quote = await computeQuoteItems(admin, 4200, ['cinematic_video', 'floor_plan']);
  expect(quote.items).toMatchObject([
    { slug: 'cinematic_video', name: 'Listing Walkthrough Video', price_cents: 60000 },
    { slug: 'floor_plan', name: 'Floor Plan', price_cents: 10000 },
  ]);
  expect(quote.subtotal_cents).toBe(70000);
  expect(rpc).toHaveBeenCalledWith('price_for_sqft', { p_product_id: 'video', p_sqft: 4200 });
});

it('keeps the aerial bundle at its catalog price with its explicit catalog label', async () => {
  const { admin } = client([
    { id: 'aerial', slug: 'drone_photos_video', name: 'Aerial Photos + Drone Video Only', base_price_cents: 30000 },
  ]);
  const quote = await computeQuoteItems(admin, 4200, ['drone_photography', 'drone_video']);
  expect(quote.items).toMatchObject([
    { slug: 'drone', name: 'Aerial Photos + Drone Video Only', price_cents: 30000 },
  ]);
  expect(quote.subtotal_cents).toBe(30000);
});

it('falls back to $100 for a floor plan while retaining an included floor plan at no charge', async () => {
  const { admin } = client();
  expect((await computeQuoteItems(admin, 4200, ['floor_plan'])).subtotal_cents).toBe(10000);
  const bundled = await computeQuoteItems(admin, 4200, ['three_d_floor_plan', 'floor_plan']);
  expect(bundled.items).toContainEqual({ slug: 'floor_plan', name: 'Floor Plan', price_cents: 0, complimentary: true });
  expect(bundled.subtotal_cents).toBe(20000);
});

it('updates only the intended catalog fields and preserves video tiers and booked order snapshots', async () => {
  const migrationName = readdirSync('supabase/migrations').find(name => name.endsWith('_clarify_listing_video_catalog.sql'));
  if (!migrationName) throw new Error('Missing catalog clarification migration');
  const migration = readFileSync(`supabase/migrations/${migrationName}`, 'utf8');
  const pricingFunction = readFileSync('supabase/migrations/0006_products_and_wizard.sql', 'utf8')
    .match(/create or replace function price_for_sqft[\s\S]*?\$\$;/)?.[0];
  if (!pricingFunction) throw new Error('Missing price_for_sqft definition');
  const db = new PGlite();
  try {
    await db.exec(`
      create table products (
        id uuid primary key default gen_random_uuid(), slug text unique, name text,
        short_description text, long_description text, base_price_cents int,
        standalone_price_cents int, is_active boolean default true
      );
      create table pricing_tiers (product_id uuid references products(id), min_sqft int, max_sqft int, price_cents int);
      create table orders (id int primary key, subtotal_cents int, total_cents int, services_revision int);
      create table order_items (order_id int references orders(id), product_id uuid references products(id), description text,
        quantity int, unit_price_cents int, total_cents int);
      insert into products (slug, name, base_price_cents, standalone_price_cents, is_active) values
        ('floor_plan', 'Floor Plan', 9500, null, true),
        ('cinematic_video', 'Cinematic Videography', 65000, null, true),
        ('drone_photos_video', 'Drone Photos + Video', 30000, 30000, true),
        ('drone_video', 'Drone Video', 20000, 25000, false),
        ('arch_floor_plan', 'Interactive floor plan', 9500, null, true);
      insert into pricing_tiers
        select id, tier.min_sqft, tier.max_sqft, tier.price_cents
        from products cross join (values (null::int, 3500, 55000), (3501, 5000, 60000), (5001, 7500, 65000))
          as tier(min_sqft, max_sqft, price_cents)
        where slug = 'cinematic_video';
      insert into orders values (1, 39500, 39500, 0);
      insert into order_items
        select 1, id, name, 1, base_price_cents, base_price_cents
        from products where slug in ('floor_plan', 'drone_photos_video');
    `);
    await db.exec(pricingFunction);
    const tiersBefore = (await db.query('select * from pricing_tiers order by min_sqft nulls first')).rows;
    const ordersBefore = (await db.query('select * from orders')).rows;
    const itemsBefore = (await db.query('select * from order_items order by product_id')).rows;
    const identitiesBefore = (await db.query('select id, slug from products order by slug')).rows;
    await db.exec(migration);
    const catalog = (await db.query('select slug, name, base_price_cents, standalone_price_cents, is_active from products order by slug')).rows;
    expect(catalog).toEqual([
      { slug: 'arch_floor_plan', name: 'Interactive floor plan', base_price_cents: 9500, standalone_price_cents: null, is_active: true },
      { slug: 'cinematic_video', name: 'Listing Walkthrough Video', base_price_cents: 65000, standalone_price_cents: null, is_active: true },
      { slug: 'drone_photos_video', name: 'Aerial Photos + Drone Video Only', base_price_cents: 30000, standalone_price_cents: 30000, is_active: true },
      { slug: 'drone_video', name: 'Drone Video', base_price_cents: 20000, standalone_price_cents: 25000, is_active: false },
      { slug: 'floor_plan', name: 'Floor Plan', base_price_cents: 10000, standalone_price_cents: null, is_active: true },
    ]);
    expect((await db.query("select slug, price_for_sqft(id, 4200) as price from products where slug in ('floor_plan', 'cinematic_video', 'drone_photos_video') order by slug")).rows).toEqual([
      { slug: 'cinematic_video', price: 60000 },
      { slug: 'drone_photos_video', price: 30000 },
      { slug: 'floor_plan', price: 10000 },
    ]);
    expect((await db.query('select id, slug from products order by slug')).rows).toEqual(identitiesBefore);
    expect((await db.query('select * from pricing_tiers order by min_sqft nulls first')).rows).toEqual(tiersBefore);
    expect((await db.query('select * from orders')).rows).toEqual(ordersBefore);
    expect((await db.query('select * from order_items order by product_id')).rows).toEqual(itemsBefore);
    await db.exec(migration);
    expect((await db.query('select slug, name, base_price_cents, standalone_price_cents, is_active from products order by slug')).rows).toEqual(catalog);
  } finally {
    await db.close();
  }
}, 30000);
