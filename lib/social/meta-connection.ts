import { randomBytes, timingSafeEqual } from "node:crypto";
import { crmDb, CrmError } from "@/lib/crm/server";
import { encryptedToken, encryptionConfigured, openToken, sealToken } from "@/lib/google-calendar/token-encryption";

export const META_CALLBACK = "/api/social/connections/meta/callback";
export const META_COOKIE = "ops_social_meta_state";
const graphVersion = "v27.0";
const authority = `https://graph.facebook.com/${graphVersion}`;
const scopes = ["pages_show_list", "pages_read_engagement", "instagram_basic"];
type Platform = "facebook" | "instagram";
type ProfileLinks = Partial<Record<Platform, string>>;
type Page = { id: string; name?: string; link?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } };
type Connection = { platform: Platform; remote_id: string; label: string; pageToken: string };

export function metaConfigured() {
  return Boolean(process.env.SOCIAL_META_APP_ID && process.env.SOCIAL_META_APP_SECRET && encryptionConfigured());
}

export function beginMeta(actor: string, account: string, callback: string) {
  const nonce = randomBytes(32).toString("base64url");
  const saved = sealToken(JSON.stringify({ actor, account, nonce, until: Date.now()+600_000 }), "social-meta-state", "access");
  const query = new URLSearchParams({client_id: process.env.SOCIAL_META_APP_ID!, redirect_uri: callback,
    response_type:"code", state:nonce, scope:scopes.join(",")});
  return {saved, url:`https://www.facebook.com/${graphVersion}/dialog/oauth?${query}`};
}

export function verifyMetaState(saved: string, state: string, actor: string): string | null {
  if (!encryptedToken(saved) || !/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
  try {
    const value = JSON.parse(openToken(saved, "social-meta-state", "access"));
    return value.actor === actor && value.until > Date.now() &&
      /^[0-9a-f-]{36}$/i.test(value.account) && timingSafeEqual(Buffer.from(state), Buffer.from(value.nonce))
      ? value.account : null;
  } catch { return null; }
}

function handle(raw: string | undefined, platform: Platform) {
  try {
    const u = new URL(raw || "");
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
    if (u.protocol !== "https:" || host !== platform + ".com") return "";
    if (platform === "facebook" && u.pathname === "/profile.php") return u.searchParams.get("id") || "";
    return /^\/([a-z\d._-]+)\/?$/i.exec(u.pathname)?.[1].toLowerCase() || "";
  } catch { return ""; }
}

/** Only save pages that match this specific client's saved public profiles. */
export function matchPages(pages: Page[], links: ProfileLinks, platforms: string[]): Connection[] {
  const out: Connection[]=[];
  for (const page of pages) {
    if (!page.access_token || !/^\d+$/.test(page.id)) continue;
    const fb = handle(links.facebook, "facebook");
    if (platforms.includes("facebook") && fb && (fb === page.id || fb === handle(page.link,"facebook"))) {
      out.push({ platform:"facebook", remote_id:page.id, label:page.name || fb, pageToken:page.access_token });
    }
    const ig = page.instagram_business_account;
    const expected = handle(links.instagram,"instagram");
    if (platforms.includes("instagram") && expected && ig?.id && /^\d+$/.test(ig.id) && ig.username?.toLowerCase() === expected) {
      out.push({ platform:"instagram", remote_id:ig.id, label:"@"+ig.username, pageToken:page.access_token });
    }
  }
  if (new Set(out.map(row=>row.platform)).size !== out.length) throw new CrmError("Multiple profiles matched. Verify the saved profile URLs and reconnect.",409);
  return out;
}
async function graph(path: string, token?: string, form?: URLSearchParams) {
  const res = await fetch(authority+path, { method: form ? "POST" : "GET", cache:"no-store",
    signal:AbortSignal.timeout(15000), headers:token ? {Authorization:`Bearer ${token}`} : {}, body:form });
  if (!res.ok) throw new CrmError("Meta could not verify access. Check your business permissions and try again.",409);
  return res.json();
}
export async function connectMeta(actor: string, account: string, code: string, callback: string) {
  const db=crmDb();
  const {data,error}=await db.from("social_accounts").select("profile_links,platforms,is_active").eq("id",account).single();
  if (error || !data?.is_active) throw new CrmError("The sub-account is unavailable.",409);
  const auth = { client_id:process.env.SOCIAL_META_APP_ID!, client_secret:process.env.SOCIAL_META_APP_SECRET! };
  const initial = await graph("/oauth/access_token",undefined,new URLSearchParams({...auth,redirect_uri:callback,code}));
  if (!initial.access_token) throw new CrmError("Meta authorization was incomplete.",409);
  const extended = await graph("/oauth/access_token",undefined,new URLSearchParams({...auth,grant_type:"fb_exchange_token",fb_exchange_token:initial.access_token}));
  if (!extended.access_token) throw new CrmError("Meta did not grant continued access.",409);
  const matches: Connection[]=[];
  let after="";
  const cursors=new Set<string>();
  do {
    const params=new URLSearchParams({fields:"id,name,link,access_token,instagram_business_account{id,username}",limit:"100"});
    if(after) params.set("after",after);
    const result=await graph("/me/accounts?"+params,extended.access_token);
    matches.push(...matchPages(result.data ?? [], data.profile_links||{}, data.platforms||[]));
    after=result.paging?.next ? result.paging?.cursors?.after || "" : "";
    if(after && cursors.has(after)) throw new CrmError("Meta returned an incomplete page list. Please reconnect.",409);
    cursors.add(after);
  } while(after);
  if(!matches.length) throw new CrmError("No managed profile matched this sub-account. Check the profile links and the Pages selected at Meta.",409);
  if(new Set(matches.map(m=>m.platform)).size!==matches.length) throw new CrmError("More than one profile matched a platform. Review the profile links.",409);
  const rows=matches.map(m=>({account_id:account,platform:m.platform,remote_id:m.remote_id,label:m.label,
    encrypted_page_token:sealToken(m.pageToken,`social:${account}:${m.platform}`,"access"),connected_by:actor,verified_at:new Date().toISOString()}));
  const {error:saveError}=await db.from("social_channel_connections").upsert(rows,{onConflict:"account_id,platform"});
  if (saveError) throw new CrmError("The connection could not be saved. Check whether this profile belongs to a different sub-account.",409);
  return matches.length;
}
