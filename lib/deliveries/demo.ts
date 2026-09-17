import type { GalleryData } from '@/components/gallery/ClientGallery';
/** Existing public marketing images only; never real client records or private files. */
export const demoGallery: GalleryData = {
 order:{id:'demo',order_number:0},
 listing:{address_line1:'The Coastal Collection',city:'Lowcountry',state:'South Carolina',zip:''},
 photos:[
  ['interior_exterior_photo','Coastal home','exterior'],['drone_photography','Aerial view','exterior'],
  ['twilight','Twilight exterior','exterior'],['amenities','Community amenities','exterior'],
  ['virtual_twilight','Evening light','exterior'],['drone_photos_video','Property overview','exterior'],
 ].map(([file,name,room],i)=>({id:`demo-${i}`,filename:`${name}.jpg`,url:`/products/${file}.webp`,width:1000,height:670,room_type:room})),
 deliverables:[],paywall:{active:false,paid:false,price_cents:0,currency:'usd'},
};
