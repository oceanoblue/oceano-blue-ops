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

/**
 * The client guide: a PDF that shows a client how to use their page and sign their agreement.
 * It uses sample content only, so the same file is right for every client.
 */
export const CLIENT_GUIDE_HREF = "/guides/social-media-client-guide.pdf";

/**
 * Where a client's page loads the image or video for a piece. It lives under
 * /api/social-public, which is open without signing in and checks the client's
 * own link itself. The page adds `&token=<the client's link secret>`.
 */
export const clientCreativeHref = (itemId: string, revision: number) => `/api/social-public/creative/${itemId}?revision=${revision}`;
/** The same file for signed-in office staff. */
export const officeCreativeHref = (itemId: string, revision: number) => `/api/social/creative/${itemId}?revision=${revision}`;
