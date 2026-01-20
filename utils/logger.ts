import { createClient } from '@/utils/supabase/server';

export async function logActivity({
  action,
  entityId,
  entityType,
  restaurantId,
  details = {}
}: {
  action: string;
  entityId?: string;
  entityType?: string;
  restaurantId?: string;
  details?: any;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return;

  // Récupération du rôle via RPC pour la sécurité
  const { data: role } = await supabase.rpc('get_my_role');

  await supabase.from('activity_logs').insert({
    user_id: user.id,
    user_email: user.email,
    user_role: role,
    action_type: action,
    entity_id: entityId,
    entity_type: entityType,
    restaurant_id: restaurantId,
    metadata: details
  });
}