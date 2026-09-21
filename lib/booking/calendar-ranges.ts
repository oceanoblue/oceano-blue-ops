type Range={start:string;end:string};
export function scheduleCalendarRanges(live:Range[],cached:Range[],hidden:Range[]) {
 const parsed=[...live,...cached].map(r=>({start:Date.parse(r.start),end:Date.parse(r.end)})).filter(r=>Number.isFinite(r.start)&&r.end>r.start&&!hidden.some(h=>r.start>=Date.parse(h.start)&&r.end<=Date.parse(h.end))).sort((a,b)=>a.start-b.start);
 const merged:{start:number;end:number}[]=[];
 for(const r of parsed){const last=merged[merged.length-1];if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else merged.push({...r});}
 return merged.map(r=>({start:new Date(r.start).toISOString(),end:new Date(r.end).toISOString()}));
}
