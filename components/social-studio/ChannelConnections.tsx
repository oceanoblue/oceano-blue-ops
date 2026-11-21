import { crmDb } from "@/lib/crm/server";
import { metaConfigured, META_CALLBACK } from "@/lib/social/meta-connection";
import { appOrigin } from "@/lib/social/links";

export async function ChannelConnections({id,platforms,profileLinks,notice}:{id:string;platforms:string[];profileLinks:Record<string,string | undefined>;notice?:string}) {
  const {data,error}=await crmDb().from("social_channel_connections").select("platform,label,verified_at,verified_profile_url").eq("account_id",id);
  const visible = ["facebook","instagram"].filter(p=>platforms.includes(p) || data?.some(r=>r.platform===p));
  if (visible.length === 0) return null;
  const ready=metaConfigured() && process.env.VERCEL_ENV==="production";
  return <section className="card space-y-3 p-5"><h2 className="font-display text-xl">Meta connections</h2>
    {notice && <p role="status" className="rounded-lg bg-ocean-50 p-3 text-sm">{notice}</p>}
    <p className="text-sm text-slate-600">Verify access to the Facebook Page and Instagram professional account using the saved profile links. This connection requests read access only.</p>
    {error ? <p role="alert">Connection status is temporarily unavailable.</p> :
      <ul className="divide-y text-sm">{visible.map(p=>{
        const record=data?.find(r=>r.platform===p);
        const matches = record && platforms.includes(p) && !!record.verified_profile_url && record.verified_profile_url === profileLinks[p];
        return <li className="py-2" key={p}><b>{p==="facebook"?"Facebook":"Instagram"}</b> · {matches ? `${record.label}, last verified ${String(record.verified_at).slice(0,10)}` : record ? "Profile settings changed. Recheck this connection." : "Awaiting authorization"}
          {record && process.env.VERCEL_ENV==="production" && <form action="/api/social/connections/meta/remove" method="post" className="mt-1">
            <input type="hidden" name="account" value={id}/><input type="hidden" name="platform" value={p}/>
            <button className="text-xs font-medium text-ocean-700 underline">Remove {p === "facebook" ? "Facebook" : "Instagram"} connection from Ops</button>
          </form>}
        </li>;
      })}</ul>}
    {ready ? <form action="/api/social/connections/meta/start" method="post"><input type="hidden" name="account" value={id}/><button className="btn-secondary">Connect or recheck with Meta</button></form> :
      <details className="text-sm text-slate-700"><summary className="cursor-pointer font-semibold">Meta app setup required</summary>
        <p className="mt-2">Configure SOCIAL_META_APP_ID, SOCIAL_META_APP_SECRET and the existing token-encryption key in production. Register this Facebook Login redirect address in the agency’s Meta app.</p>
        <code className="block break-all py-2 text-xs">{appOrigin()+META_CALLBACK}</code></details>}
  </section>;
}
