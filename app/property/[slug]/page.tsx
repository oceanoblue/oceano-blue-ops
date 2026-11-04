import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { demoGallery } from '@/lib/deliveries/demo';
import { PropertyExperience } from '@/components/marketing/PropertyExperience';
import { PropertyGallery } from '@/components/marketing/PropertyGallery';
import { toEmbedUrl } from '@/lib/deliverables/embed';
import { loadProperty } from '@/lib/marketing/load-property';
import './property.css';
export const dynamic='force-dynamic';

type Search={preview?:string;unbranded?:string};
const money=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100);
/** "NN-group.jpg" file names (how Oceano Blue Media publishes client photo sets) give the gallery its chapters. */
const groupOf=(url:string)=>{const m=url.match(/\/(?:(\d+)-([a-z]+)|(hero)-[a-z]+)\.(?:jpe?g|png|webp)(?:\?.*)?$/i);return m?(m[3]?'still':m[2]):undefined;};
const lines=(text:string)=>text.split('\n').map(l=>l.trim()).filter(Boolean);
/** Split the address into a display pair: "10 Derby Court" -> ["10 Derby", "Court"]. */
function splitAddress(address:string){const parts=address.trim().split(/\s+/);return parts.length>1?[parts.slice(0,-1).join(' '),parts[parts.length-1]]:[address,''];}

export async function generateMetadata({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Search>}):Promise<Metadata>{
 const {slug}=await params;const search=await searchParams;const data=slug==='demo'?null:await loadProperty(slug,search.preview==='1');
 if(!data)return {title:'Property showcase',robots:{index:false,follow:false}};
 const site:any=data.site;const title=`${site.headline}${site.community?` — ${site.community}`:''}`;const description=(site.tagline||site.description||'Explore this property, photography and film.').slice(0,200);
 const image=site.hero_image_url||(data.photos.length?`https://app.oceanoblue.net/api/property-public/${slug}/hero`:'');
 return {title,description,robots:{index:site.is_published&&search.preview!=='1',follow:site.is_published},openGraph:{title,description,type:'website',...(image?{images:[image]}:{})},twitter:{card:image?'summary_large_image':'summary',title,description,...(image?{images:[image]}:{})}};
}

export default async function Page({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<Search>}) {
 const {slug}=await params;const search=await searchParams;
 const data=slug==='demo'?{site:{is_published:true,headline:'The Coastal Collection',tagline:'A sample property website showcasing finished photography, property details, and a clear way to contact the listing agent.',description:'',agent_name:'Sample Coastal Realty',agent_phone:'',agent_email:'',asking_price_cents:null},listing:{...demoGallery.listing,bedrooms:null,bathrooms:null,sqft:null},photos:demoGallery.photos.map(p=>({id:p.id,url:p.url!,alt:p.filename}))}:await loadProperty(slug,search.preview==='1');
 if(!data)notFound();
 const {listing}=data;const site:any=data.site;const unbranded=search.unbranded==='1';const live=site.is_published&&slug!=='demo'&&search.preview!=='1';
 const photos=data.photos.map(p=>({...p,group:groupOf(p.url)}));
 const hero=site.hero_image_url||photos[0]?.url||'';
 const [addrA,addrB]=splitAddress(site.headline);
 const place=[site.community,listing?.city,listing?.state==='SC'?'South Carolina':listing?.state].filter(Boolean).join(', ');
 const stats=[listing?.bedrooms!=null?[String(listing.bedrooms),listing.bedrooms===1?'bedroom':'bedrooms']:null,listing?.bathrooms!=null?[String(Number(listing.bathrooms)),'baths']:null,listing?.sqft?[listing.sqft.toLocaleString(),'square feet']:null,site.acreage!=null?[String(site.acreage),'acres']:null].filter(Boolean) as [string,string][];
 const facts=lines(site.facts||'').map(l=>{const i=l.indexOf(':');return i>0?[l.slice(0,i).trim(),l.slice(i+1).trim()]:[l,''];});
 const highlights=lines(site.highlights||'');
 const paragraphs=(site.description||'').split(/\n\s*\n/).map((p:string)=>p.trim()).filter(Boolean);
 const address=[listing?.address_line1,listing?.city,listing?.state,listing?.zip].filter(Boolean).join(', ');
 const mapSrc=`https://www.google.com/maps?q=${encodeURIComponent(address)}&z=13&output=embed`;
 const stills=photos.filter(p=>p.group==='still');
 const feature=stills.find(p=>/porch/i.test(p.url))||photos.find(p=>p.group==='porch')||stills[0]||photos[1]||null;
 const interlude=stills.find(p=>/pool|aerial/i.test(p.url)&&p!==feature)||photos.find(p=>p.group==='pool')||null;
 const agent=!unbranded&&(site.agent_name||site.agent_names||site.agent_phone||site.agent_email)?{name:site.agent_name,names:site.agent_names,brokerage:site.brokerage,phone:site.agent_phone,email:site.agent_email,image:site.agent_image_url}:null;
 const brand=unbranded?'Property showcase':(site.brokerage||site.agent_name||'Oceano Blue Media');

 return <main className="ps-root">
  {slug==='demo'&&<div className="ps-notice">Sample property website · public sample photography</div>}
  {!site.is_published&&<div className="ps-notice">Draft preview — only your team can see this page.</div>}
  <header className="ps-hero">
   <div className="ps-hero-media">{hero&&<img src={hero} alt="" fetchPriority="high"/>}<div className="ps-hero-shade"/></div>
   <div className="ps-wrap-wide ps-topbar"><span className="ps-brand">{brand}</span><nav className="ps-nav" aria-label="Page sections">{site.video_url&&<a href="#film">Film</a>}<a href="#photos">Photos</a><a href="#location">Location</a>{!unbranded&&live&&<a href="#inquire">Showings</a>}</nav></div>
   <div/>
   <div className="ps-wrap-wide ps-hero-body">
    <div className="ps-reveal">
     <p className="ps-hero-place">{place}</p>
     <h1>{addrA}{addrB&&<> <em>{addrB}</em></>}</h1>
     {site.tagline&&<p className="ps-hero-tag">{site.tagline}</p>}
     <div className="ps-hero-cta">{site.video_url&&<a className="ps-btn ps-btn-light" href="#film">Watch the film</a>}{!unbranded&&live?<a className="ps-btn ps-btn-ghost" href="#inquire">Request a showing</a>:<a className="ps-btn ps-btn-ghost" href="#photos">See the photos</a>}</div>
    </div>
    {stats.length>0&&<div className="ps-hero-facts">{stats.map(([n,l])=><div key={l}><strong>{n}</strong><span>{l}</span></div>)}{site.asking_price_cents!==null&&site.asking_price_cents!==undefined&&<div><strong>{money(site.asking_price_cents)}</strong><span>offered at</span></div>}</div>}
   </div>
  </header>

  <section className="ps-section"><div className="ps-wrap ps-intro">
   <div>{site.tagline&&paragraphs.length>0?<p className="ps-lede">{paragraphs[0]}</p>:<p className="ps-lede">{site.tagline||paragraphs[0]||site.headline}</p>}</div>
   <div><div className="ps-prose">{(site.tagline?paragraphs.slice(1):paragraphs.slice(1)).map((p:string,i:number)=><p key={i}>{p}</p>)}</div>
    {(facts.length>0||stats.length>0)&&<dl className="ps-facts" style={{marginTop:paragraphs.length>1?'2rem':0}}>{stats.map(([n,l])=><div key={l}><dt style={{textTransform:'capitalize'}}>{l}</dt><dd>{n}</dd></div>)}{facts.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}{site.mls_number&&<div><dt>MLS</dt><dd>{site.mls_number}</dd></div>}</dl>}
   </div>
  </div></section>

  <PropertyExperience slug={slug} enabled={live} videoUrl={site.video_url||''} unbranded={unbranded} filmTitle={`Three minutes at ${site.headline}`} filmNote={site.video_url?'A short film of the home and grounds, shot on the property. Sound on.':''} agent={agent}>

  {highlights.length>0&&<section className="ps-section"><div className="ps-wrap ps-split">
   {feature&&<div className="ps-photo"><img src={feature.url} alt={feature.alt} loading="lazy"/></div>}
   <div><h2 className="ps-h2">What sets it apart</h2><ul className="ps-list">{highlights.map((h,i)=><li key={i}>{h}</li>)}</ul></div>
  </div></section>}

  <section id="photos" className="ps-section-tight"><div className="ps-wrap-wide"><PropertyGallery photos={photos} headline={site.headline}/></div></section>

  {interlude&&<section className="ps-bleed" aria-hidden="true"><img src={interlude.url} alt="" loading="lazy"/></section>}

  {site.social_video_urls?.length>0&&<section className="ps-section"><div className="ps-wrap"><h2 className="ps-h2">Short takes</h2><div className="ps-reels">{site.social_video_urls.map((url:string,i:number)=>{const embed=toEmbedUrl(url);return embed?<iframe key={url} src={embed} title={`Property highlight ${i+1}`} allowFullScreen/>:<a key={url} href={url} target="_blank" rel="noreferrer" className="ps-btn ps-btn-oxblood">Watch highlight {i+1}</a>;})}</div></div></section>}

  <section id="location" className="ps-section"><div className="ps-wrap ps-split">
   <div><h2 className="ps-h2">Where it sits</h2><div className="ps-prose">{lines(site.area_description||'').map((p:string,i:number)=><p key={i}>{p}</p>)}<p>{address}</p><p><a className="ps-btn ps-btn-oxblood" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer">Open in Google Maps</a></p></div>
    {(site.tour_url||site.floor_plan_url)&&<p style={{display:'flex',gap:'.75rem',flexWrap:'wrap'}}>{site.tour_url&&<a className="ps-btn ps-btn-ghost" style={{color:'var(--ink)',borderColor:'var(--ink)'}} href={site.tour_url} target="_blank" rel="noreferrer">3D / 360 tour</a>}{site.floor_plan_url&&<a className="ps-btn ps-btn-ghost" style={{color:'var(--ink)',borderColor:'var(--ink)'}} href={site.floor_plan_url} target="_blank" rel="noreferrer">Floor plan</a>}</p>}</div>
   <iframe className="ps-map" src={mapSrc} title={`Map of ${address}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/>
  </div></section>
  </PropertyExperience>

  <div className="ps-wrap"><footer className="ps-footer">
   <span>{site.headline}{site.community?`, ${site.community}`:''}{site.mls_number?` · MLS ${site.mls_number}`:''}</span>
   {!unbranded&&<span>{site.brokerage||site.agent_name}{site.brokerage||site.agent_name?' · ':''}Film and website by <a href="https://oceanoblue.net" target="_blank" rel="noreferrer">Oceano Blue Media</a></span>}
   <span>Information is deemed reliable but not guaranteed. Buyers should verify all details.</span>
  </footer></div>
 </main>;
}
