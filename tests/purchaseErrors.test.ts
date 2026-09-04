/**
 * Purchase failures must map to a named reason and a sentence that tells
 * the athlete what to do. The SDK is stubbed (jest runs the web-safe module,
 * which carries the same enum values as react-native-purchases).
 */
import { PURCHASES_ERROR_CODE } from '../lib/revenuecat-sdk';
import { classifyPurchaseError } from '../context/RevenueCatContext';

jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../lib/layers', () => ({ layers: { track: jest.fn() } }));
jest.mock('../lib/revenuecat', () => ({
  Purchases: {},
  initRevenueCat: jest.fn(),
  isRevenueCatAvailable: false,
  ENTITLEMENT_CLIENT_PREMIUM: 'client_premium',
  ENTITLEMENT_COACH_ELITE: 'coach_elite',
  OFFERING_DEFAULT: 'default',
  OFFERING_COACH: 'coach',
}));

describe('classifyPurchaseError', () => {
  it('names an offline failure as retryable with a "nothing charged" line', () => {
    const f = classifyPurchaseError({ code: PURCHASES_ERROR_CODE.NETWORK_ERROR, message: 'x' });
    expect(f.reason).toBe('offline');
    expect(f.retryable).toBe(true);
    expect(f.message).toMatch(/Nothing has been charged/);
  });
  it('sends an already-owned subscription to Restore', () => {
    const f = classifyPurchaseError({ code: PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR });
    expect(f.reason).toBe('already_owned');
    expect(f.message).toMatch(/Restore purchases/);
  });
  it('treats a misconfiguration as not retryable', () => {
    const f = classifyPurchaseError({ code: PURCHASES_ERROR_CODE.CONFIGURATION_ERROR });
    expect(f.reason).toBe('configuration');
    expect(f.retryable).toBe(false);
  });
  it('falls back to the SDK message for an unknown code', () => {
    const f = classifyPurchaseError({ code: '999', message: 'Something odd' });
    expect(f.reason).toBe('unknown');
    expect(f.message).toBe('Something odd');
  });
});
