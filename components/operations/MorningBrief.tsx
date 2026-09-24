import { Copy, Sparkles, Sunrise } from "lucide-react";
import { AGENT_LABELS, type AgentOutput, type AgentRole, type OperationsSnapshot } from "@/lib/operations/types";
import { fmtTime } from "@/lib/utils/format";

export function MorningBrief({ name, snapshot, text, output, savedAt, role, onRole, onCopy }: {
  name: string; snapshot: OperationsSnapshot; text: string; output?: AgentOutput; savedAt?: string;
  role: AgentRole; onRole: (role: AgentRole) => void; onCopy: () => void;
}) {
  const overdue = snapshot.items.filter(i => i.overdue).length;
  const handoffs = snapshot.items.filter(i => i.lane === "prepare").length;
  const headline = snapshot.conflicts.length ? `A few commitments overlap today, ${name}. Let’s make room.`
    : overdue ? `${name}, let’s get the overdue work moving first.`
    : handoffs ? `Your day is taking shape, ${name}. ${handoffs} handoff${handoffs === 1 ? " is" : "s are"} next.`
    : `A little clarity for the day ahead, ${name}.`;
  return <section className="overflow-hidden rounded-2xl border border-[#e3e5dd] bg-[#fafaf6] text-[#293931]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e3e5dd] px-6 py-4 sm:px-8">
      <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.17em]"><Sunrise className="h-4 w-4 text-[#ad6d45]"/>The morning edition</span>
      <span className="text-xs text-[#667269]">{savedAt ? `Brief saved ${fmtTime(savedAt, snapshot.timezone)}` : "Live operational summary"}</span>
    </div>
    <div className="p-6 sm:p-8">
      <h2 className="max-w-3xl font-serif text-3xl leading-[1.2] tracking-tight sm:text-[2.6rem]">{headline}</h2>
      <div className="mt-7 flex items-center gap-3 text-xs text-[#667269]"><span className="h-px flex-1 bg-[#d9dfd5]"/><span>THE SHAPE OF TODAY</span><span className="h-px flex-1 bg-[#d9dfd5]"/></div>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {snapshot.events.slice(0,3).map((event,index) => <div key={event.id} className={index ? "sm:border-l sm:border-[#d9dfd5] sm:pl-5" : ""}>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9b623f]">{event.allDay ? "All day" : fmtTime(event.start,snapshot.timezone)}</p>
          <p className="mt-2 text-sm font-semibold leading-relaxed">{event.title}</p>
          {event.location && <p className="mt-1 text-xs leading-relaxed text-[#667269]">{event.location}</p>}
        </div>)}
        {!snapshot.events.length && <p className="text-sm text-[#667269] sm:col-span-3">{snapshot.calendar.status === "connected" ? "No events found today. Check undated production work before making new commitments." : "Connect your calendar to complete the picture of your day."}</p>}
      </div>
      {snapshot.events.length > 3 && <p className="mt-4 text-xs text-[#667269]">+{snapshot.events.length-3} more commitments in your agenda</p>}
      <div role="group" aria-label="Briefing assistant" className="mt-7 flex flex-wrap gap-2">{(["planner","handoff","delivery"] as const).map(value => <button key={value} type="button" aria-pressed={role === value} onClick={() => onRole(value)} className={`min-h-10 rounded-full px-4 text-sm transition ${role === value ? "bg-[#284d42] text-white" : "bg-white text-[#50645a] ring-1 ring-[#e3e5dd] hover:bg-[#eef1e9]"}`}>{AGENT_LABELS[value]}</button>)}</div>
      <div className="mt-5 space-y-3 break-words text-[15px] leading-7 text-[#506057]">{text.split(/\n\s*\n/).map((paragraph,index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>)}</div>
      {output?.error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{output.error} Showing the factual briefing.</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#d9dfd5] pt-4 text-xs text-[#667269]">
        <span className="flex items-center gap-2"><Sparkles className="h-4 w-4"/>{output && output.provider !== "rules" && output.status !== "fallback" ? `${output.provider === "openai" ? "OpenAI" : "Claude"} · ${output.model}` : "Built-in operations rules"}</span>
        <button type="button" onClick={onCopy} className="flex min-h-10 items-center gap-2 font-medium"><Copy className="h-4 w-4"/>Copy brief</button>
      </div>
      {savedAt && <p className="mt-2 text-xs text-[#667269]">Assistant text reflects the saved brief. Counts and calendar reflect the latest refresh.</p>}
    </div>
  </section>;
}
