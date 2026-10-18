---
title: Connect a custom domain
description: Add your own domain to a published site on Plus, Pro or Business: DNS records to create, what each status means and how to fix common errors.
order: 7
updated: 2026-10-03
keywords: custom domain, DNS records, CNAME, A record, Cloudflare, TXT verification
howto: true
related: /docs/create/publish-your-site, /docs/billing-plans/plans-compared, /docs/reference/error-messages
---

Custom domains are available on Plus (1 domain), Pro (3) and Business (10). The limit counts across all your sites. You need a verified email and a **published** site.

## Steps

1. In Create, open your site, then Publish, then Custom domain.
2. Type the domain, such as `example.com` or `shop.example.com`.
3. Add the DNS records Keplar shows at your DNS provider. Each has a copy button.
4. Press **Verify** (or wait; a background job re-checks).
5. When the status reads Active, open your domain. HTTPS is issued automatically; the first visit can take a minute.

## The records

| Record | Purpose |
|---|---|
| `A @` to the address shown | Points an apex domain (`example.com`) at the host |
| `CNAME <sub>` to the target shown | Points a subdomain (`shop.example.com`) at the host |
| `TXT _keplar-verify.<host>` = `keplar-verify=<token>` | Proves you own the domain |
| `TXT _vercel.<domain>` | Only if you are asked to, when the domain is already used elsewhere |

Always copy the values shown in the app; they come from the hosting provider's current recommendation and can change. A format example:

```text
Type   Name                       Value
A      @                          <address shown in the app>
CNAME  shop                       <target shown in the app>
TXT    _keplar-verify.example.com keplar-verify=<your token>
```

## Statuses

| Status | Meaning |
|---|---|
| Waiting for DNS | Records not found yet |
| Checking | Verification in progress |
| Active | Serving your site |
| Needs attention | Not set up after 7 days, or a provider problem; press Verify to retry |

DNS changes can take minutes to hours to spread. Keplar checks every five minutes for the first hour, every 30 minutes for a day, then every three hours.

## Common problems

- **Cloudflare orange cloud.** Set the records to **DNS only** (gray cloud), or the host reports the domain as misconfigured.
- **Conflicting extra A record.** An old record from a previous host next to the new one. Delete the old one.
- **Wrong value or wrong name.** For example `example.com.example.com`, `www` instead of the subdomain, or the apex instead of the subdomain.
- **AAAA record pointing elsewhere.** Remove it or point it correctly.
- **No record at all.** The app tells you where your DNS appears to be hosted.

The Check again button re-checks immediately and shows what was found at your domain right now compared with what is expected.

## Rules

Hostnames must be plain lowercase domains: no URLs, ports, paths, wildcards, IP addresses or internationalized names. Shared-hosting suffixes and Keplar's own domains are refused. One domain belongs to one account. If you downgrade below your domain allowance, the newest domains over the allowance stop serving but stay stored.

## What a domain serves

Only your published site. No Keplar app or API route is reachable on your domain.
