---
title: Rolling usage limits
description: The 5-hour and weekly limits on paid plans: how a window opens and resets, the numbers per plan, the warning at 80 percent, and what to do when you hit one.
order: 3
updated: 2026-10-03
keywords: usage window, 5-hour limit, weekly limit, rate limits
related: /docs/billing-plans/credits-explained, /docs/billing-plans/when-you-reach-a-limit, /docs/billing-plans/plans-compared
---

Monthly credits alone would let one heavy afternoon use a whole month. Rolling windows spread use out.

## How a window works

A window opens with your **first charge** after the previous window ended and closes after its length: five hours for the short window and seven days for the weekly one. Credits you use inside the window count against its limit. When the window closes, the counter starts again. The app shows how long is left: "resets in 3h 20m" for the 5-hour window and "resets Mon" for the weekly one.

## Limits by plan (credits)

| Plan | 5-hour | Weekly | Monthly |
|---|---|---|---|
| Lite | {{win5:lite}} | {{weekly:lite}} | {{credits:lite}} |
| Plus | {{win5:plus}} | {{weekly:plus}} | {{credits:plus}} |
| Pro | {{win5:pro}} | {{weekly:pro}} | {{credits:pro}} |

Free and Business have no rolling windows. Free is limited by a daily question allowance, and Business is a contract.

## Warnings

The app shows a "nearly at your limit" warning when you have used 80 percent of a window.

## Enforcement

Limits are enforced on the server, from a shared store, so they hold across devices and sessions. A run whose estimate does not fit stops before any model is called. Failed or no-response runs are never charged, so they never count.

## When you hit one

You see which window and when it resets. You can wait, ask a cheaper question (Fastest, or no Deep Research), or upgrade for higher limits. See [When you reach a limit](/docs/billing-plans/when-you-reach-a-limit).

## Why two windows

The 5-hour limit protects against a burst, and the weekly limit protects against steady heavy use. Between them, the monthly allowance lasts the month for most people.

## Large jobs and windows

A big video Compare run or a Deep Research run can be larger than a short window on some plans. The preview says so before you start instead of failing halfway.
