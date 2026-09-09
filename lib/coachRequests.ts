/**
 * lib/coachRequests.ts — what a coach does with a coaching request.
 *
 * ONE implementation for the three places a request is answered: the Home
 * lead (components/dashboard/home/CoachRequestLead.tsx), the request screen
 * (app/request/[clientId].tsx) and the Clients tab. Both actions go through
 * `respond_coach_request` (SECURITY DEFINER: the coach must be the one the
 * athlete asked for). Accepting tells the athlete on their phone; declining
 * leaves a courteous note in their thread.
 *
 * `describeRequest` reads the intake the athlete wrote in Find a coach
 * (clients.assessment_data.intake, merged by request_coach) into the lines
 * every surface shows: every line a fact the athlete gave, never a guess.
 */
import { supabase } from './supabase';

export interface RequestingClient {
  id: string;
  name: string;
  coach_requested_at?: string | null;
  assessment_data?: any;
}

export interface RequestFacts {
  displayName: string;
  firstName: string;
  initials: string;
  goal: string | null;
  days: string | null;
  setting: string | null;
  experience: string | null;
  /** "2 minutes ago", "3 hours ago", "yesterday", or null without a timestamp. */
  asked: string | null;
}

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const SETTING_LABEL: Record<string, string> = { gym: 'Gym', home: 'Home', outdoors: 'Outdoors', coach_location: "Coach's studio", flexible: 'Anywhere' };

export function toTitleCase(str: string): string {
  return String(str ?? '').replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function describeRequest(client: RequestingClient, now: number = Date.now()): RequestFacts {
  const displayName = toTitleCase(client.name || 'Athlete');
  const firstName = displayName.split(' ')[0] || 'Athlete';
  const initials = displayName.split(' ').map((n) => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || 'A';
  const intake = (client.assessment_data?.intake ?? {}) as Record<string, any>;
  const goal = typeof intake.goal === 'string' && intake.goal.trim() ? intake.goal.trim() : null;
  const dayKeys: string[] = Array.isArray(intake.training_days) ? intake.training_days.map((d: unknown) => String(d).toLowerCase().slice(0, 3)).filter((d: string) => DAY_LABEL[d]) : [];
  const dayCount = Number(intake.days);
  const days = dayKeys.length > 0
    ? dayKeys.map((d) => DAY_LABEL[d]).join(' · ')
    : Number.isFinite(dayCount) && dayCount > 0 ? `${dayCount} day${dayCount === 1 ? '' : 's'} a week` : null;
  const settingRaw = typeof intake.setting === 'string' ? intake.setting : typeof intake.location === 'string' ? intake.location : null;
  const setting = settingRaw ? (SETTING_LABEL[settingRaw] ?? toTitleCase(settingRaw)) : null;
  const experience = typeof intake.experience === 'string' && intake.experience.trim() ? intake.experience.trim() : null;
  return { displayName, firstName, initials, goal, days, setting, experience, asked: timeAgo(client.coach_requested_at, now) };
}

/** One line for a push or a card: "Get stronger on the big lifts · Tue · Thu · Sat · Gym". */
export function requestSummaryLine(f: RequestFacts): string {
  return [f.goal, f.days, f.setting].filter(Boolean).join(' · ');
}

export type RequestResult = { ok: true } | { ok: false; message: string };

/** Accept: attach the athlete (server-side), then tell them on their phone. */
export async function acceptCoachRequest(client: RequestingClient, coachName: string | null | undefined): Promise<RequestResult> {
  const { data, error } = await supabase.rpc('respond_coach_request', { p_client_id: client.id, p_accept: true });
  if (error || !data?.success) return { ok: false, message: error?.message || data?.reason || 'accept failed' };
  const first = toTitleCase(coachName || 'Your coach').split(' ')[0];
  supabase.functions.invoke('send-push-notification', {
    body: {
      toClientId: client.id,
      title: `${first} took you on`,
      body: 'Your sessions now come from your coach. Open FitLink to see what changes.',
      data: { type: 'coach_accepted', url: '/(client-tabs)' },
    },
  }).catch(() => {});
  return { ok: true };
}

/**
 * Decline: release the request (server-side) and leave a short note in the
 * athlete's thread. The note is what the confirmation dialog promises, so a
 * failure to send it is reported, not swallowed.
 */
export async function declineCoachRequest(client: RequestingClient, trainerId: string | null | undefined): Promise<RequestResult & { noticeFailed?: string | null }> {
  const { data, error } = await supabase.rpc('respond_coach_request', { p_client_id: client.id, p_accept: false });
  if (error || !data?.success) return { ok: false, message: error?.message || data?.reason || 'decline failed' };

  const first = toTitleCase(client.name).split(' ')[0];
  const content =
    `Hi ${first}, thanks for reaching out and for sharing your goals. ` +
    `I don't have room to take on a new athlete right now, so I won't be able to coach you at the moment. ` +
    `There are plenty of other coaches on FitLink worth a look — wishing you the best with your training.`;
  let noticeFailed: string | null = null;
  if (!trainerId) {
    noticeFailed = 'You are not signed in as a coach.';
  } else {
    let { data: conv, error: convSelErr } = await supabase
      .from('conversations').select('id').eq('client_id', client.id).eq('trainer_id', trainerId).maybeSingle();
    if (convSelErr) noticeFailed = convSelErr.message;
    if (!conv && !noticeFailed) {
      const { data: created, error: convInsErr } = await supabase
        .from('conversations').insert({ client_id: client.id, trainer_id: trainerId }).select('id').single();
      if (convInsErr || !created) noticeFailed = convInsErr?.message || 'Could not start a conversation.';
      conv = created;
    }
    if (conv && !noticeFailed) {
      const { error: msgErr } = await supabase.from('messages').insert({ conversation_id: conv.id, sender_type: 'trainer', content });
      if (msgErr) noticeFailed = msgErr.message;
      else {
        await supabase.rpc('increment_conversation_unread', { conv_id: conv.id, new_last_message: content })
          .then(undefined, () => { /* older DBs may lack the rpc */ });
      }
    }
  }
  return { ok: true, noticeFailed };
}
