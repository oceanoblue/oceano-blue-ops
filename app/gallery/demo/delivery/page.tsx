import Link from 'next/link';
import { galleryReadyEmail, galleryReadySms } from '@/lib/email/templates';
import { BrandLogo } from '@/components/ui/BrandLogo';
export const metadata={title:'Delivery Preview | Oceano Blue Media',robots:{index:false,follow:false}};
export default function DeliveryPreview(){
 const content={recipientName:'Gustavo',address:'Coastal Home · Sample gallery',cityStateZip:'Lowcountry, South Carolina',galleryUrl:'https://app.oceanoblue.net/gallery/demo',photoCount:6,message:'Thank you for choosing Oceano Blue Media. We hope you love your finished media!',isTest:true};
 const email=galleryReadyEmail(content);
 return <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8"><div className="mx-auto max-w-6xl">
  <BrandLogo variant="dark" className="h-9 w-auto"/>
  <div className="my-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[.2em] text-ocean-700">Client experience · Preview</p><h1 className="mt-3 text-3xl text-ocean-950 sm:text-4xl">A thoughtful final handoff.</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">This sample shows the email, text, and gallery your client receives. It uses public sample images and creates no orders or payments.</p></div><Link className="btn-primary" href="/gallery/demo">Explore the client gallery →</Link></div>
  <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_1fr]"><section><h2 className="mb-3 text-lg font-semibold">01 · The email</h2><p className="mb-3 text-xs text-slate-500">{email.subject}</p><iframe title="Sample delivery email" sandbox="" srcDoc={email.html} className="h-[790px] w-full rounded-2xl border bg-white"/></section>
   <section><h2 className="mb-6 text-lg font-semibold">02 · The text</h2><div className="mx-auto max-w-sm rounded-[2.5rem] border-[8px] border-slate-800 bg-white px-5 py-10 shadow-lg"><p className="text-center text-xs text-slate-400">Oceano Blue Media</p><p className="mt-10 rounded-2xl bg-slate-100 p-4 text-sm leading-6 break-words whitespace-pre-line">{galleryReadySms(content)}</p><p className="mt-4 text-right text-[10px] text-slate-400">Sample message</p></div><div className="mt-8 rounded-2xl border bg-white p-6"><h2 className="text-lg font-semibold">03 · Their private gallery</h2><p className="my-3 text-sm leading-6 text-slate-600">A property cover, finished photos, full-screen viewing, and download sizes for MLS, print, and full resolution. Payment protection stays in place for unpaid photo orders.</p><Link href="/gallery/demo" className="text-sm font-semibold text-ocean-700 underline">View the gallery →</Link></div></section>
  </div></div></main>;
}
