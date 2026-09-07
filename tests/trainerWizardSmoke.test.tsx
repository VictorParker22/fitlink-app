/**
 * Mount smoke test for the coach setup wizard. A coach reported the app
 * crashing the moment this screen appears after sign-up; this renders the
 * first stop with a brand-new trainer (no row yet) and with a row on file,
 * so a render-time or effect-time throw shows up here instead of on a phone.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

type Tree = ReturnType<typeof TestRenderer.create>;
const texts = (t: Tree) => t.root.findAll((n: ReactTestInstance) => typeof n.type === 'string' && n.type === 'Text').map((n: ReactTestInstance) => n.children.map(String).join(''));
const hasText = (t: Tree, text: string) => texts(t).some((x: string) => x === text);
const hasLabel = (t: Tree, label: string) => t.root.findAll((n: ReactTestInstance) => n.props?.accessibilityLabel === label).length > 0;

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void | (() => void)) => React.useEffect(cb, [cb]),
  };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../lib/supabase', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  supabase: {
    rpc: jest.fn(() => ({ maybeSingle: async () => ({ data: null, error: null }) })),
    auth: { updateUser: jest.fn(async () => ({ data: null, error: null })) },
    storage: { from: () => ({ upload: jest.fn(async () => ({ error: null })), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    functions: { invoke: jest.fn(async () => ({ data: null, error: null })) },
  },
}));
jest.mock('../lib/permissions', () => ({
  getNotificationState: jest.fn(async () => 'undetermined'),
  requestNotifications: jest.fn(async () => 'granted'),
  getCameraMicState: jest.fn(async () => 'undetermined'),
  requestCameraMic: jest.fn(async () => 'granted'),
}));
jest.mock('../lib/secureStore', () => ({ setItemAsync: jest.fn(async () => {}), getItemAsync: jest.fn(async () => null), deleteItemAsync: jest.fn(async () => {}) }));
jest.mock('../lib/layers', () => ({ layers: { track: jest.fn(), reset: jest.fn() } }));
jest.mock('../context/AlertContext', () => ({ useAlert: () => ({ showAlert: jest.fn() }) }));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'coach-1' } }) }));

const appState: { trainer: any } = { trainer: null };
jest.mock('../context/AppContext', () => ({
  useApp: () => ({ trainer: appState.trainer, updateTrainer: jest.fn(async () => {}) }),
}));

import TrainerWizardScreen from '../app/(auth)/trainer-wizard';

describe('TrainerWizardScreen mount', () => {
  it('mounts for a brand-new coach with no trainer row', async () => {
    appState.trainer = null;
    let tree: Tree | null = null;
    await act(async () => { tree = TestRenderer.create(<TrainerWizardScreen />); });
    expect(hasText(tree!, 'Step 1 of 4')).toBe(true);
    expect(hasLabel(tree!, 'Your name')).toBe(true);
  });

  it('mounts with the name on file and folds the field into a row', async () => {
    appState.trainer = { id: 'coach-1', name: 'Coach Mike', bio: '', specializations: ['strength'], certifications: [], training_locations: ['member_gym'], coaching_mode: 'in_person', working_hours: null };
    let tree: Tree | null = null;
    await act(async () => { tree = TestRenderer.create(<TrainerWizardScreen />); });
    expect(hasLabel(tree!, 'Edit name')).toBe(true);
    expect(hasLabel(tree!, 'Your name')).toBe(false);
  });

  it('mounts when the trainer row arrives after the screen', async () => {
    appState.trainer = null;
    let tree: Tree | null = null;
    await act(async () => { tree = TestRenderer.create(<TrainerWizardScreen />); });
    appState.trainer = { id: 'coach-1', name: 'Late Row', bio: 'Hi', specialization: 'fat loss', specializations: ['fat loss'], certifications: ['NASM CPT', 'PN1'] };
    await act(async () => { tree!.update(<TrainerWizardScreen />); });
    expect(hasText(tree!, 'Step 1 of 4')).toBe(true);
  });
});
