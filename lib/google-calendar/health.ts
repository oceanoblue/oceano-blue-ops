export function calendarNeedsReconnect(connection: { is_active: boolean | null; scope: string | null }): boolean {
  const scopes = new Set((connection.scope || '').split(/\s+/));
  return !connection.is_active || !(scopes.has('https://www.googleapis.com/auth/calendar.readonly') || scopes.has('https://www.googleapis.com/auth/calendar'));
}
