# AI Implementation Standard Operating Procedure (SOP)

This document serves as the mandatory checklist for any AI agent interacting with the FitLink Native codebase. Due to the scale and complexity of this two-sided marketplace (Coach & Client), assumptions lead to broken architecture.

## 1. Deep Dive First, Plan Second
Before proposing an Implementation Plan, the agent MUST:
- Traverse the relevant directories (`app/(tabs)` vs `app/(client-tabs)`).
- Verify the existence of frontend screens before assuming they need to be built from scratch.
- Check the database schema (`supabase/migrations`) to understand the backend architecture.
- Identify Edge Functions (`supabase/functions`) that might be handling background tasks (e.g., Push Notifications, Stripe Webhooks).

## 2. Platform Nuances (iOS vs Android)
- **Push Notifications:** Expo handles iOS via APNs seamlessly, but Android relies on Firebase Cloud Messaging (FCM). With FCM v1 API changes, FitLink uses a custom Firebase Cloud Function (`FIREBASE_PUSH_URL`) for Android. Payloads must be strictly stringified (`data: Record<string, string>`) and tested against this custom backend.
- **File URIs:** Image and file picking on Android often yield `content://` URIs, whereas iOS yields `file://` or `assets-library://`. Upload mechanisms must handle base64 encoding or native blob resolution robustly across both platforms.

## 3. UI/UX Aesthetic Enforcement
FitLink uses a "Brutalist Luxury / Editorial" aesthetic:
- **Colors:** Deep blacks (`#000000`, `#0A0A0A`), crisp whites (`#FFFFFF`), and muted structural borders (`rgba(255,255,255,0.1)`). NO soft pastels or generic SaaS blues.
- **Typography:** Uppercase headers (`FontFamily.heading`), precise letter spacing (`1px` or `2px`), and sharp alignment.
- **Geometry:** 1px borders, rigid dimensions (36x36 or 32x32 containers), sharp or ultra-minimal border radii (`Radius.xs`).

## 4. Execution Protocol
- Update `task.md` sequentially as milestones are hit.
- Never run global un-tested regex replacements without dry runs.
- If a frontend component uses a context (like `ClientContext`), verify the properties exist in the context before assuming they are passed via props.
- Run `npx tsc --noEmit` after every major phase to ensure type safety remains intact.
