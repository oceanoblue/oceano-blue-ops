import { z } from 'zod';

export const areaSchema = z.object({
  x: z.number().min(0).max(0.95), y: z.number().min(0).max(0.95),
  width: z.number().min(0.05).max(0.6), height: z.number().min(0.05).max(0.6),
}).strict().refine(a => a.x + a.width <= 1.001 && a.y + a.height <= 1.001 && a.width * a.height <= 0.25, 'Choose a smaller area inside the photo.');
export const editSchema = z.discriminatedUnion('operation', [
  z.object({ id: z.string().uuid(), photo_id: z.string().uuid(), operation: z.literal('declutter'), options: z.object({ area: areaSchema }).strict() }).strict(),
  z.object({ id: z.string().uuid(), photo_id: z.string().uuid(), operation: z.literal('virtual_stage'), options: z.object({
    room: z.enum(['living_room','bedroom','dining_room','office']),
    style: z.enum(['coastal','modern','transitional']),
  }).strict() }).strict(),
]);
export type EditInput = z.infer<typeof editSchema>;
export type EditArea = z.infer<typeof areaSchema>;
export const creditCost = (operation: EditInput['operation']) => operation === 'virtual_stage' ? 2 : 1;
export type ClientEdit = { id: string; photo_id: string; operation: EditInput['operation']; credits: number; status: string; created_at: string };
export const editStatusLabel: Record<string,string> = { queued: 'Queued', running: 'Creating your edit', review: 'Being reviewed by Oceano Blue', approved: 'Ready to download', rejected: 'Not approved · Credits returned', failed: 'Could not complete · Credits returned' };
