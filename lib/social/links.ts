/** The pages every client has inside Social Studio. */
export type ClientView = "dashboard" | "accounts" | "board" | "calendar" | "checks" | "agreement";

export const SOCIAL_HOME = "/dashboard/social";

const SEGMENT: Record<ClientView, string> = {
  dashboard: "",
  accounts: "/accounts",
  board: "/board",
  calendar: "/calendar",
  checks: "/checks",
  agreement: "/agreement",
};

/** Link to one of a client's pages, keeping the chosen month. */
export function clientHref(view: ClientView, clientId: string, month?: string | null): string {
  return `${SOCIAL_HOME}/clients/${clientId}${SEGMENT[view]}${month ? `?month=${month}` : ""}`;
}

/** Link to one sub-account (a hotel, outlet or brand page) of a client. */
export function accountHref(accountId: string, month?: string | null): string {
  return `${SOCIAL_HOME}/accounts/${accountId}${month ? `?month=${month}` : ""}`;
}

/** The private report page a client opens. Anyone holding the link can read it. */
export function reportHref(token: string, month?: string | null): string {
  return `/social/report/${token}${month ? `?month=${month}` : ""}`;
}

/** The private page where a client reads and signs an agreement. */
export function agreementHref(token: string): string {
  return `/social/agreement/${token}`;
}

/** The address of the live system, for links that are copied and sent to clients. */
export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.oceanoblue.net").replace(/\/$/, "");
}
