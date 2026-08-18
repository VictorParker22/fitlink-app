/**
 * BASE module — deliberately the WEB-SAFE implementation.
 *
 * Same shape as lib/stripe-provider.ts / lib/stripe-checkout.ts, and for the
 * same reason: `react-native-purchases` cannot be imported outside native at
 * all. It reaches into react-native internals the web bundler rejects
 * outright, which fails the WHOLE BUILD rather than degrading. A runtime
 * guard is not enough — the IMPORT itself has to differ by platform.
 *
 * Metro prefers `.native.ts` on iOS/Android, so native still gets the real
 * SDK. The base is what every other resolution path lands on (web, SSR,
 * tooling), so the base fails SAFE: a miss yields inert stubs, not a broken
 * bundle. The previous arrangement had the base re-export the native package,
 * which meant every non-native resolution path detonated.
 *
 * Honesty rule: nothing here fakes an entitlement or a price. In-app
 * purchases are native-only, so on web offerings stay null, entitlements stay
 * false, and any attempt to buy or restore rejects with a message that says
 * exactly that. Callers are expected to render the truth, not a dead button.
 *
 * TYPES still come from the package — `import type` / `export type` are
 * erased at compile time, so they never reach the bundler.
 */

export type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';

const WEB_MESSAGE = 'Subscriptions are managed in the FitLink app.';

function unsupported(): never {
  throw new Error(WEB_MESSAGE);
}

// ─── Runtime enums ────────────────────────────────────────────────────────────
// PACKAGE_TYPE, PURCHASES_ERROR_CODE and LOG_LEVEL are real runtime values, not
// types, so they must be shimmed with the SAME string values the SDK uses.
// Sources (verified against node_modules):
//   @revenuecat/purchases-typescript-internal/dist/offerings.js         → PACKAGE_TYPE
//   @revenuecat/purchases-typescript-internal/dist/generated/error-codes → PURCHASES_ERROR_CODE
//   @revenuecat/purchases-typescript-internal/dist/enums.js             → LOG_LEVEL
// Each is typed as the SDK's own enum object so comparisons against values
// carried on real (native) objects keep type-checking.

export const PACKAGE_TYPE: typeof import('react-native-purchases').PACKAGE_TYPE = {
  UNKNOWN: 'UNKNOWN',
  CUSTOM: 'CUSTOM',
  LIFETIME: 'LIFETIME',
  ANNUAL: 'ANNUAL',
  SIX_MONTH: 'SIX_MONTH',
  THREE_MONTH: 'THREE_MONTH',
  TWO_MONTH: 'TWO_MONTH',
  MONTHLY: 'MONTHLY',
  WEEKLY: 'WEEKLY',
} as any;

export const PURCHASES_ERROR_CODE: typeof import('react-native-purchases').PURCHASES_ERROR_CODE = {
  UNKNOWN_ERROR: '0',
  PURCHASE_CANCELLED_ERROR: '1',
  STORE_PROBLEM_ERROR: '2',
  PURCHASE_NOT_ALLOWED_ERROR: '3',
  PURCHASE_INVALID_ERROR: '4',
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: '5',
  PRODUCT_ALREADY_PURCHASED_ERROR: '6',
  RECEIPT_ALREADY_IN_USE_ERROR: '7',
  INVALID_RECEIPT_ERROR: '8',
  MISSING_RECEIPT_FILE_ERROR: '9',
  NETWORK_ERROR: '10',
  INVALID_CREDENTIALS_ERROR: '11',
  UNEXPECTED_BACKEND_RESPONSE_ERROR: '12',
  RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR: '13',
  INVALID_APP_USER_ID_ERROR: '14',
  OPERATION_ALREADY_IN_PROGRESS_ERROR: '15',
  UNKNOWN_BACKEND_ERROR: '16',
  INVALID_APPLE_SUBSCRIPTION_KEY_ERROR: '17',
  INELIGIBLE_ERROR: '18',
  INSUFFICIENT_PERMISSIONS_ERROR: '19',
  PAYMENT_PENDING_ERROR: '20',
  INVALID_SUBSCRIBER_ATTRIBUTES_ERROR: '21',
  LOG_OUT_ANONYMOUS_USER_ERROR: '22',
  CONFIGURATION_ERROR: '23',
  UNSUPPORTED_ERROR: '24',
  EMPTY_SUBSCRIBER_ATTRIBUTES_ERROR: '25',
  PRODUCT_DISCOUNT_MISSING_IDENTIFIER_ERROR: '26',
  PRODUCT_DISCOUNT_MISSING_SUBSCRIPTION_GROUP_IDENTIFIER_ERROR: '28',
  CUSTOMER_INFO_ERROR: '29',
  SYSTEM_INFO_ERROR: '30',
  BEGIN_REFUND_REQUEST_ERROR: '31',
  PRODUCT_REQUEST_TIMED_OUT_ERROR: '32',
  API_ENDPOINT_BLOCKED: '33',
  INVALID_PROMOTIONAL_OFFER_ERROR: '34',
  OFFLINE_CONNECTION_ERROR: '35',
  TEST_STORE_SIMULATED_PURCHASE_ERROR: '42',
} as any;

export const LOG_LEVEL: typeof import('react-native-purchases').LOG_LEVEL = {
  VERBOSE: 'VERBOSE',
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as any;

// ─── The SDK singleton ────────────────────────────────────────────────────────
// Inert everywhere the real native module cannot exist. Nothing here reports
// success it did not achieve: reads return empty, writes reject.

const webPurchases = {
  setLogLevel: (_level?: unknown) => {},
  configure: (_options?: unknown) => {},
  logIn: async (_userId: string) => unsupported(),
  logOut: async () => unsupported(),
  getCustomerInfo: async () => unsupported(),
  getOfferings: async () => unsupported(),
  purchasePackage: async (_pkg: unknown) => unsupported(),
  restorePurchases: async () => unsupported(),
  addCustomerInfoUpdateListener: (_listener: unknown) => ({ remove: () => {} }),
  removeCustomerInfoUpdateListener: (_listener: unknown) => {},
  isConfigured: async () => false,
};

export const Purchases = webPurchases as unknown as typeof import('react-native-purchases').default;

export default Purchases;
