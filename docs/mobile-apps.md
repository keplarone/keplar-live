# Mobile app creator (BETA)

Create > Mobile (Beta). Status: **implemented and tested up to the stores' doors; never submitted to a real store.**

## What it does
1. **Project generator** (`src/lib/mobile/scaffold.ts`): from a name, bundle ID and up to six screens, a deterministic Expo / React Native project (`App.tsx`, `app.json`, `eas.json`, `package.json`, `tsconfig.json`, a GitHub Actions workflow you run by hand, README). No model call, nothing charged. Text from the form is written as JSON string literals, never as code. Dark graphite look, no blue. Versions target Expo SDK 57 (React Native 0.86); the README and workflow run `npx expo install --fix` to align them. **Not built on EAS or run on a device by Keplar.**
2. **Key checks** (`src/lib/mobile/credentials.ts`): Apple App Store Connect API key (Issuer ID, Key ID, `.p8`) is verified with a real ES256 token against `GET /v1/apps`; a Google Play service account JSON is exchanged for a token and, if you give a package name, an edit is opened and deleted to prove access. Both are encrypted with the workspace-bound key and never returned by any API. The Expo token is saved but not checked.

## What the stores allow (checked October 2026)
- Apple: Developer Program $99/year. The App Store Connect API cannot create the app record (`POST /v1/apps` is refused for API keys); create it once in the website. Apple reviews every submission.
- Google: Play Console $25 one-time. The Play Developer API edits an existing app; the first bundle is uploaded in Play Console and legal declarations are done there. A service account must be invited in Play Console.
- EAS builds and submits from your own GitHub repo with an `EXPO_TOKEN` secret.

## Not done yet
Automatic EAS build/submit from Keplar, store metadata upload, screenshots for the stores. The UI says so rather than showing buttons that do nothing.

## You supply
Apple Developer account + API key; Play Console account + service account; Expo account + token. Nothing is needed on the server.

Tests: `tests/mobile-creator.test.ts` (JWT signatures verified with the matching public keys, mocked store APIs), `e2e/mobile.e2e.ts` (real browser: limits on screen, bad key refused, ZIP downloads).
