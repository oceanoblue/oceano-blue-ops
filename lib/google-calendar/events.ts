import { getAccessToken } from './api';

export interface GCalEvent {
  id: string;
  summary: string;
  startIso: string;
  endIso: string;
  location?: string;
  htmlLink?: string;
}

/**
 * Fetch events (not just busy ranges) from the user's primary calendar.
 * Used by the team Schedule view so internal staff can see their full
 * personal day overlaid with Oceano Blue shoots.
 */
export async function fetchEvents(
  teamMemberId: string,
  startIso: string,
  endIso: string
): Promise<GCalEvent[]> {
  const token = await getAccessToken(teamMemberId);
  if (!token) return [];

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', startIso);
  url.searchParams.set('timeMax', endIso);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');

  const r = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const data: any = await r.json();
  const items: any[] = data?.items ?? [];

  return items
    .filter((e) => e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date))
    .map((e) => ({
      id: e.id,
      summary: e.summary ?? '(no title)',
      // All-day events have only `date`; timed events have `dateTime`.
      startIso: e.start.dateTime ?? `${e.start.date}T00:00:00Z`,
      endIso: e.end.dateTime ?? `${e.end.date}T23:59:59Z`,
      location: e.location,
      htmlLink: e.htmlLink,
    }));
}
