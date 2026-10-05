import { expect,it } from 'vitest';
import { attribution,campaignLink,eventSchema,inquirySchema } from './performance';
import { propertySchema } from './property';
it('attributes tagged campaigns and avoids lookalike social hosts',()=>{
 expect(attribution(new URLSearchParams('utm_source=Instagram&utm_campaign=derby'),'https://facebook.com')).toEqual({source:'instagram',campaign:'derby'});
 expect(attribution(new URLSearchParams(),'https://instagram.com.evil.test')).toEqual({source:'referral',campaign:''});
 expect(attribution(new URLSearchParams(),'https://l.facebook.com/')).toEqual({source:'facebook',campaign:''});
 expect(new URL(campaignLink('/property/derby','print')).searchParams.get('utm_medium')).toBe('qr');
});
it('limits events and requires explicit inquiry consent and valid contact information',()=>{
 const id='00000000-0000-4000-8000-000000000001';
 expect(eventSchema.safeParse({event:'form_submit',session_id:id,event_id:id}).success).toBe(false);
 expect(inquirySchema.safeParse({name:'Buyer',email:'buyer@example.test',message:'Please contact me',consent:false,submission_id:id}).success).toBe(false);
 expect(inquirySchema.safeParse({name:'Buyer',email:'buyer@example.test',message:'Please contact me',consent:true,submission_id:id}).success).toBe(true);
});
it('rejects unsafe media links and reserved addresses',()=>{
 const base={headline:'Property',description:'',agent_name:'',agent_phone:'',agent_email:'',asking_price_cents:null,is_published:false};
 for(const url of ['javascript:alert(1)','http://example.test/a','https://user:password@example.test/a'])expect(propertySchema.safeParse({...base,video_url:url}).success).toBe(false);
 expect(propertySchema.safeParse({...base,url_slug:'demo'}).success).toBe(false);
 expect(propertySchema.safeParse({...base,video_url:'https://vimeo.com/123456/aabbcc'}).success).toBe(true);
});
