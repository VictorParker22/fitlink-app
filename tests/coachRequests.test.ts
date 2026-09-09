/**
 * A coaching request is shown the same way everywhere (push, Home lead,
 * request screen, Notifications): every line is a fact the athlete gave.
 */
import { describeRequest, requestSummaryLine, timeAgo, toTitleCase } from '../lib/coachRequests';

jest.mock('../lib/supabase', () => ({ supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() }, from: jest.fn() } }));

const NOW = new Date('2026-09-09T02:00:00Z').getTime();

describe('describeRequest', () => {
  it('reads the Find-a-coach intake into display lines', () => {
    const f = describeRequest({
      id: 'c1', name: 'mia rodriguez', coach_requested_at: '2026-09-09T01:58:00Z',
      assessment_data: { intake: { goal: 'Get stronger on the big lifts', training_days: ['tue', 'thu', 'sat'], setting: 'gym', experience: 'Trained before, out of the habit' } },
    }, NOW);
    expect(f).toMatchObject({ displayName: 'Mia Rodriguez', firstName: 'Mia', initials: 'MR', goal: 'Get stronger on the big lifts', days: 'Tue · Thu · Sat', setting: 'Gym', experience: 'Trained before, out of the habit', asked: '2 minutes ago' });
    expect(requestSummaryLine(f)).toBe('Get stronger on the big lifts · Tue · Thu · Sat · Gym');
  });
  it('falls back to a day count and the location key, and omits what was not given', () => {
    const f = describeRequest({ id: 'c2', name: 'GERRY', assessment_data: { intake: { days: 4, location: 'coach_location' } } }, NOW);
    expect(f.days).toBe('4 days a week');
    expect(f.setting).toBe("Coach's studio");
    expect(f.goal).toBeNull();
    expect(f.experience).toBeNull();
    expect(f.asked).toBeNull();
    expect(requestSummaryLine(f)).toBe("4 days a week · Coach's studio");
  });
  it('survives a row with no intake at all', () => {
    const f = describeRequest({ id: 'c3', name: '' }, NOW);
    expect(f.displayName).toBe('Athlete');
    expect(f.initials).toBe('A');
    expect(requestSummaryLine(f)).toBe('');
  });
});

describe('timeAgo', () => {
  it('speaks in minutes, hours, days', () => {
    expect(timeAgo(new Date(NOW - 20_000).toISOString(), NOW)).toBe('just now');
    expect(timeAgo(new Date(NOW - 60_000).toISOString(), NOW)).toBe('1 minute ago');
    expect(timeAgo(new Date(NOW - 3 * 3600_000).toISOString(), NOW)).toBe('3 hours ago');
    expect(timeAgo(new Date(NOW - 26 * 3600_000).toISOString(), NOW)).toBe('yesterday');
    expect(timeAgo(new Date(NOW - 3 * 86400_000).toISOString(), NOW)).toBe('3 days ago');
    expect(timeAgo(null, NOW)).toBeNull();
    expect(timeAgo('nope', NOW)).toBeNull();
  });
  it('title-cases names', () => {
    expect(toTitleCase('laurel fruehling')).toBe('Laurel Fruehling');
  });
});
