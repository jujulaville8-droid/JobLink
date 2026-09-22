# Post-Login Interface Smoothness Design

Date: 2026-09-22
Status: Approved in chat; awaiting written-spec review

## Goal

Make JobLink feel immediate, stable, and polished after login across seeker and employer experiences. The work focuses on perceived performance and interaction quality without changing product behavior, navigation structure, or the underlying data model.

## Success Criteria

- The signed-in shell remains visually stable while users navigate between pages.
- Every dashboard navigation action gives immediate feedback.
- Routes that need time to load show layout-matched skeletons instead of blank space or abrupt content replacement.
- Page changes use subtle motion that finishes in roughly 150–200 ms and never delays interaction.
- Buttons and form submissions clearly communicate pressed, pending, success, and error states where those states already exist.
- Mobile scrolling and bottom navigation feel responsive and do not jump when routes change.
- The experience respects `prefers-reduced-motion` and remains fully usable without animation.
- Existing seeker, employer, and admin behavior remains unchanged.

## Recommended Approach

Use a shared perceived-performance system in the existing dashboard architecture.

This is preferable to a cosmetic animation-only pass because motion cannot hide blank screens or unstable layouts. It is also preferable to a data-layer rewrite because the current goal can be achieved with lower-risk route boundaries, stable layout behavior, prefetching, and consistent interaction feedback.

## Architecture

### Stable Signed-In Shell

Keep the sidebar, mobile navigation, and main content frame mounted while dashboard routes change. The shell owns navigation feedback and the content viewport; individual pages continue to own their data and business behavior.

The content viewport will provide a consistent minimum height and containment so different page shapes do not make the surrounding interface jump.

### Route Loading Boundaries

Add a dashboard-level `loading.tsx` boundary that renders a neutral, responsive skeleton matching the common page structure: title, supporting text, summary cards, and primary content rows. Pages with materially different layouts may receive a local loading boundary only when the shared skeleton would be misleading.

Skeletons will use the existing JobLink color tokens and shimmer treatment. They must preserve approximate geometry, avoid cumulative layout shift, and remain hidden from assistive technology.

### Navigation Feedback

Desktop sidebar and mobile bottom-navigation links will:

- prefetch signed-in destinations;
- show a brief pending indicator immediately after activation;
- preserve the current active-route treatment until the destination is ready;
- use touch-safe pressed states on mobile; and
- avoid duplicate navigation while a route change is pending.

Navigation feedback will be encapsulated in a small client component rather than duplicated across both navigation systems.

### Motion System

Introduce a small set of shared motion values in global styles:

- fast feedback: approximately 120 ms;
- page entrance: approximately 180 ms;
- standard easing: a restrained ease-out curve;
- movement distance: no more than 4–6 px for page content.

The content transition will combine a short opacity change with minimal vertical movement. Persistent navigation will not animate out between routes. Large springs, staggered page reveals, and animations that block input are out of scope.

When `prefers-reduced-motion: reduce` is active, nonessential transforms and animation durations will be removed.

### Interaction Feedback

Shared buttons and relevant existing submit controls will receive consistent hover, pressed, focus-visible, and disabled/pending behavior. Existing success and error messages remain authoritative; this pass will improve their presentation rather than alter action semantics.

Forms will not be broadly rewritten. Only controls encountered in the primary post-login flows will be brought onto the shared feedback pattern.

### Mobile Behavior

The mobile bottom navigation will use stable dimensions, safe-area padding, responsive pressed feedback, and correct active matching for nested routes. The main viewport will retain enough bottom padding so content never sits beneath the fixed navigation.

Scrolling will remain native. The implementation will avoid global smooth scrolling because it can make touch interaction feel delayed and conflicts with accessibility preferences.

## Primary Flows Covered

- Login redirect into the dashboard.
- Dashboard-to-profile and dashboard-to-resume navigation.
- Job browsing, saved jobs, applications, and alerts for seekers.
- Listings, candidate browsing, company profile, and post-job entry for employers.
- Messages and settings for both roles.
- Shared admin routes receive the stable shell and loading behavior, but page-specific admin redesign is out of scope.

## Error Handling

Existing page errors remain visible and actionable. The loading system must not mask an error indefinitely. Pending navigation state clears when the pathname changes, when navigation fails, or when the initiating component unmounts.

No optimistic data mutation is introduced by this work, so server state cannot visually diverge from persisted state.

## Accessibility

- Honor reduced-motion preferences.
- Keep keyboard focus visible during navigation and form interaction.
- Do not move focus unexpectedly on route transitions.
- Mark decorative loading skeletons as hidden from assistive technology.
- Preserve semantic links and buttons; visual feedback must not replace native behavior.
- Maintain adequate contrast for pending and disabled states.

## Testing and Verification

- Unit-level coverage for route matching and navigation pending-state behavior where practical.
- Lint and production build.
- Manual verification of seeker and employer routes at desktop and mobile widths.
- Verification with reduced motion enabled.
- Verification under network throttling to confirm skeletons appear promptly and clear correctly.
- Regression checks for authentication redirects, nested-route active states, fixed mobile navigation, and existing form submissions.

## Files and Components Expected to Change

- `src/app/(dashboard)/layout.tsx`
- `src/app/(dashboard)/loading.tsx`
- `src/app/globals.css`
- `src/components/SidebarNav.tsx`
- `src/components/BottomNav.tsx`
- New small shared components for navigation feedback and route content transitions, if needed
- Focused tests or verification scripts covering the new shared behavior

## Non-Goals

- Changing JobLink branding or visual direction.
- Redesigning individual dashboard pages.
- Replacing Supabase queries or introducing a new client-side cache.
- Changing permissions, authentication, database schemas, or business logic.
- Adding elaborate animation for its own sake.
- Attempting to conceal genuinely slow backend operations instead of showing honest progress.

## Rollout Risk

The main risk is creating motion that feels slower than the current interface or pending states that get stuck. The implementation mitigates this by keeping motion brief, using native links, treating visual pending state as progressive enhancement, and testing navigation failure and reduced-motion cases.
