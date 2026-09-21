import { expect, it } from 'vitest';
import { dollarsToCents, servicePrice, serviceEditSchema } from './service-pricing';
const product = {id:'product',name:'Photography',base_price_cents:20000,pricing_tiers:[
  {min_sqft:null,max_sqft:1000,price_cents:20000},
  {min_sqft:1001,max_sqft:1500,price_cents:22500},
  {min_sqft:1501,max_sqft:2500,price_cents:25000},
]};
it.each([[null,20000],[1000,20000],[1001,22500],[1500,22500],[1501,25000]])('matches catalog boundaries for size %s', (size,price) => {
  expect(servicePrice(product,size)).toBe(price);
});
it('converts dollar input without fractional cents', () => {
  expect(dollarsToCents('225')).toBe(22500); expect(dollarsToCents('10.99')).toBe(1099);
  expect(dollarsToCents('-25.50')).toBe(-2550); expect(dollarsToCents('1.001')).toBeNaN(); expect(dollarsToCents('')).toBeNaN();
});
it('rejects malformed invoices before persistence', () => {
  const valid = {expected_updated_at:'2026-09-21T12:00:00.123456+00:00',sqft:null,expected_sqft:null,adjustment_cents:0,items:[{product_id:null,description:'Photo',quantity:1,unit_price_cents:22500}]};
  expect(serviceEditSchema.safeParse(valid).success).toBe(true);
  expect(serviceEditSchema.safeParse({...valid,adjustment_cents:-23000}).success).toBe(false);
  expect(serviceEditSchema.safeParse({...valid,items:[{...valid.items[0],quantity:0}]}).success).toBe(false);
});
