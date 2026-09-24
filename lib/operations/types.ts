export const AGENT_ROLES = ["planner", "handoff", "delivery"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
export type Provider = "rules" | "openai" | "anthropic";
export type AgentChoice = { provider: Provider; model: string };
export type AgentSettings = {
  enabled: boolean;
  timezone: string;
  brief_time: string;
  agents: Record<AgentRole, AgentChoice>;
};
export const DEFAULT_SETTINGS: AgentSettings = {
  enabled: true,
  timezone: "America/New_York",
  brief_time: "07:00",
  agents: {
    planner: { provider: "rules", model: "" },
    handoff: { provider: "rules", model: "" },
    delivery: { provider: "rules", model: "" },
  },
};
export const AGENT_LABELS: Record<AgentRole, string> = {
  planner: "Day planner",
  handoff: "Editor handoffs",
  delivery: "Delivery monitor",
};
export type WorkItem = {
  id: string;
  kind: "order" | "job";
  title: string;
  client: string;
  href: string;
  status: string;
  due: string | null;
  scheduled: string | null;
  duration: number | null;
  updated: string;
  rush: boolean;
  editor: string | null;
  lane: "prepare" | "editing" | "review" | "deliver" | "other";
  route: "internal" | "external" | "unassigned";
  next: string;
  blockers: string[];
  overdue: boolean;
};
export type DayEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  source: "calendar" | "shoot";
  href: string | null;
  location?: string;
};
export type OperationsSnapshot = {
  capturedAt: string;
  day: string;
  timezone: string;
  calendar: { status: "connected" | "disconnected" | "error"; message: string };
  items: WorkItem[];
  events: DayEvent[];
  conflicts: string[][];
  warnings: string[];
};
export type AgentOutput = {
  role: AgentRole;
  provider: Provider;
  model: string;
  status: "completed" | "fallback";
  text: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
};
export type BriefRun = {
  id: string;
  local_date: string;
  status: "running" | "completed" | "partial" | "failed";
  created_at: string;
  completed_at: string | null;
  error: string | null;
  outputs: AgentOutput[];
  snapshot: OperationsSnapshot | null;
  run_key: string;
};
