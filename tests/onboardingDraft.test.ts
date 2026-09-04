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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { saveDraft, loadDraft, clearDraft, applyOnboardingDraft } from '../lib/onboardingDraft';

const fromMock = supabase.from as jest.Mock;
const updateUserMock = supabase.auth.updateUser as jest.Mock;
const rpcMock = supabase.rpc as jest.Mock;
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
});

describe('saveDraft / loadDraft round-trip', () => {
  it('persists a patch and reads it back merged', async () => {
    await saveDraft({ role: 'client', goals: ['strength'] });
    const afterFirst = await loadDraft();
    expect(afterFirst.role).toBe('client');
    expect(afterFirst.goals).toEqual(['strength']);

    await saveDraft({ dob: '1990-01-15' });
    const afterSecond = await loadDraft();
    expect(afterSecond.role).toBe('client');
    expect(afterSecond.dob).toBe('1990-01-15');
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

    // claim_athlete_role is a client-path-only call
    expect(rpcMock).not.toHaveBeenCalled();

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

  it('client path: sets role client, client_onboarded, onboarding_path, dob, name, and calls claim_athlete_role', async () => {
    await saveDraft({
      role: 'client',
      goals: ['fat_loss'],
      locations: ['Home'],
      mode: 'remote',
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
        onboarding_intake: { goals: ['fat_loss'], location: 'Home', mode: 'remote' },
        intake_goal: 'fat_loss',
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

  it('client path: omits dob and name when absent, and defaults intake fields', async () => {
    await saveDraft({ role: 'client' });
    await applyOnboardingDraft('client-2');

    expect(updateUserMock).toHaveBeenCalledWith({
      data: {
        role: 'client',
        client_onboarded: true,
        onboarding_intake: { goals: [], location: null, mode: null },
        intake_goal: null,
        onboarding_path: null,
      },
    });
  });
});
