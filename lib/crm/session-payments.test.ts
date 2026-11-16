import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), create: vi.fn(), retrieve: vi.fn(), stripe: true, appointment: {} as any, payment: {} as any }));
vi.mock("./server", () => ({ crmDb: () => ({ from: m.from, rpc: m.rpc }), CrmError: class extends Error { constructor(message: string, public status=400) { super(message); } } }));
vi.mock("@/lib/stripe/server", () => ({ getStripe: () => m.stripe ? { checkout: { sessions: { create: m.create, retrieve: m.retrieve } } } : null }));
import { requireSessionPayments, sessionCheckout, settleSessionPayment } from "./session-payments";
beforeEach(() => {
 vi.clearAllMocks(); vi.stubEnv("STRIPE_WEBHOOK_SECRET", "fixture");
 m.stripe = true;
 m.appointment={id:"appointment",title:"Family session",email:"test@example.test",manage_token:"a".repeat(64),status:"pending_payment",payment_status:"pending"};
 m.payment={appointment_id:"appointment",amount_cents:35000,expires_at:new Date(Date.now()+45*60000).toISOString(),stripe_session_id:null};
 m.rpc.mockResolvedValue({error:null});
 m.create.mockResolvedValue({id:"cs_fixture",url:"https://checkout.stripe.com/test",status:"open",payment_status:"unpaid"});
 m.from.mockImplementation((table:string)=>{const q:any={};for(const k of ["select","eq","update"])q[k]=()=>q;q.single=async()=>({data:table==="crm_appointments"?m.appointment:m.payment,error:null});q.then=(f:any)=>Promise.resolve({error:null}).then(f);return q;});
});
afterEach(()=>vi.unstubAllEnvs());
it("requires both payment keys before accepting paid sessions",()=>{m.stripe=false;expect(()=>requireSessionPayments()).toThrow("temporarily unavailable");m.stripe=true;vi.stubEnv("STRIPE_WEBHOOK_SECRET","");expect(()=>requireSessionPayments()).toThrow("temporarily unavailable");});
it("uses frozen server price, expiry and stable idempotency without allowing delayed payment methods",async()=>{
 expect(await sessionCheckout("appointment")).toContain("checkout.stripe.com");
 const [params, options]=m.create.mock.calls[0];
 expect(params.payment_method_types).toEqual(["card"]);
 expect(params.line_items[0].price_data.unit_amount).toBe(35000);
 expect(params.expires_at).toBe(Math.floor(Date.parse(m.payment.expires_at)/1000));
 expect(params.metadata).toEqual({photo_appointment_id:"appointment"});
 expect(options).toEqual({idempotencyKey:"photo-session-appointment"});
 await sessionCheckout("appointment");expect(m.create.mock.calls[1]).toEqual(m.create.mock.calls[0]);
});
it("reuses an existing checkout and settles paid return without making a new charge",async()=>{
 m.payment.stripe_session_id="cs_existing";
 m.retrieve.mockResolvedValue({id:"cs_existing",metadata:{photo_appointment_id:"appointment"},mode:"payment",payment_status:"paid",amount_total:35000,currency:"usd"});
 expect(await sessionCheckout("appointment")).toBeNull();expect(m.create).not.toHaveBeenCalled();
 expect(m.rpc).toHaveBeenCalledWith("crm_session_payment_result",{p_id:"appointment",p_session:"cs_existing",p_amount:35000,p_currency:"usd",p_paid:true});
});
it("does not acknowledge unpaid completion as a confirmed booking",async()=>{
 await settleSessionPayment({metadata:{photo_appointment_id:"appointment"},mode:"payment",payment_status:"unpaid",status:"complete"} as any);expect(m.rpc).not.toHaveBeenCalled();
});
it("keeps uncertain holds instead of silently reopening the time",async()=>{
 m.payment.expires_at=new Date(Date.now()+10*60000).toISOString();
 await expect(sessionCheckout("appointment")).rejects.toThrow("time is still held");expect(m.create).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it("returns persistence failures so Stripe retries",async()=>{
 m.rpc.mockResolvedValue({error:{message:"database unavailable"}});
 await expect(settleSessionPayment({id:"cs_fixture",metadata:{photo_appointment_id:"appointment"},mode:"payment",payment_status:"paid",amount_total:35000,currency:"usd"} as any)).rejects.toThrow("verification is pending");
});
