# Security policy

## Reporting a vulnerability

Email **team@keplar.one**. The same policy is published at <https://keplar.one/security> and in machine-readable form at
<https://keplar.one/.well-known/security.txt>. Please include what you found, where (URL or API route), how to reproduce it
and the impact as you understand it. Do not include real personal data.

What you can expect (a small team's commitment, not a legal agreement):

| Step | Target |
|---|---|
| Acknowledgement | within 3 business days |
| First assessment and severity | within 7 days |
| Fix for a critical issue | within 7 days of confirmation |
| Fix for a high issue | within 30 days |
| Fix for a medium issue | within 90 days |
| Low issues | next planned release |

Good-faith research against accounts you own is welcome. No denial of service, spam, social engineering or physical attacks,
and give us a chance to fix the problem before you publish. There is no bug bounty.

## Supported versions

keplar.one is a continuously deployed service: only what is live is supported, and it always runs the latest `main`.
Desktop and mobile apps: the latest release on <https://keplar.one/download>.

## How security work is organised

- `security/checklist.json` is the control inventory: every item of the Keplar security checklist with its status and the
  code, test or document that is the evidence. `docs/security-checklist.md` is rendered from it and
  `tests/security-checklist.test.ts` fails the build when evidence goes missing.
- `docs/security.md` is the technical summary; `docs/threat-model.md` the threat model; `docs/security-policy.md` the
  development lifecycle, severity levels, accepted risks and review cadence; `docs/privacy-inventory.md` the data inventory;
  `docs/runbooks/security-incident.md` the incident procedure.
- Every pull request runs: secret scan, production dependency audit, CodeQL, dependency review, typecheck, lint, unit tests
  (including authorization, tenant isolation and rate-limit audits), production build and an SBOM.
