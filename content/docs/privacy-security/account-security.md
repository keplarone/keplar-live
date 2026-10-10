---
title: Account security
description: How sign-in sessions work, how to review and end sessions, what to do if you lose email access, and practical habits that protect your account.
order: 4
updated: 2026-10-03
keywords: account security, sessions, sign out everywhere, magic link
related: /docs/get-started/accounts-and-sign-in, /docs/privacy-security/report-a-vulnerability, /docs/privacy-security/delete-and-export
---

## How sign-in works

Keplar supports a one-time email link, email with a password, Google and Microsoft. Your session is a secure, signed cookie. Plans are attached to your account by a verified payment signal from Whop; no browser value can grant a plan.

## Review sessions

Account lists your active sessions so you can end any you do not recognize. Deleting your account revokes all of them.

## Habits that help

- Use a password manager for any password you set, and do not reuse passwords.
- Prefer the email link or a provider sign-in if you do not want a Keplar-specific password.
- Keep your email account secure, because a one-time link goes to it.
- Do not paste secrets into questions. Keplar redacts known secret-shaped strings from tool output, but the safest secret is one you never type.
- On shared computers, sign out when you finish.

## Rate limits and abuse protection

Sign-in, deletion and other sensitive actions are rate limited and checked for same-origin requests. Admin accounts are protected from self-service deletion.

## Connected apps and agents

Tokens are encrypted at rest and never returned to the browser. Review [Connected app security](/docs/privacy-security/connected-app-security).

## If something looks wrong

End sessions you do not recognize, change your email provider password, and write to [team@keplar.one](mailto:team@keplar.one). To report a vulnerability, see [Report a vulnerability](/docs/privacy-security/report-a-vulnerability).

## What Keplar does not claim

No certifications are claimed on this page, such as SOC 2 or ISO 27001. When that changes, it will be stated in these docs with a date.
