# Website support intake

The website has a small site-wide **Support** chat bubble in the bottom right,
opening a compact native modal panel. Visitors can
send their name (1–100 characters), reply email (up to 254 characters), and message
(10–5,000 characters), after agreeing to share those details with JobLink support
and be contacted about the request. No account or attachment is required.

The panel explicitly says **Replies by email**; it makes no live-chat,
online-agent, or instant-response claim and opens only after a visitor action.
The dialog uses the site's existing teal controls. Native modal behavior contains
keyboard focus and makes the background inert. Escape and the close button dismiss
it and restore focus to Support. The panel body scrolls while its close control
stays visible. The 56px bubble and right-edge panel sit above the actual visible
bottom navigation and Apply bar, measured with ResizeObserver and checked again
after route changes. Safe-area insets and the visual viewport are respected.
There is no current cookie banner in the repository. Future bottom cookie or
consent UI must use `data-support-obstruction` to join the same collision handling;
tests simulate such a banner. Closing or failing
keeps the draft in component memory. Refreshing or leaving the site clears it;
private drafts are not written to browser storage.

## Routing and setup

Julian confirmed **support@joblinkantigua.com** on October 12, 2026. This change
does not provision that mailbox, verify its delivery, or connect the support bot.

`POST /api/support` fails with 503 until the server environment explicitly has
`SUPPORT_RECIPIENT_EMAIL=support@joblinkantigua.com` and `RESEND_API_KEY`. A missing,
invalid, or different recipient fails closed. The API never routes using submitted
`to`, `cc`, or other recipient values. It does not fall back to `hello@` or the
owner forwarding inbox. The existing sender is
`JobLink <notifications@joblinkantigua.com>`; the validated visitor email is
Reply-To. There is no automatic email to unverified visitor addresses.

Existing Supabase URL and service-role configuration and the existing
`consume_rate_limit` RPC are required. No new dependency, migration, table,
scheduled job, or paid service is added. This route reuses the shared limiter
directly and fails closed if it is unavailable or returns malformed data, unlike
the general fail-open limiter helper. Limits are 5 attempts/IP/hour and
3 attempts/reply email/hour, with hashed bucket identifiers. This assumes Vercel's
edge overwrites client forwarding headers. The endpoint also checks same-origin
JSON submissions, a hidden spam field, consent, and streamed body size (24,000
bytes). These measures reduce abuse; they do not replace CAPTCHA against a
determined distributed spammer. No CAPTCHA service or credential is introduced.

## Delivery semantics and retries

The server sends synchronously via the existing Resend SDK, with HTML escaping
and a plain-text alternative. A positive response requires a provider message ID.
The receipt says **Message accepted for sending** and explicitly does not confirm
inbox delivery. Provider rejection, uncertainty, limiter failure, or missing
configuration keeps the draft and shows an error; it never claims a saved ticket.
Message content is not persisted in a new database table or logged.

An unchanged draft keeps its UUID and creation time through failed retries and
closing/reopening the dialog. Concurrent submits are blocked with a synchronous
ref and disabled controls. Resend receives the stable key
`website-support/<uuid>` and identical email content on unchanged retries.
Changing the draft creates a new message identity. After successful acceptance,
the draft is cleared and a reference is displayed. An explicit **Write another
message** action starts a fresh draft.

[Resend retains idempotency keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys).
Both client and server stop unchanged retries after 23 hours and retain the draft
with instructions to have support check its reference before resending. There is
no automatic background retry. A browser refresh loses the retry identity; after
an uncertain send, retry in the same open website instead of refreshing and
submitting again. Permanent deduplication across refreshes/devices would require
durable intake storage, deliberately outside this initial email-only addition.

## Before a controlled delivery test and publication

1. Verify that `support@joblinkantigua.com` exists at the receiving mail provider,
   receives mail, and is accessible to the intended support system. Check its
   forwarding/access rules without assuming bot access from the address alone.
2. Confirm the existing Resend sender domain is verified and the server has its
   existing credentials and limiter RPC. Set the support recipient only in the
   authorized preview/production server environment. Never use a `NEXT_PUBLIC_`
   variable for routing or credentials.
3. With explicit authorization, send one clearly labelled TEST request with
   synthetic details to the confirmed support inbox. Compare the on-page reference
   with Resend acceptance/delivery status, check the inbox and bot intake, and
   test a reply to the synthetic sender. Provider acceptance alone is insufficient.
4. Obtain authorization to publish. No real email, live setting, credential,
   push, merge, or deployment is part of the local implementation.

Focused specs: `tests/support-api.spec.tsx` and `tests/support-button.spec.tsx`.
Headless browser checks: `tests/browser/check-support.cjs`, using the actual
component and stylesheet in the isolated Vite fixture. The browser fixture
intercepts the support API; it cannot send real mail.

## Local verification, October 12, 2026

Base: `32d7ed3521b4b380c3d78d02eb8b7226efd2b795` (current main at checkout).
Local branch: `codex/website-support-form` in a fresh checkout created only for
this task. There was no root `AGENTS.md` or `.agents` directory; the existing
`.claude/skills/joblink-backend/SKILL.md` was read for backend conventions.

| Check | Result |
| --- | --- |
| Focused support API/form specs | 37 passed; validation, Safari focus traversal, launcher dismissal/reopen, reduced motion, proxy-origin and explicit email-response behavior verified |
| Full Vitest suite (`npm run test:unit -- --maxWorkers=2`) | 1,358 passed, 1 existing live-email test skipped (includes later job-approval tests) |
| Existing Node suite (`npm run test:node`) | 34 passed |
| `npm run typecheck` | Passed |
| `npm run lint` | 0 errors; 9 existing navigation warnings, no added warnings |
| `npm run build -- --webpack` | Passed with inert public placeholders and blank email/service credentials |
| Headless browser fixture | Chromium and WebKit each passed 10/10 normal cases: 320, 375, 390, 768, 1440 px × light/dark preferences; reduced motion, 200% text, nav/Apply/cookie clearance; 2/2 keyboard viewport cases |
| Compiled local production API | Correct 503 for unconfigured delivery, 403 for foreign origin, 400 for missing consent, 413 for excessive body; no-store responses |
| Diff whitespace check | Passed |

The initial full `npm test` run with unrestricted Vitest workers timed out in
four existing tests. The complete suite passed with two workers, without changing
those tests: `admin-company-settings-form.spec.tsx` (edited existing-company and
new-company contact submission), and `admin-application-queries.spec.tsx`
(large-dataset aggregation and shared scan-budget rejection). The first Node
runner attempt was blocked from creating its temporary IPC socket by the sandbox;
the permitted local rerun passed. An executor disconnect interrupted the default
Turbopack build; the webpack production build completed. The blank service key
caused the expected homepage featured-jobs fallback during static generation.
This verifies compilation without accessing live business data.

The browser checks exposed and fixed a Tab-loop issue and a textarea label that
absorbed filled text. The compiled-route check exposed and fixed an origin check
that relied on Next's normalized internal hostname. The route now compares the
browser Origin with Host and the edge-set protocol; tests cover both local and
HTTPS proxy hosts and continue to reject foreign origins.

WebKit also reproduced Tab leaving the native dialog after the message field
under Safari's default keyboard navigation, which skips some controls. The modal
now advances Tab and Shift+Tab explicitly through its eligible controls, including
consent, privacy, and send. A focused regression failed before the fix and passed
afterward. Run the same browser fixture with `SUPPORT_BROWSER=webkit` to cover
that behavior without changing a user's Safari preferences.

The launcher also dismisses the open panel. Its active button belongs to the
native modal's top layer, so the backdrop does not block that button while the
background remains inert. The panel and backdrop fade over 180 ms on opening
and closing. Reduced motion removes the fade and closes immediately. Drafts
remain intact; dismissing restores focus to the original launcher, and another
tap during closing cancels the pending close. The browser fixture covers opacity
transitions and reduced motion on mobile and desktop with intercepted delivery.

## Independent review and component research

An independent read-only reviewer checked the exact original diff from base
`32d7ed3` to `82a9b6a`, then the compact-bubble follow-up. No important backend,
header/injection, limiter, configuration, provider-error, or duplicate-path
findings remained. The reviewer independently reran all 33 focused specs.

The UI review found a mobile keyboard bug: the keyboard inset was counted twice
in available panel height. A failing synthetic visualViewport regression
reproduced panel collapse. The fix calculates available space from layout height,
subtracting clearance once and preserving viewport pan offset. The reviewer
confirmed the fix and both 400px keyboard viewport scenarios (offset 0/100).
Normal browser checks also exercise focus, Escape, focus restoration, consent,
draft failure/retry, duplicate prevention, clearing accepted drafts, and no
automatic opening. Physical software keyboards still merit the normal device
smoke check before publication; the automated keyboard cases are simulations.

Public resource reviewed on October 12, 2026:

| Field | Evidence / decision |
| --- | --- |
| Component / author | shadcn/ui Dialog by shadcn |
| Catalog | [21st.dev Dialog](https://21st.dev/@shadcn/components/dialog) |
| Upstream source | [shadcn/ui dialog.tsx](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/new-york-v4/ui/dialog.tsx) |
| License | [MIT, copyright 2023 shadcn](https://raw.githubusercontent.com/shadcn-ui/ui/main/LICENSE.md) |
| Catalog dependencies | lucide-react and @radix-ui/react-dialog; current upstream uses radix-ui |
| Reuse | Functional reference only; no source, CSS, demo data, media, or notices copied |
| Implementation decision | Keep existing native dialog and installed Lucide icons; add no registry/package dependency |

The public Dialog pattern fits accessible modal behavior. A chat runtime would
add unnecessary capabilities to an email-only support flow. The adaptation is
original local UI using existing website colors and controls, following Julian's
explicit small-bubble direction. No component purchase, account, paid registry,
or additional credential is used. Since no third-party code is vendored, there is
no new copied-code license notice to retain; existing dependency licenses remain
in their installed packages. Static asset totals before/after are recorded in the
local evidence bundle as aggregate uncompressed build sizes, not a per-page
performance claim.

All screenshots are isolated component fixtures with synthetic data. No iOS
working copy, existing task, live configuration, real inbox, or desktop Chrome
session was changed. No send, credential creation, push, merge, or deployment was
performed. The remaining setup is mailbox/bot access verification, explicitly
configuring the confirmed server recipient, an authorized controlled delivery
test, and publication approval.
