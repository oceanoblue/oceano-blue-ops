import { z } from "zod";
const timezone = z.string().max(80).refine((value) => {
    try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
    }
    catch {
        return false;
    }
}, "Choose a valid timezone.");
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const sessionTypeSchema = z.object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    description: z.string().trim().max(2000),
    confirmation_instructions: z.string().trim().max(8000).default(""),
    owner_id: z.string().uuid(),
    duration_minutes: z.number().int().min(15).max(720),
    timezone,
    availability: z.array(z.object({ day: z.number().int().min(0).max(6), start: clock, end: clock }).refine(v => v.end > v.start, "End must follow start.")).min(1).max(21),
    notice_minutes: z.number().int().min(0).max(43200),
    horizon_days: z.number().int().min(1).max(365),
    booking_horizon_months: z.number().int().min(1).max(12).nullable().default(null),
    slot_interval_minutes: z.number().int().min(1).max(720).default(15),
    use_session_as_project_date: z.boolean().default(false),
    buffer_minutes: z.number().int().min(0).max(180),
    buffer_before_minutes: z.number().int().min(0).max(180).nullable().default(null),
    buffer_after_minutes: z.number().int().min(0).max(180).nullable().default(null),
    location: z.string().trim().max(500),
    published: z.boolean(),
});
export const sessionBookingSchema = z.object({
    id: z.string().uuid(), starts_at: z.string().datetime({ offset: true }),
    full_name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
    phone: z.string().trim().max(50).default(""),
    notes: z.string().trim().max(2000).default(""),
    email_consent: z.boolean(), website: z.string().max(100).default(""),
});
export const sessionChangeSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("cancel"), version: z.number().int().positive() }),
    z.object({ action: z.literal("reschedule"), version: z.number().int().positive(), starts_at: z.string().datetime({ offset: true }) }),
]);
export type SessionType = z.infer<typeof sessionTypeSchema> & {
    id: string;
    version: number;
};
export type PublicSessionType = Pick<SessionType, "name" | "slug" | "description" | "duration_minutes" | "timezone" | "location">;
export const sessionRequiresPhone = (type: Pick<PublicSessionType,"location">) => /^phone\b/i.test(type.location.trim());
export const validSessionPhone = (value: string) => { const digits=value.replace(/\D/g,"");return digits.length>=7&&digits.length<=15; };
export type Appointment = {
    id: string;
    session_type_id: string | null;
    client_id: string;
    project_id: string;
    owner_id: string;
    full_name: string;
    email: string;
    phone: string;
    notes: string;
    confirmation_instructions?: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    title: string;
    location: string;
    status: "confirmed" | "cancelled";
    version: number;
    email_consent: boolean;
    manage_token?: string;
    created_at: string;
    schedule_block_id?: string;
    source_system?: string;
    source_id?: string | null;
    import_state?: "native" | "reference" | "migrated";
    source_evidence?: Record<string, unknown>;
};
export type SchedulingData = {
    types: SessionType[];
    appointments: Appointment[];
    team: {
        id: string;
        full_name: string;
    }[];
    notifications: {
        id: string;
        appointment_id: string;
        kind: string;
        status: string;
        last_error: string | null;
        due_at: string;
    }[];
    production: boolean;
};
export const sessionTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const sessionSlugSchema = z.string().min(1).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
