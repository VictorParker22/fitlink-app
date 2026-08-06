---
name: FitLink Client Refactoring Plan
description: Comprehensive refactoring roadmap for the FitLink React Native client app, covering code splitting, data centralization, navigation fixes, accessibility, and production readiness.
---

# FitLink Client Refactoring Plan

## Phase 1: Critical (Before Beta ~5h)
1. Split workouts.tsx (1,786 lines) into 6+ components
2. Extract ~3,000 lines of mock data into `data/` directory
3. Centralize CATEGORY_COLORS (duplicated 6× with inconsistent values) into `constants/categoryColors.ts`
4. Fix navigation: replace `router.back()` in strength-session, my-profile, my-subscription, connected-tech
5. Add back buttons to my-diet, health-insights, my-messages (navigation dead-ends)
6. Remove stale state: `selectedArticle`, unused CATEGORY_LIBRARIES entries
7. Add error boundaries + "Not Found" fallback for missing params (article-detail, program-detail, strength-session)
8. Fix rest timer modal missing `onRequestClose` in workouts.tsx

## Phase 2: Important (Before Launch ~8h)
6. Switch all `<Image>` to `expo-image` (already installed)
7. Create shared components: ScreenHeader, SessionRow, Divider, HeroImage, FavoriteButton
8. Add accessibility labels to all interactive elements and images (13 screens missing)
9. Type-safe routes — eliminate 30+ `as any` casts
10. Remove credentials.json from repo, add to .gitignore

## Phase 3: Polish (Post-Launch ~15h+)
11. Onboarding flow
12. Push notification scheduling
13. Loading/skeleton states
14. Offline caching
15. Analytics integration
16. Unit & integration tests

## Key Architecture Rules
- **Navigation:** Never use `router.back()` in hidden tab screens — always explicit `router.push()`
- **Data:** All mock data in `data/` directory, never inline in screen files
- **Styles:** Use theme tokens (Spacing, Radius, FontSize) — not hardcoded values
- **Components:** Extract any UI pattern used in 3+ files into `components/ui/`
- **Types:** No `as any` — use typed route maps and proper interfaces
- **Bottom padding:** Standardize to `<View style={{ height: 100 }} />` for tab bar clearance
- **SafeAreaView:** Always use `edges={['top']}` pattern (not manual insets)
