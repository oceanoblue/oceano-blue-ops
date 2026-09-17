import { ClientGallery } from '@/components/gallery/ClientGallery';
import { demoGallery } from '@/lib/deliveries/demo';
export const metadata={title:'Sample Client Gallery | Oceano Blue Media',robots:{index:false,follow:false}};
export default function DemoGallery(){return <ClientGallery token="demo" initialData={demoGallery} demo/>;}
