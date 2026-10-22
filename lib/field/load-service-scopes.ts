import 'server-only';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { SERVICE_SCOPE_COLUMNS, serviceScope, type ServiceScope } from './service-scope';

/** Never trust a caller-supplied contractor ID. Recheck ownership on the privileged read. */
export async function loadFieldServiceScopes(orderIds: string[]): Promise<Map<string, ServiceScope>> {
  const scopes = new Map<string, ServiceScope>();
  if (!orderIds.length) return scopes;
  const client = await createClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) throw new Error('Sign in to view shoot services.');
  const { data: contractor, error } = await client.from('contractors').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!contractor) return scopes;
  const admin = createAdminClient({ noStore: true });
  // Batches avoid oversized PostgREST URLs for long shoot histories.
  for (let offset = 0; offset < orderIds.length; offset += 100) {
    const { data, error: readError } = await admin.from('orders')
      .select(`id,${SERVICE_SCOPE_COLUMNS}`)
      .eq('contractor_id', contractor.id).in('id', orderIds.slice(offset, offset + 100));
    if (readError) throw readError;
    for (const order of data ?? []) scopes.set(order.id, serviceScope(order));
  }
  return scopes;
}
