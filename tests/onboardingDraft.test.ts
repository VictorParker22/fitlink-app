jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// lib/supabase.ts constructs a real supabase-js client wired to
// expo-secure-store; none of that belongs in a unit test, so replace the
// module entirely with a hand-built double whose chain shapes match what
// applyOnboardingDraft actually calls. Everything the mock needs lives
// inside the factory (Jest hoists jest.mock calls above imports, so a
// module-level variable referenced here would still be undefined when the
// factory first runs) — the test file gets the same instance back by
// importing { supabase } from the now-mocked module below.
jest.mock('../lib/supabase', () => {
  const eq = jest.fn().mockResolvedValue({ error: null });
  const update = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ update }));
  const updateUser = jest.fn().mockResolvedValue({ error: null });
  const rpc = jest.fn().mockResolvedValue({ error: null });
  return { supabase: { from, auth: { updateUser }, rpc } };
});

// The per-account "client onboarded" device flag goes through the
// platform-aware wrapper (lib/secureStore.ts), which has no test backend.
jest.mock('../lib/secureStore', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import * as SecureStore from '../lib/secureStore';
import { clientOnboardedKey } from '../lib/onboardingFlags';
import { saveDraft, loadDraft, clearDraft, applyOnboardingDraft, GOAL_LABEL } from '../lib/onboardingDraft';

const fromMock = supabase.from as jest.Mock;
const updateUserMock = supabase.auth.updateUser as jest.Mock;
const rpcMock = supabase.rpc as jest.Mock;
const setItemMock = SecureStore.setItemAsync as jest.Mock;
// `update` and `eq` are shared across every from() call (the mock always
// returns the same chain), which is fine here: onboardingDraft only ever
// targets the trainers table, so every update()/eq() call belongs to it.
const updateMock = (fromMock() as any).update as jest.Mock;
const eqMock = (updateMock() as any).eq as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  fromMock.mockClear();
  updateMock.mockClear();
  eqMock.mockClear();
  updateUserMock.mockClear();
  rpcMock.mockClear();
  setItemMock.mockClear();
});

describe('GOAL_LABEL', () => {
  it('holds the exact labels other screens match on', () => {
    // lib/coachMatch.ts keywords and find-coach's prefill map are keyed on
    // these strings verbatim — a change here silently breaks both.
    expect(GOAL_LABEL).toEqual({
      strength: 'Get stronger on the big lifts',
      fat_loss: 'Lose fat, keep the strength I have',
      return: 'Get back into it after a break',
      pain: 'Train around something that hurts',
    });
  });
});

describe('saveDraft / loadDraft round-trip', () => {
  it('persists a patch and reads it back merged', async () => {
    await saveDraft({ role: 'client', goal: 'strength', goals: [GOAL_LABEL.strength] });
    const afterFirst = await loadDraft();
    expect(afterFirst.role).toBe('client');
    expect(afterFirst.goal).toBe('strength');
    expect(afterFirst.goals).toEqual(['Get stronger on the big lifts']);

    await saveDraft({ dob: '1990-01-15', trainingDays: ['tue', 'thu', 'sat'], days: 3 });
    const afterSecond = await loadDraft();
    expect(afterSecond.role).toBe('client');
    expect(afterSecond.goal).toBe('strength');
    expect(afterSecond.dob).toBe('1990-01-15');
    expect(afterSecond.trainingDays).toEqual(['tue', 'thu', 'sat']);
    expect(afterSecond.days).toBe(3);
    expect(typeof afterSecond.updatedAt).toBe('number');
  });

  it('returns an empty object when nothing was saved', async () => {
    expect(await loadDraft()).toEqual({});
  });

  it('clearDraft removes the persisted value', async () => {
    await saveDraft({ role: 'trainer' });
    await clearDraft();
    expect(await loadDraft()).toEqual({});
  });
});

describe('applyOnboardingDraft', () => {
  it('returns null and touches nothing when there is no draft', async () => {
    const result = await applyOnboardingDraft('user-1');
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('trainer path: updates trainers with specializations/mode/locations and metadata, then clears the draft', async () => {
    await saveDraft({
      role: 'trainer',
      goals: ['strength', 'mobility'],
      locations: ['Gym A', 'Gym B'],
      mode: 'hybrid',
      name: 'Coach Jamie',
    });

    const result = await applyOnboardingDraft('trainer-1');

    expect(result).toBe('trainer');

    // supabase.from('trainers') is called once for the spec update and
    // once more for the name-only update.
    expect(fromMock).toHaveBeenCalledWith('trainers');
    expect(fromMock).toHaveBeenCalledTimes(2);

    const updateArgs = updateMock.mock.calls.map((c) => c[0]);
    expect(updateArgs).toContainEqual({
      specializations: ['strength', 'mobility'],
      specialization: 'strength',
      training_locations: ['Gym A', 'Gym B'],
      coaching_mode: 'hybrid',
    });
    expect(updateArgs).toContainEqual({ name: 'Coach Jamie' });

    // auth metadata gets role + name
    expect(updateUserMock).toHaveBeenCalledWith({ data: { role: 'trainer', name: 'Coach Jamie' } });

    // both trainers writes are scoped to the signed-in user
    for (const call of eqMock.mock.calls) {
      expect(call).toEqual(['id', 'trainer-1']);
    }

    // claim_athlete_role and the athlete device flag are client-path-only
    expect(rpcMock).not.toHaveBeenCalled();
    expect(setItemMock).not.toHaveBeenCalled();

    // draft cleared
    expect(await loadDraft()).toEqual({});
  });

  it('trainer path: skips the trainers spec update when there is nothing to write, but still sets role', async () => {
    await saveDraft({ role: 'trainer' });
    await applyOnboardingDraft('trainer-2');

    const updateArgs = updateMock.mock.calls.map((c) => c[0]);
    expect(updateArgs.some((a) => 'specializations' in a)).toBe(false);
    expect(updateUserMock).toHaveBeenCalledWith({ data: { role: 'trainer' } });
  });

  it('client path: writes the First Week intake contract to metadata and calls claim_athlete_role', async () => {
    await saveDraft({
      role: 'client',
      goal: 'fat_loss',
      goals: [GOAL_LABEL.fat_loss],
      days: 3,
      trainingDays: ['tue', 'thu', 'sat'],
      locations: ['home'],
      dob: '1999-05-20',
      path: 'solo',
      name: 'Alex Athlete',
    });

    const result = await applyOnboardingDraft('client-1');

    expect(result).toBe('client');
    expect(updateUserMock).toHaveBeenCalledTimes(1);
    expect(updateUserMock).toHaveBeenCalledWith({
      data: {
        role: 'client',
        client_onboarded: true,
        intake_goal: 'Lose fat, keep the strength I have',
        intake_goal_key: 'fat_loss',
        intake_days: 3,
        intake_training_days: ['tue', 'thu', 'sat'],
        intake_experience: 'not stated',
        onboarding_intake: {
          goals: ['Lose fat, keep the strength I have'],
          goal_key: 'fat_loss',
          location: 'home',
          days: 3,
          training_days: ['tue', 'thu', 'sat'],
        },
        onboarding_path: 'solo',
        date_of_birth: '1999-05-20',
        name: 'Alex Athlete',
      },
    });

    expect(rpcMock).toHaveBeenCalledWith('claim_athlete_role');
    // client path never touches the trainers table
    expect(fromMock).not.toHaveBeenCalled();

    expect(await loadDraft()).toEqual({});
  });

  it('client path: sets the per-account device flag BEFORE the metadata round-trip', async () => {
    await saveDraft({ role: 'client', goal: 'strength', trainingDays: ['mon'], locations: ['gym'], path: 'coach' });
    await applyOnboardingDraft('client-3');

    expect(setItemMock).toHaveBeenCalledTimes(1);
    expect(setItemMock).toHaveBeenCalledWith(clientOnboardedKey('client-3'), 'true');
    expect(setItemMock).toHaveBeenCalledWith('fitlink_client_onboarded_client-3', 'true');
    // The route guard reads this flag; a slow or failed updateUser must not
    // be able to bounce the athlete back into intake.
    expect(setItemMock.mock.invocationCallOrder[0]).toBeLessThan(updateUserMock.mock.invocationCallOrder[0]);
  });

  it('client path: a failing device flag write does not stop the metadata write', async () => {
    setItemMock.mockRejectedValueOnce(new Error('keychain unavailable'));
    await saveDraft({ role: 'client', goal: 'pain', trainingDays: ['wed', 'fri'], locations: ['outdoors'] });
    await expect(applyOnboardingDraft('client-4')).resolves.toBe('client');
    expect(updateUserMock).toHaveBeenCalledTimes(1);
  });

  it('client path: derives days from trainingDays when days is absent', async () => {
    await saveDraft({ role: 'client', goal: 'return', trainingDays: ['mon', 'wed', 'fri', 'sun'], locations: ['gym'] });
    await applyOnboardingDraft('client-5');
    const data = updateUserMock.mock.calls[0][0].data;
    expect(data.intake_days).toBe(4);
    expect(data.onboarding_intake.days).toBe(4);
    expect(data.intake_goal).toBe('Get back into it after a break');
  });

  it('client path: omits dob, name and mode when absent, and nulls the unanswered intake fields', async () => {
    await saveDraft({ role: 'client' });
    await applyOnboardingDraft('client-2');

    expect(updateUserMock).toHaveBeenCalledWith({
      data: {
        role: 'client',
        client_onboarded: true,
        intake_goal: null,
        intake_goal_key: null,
        intake_days: null,
        intake_training_days: [],
        intake_experience: 'not stated',
        onboarding_intake: { goals: [], goal_key: null, location: null, days: null, training_days: [] },
        onboarding_path: null,
      },
    });
  });

  it('client path: a coach-style mode on the draft is carried into onboarding_intake', async () => {
    await saveDraft({ role: 'client', goal: 'strength', mode: 'remote', trainingDays: ['tue'], locations: ['gym'] });
    await applyOnboardingDraft('client-6');
    expect(updateUserMock.mock.calls[0][0].data.onboarding_intake.mode).toBe('remote');
  });
});
