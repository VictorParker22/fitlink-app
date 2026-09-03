/**
 * soloClient — the coachless athlete's own clients row.
 *
 * Solo hangs off a clients row (premium_until, solo_character,
 * solo_messages). Athletes without a coach never had one, which is why
 * setup saved nothing and the corner answered 402 to everyone. The
 * ensure_solo_client() RPC creates a trainer-less row (status 'solo') the
 * first time Solo is entered; picking a coach later adopts that same row.
 */
import { supabase } from './supabase';

export async function ensureSoloClient(): Promise<{ clientId: string; created: boolean } | null> {
  const { data, error } = await supabase.rpc('ensure_solo_client');
  if (error) {
    if (__DEV__) console.warn('[soloClient] ensure_solo_client failed:', error.message);
    return null;
  }
  const row = data as { client_id?: string; created?: boolean } | null;
  if (!row?.client_id) return null;
  return { clientId: row.client_id, created: !!row.created };
}
