import { beforeEach,expect,it,vi } from 'vitest';
import { PATCH } from '@/app/api/invoices/[id]/route';
import { GET } from '@/app/api/reports/billing/route';
import { requireTeamMember } from '@/lib/auth/require-team-member';
import { createClient } from '@/lib/supabase/server';
import { loadInvoices } from './load';
vi.mock('@/lib/auth/require-team-member',()=>({requireTeamMember:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('./load',()=>({loadInvoices:vi.fn(async()=>[])}));
let update:any;
beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireTeamMember).mockResolvedValue({error:null,user:{id:'staff'}} as any);update=vi.fn();const q:any={update:(v:any)=>{update(v);return q;},eq:()=>q,select:()=>q,maybeSingle:async()=>({data:{id:'order'},error:null})};vi.mocked(createClient).mockResolvedValue({from:()=>q} as any);});
const request=(body:any)=>new Request('https://example.test/api/invoices/order',{method:'PATCH',body:JSON.stringify(body)});const ctx={params:Promise.resolve({id:'order'})};
it('denies clients access to changing due dates and exporting staff reports',async()=>{vi.mocked(requireTeamMember).mockResolvedValue({error:new Response('',{status:403}),user:null} as any);expect((await PATCH(request({due_date:'2026-10-01'}),ctx)).status).toBe(403);expect((await GET(new Request('https://example.test/api/reports/billing'))).status).toBe(403);expect(update).not.toHaveBeenCalled();expect(loadInvoices).not.toHaveBeenCalled();});
it('only allows a real date or clearing terms, never changing price or payment state',async()=>{
 expect((await PATCH(request({due_date:'2026-02-30'}),ctx)).status).toBe(400);expect((await PATCH(request({due_date:'2026-10-01',download_paid_at:'now'}),ctx)).status).toBe(400);expect(update).not.toHaveBeenCalled();
 expect((await PATCH(request({due_date:null}),ctx)).status).toBe(200);expect(update).toHaveBeenCalledWith({invoice_due_date:null});
});
