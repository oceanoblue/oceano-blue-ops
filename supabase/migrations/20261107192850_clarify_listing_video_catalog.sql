-- Correct the real-estate floor-plan price and distinguish a home walkthrough
-- from an aerial-only shoot. Existing order items retain their booked snapshots.
-- Video prices, size tiers, product identities and drone add-ons are unchanged.

update public.products
set base_price_cents = 10000
where slug = 'floor_plan';

update public.products
set name = 'Listing Walkthrough Video',
    short_description = 'Interior and exterior walkthrough video of the home.',
    long_description = 'A horizontal listing video featuring interior rooms, exterior features, and the flow of the home. Choose this service for a home-tour or listing walkthrough video. Aerial drone footage is a separate service.'
where slug = 'cinematic_video';

update public.products
set name = 'Aerial Photos + Drone Video Only',
    short_description = 'Aerial photos and drone video only. No interior walkthrough.',
    long_description = 'Drone photography and video of the property from the air, highlighting the lot, surroundings, and views. This aerial-only package does not include an interior or ground-level walkthrough. Select Listing Walkthrough Video for a home-tour video.'
where slug = 'drone_photos_video';
