import { beforeEach, expect, it, vi } from 'vitest';
import { DeliveryControl } from '@/components/orders/DeliveryControl';

// Exercise the actual component handlers and rendered feedback without a browser,
// providers, or DOM effects. State/ref slots persist across explicit renders.
const h = vi.hoisted(() => ({ states: [] as any[], refs: [] as any[], stateIndex: 0, refIndex: 0, refresh: vi.fn() }));
vi.mock('react', async importOriginal => ({
 ...await importOriginal<typeof import('react')>(),
 useState: (initial: any) => {
  const i=h.stateIndex++;
  if(!(i in h.states)) h.states[i]=initial;
  return [h.states[i], (next:any) => {h.states[i]=typeof next==='function'?next(h.states[i]):next;}];
 },
 useRef: (initial:any) => h.refs[h.refIndex++] ?? (h.refs[h.refIndex-1]={current:initial}),
 useEffect: () => {}, useCallback: (fn:any) => fn,
}));
vi.mock('react-dom', () => ({createPortal:(node:any)=>node}));
vi.mock('next/navigation', () => ({useRouter:()=>({refresh:h.refresh})}));
vi.mock('@/components/orders/OrderWorkspace', () => ({useOrderAreaActive:()=>true}));
vi.mock('@/lib/email/templates', () => ({galleryReadyEmail:()=>({subject:'Preview',html:''}),galleryReadySms:()=>''}));
const context={client:{full_name:'Test client',email:'client@example.test',phone:''},listing:null,photoCount:1,mediaCount:0,phone:null,appUrl:'https://example.test',channels:{email:true,sms:false},paywall:{active:false},teammates:[],link:null,history:[]};
const fetchMock=vi.fn();
function render(){h.stateIndex=0;h.refIndex=0;return DeliveryControl({orderId:'order'});}
function nodes(node:any):any[]{if(Array.isArray(node))return node.flatMap(nodes);return node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];}
function text(node:any):string{if(Array.isArray(node))return node.map(text).join('');if(node&&typeof node==='object')return text(node.props?.children);return typeof node==='string'?node:'';}
function button(tree:any,label:string){const b=nodes(tree).find(n=>n.type==='button'&&text(n)===label);expect(b,`button ${label}`).toBeTruthy();return b;}
function feedback(tree:any,role:string){return nodes(tree).filter(n=>n.props?.role===role).map(text).join(' ');}
async function send(){button(render(),'Prepare delivery').props.onClick();await button(render(),'Deliver to client').props.onClick();return render();}
const response=(body:any,ok=true)=>({ok,json:async()=>body});
beforeEach(()=>{
 h.states=[];h.refs=[];h.refresh.mockReset();fetchMock.mockReset();h.states[0]=context;
 vi.stubGlobal('fetch',fetchMock);vi.stubGlobal('document',{body:{}});
});
it('closes after confirmed delivery and announces success outside the dialog',async()=>{
 fetchMock.mockResolvedValueOnce(response({dispatch:{id:'dispatch',status:'sent',is_test:false,recipients:[],created_at:'2026-09-30'}})).mockResolvedValueOnce(response(context));
 const tree=await send();expect(nodes(tree).some(n=>n.props?.role==='dialog')).toBe(false);
 expect(feedback(tree,'status')).toContain('Delivery sent.');expect(feedback(tree,'alert')).toBe('');
 expect(h.refresh).toHaveBeenCalledOnce();expect(fetchMock).toHaveBeenCalledTimes(2);
});
it.each(['partial','failed','needs_review','sending'])('keeps %s visible without claiming success',async status=>{
 fetchMock.mockResolvedValueOnce(response({dispatch:{status}})).mockResolvedValueOnce(response(context));
 const tree=await send();expect(nodes(tree).some(n=>n.props?.role==='dialog')).toBe(true);
 expect(feedback(tree,'alert')).toContain('Check the delivery history');expect(feedback(tree,'status')).not.toContain('sent.');
 expect(button(tree,'Deliver to client').props.disabled).toBe(false);
});
it('preserves confirmed success when the subsequent history refresh fails',async()=>{
 fetchMock.mockResolvedValueOnce(response({dispatch:{id:'dispatch',status:'sent',is_test:false,recipients:[],created_at:'2026-09-30'}})).mockRejectedValueOnce(new Error('offline'));
 const tree=await send();expect(nodes(tree).some(n=>n.props?.role==='dialog')).toBe(false);
 expect(feedback(tree,'status')).toContain('Delivery sent.');expect(feedback(tree,'alert')).toContain('history could not refresh');
});
it('closes and releases busy state before a slow history refresh finishes',async()=>{
 let finish!:(value:any)=>void;
 fetchMock.mockResolvedValueOnce(response({dispatch:{id:'dispatch',status:'sent',is_test:false,recipients:[],created_at:'2026-09-30'}})).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const pending=send();await vi.waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2));
 expect(nodes(render()).some(n=>n.props?.role==='dialog')).toBe(false);expect(h.states[4]).toBe(false);
 button(render(),'Prepare delivery').props.onClick();
 expect(button(render(),'Deliver to client').props.disabled).toBe(true);
 finish(response(context));await pending;
});
it('shows HTTP errors in the open dialog and permits a same-id retry',async()=>{
 fetchMock.mockResolvedValueOnce(response({error:'Provider unavailable'},false));
 const tree=await send();expect(feedback(tree,'alert')).toContain('Provider unavailable');
 expect(feedback(tree,'alert')).toContain('confirm the outcome');expect(button(tree,'Deliver to client').props.disabled).toBe(false);
 const first=JSON.parse(fetchMock.mock.calls[0][1].body);
 fetchMock.mockResolvedValueOnce(response({dispatch:{id:'dispatch',status:'sent',is_test:false,recipients:[],created_at:'2026-09-30'}})).mockResolvedValueOnce(response(context));
 await button(tree,'Deliver to client').props.onClick();
 expect(JSON.parse(fetchMock.mock.calls[1][1].body).request_id).toBe(first.request_id);
});
it('shows interrupted-response errors without announcing success',async()=>{
 fetchMock.mockRejectedValueOnce(new Error('Network interrupted'));
 const tree=await send();expect(feedback(tree,'alert')).toContain('Network interrupted');expect(feedback(tree,'status')).toBe('');
 expect(nodes(tree).some(n=>n.props?.role==='dialog')).toBe(true);
});
it('labels confirmed test delivery separately and closes it',async()=>{
 button(render(),'Prepare delivery').props.onClick();
 const toggle=nodes(render()).find(n=>n.type==='input'&&n.props.type==='checkbox');toggle.props.onChange({target:{checked:true}});
 fetchMock.mockResolvedValueOnce(response({dispatch:{id:'dispatch',status:'sent',is_test:false,recipients:[],created_at:'2026-09-30'}})).mockResolvedValueOnce(response(context));
 await button(render(),'Send test delivery').props.onClick();
 expect(feedback(render(),'status')).toContain('Test delivery sent.');expect(nodes(render()).some(n=>n.props?.role==='dialog')).toBe(false);
 expect(JSON.parse(fetchMock.mock.calls[0][1].body).action).toBe('test');
});
