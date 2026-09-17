import { ClientGallery } from '@/components/gallery/ClientGallery';
export default async function GalleryPage({params}:{params:Promise<{token:string}>}) {
 const {token}=await params;
 return <ClientGallery token={token}/>;
}
