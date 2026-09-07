/**
 * Mount smoke tests for the pre-account onboarding screens a coach walks
 * through: coach-intake and the account step (name, date of birth, email or
 * phone). These screens were changed for the keyboard fix and shipped over
 * the air; a throw on mount would look like a crash the moment they appear.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

type Tree = ReturnType<typeof TestRenderer.create>;
const texts = (t: Tree) => t.root.findAll((n: ReactTestInstance) => typeof n.type === 'string' && n.type === 'Text').map((n: ReactTestInstance) => n.children.map(String).join(''));
const hasLabel = (t: Tree, label: string) => t.root.findAll((n: ReactTestInstance) => n.props?.accessibilityLabel === label).length > 0;

const routerState: { params: Record<string, string> } = { params: {} };
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true }),
    useLocalSearchParams: () => routerState.params,
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
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('../lib/supabase', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  supabase: { auth: {}, from: () => ({}), rpc: jest.fn(), functions: { invoke: jest.fn() } },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../lib/layers', () => ({ layers: { track: jest.fn(), reset: jest.fn() } }));
jest.mock('../lib/secureStore', () => ({ setItemAsync: jest.fn(async () => {}), getItemAsync: jest.fn(async () => null), deleteItemAsync: jest.fn(async () => {}) }));
jest.mock('../context/AlertContext', () => ({ useAlert: () => ({ showAlert: jest.fn() }) }));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    signUp: jest.fn(async () => {}),
    signInWithPhone: jest.fn(async () => {}),
    verifyOtp: jest.fn(async () => {}),
    signUpAsClient: jest.fn(async () => {}),
  }),
}));
jest.mock('../context/RevenueCatContext', () => ({
  useRevenueCat: () => ({ athletePlan: { monthly: null, annual: null }, coachPlan: { monthly: null, annual: null }, storeStatus: null }),
}));

import AccountScreen from '../app/(auth)/account';
import CoachIntakeScreen from '../app/(auth)/coach-intake';

describe('coach onboarding screens mount', () => {
  it('account step mounts for a coach', async () => {
    routerState.params = { role: 'trainer' };
    let tree: Tree | null = null;
    await act(async () => { tree = TestRenderer.create(<AccountScreen />); });
    expect(texts(tree!).length).toBeGreaterThan(0);
  });

  it('account step mounts for an athlete', async () => {
    routerState.params = { role: 'client' };
    let tree: Tree | null = null;
    await act(async () => { tree = TestRenderer.create(<AccountScreen />); });
    expect(texts(tree!).length).toBeGreaterThan(0);
  });

  it('coach intake mounts', async () => {
    routerState.params = {};
    let tree: Tree | null = null;
    await act(async () => { tree = TestRenderer.create(<CoachIntakeScreen />); });
    expect(texts(tree!).length).toBeGreaterThan(0);
  });
});
