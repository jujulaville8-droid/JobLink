# JobLinks iPhone app

Expo / React Native app sharing the website's existing Supabase accounts and jobs.

## Run locally

Use Node 22.13+ and run `npm ci` in this directory. Copy `.env.example` to `.env.local` and fill in the public Supabase URL, public anon/publishable key and website URL. Never include a service-role key in this app: every `EXPO_PUBLIC_` value is shipped to users.

Run `npm start` for Expo, `npm run ios` for an installed iOS simulator, or `npm run web` for a browser preview. Xcode must be installed and its license accepted by the developer before simulator tools work. Browser preview checks layout; it does not validate iOS-specific behavior.

The website backend must include this branch's bearer-token support before native profile, application and saved-job writes will work. For a local backend, set EXPO_PUBLIC_SITE_URL to its reachable address. On a physical phone, localhost refers to that phone.

## Included

- Search active jobs by title, description or company; job-type filters and pagination.
- Job details, sharing, saving and application submission.
- Existing-account sign-in, native profile edits, saved jobs and application history.
- Employer vacancy overview and links to the existing hiring workspace.
- SecureStore session persistence on iOS; refresh tokens rotate through the Supabase SDK.

Signup, password recovery, CV tools, messages and detailed employer management open the existing website. The website and native app have separate login sessions. The web preview deliberately keeps its native session in memory only.

## Validation

`npm run typecheck`, `npx expo-doctor`, and `npm run export:ios` validate configuration and export the iOS JavaScript/Hermes bundle. An export is not a signed native application. Root CI runs the mobile typecheck and export separately from the website checks.

Native bearer authentication was integration-tested against a local website backend and the connected Supabase project using a temporary user: anonymous and invalid tokens rejected, verification/profile/save/unsave succeeded, banned account rejected. Test user removed; no real applications submitted.

## Install and release

An Expo account and Apple signing access are still needed. Once accounts are available, use EAS CLI to log in and configure this project. Set the three public environment values for the EAS build environment, then build using the simulator, preview or production profiles in eas.json. Production submission requires an App Store Connect app record and appropriate Apple team access. A friend should invite the owner through Apple's team controls, rather than sharing a password; available access depends on their membership type.

Before public submission: test sign-in, session restoration, save/apply, keyboard handling, sharing and web handoffs on a real iPhone; implement and verify in-app account deletion; supply a final opaque App Store icon, screenshots, privacy disclosures and review credentials; verify the app's privacy policy covers native data handling. Push notifications and native CV uploads are not included in this first version.

Current local limitation: Xcode's license has not been accepted, so no simulator/native build has been run. No TestFlight upload or App Store submission has been made.
