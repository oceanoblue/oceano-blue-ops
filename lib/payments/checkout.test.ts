import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/delivery/[token]/checkout/route';
import { createAdminClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe/server';
vi.mock('@/lib/supabase/server', () => ({createAdminClient:vi.fn()}));
vi.mock('@/lib/stripe/server', () => ({getStripe:vi.fn(),isStripeConfigured:()=>true,getBaseUrl:()=> 'https://example.test'}));
const create=vi.fn();
let total=22500;
let reviews: unknown[]=[];
let reviewError: unknown=null;
beforeEach(() => {
  total=22500; reviews=[]; reviewError=null; vi.clearAllMocks();
  create.mockResolvedValue({url:'https://checkout.stripe.com/fixture'});
  vi.mocked(getStripe).mockReturnValue({checkout:{sessions:{create}}} as any);
  vi.mocked(createAdminClient).mockReturnValue({from:(table:string)=> {
    const data = table==='delivery_links' ? {order_id:'order'} : table==='orders' ? {id:'order',order_number:72,total_cents:total,download_paid_at:null,services_revision:2} : [{description:'Photography',quantity:1,unit_price_cents:22500,total_cents:22500}];
    const chain:any={select:()=>chain,eq:()=>chain,is:()=>chain,single:async()=>({data}),limit:async()=>({data:reviews,error:reviewError}),then:(resolve:any)=>Promise.resolve({data}).then(resolve)};
    return chain;
  }} as any);
});
const checkout=()=>POST(new Request('https://example.test'),{params:Promise.resolve({token:'gallery'})});
it('charges the edited price and includes the invoice revision', async () => {
  expect((await checkout()).status).toBe(200);
  expect(create).toHaveBeenCalledWith(expect.objectContaining({metadata:{order_id:'order',token:'gallery',services_revision:'2'},line_items:[{quantity:1,price_data:{currency:'usd',unit_amount:22500,product_data:{name:'Photography'}}}]}));
});
it('honors order-level adjustments instead of charging the sum of unadjusted lines', async () => {
  total=20000; await checkout();
  expect(create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(20000);
});
it('does not replace an explicitly zero total with the original line-item price', async () => {
  total=0; expect((await checkout()).status).toBe(400); expect(create).not.toHaveBeenCalled();
});
it('prevents another checkout while a captured payment needs review', async () => {
  reviews=[{session_id:'cs_old'}]; expect((await checkout()).status).toBe(409); expect(create).not.toHaveBeenCalled();
});
it('fails closed when payment review status cannot be loaded', async () => {
  reviewError={message:'unavailable'}; expect((await checkout()).status).toBe(503); expect(create).not.toHaveBeenCalled();
});
