export async function workRequest<T>(url:string,body?:Record<string,unknown>):Promise<T> {
  const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'}:{cache:'no-store'});
  const data=await r.json().catch(()=>({error:'The server returned an unexpected response. Please retry.'}));
  if(!r.ok) throw new Error(data.error||'The request failed.');return data as T;
}
export function readableError(e:unknown):string{return e instanceof Error?e.message:'Something went wrong. Please retry.';}
export function localDateTime(s:string|null|undefined):string{return s?new Date(s).toLocaleString():'';}
