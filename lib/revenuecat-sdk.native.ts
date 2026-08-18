// Native implementation — the real RevenueCat SDK.
// Metro prefers this file on iOS/Android; the web-safe stubs live in the base
// module (lib/revenuecat-sdk.ts), which nothing native ever resolves to.
import Purchases from 'react-native-purchases';

export { Purchases };
export default Purchases;

export { LOG_LEVEL, PACKAGE_TYPE, PURCHASES_ERROR_CODE } from 'react-native-purchases';

export type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesOfferings,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';
