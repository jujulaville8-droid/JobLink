# Homepage candidate preview

The public homepage uses anonymous abstractions: category icons, silhouette icons and skeleton shapes. It has no candidate data source, photos, names, identifiers, contacts, availability claims, ratings or counts. Removing every visual effect reveals only these abstractions. The caption reads “Create an employer account to browse candidates”.

Anonymous signup preserves employer intent and `/members` as the return destination. Signed-in links still go through `/members`, which checks server account state before forwarding an employer to the existing directory. Homepage auth state changes copy only. Directory permissions, candidate visibility, CV rules, email verification, company requirements and pricing are unchanged. Homepage links do not prefetch candidate routes.

## Design and source

The September 30 design preview uses two softly tilted opposing rows, ivory and seafoam cards, a peach accent and a stationary frosted panel. Mobile retains both rows in a compact 300px visual. JobLink’s existing serif heading and primary signup button remain the focus.

Research references, viewed September 30, 2026:

- [21st.dev marquee guide](https://news.21st.dev/blog/react-marquee-logo-cloud-components): compared horizontal, vertical and perspective variants; adopted the general duplicated-track, masked-edge pattern. Vertical and heavier 3D treatments were less suited to the narrow mobile preview.
- [Ali Imam’s Marquee Card](https://21st.dev/@designali-in/components/marquee-card): public rendered example reviewed for rhythm and card treatment. A component-specific reuse license was not established, so none of its code or demo media is used.
- [21st.dev terms](https://docs.21st.dev/terms), updated July 20, 2026: marketplace demo/media rights are separate from component-code licenses. No registry extraction, scraping, copied demo assets, accounts or purchases were used.
- [Magic UI Marquee](https://magicui.design/docs/components/marquee): the existing repository primitive is retained. Its upstream [MIT license](https://github.com/magicuidesign/magicui/blob/main/LICENSE.md) is preserved in `src/components/magicui/LICENSE.md`, with a source comment in the component.

The card markup, layout and CSS treatment are original work for JobLink. Icons come from the existing `lucide-react` dependency. There are no added packages, external media, timers, animation libraries or candidate requests. Motion uses the existing CSS transform keyframe. The stationary frosted panel uses a single backdrop filter; moving cards do not animate blur or shadows.

## Motion and accessibility

Copy and links render on the server. Animation starts after hydration so a working pause control is available; without JavaScript it stays still. Hover and keyboard focus pause both rows. A persistent pause/resume button exposes its state, has a 44px minimum target and a visible focus ring. Reduced motion removes animation and the inapplicable control. Cards and their duplicated tracks are decorative, hidden from assistive technology and contain no focusable children.

## Validation and reproduction

`npm test` covers typecheck, lint, unit and Node suites; `npm run build` checks the production bundle. `tests/browser/check-talent-preview.cjs` checks 320/390/768/1440px geometry, continuous track coverage, signup/login destinations, pause/resume and keyboard behavior, reduced motion, no JavaScript, and absence of a synthetic private-candidate canary from public HTML and requests. Screenshots are saved under `output/playwright/candidate-after-*.png`.

Local preview validation passed: production build and typecheck; 218 unit tests with one existing skip; 34 Node tests; 54 browser checks with no runtime errors; lint with zero errors and nine existing warnings. Screenshots at all four widths were visually reviewed. The accessibility tree contains the heading, copy, signup/sign-in links and pause button, with decorative cards excluded.

Browser checks use a read-only localhost fixture, not live accounts or a database-policy emulator. They establish UI/gateway behavior with synthetic sessions, not deployed RLS or identity-provider behavior. Production auth, CSP and database policies are untouched.

To reproduce:

1. Run `node tests/browser/talent-fixture.mjs` on port 4318.
2. Build and start on port 4319 with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4318`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=local-fixture-anon`, `SUPABASE_SERVICE_ROLE_KEY=local-fixture-service`, and both site/app URL variables set to `http://127.0.0.1:4319`.
3. Run `node tests/browser/check-talent-preview.cjs` with Playwright available on `NODE_PATH` if installed outside the repository.

PR #19 already published the positive caption and small-mobile action containment fix. The broader visual redesign is a separate preview for review and is not automatically merged. Company claim PR #17 remains separate and unmerged.
