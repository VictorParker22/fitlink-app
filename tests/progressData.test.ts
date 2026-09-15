/**
 * The Progress tab's numbers, from real row shapes. A curve needs two
 * sessions, a PR needs a previous best, the week is Monday → Sunday in local
 * time, and a habit run is counted back from today.
 */
import { buildLiftSeries, prMoments, e1rm, liftDeltaPct, bestE1rm, buildWeek, completedDayKeys, habitStats, lastDays, averageOver, formatHours, mondayOf } from '../lib/progressData';

const log = (createdAt: string, exercises: any[]) => ({ created_at: createdAt, exercises });
const set = (weight: number, reps: number, feel?: string) => ({ weight, reps, completed: true, feel });
const NAMES = { bench: 'Bench press', squat: 'Back squat' };

describe('lifts', () => {
  const logs = [
    log('2026-08-19T10:00:00Z', [{ id: 'bench', sets: [set(135, 5), set(135, 5)] }, { id: 'squat', sets: [set(185, 5)] }]),
    log('2026-08-26T10:00:00Z', [{ id: 'bench', sets: [set(140, 5, 'right'), set(140, 4, 'grind')] }]),
    log('2026-09-02T10:00:00Z', [{ id: 'bench', sets: [set(140, 6)] }, { id: 'squat', sets: [set(185, 5, 'grind')] }]),
    log('2026-09-14T10:00:00Z', [{ id: 'bench', sets: [set(145, 5), set(145, 4), { weight: 150, reps: 1, completed: false }] }]),
    log('2026-09-15T10:00:00Z', [{ id: 'unknown', sets: [set(50, 10)] }]),
  ];
  const series = buildLiftSeries(logs, NAMES);

  it('takes the best COMPLETED set per session, most-logged lift first, unnamed lifts dropped', () => {
    expect(series.map((s) => s.name)).toEqual(['Bench press', 'Back squat']);
    expect(series[0].sessions.map((s) => s.best)).toEqual([135, 140, 140, 145]);
    expect(series[0].sessions[1].feel).toBe('grind');
  });
  it('PRs are new bests after a first session, newest first', () => {
    const prs = prMoments(series);
    expect(prs.map((p) => `${p.name} ${p.weight} from ${p.previous}`)).toEqual(['Bench press 145 from 140', 'Bench press 140 from 135']);
  });
  it('delta and e1RM', () => {
    expect(liftDeltaPct(series[0])).toBe(7);
    expect(liftDeltaPct(series[1])).toBe(0);
    expect(e1rm(145, 5)).toBe(169);
    expect(e1rm(150, 1)).toBe(150);
    expect(bestE1rm(series[0])).toBe(169);
  });
});

describe('week', () => {
  const now = new Date(2026, 8, 15, 18, 0); // Tuesday 15 Sep 2026
  it('starts on Monday, marks plan, done, today, steps', () => {
    const week = buildWeek({ now, trainingDays: ['mon', 'wed', 'thu', 'fri'], completedDates: ['2026-09-14'], stepsByDay: { '2026-09-14': 9100 }, minutesByDay: { '2026-09-14': 55 } });
    expect(week.map((d) => d.label).join('')).toBe('MTWTFSS');
    expect(week[0]).toMatchObject({ date: '2026-09-14', planned: true, done: true, minutes: 55, steps: 9100 });
    expect(week[1]).toMatchObject({ date: '2026-09-15', isToday: true, planned: false, done: false, steps: null });
    expect(week.filter((d) => d.planned)).toHaveLength(4);
  });
  it('mondayOf on a Sunday is the previous Monday', () => {
    expect(mondayOf(new Date(2026, 8, 20)).getDate()).toBe(14);
  });
  it('completed day keys read completed_at in local time and assigned_date as a plain day', () => {
    expect(completedDayKeys([{ status: 'completed', completed_at: '2026-09-14T23:30:00' }, { status: 'completed', assigned_date: '2026-09-10' }, { status: 'assigned', assigned_date: '2026-09-11' }])).toEqual(['2026-09-14', '2026-09-10']);
  });
});

describe('habits', () => {
  const now = new Date(2026, 8, 15);
  const days = lastDays(28, now);
  const rows: Record<string, any> = {};
  days.forEach((d, i) => { rows[d] = { water: true, steps: i % 2 === 0, sleep: i > 20, protein: i >= 7, mindfulness: false }; });
  const stats = habitStats(rows, now);
  it('this week and today', () => {
    expect(stats.possibleThisWeek).toBe(35);
    expect(stats.perHabitPct.water).toBe(100);
    expect(stats.perHabitPct.mindfulness).toBe(0);
    expect(stats.todayDone).toBe(3); // today is i=27: water, sleep, protein (steps odd → false)
  });
  it('runs and four weeks', () => {
    expect(stats.streaks.water).toBe(28);
    expect(stats.streaks.mindfulness).toBe(0);
    expect(stats.longest).toMatchObject({ habit: 'water', days: 28 });
    expect(stats.weeks).toHaveLength(4);
    expect(stats.weakest?.habit).toBe('mindfulness');
    expect(stats.bestWeekPct).toBeGreaterThanOrEqual(stats.weeks[0].pct);
  });
});

describe('rollups', () => {
  it('averages only the days with data', () => {
    expect(averageOver({ a: 8000, b: 6000 }, ['a', 'b', 'c'])).toBe(7000);
    expect(averageOver({}, ['a'])).toBeNull();
    expect(formatHours(440)).toBe('7 h 20');
    expect(formatHours(35)).toBe('35 min');
  });
});
