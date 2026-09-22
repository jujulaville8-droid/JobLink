# Post-Login Interface Smoothness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make JobLink's signed-in experience feel immediate, stable, and polished across desktop and mobile without changing business behavior.

**Architecture:** Preserve the server-rendered authenticated dashboard shell, then add a small client-side transition wrapper and navigation-feedback hook inside it. Use Next.js route loading boundaries for honest progress, pure route-matching helpers for consistent active states, and narrowly scoped CSS motion tokens instead of the current global transition on every DOM node.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Tailwind CSS 4, Node.js built-in test runner

**Spec:** `docs/superpowers/specs/2026-09-22-post-login-interface-smoothness-design.md`

## Global Constraints

- Keep existing seeker, employer, and admin behavior unchanged.
- Page motion must finish in roughly 150–200 ms and never block interaction.
- Movement distance must not exceed 4–6 px.
- Preserve semantic links and buttons and visible keyboard focus.
- Honor `prefers-reduced-motion: reduce`.
- Do not add a client-side data cache, authentication changes, schema changes, or new runtime dependencies.
- Do not modify or stage unrelated existing worktree changes.

## File Structure

- Create `src/lib/navigation-state.ts`: pure pathname matching shared by desktop and mobile navigation.
- Create `tests/navigation-state.test.mjs`: Node test coverage for exact, nested, and root-route matching.
- Create `src/components/useNavigationFeedback.ts`: client hook that prefetches routes and owns short-lived pending navigation state.
- Create `src/components/DashboardPageTransition.tsx`: keyed content wrapper that restarts the restrained page entrance when the pathname changes.
- Create `src/app/(dashboard)/loading.tsx`: responsive, assistive-technology-hidden dashboard skeleton.
- Modify `src/app/(dashboard)/layout.tsx`: keep a stable content viewport and route all dashboard children through the transition wrapper.
- Modify `src/components/SidebarNav.tsx`: use shared route matching, prefetching, pressed states, and an inline pending indicator.
- Modify `src/components/BottomNav.tsx`: use nested-route matching, stable touch targets, prefetching, pressed states, and pending feedback.
- Modify `src/components/ui/button.tsx`: standardize brief press, focus, and disabled feedback for shared buttons.
- Modify `src/app/globals.css`: remove the blanket 300 ms DOM transition and global smooth scrolling; add targeted dashboard motion, skeleton, navigation, and reduced-motion rules.

---

### Task 1: Tested Navigation State Primitives

**Files:**
- Create: `src/lib/navigation-state.ts`
- Create: `tests/navigation-state.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `isRouteActive(pathname: string, href: string): boolean`
- Produces: `isModifiedNavigation(event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">): boolean`
- Consumes: no application modules

- [x] **Step 1: Write the failing route-state tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  isModifiedNavigation,
  isRouteActive,
} from "../src/lib/navigation-state.ts";

test("root is active only on the root pathname", () => {
  assert.equal(isRouteActive("/", "/"), true);
  assert.equal(isRouteActive("/jobs", "/"), false);
});

test("dashboard links stay active on nested routes", () => {
  assert.equal(isRouteActive("/messages", "/messages"), true);
  assert.equal(isRouteActive("/messages/abc", "/messages"), true);
  assert.equal(isRouteActive("/profile/cv", "/profile"), true);
  assert.equal(isRouteActive("/profiles", "/profile"), false);
});

test("modified and non-primary clicks preserve native browser navigation", () => {
  assert.equal(isModifiedNavigation({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), false);
  assert.equal(isModifiedNavigation({ button: 0, metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }), true);
  assert.equal(isModifiedNavigation({ button: 1, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }), true);
});
```

- [x] **Step 2: Add the test command and prove the test fails**

Add to `package.json` scripts:

```json
"test:ui": "node --experimental-strip-types --test tests/navigation-state.test.mjs"
```

Run: `npm run test:ui`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/lib/navigation-state.ts`.

- [x] **Step 3: Implement the minimal pure helpers**

```ts
type NavigationEvent = Pick<
  MouseEvent,
  "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

export function isRouteActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isModifiedNavigation(event: NavigationEvent) {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
```

- [x] **Step 4: Run the focused test and type checks**

Run: `npm run test:ui`

Expected: 3 tests pass.

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [x] **Step 5: Commit the tested primitives**

```bash
git add package.json src/lib/navigation-state.ts tests/navigation-state.test.mjs
git commit -m "test: add dashboard navigation state coverage"
```

### Task 2: Stable Dashboard Shell and Honest Loading Feedback

**Files:**
- Create: `src/components/DashboardPageTransition.tsx`
- Create: `src/app/(dashboard)/loading.tsx`
- Modify: `src/app/(dashboard)/layout.tsx:88-121`
- Modify: `src/app/globals.css:3-75,103-213`

**Interfaces:**
- Consumes: `children: React.ReactNode` from the authenticated server layout
- Produces: `DashboardPageTransition({ children }: { children: React.ReactNode }): React.ReactElement`
- Produces: a framework-owned default export from `loading.tsx`

- [x] **Step 1: Add a failing source-contract test for the shared shell**

Append to `tests/navigation-state.test.mjs`:

```js
import { readFile } from "node:fs/promises";

test("dashboard shell defines a loading boundary and reduced-motion fallback", async () => {
  const [loading, css] = await Promise.all([
    readFile(new URL("../src/app/(dashboard)/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(loading, /aria-hidden="true"/);
  assert.match(css, /dashboard-page-enter/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /html \*,\s*html \*::before/);
});
```

- [x] **Step 2: Run the test and confirm the missing boundary fails**

Run: `npm run test:ui`

Expected: FAIL with `ENOENT` for `src/app/(dashboard)/loading.tsx`.

- [x] **Step 3: Add the route-keyed content wrapper**

Create `DashboardPageTransition.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";

export default function DashboardPageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="dashboard-page-enter min-h-[60vh]">
      {children}
    </div>
  );
}
```

- [x] **Step 4: Add a geometry-preserving dashboard skeleton**

Create `src/app/(dashboard)/loading.tsx` with an `aria-hidden="true"` root, a title row, three responsive summary cards, and five list rows. Each placeholder uses the existing `skeleton` class, with the outer layout matching the dashboard content width rather than introducing another page container.

```tsx
export default function DashboardLoading() {
  return (
    <div aria-hidden="true" className="dashboard-loading min-h-[60vh] space-y-6">
      <div className="space-y-3">
        <div className="skeleton h-8 w-52" />
        <div className="skeleton h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-2xl border border-border bg-white p-5">
            <div className="skeleton h-4 w-24" />
            <div className="skeleton mt-4 h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-white">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="flex items-center gap-4 border-b border-border p-4 last:border-0">
            <div className="skeleton h-11 w-11 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-2/5" />
              <div className="skeleton h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [x] **Step 5: Wire the stable content viewport into the authenticated layout**

Import `DashboardPageTransition` and replace the raw `{children}` at `layout.tsx:115` with:

```tsx
<DashboardPageTransition>{children}</DashboardPageTransition>
```

Add `min-w-0` to the main element and `w-full` to its inner container so page widths do not push the shell.

- [x] **Step 6: Replace blanket transitions with targeted motion**

In `globals.css`, remove the `html, html *, html *::before, html *::after` transition rule and the global `html { scroll-behavior: smooth; }` rule. Add motion tokens to `:root`, a 180 ms `dashboard-page-in` animation using `translateY(5px)`, a 120 ms navigation feedback transition, and the reduced-motion block:

```css
:root {
  --motion-fast: 120ms;
  --motion-page: 180ms;
  --motion-ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes dashboard-page-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.dashboard-page-enter {
  animation: dashboard-page-in var(--motion-page) var(--motion-ease-out) both;
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto !important; }
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

Also set `.skeleton { pointer-events: none; }` so loading placeholders cannot intercept input.

- [x] **Step 7: Run the tests, lint the touched files, and build**

Run: `npm run test:ui`

Expected: all tests pass.

Run: `npx eslint 'src/app/(dashboard)/layout.tsx' 'src/app/(dashboard)/loading.tsx' src/components/DashboardPageTransition.tsx`

Expected: exit code 0.

Run: `npm run build`

Expected: successful production build.

- [x] **Step 8: Commit the stable shell**

```bash
git add 'src/app/(dashboard)/layout.tsx' 'src/app/(dashboard)/loading.tsx' src/components/DashboardPageTransition.tsx src/app/globals.css tests/navigation-state.test.mjs
git commit -m "feat: add stable dashboard loading transitions"
```

### Task 3: Responsive Desktop and Mobile Navigation Feedback

**Files:**
- Create: `src/components/useNavigationFeedback.ts`
- Modify: `src/components/SidebarNav.tsx:1-132`
- Modify: `src/components/BottomNav.tsx:1-120`
- Modify: `src/app/globals.css`
- Test: `tests/navigation-state.test.mjs`

**Interfaces:**
- Consumes: `isModifiedNavigation` and `isRouteActive` from `@/lib/navigation-state`
- Produces: `useNavigationFeedback(): { activePathname: string; pendingHref: string | null; beginNavigation(event: React.MouseEvent<HTMLAnchorElement>, href: string): void; prefetch(href: string): void; isActive(href: string): boolean; isPending(href: string): boolean }`

- [x] **Step 1: Extend route-state tests for the pending active pathname contract**

Add `getActivePathname` to the existing import from `navigation-state.ts`, then append this test:

```js
test("a pending destination becomes active immediately", () => {
  assert.equal(getActivePathname("/dashboard", "/messages"), "/messages");
  assert.equal(getActivePathname("/messages", null), "/messages");
});
```

Run: `npm run test:ui`

Expected: FAIL because `getActivePathname` is not exported.

- [x] **Step 2: Implement the pending-path helper and client hook**

Add to `navigation-state.ts`:

```ts
export function getActivePathname(pathname: string, pendingHref: string | null) {
  return pendingHref ?? pathname;
}
```

Create `useNavigationFeedback.ts` with `usePathname`, `useRouter`, and local `pendingHref`. Clear pending state on pathname changes and after a 4-second safety timeout. `beginNavigation` ignores active destinations, prevented events, download links, non-`_self` targets, and modified clicks:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getActivePathname,
  isModifiedNavigation,
  isRouteActive,
} from "@/lib/navigation-state";

const PENDING_TIMEOUT_MS = 4_000;

export function useNavigationFeedback() {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const timeout = window.setTimeout(() => setPendingHref(null), PENDING_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  const beginNavigation = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      const anchor = event.currentTarget;
      if (
        event.defaultPrevented ||
        isModifiedNavigation(event.nativeEvent) ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self") ||
        isRouteActive(pathname, href)
      ) {
        return;
      }
      if (pendingHref === href) event.preventDefault();
      setPendingHref(href);
    },
    [pathname, pendingHref],
  );

  const prefetch = useCallback((href: string) => router.prefetch(href), [router]);
  const activePathname = getActivePathname(pathname, pendingHref);

  return {
    activePathname,
    pendingHref,
    beginNavigation,
    prefetch,
    isActive: (href: string) => isRouteActive(activePathname, href),
    isPending: (href: string) => pendingHref === href,
  };
}
```

- [x] **Step 3: Apply feedback to the sidebar**

Replace direct `usePathname` use with `useNavigationFeedback`. Each link must include:

```tsx
aria-current={isActive ? "page" : undefined}
aria-busy={isPending || undefined}
onClick={(event) => beginNavigation(event, link.href)}
onFocus={() => prefetch(link.href)}
onMouseEnter={() => prefetch(link.href)}
onTouchStart={() => prefetch(link.href)}
```

Use the pending destination for the active visual state. Add `dashboard-nav-link` and `data-pending={isPending || undefined}`. Render a 14 px CSS spinner before the badge when pending while leaving badges mounted to avoid width changes.

- [x] **Step 4: Apply nested matching and touch feedback to mobile navigation**

Replace the exact `pathname === path` check in `BottomNav` with the hook's `isActive`. Add the same prefetch and click handlers as the sidebar, `aria-current`, `aria-busy`, `dashboard-bottom-nav-link`, and `data-pending`. Keep every item at least 44 px tall and render the active dot with `aria-hidden="true"`; pending dots use the CSS pulse animation.

- [x] **Step 5: Add narrowly scoped navigation CSS**

Add the following narrowly scoped rules. The reduced-motion block from Task 2 disables the pulse and rotation automatically.

```css
.dashboard-nav-link,
.dashboard-bottom-nav-link {
  -webkit-tap-highlight-color: transparent;
  transition:
    color var(--motion-fast) var(--motion-ease-out),
    background-color var(--motion-fast) var(--motion-ease-out),
    border-color var(--motion-fast) var(--motion-ease-out),
    opacity var(--motion-fast) var(--motion-ease-out),
    transform var(--motion-fast) var(--motion-ease-out);
}

.dashboard-nav-link:active,
.dashboard-bottom-nav-link:active {
  transform: scale(0.98);
}

@keyframes dashboard-nav-spin {
  to { transform: rotate(360deg); }
}

@keyframes dashboard-nav-pulse {
  50% { opacity: 0.45; transform: translateX(-50%) scale(0.78); }
}

.dashboard-nav-spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 9999px;
  animation: dashboard-nav-spin 600ms linear infinite;
}

.dashboard-bottom-nav-link[data-pending="true"] .dashboard-nav-dot {
  animation: dashboard-nav-pulse 600ms ease-in-out infinite;
}
```

- [x] **Step 6: Verify behavior and quality gates**

Run: `npm run test:ui`

Expected: all tests pass.

Run: `npx eslint src/lib/navigation-state.ts src/components/useNavigationFeedback.ts src/components/SidebarNav.tsx src/components/BottomNav.tsx`

Expected: exit code 0.

Run: `npm run build`

Expected: successful production build.

- [x] **Step 7: Commit navigation feedback**

```bash
git add src/lib/navigation-state.ts src/components/useNavigationFeedback.ts src/components/SidebarNav.tsx src/components/BottomNav.tsx src/app/globals.css tests/navigation-state.test.mjs
git commit -m "feat: add instant dashboard navigation feedback"
```

### Task 4: Interaction Polish and Full Verification

**Files:**
- Modify: `src/components/ui/button.tsx:8-30`
- Modify: `src/app/globals.css:235-340`
- Modify: `docs/superpowers/plans/2026-09-22-post-login-interface-smoothness.md` checkbox state only

**Interfaces:**
- Consumes: existing `buttonVariants` API without changing its props or exports
- Produces: the same `Button` and `buttonVariants` exports with consistent press, focus, pending, and disabled visuals

- [ ] **Step 1: Add a failing source-contract test for shared button feedback**

Append to `tests/navigation-state.test.mjs`:

```js
test("shared buttons provide press and busy feedback", async () => {
  const button = await readFile(new URL("../src/components/ui/button.tsx", import.meta.url), "utf8");
  assert.match(button, /active:scale-\[0\.98\]/);
  assert.match(button, /aria-\[busy=true\]:cursor-wait/);
});
```

Run: `npm run test:ui`

Expected: FAIL because the shared button does not yet include the feedback classes.

- [ ] **Step 2: Polish the shared button primitive without changing its API**

Replace the broad `transition-colors` class in `buttonVariants` with:

```text
transition-[transform,background-color,border-color,color,box-shadow,opacity] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:transform-none aria-[busy=true]:cursor-wait aria-[busy=true]:opacity-70
```

Keep all existing variants and sizes unchanged.

- [ ] **Step 3: Tighten legacy global button timing**

Change `.btn-primary`, `.btn-warm`, `.btn-secondary`, and `.btn-secondary-dark` to explicit 180 ms transitions for transform, background-color, border-color, and box-shadow. Reduce hover translation from 2 px to 1 px and preserve zero translation on active press.

- [ ] **Step 4: Run all automated checks**

Run: `npm run test:ui`

Expected: all tests pass.

Run: `npm run lint`

Expected: exit code 0, or only pre-existing warnings documented in the final handoff.

Run: `npx tsc --noEmit`

Expected: exit code 0.

Run: `npm run build`

Expected: successful production build.

- [ ] **Step 5: Perform signed-in desktop and mobile verification**

Start the app with `npm run dev` and verify:

1. Desktop sidebar remains mounted while moving between `/dashboard`, `/profile`, `/profile/cv`, `/jobs`, `/messages`, and `/settings`.
2. Clicking a destination changes its active treatment immediately, shows a pending spinner, and clears the spinner on arrival.
3. Slow route responses display the dashboard skeleton without shifting the surrounding shell.
4. Mobile navigation remains fixed, respects safe-area padding, and correctly highlights nested `/messages/[id]`, `/jobs/[id]`, and `/profile/cv` routes.
5. Keyboard focus remains visible and Enter activates links and buttons normally.
6. With reduced motion enabled, content appears without visible translation, shimmer, pulse, or rotation.
7. Seeker, employer, and admin navigation destinations and permissions remain unchanged.

- [ ] **Step 6: Review the final diff for scope and unrelated files**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only files named in this plan plus the repository's pre-existing unrelated changes.

- [ ] **Step 7: Commit the final interaction polish**

```bash
git add src/components/ui/button.tsx src/app/globals.css tests/navigation-state.test.mjs docs/superpowers/plans/2026-09-22-post-login-interface-smoothness.md
git commit -m "feat: polish signed-in interaction feedback"
```
