import { supabase } from './supabase';

/**
 * Squad feed writes — athletes on the same pass see each other's PRs and
 * season finishes (supabase/migrations/add_squad_events.sql).
 *
 * Every write is tolerant of the table not existing yet (Postgres 42P01):
 * pre-migration the feature is silent, never an error the athlete sees.
 *
 * payload carries first_name at write time — client rows are not
 * cross-readable between athletes, so the name is denormalized honestly
 * at the moment the athlete chose to share.
 */

export interface SquadShare {
  planId: string;
  clientId: string;
  firstName: string;
}

export async function insertSquadEvent(
  share: SquadShare,
  eventType: 'pr' | 'season_complete',
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from('squad_events').insert({
      plan_id: share.planId,
      client_id: share.clientId,
      event_type: eventType,
      payload: { ...payload, first_name: share.firstName },
    });
    if (error && error.code !== '42P01' && __DEV__) {
      console.warn('[squadEvents] insert skipped:', error.message);
    }
  } catch {
    // Never let a squad share break the celebration flow.
  }
}
