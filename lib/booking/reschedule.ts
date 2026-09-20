export function rescheduleEligibility(order: { status: string; scheduled_at: string | null; photographer_id: string | null },
  settings: { client_rescheduling_enabled: boolean; client_reschedule_cutoff_hours: number }, now = Date.now()) {
  if (!settings.client_rescheduling_enabled) return 'Contact us to change your appointment.';
  if (!['booked','scheduled'].includes(order.status) || !order.scheduled_at || !order.photographer_id) return 'Please contact us to arrange a change for this order.';
  if (Date.parse(order.scheduled_at) < now + settings.client_reschedule_cutoff_hours * 3600000) return `Changes within ${settings.client_reschedule_cutoff_hours} hours of your appointment must go through our team.`;
  return null;
}
