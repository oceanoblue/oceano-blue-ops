-- Restore the $100 drone-video add-on under Listing Walkthrough Video.
-- Standalone aerial prices and saved order items are separate and unchanged.
update public.products
set base_price_cents = 10000,
    is_active = true,
    updated_at = now()
where slug = 'drone_video';
