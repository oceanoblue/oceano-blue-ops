export type StudioView = "overview" | "board" | "calendar" | "checks";

const PATH: Record<StudioView, string> = {
  overview: "/dashboard/social",
  board: "/dashboard/social/board",
  calendar: "/dashboard/social/calendar",
  checks: "/dashboard/social/checks",
};

/** Link to a Social Studio view, keeping the chosen program and month. */
export function studioHref(view: StudioView, programId?: string | null, month?: string | null): string {
  const params = new URLSearchParams();
  if (programId) params.set("program", programId);
  if (month) params.set("month", month);
  return `${PATH[view]}${params.size ? `?${params}` : ""}`;
}

export function accountHref(accountId: string, month?: string | null): string {
  return `/dashboard/social/accounts/${accountId}${month ? `?month=${month}` : ""}`;
}
