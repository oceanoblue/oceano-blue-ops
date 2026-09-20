import { MarketingStudio } from '@/components/marketing/MarketingStudio';
import { demoGallery } from '@/lib/deliveries/demo';
export const metadata={title:'Listing marketing kit | Oceano Blue Media',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <MarketingStudio token={token} demo={token==='demo'} initialData={token==='demo'?demoGallery:undefined}/>;}
