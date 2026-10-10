# Applications browser checks

The Vite fixture imports the real Applications components with clearly marked synthetic data. It exercises responsive layouts, keyboard behavior, accessibility, navigation, error states, and session clearing. It does not verify Supabase authentication, database permissions, or deployed behavior.

Build the app first (`npm run build`) so its local fonts are available. The fixture's two font filenames correspond to the current pinned Next/font build; update them in `admin-applications-vite.config.ts` if the font inputs change.

Use a Playwright installation with Chromium and the app's installed `axe-core`. Playwright may be supplied by the development environment through `PLAYWRIGHT_MODULE` (module path) and `PLAYWRIGHT_EXECUTABLE_PATH` (optional Chromium executable). Otherwise the scripts resolve `playwright` normally and use its installed browser.

Start the fixture from the repository root:

```sh
npx vite --config tests/browser/admin-applications-vite.config.ts
```

In another terminal:

```sh
node tests/browser/check-admin-applications.cjs
node tests/browser/admin-applications-capture.cjs
```

Reports and synthetic screenshots default to the ignored `.playwright-mcp/admin-applications` directory. Set `ADMIN_APPLICATIONS_QA_OUTPUT` to use another directory. The capture script reads the preceding check report. The fixture binds only `127.0.0.1:4212` and blocks real API calls; never substitute real applicants into this screenshot harness.
