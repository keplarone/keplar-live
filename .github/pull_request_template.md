## What changed

<!-- One or two sentences. Link the issue or doc if there is one. -->

## Security review (fill in; delete lines that do not apply)

- [ ] **No new secret** in code, tests, fixtures or workflow files (`node scripts/secret-scan.mjs` is clean).
- [ ] **Authorization:** every new or changed route checks the session and the workspace it acts on (`tests/authz.test.ts` still passes; new public routes are listed there with a reason).
- [ ] **Input:** new request bodies are validated and bounded; new outbound fetches go through the SSRF-safe helpers.
- [ ] **Data:** new stored fields are classified in `docs/privacy-inventory.md` if they hold personal data, and covered by export and deletion.
- [ ] **Dependencies:** any new package was reviewed (maintainer, downloads, what it reads and sends), and the lockfile changed only as expected.
- [ ] **Agents / AI:** new tools or actions carry a permission check, a budget and an approval gate where they act on the world.
- [ ] **Checklist:** `security/checklist.json` updated when this PR adds or removes a control (`node scripts/security-checklist.mjs --check`).

## How it was verified

<!-- Tests added or run, screenshots for UI, what was tried by hand. "Not verified" is an acceptable answer if it is true. -->
