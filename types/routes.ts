/**
 * Type-safe route definitions for FitLink client navigation.
 * Eliminates `as any` casts on router.push() calls.
 *
 * Usage:
 *   import { ClientRoute } from '../../types/routes';
 *   router.push(ClientRoute.workouts);
 *   router.push({ pathname: ClientRoute.classDetail, params: { id: '1', title: 'Yoga' } });
 */

/** Simple routes (no params) */
export const ClientRoute = {
  // Tab screens
  home: '/(client-tabs)/' as const,
  workouts: '/(client-tabs)/workouts' as const,
  myProgress: '/(client-tabs)/my-progress' as const,
  myPass: '/(client-tabs)/my-pass' as const,
  more: '/(client-tabs)/my-profile' as const,

  // Content screens
  exploreClasses: '/(client-tabs)/explore-classes' as const,
  collections: '/(client-tabs)/collections' as const,
  articles: '/(client-tabs)/articles' as const,
  programs: '/(client-tabs)/programs' as const,

  // Profile & settings
  myProfile: '/(client-tabs)/my-profile' as const,
  myDiet: '/(client-tabs)/my-diet' as const,
  healthInsights: '/(client-tabs)/health-insights' as const,
  myMessages: '/(client-tabs)/my-messages' as const,
  mySubscription: '/(client-tabs)/my-subscription' as const,
  connectedTech: '/(client-tabs)/connected-tech' as const,

  // Param screens
  classDetail: '/(client-tabs)/class-detail' as const,
  classPlayer: '/(client-tabs)/class-player' as const,
  collectionDetail: '/(client-tabs)/collection-detail' as const,
  articleDetail: '/(client-tabs)/article-detail' as const,
  programDetail: '/(client-tabs)/program-detail' as const,
  strengthSession: '/(client-tabs)/strength-session' as const,
} as const;

/** Auth routes */
export const AuthRoute = {
  clientOnboarding: '/(auth)/client-onboarding' as const,
} as const;

/** Shared root-level routes accessed by both clients and trainers */
export const SharedRoute = {
  settings: '/settings' as const,
  notifications: '/notifications' as const,
  helpCenter: '/help-center' as const,
  contactSupport: '/contact-support' as const,
  termsPrivacy: '/terms-privacy' as const,
  checkout: '/checkout' as const,
} as const;

/** Type for all client route values */
export type ClientRouteValue = typeof ClientRoute[keyof typeof ClientRoute] | typeof SharedRoute[keyof typeof SharedRoute];
