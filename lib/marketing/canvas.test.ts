import {expect,it} from 'vitest';
import {wrapText,templateSizes} from './canvas';
import {propertySchema} from './property';
it('wraps all headline words without dropping the final line and bounds overflowing text',()=>{
 expect(wrapText('One two three four',10,s=>s.length,2)).toEqual(['One two','three four']);expect(wrapText('One two three four five six seven',10,s=>s.length,2)).toEqual(['One two','three fou…']);expect(wrapText('x'.repeat(100),10,s=>s.length,2)[0].length).toBeLessThanOrEqual(10);
});
it('uses print and social export dimensions and rejects unsafe property input',()=>{
 expect(templateSizes.flyer).toEqual([2550,3300]);expect(templateSizes.square).toEqual([1080,1080]);expect(templateSizes.story).toEqual([1080,1920]);
 const site={headline:'Test property',description:'',agent_name:'',agent_phone:'',agent_email:'',asking_price_cents:null,is_published:false};expect(propertySchema.safeParse(site).success).toBe(true);for(const update of [{headline:'  '},{agent_email:'javascript:alert(1)'},{asking_price_cents:-1},{agent_phone:'<script>'},{order_id:'other'}])expect(propertySchema.safeParse({...site,...update}).success).toBe(false);
});
