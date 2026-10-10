---
title: Desktop troubleshooting
description: Fixes for the common desktop problems: first-run warnings, a sign-in that does not return to the app, a blank window, and a download that will not verify.
order: 3
updated: 2026-10-03
keywords: desktop app problems, Keplar One won't open, blank window
related: /docs/desktop/install-desktop-app, /docs/desktop/sign-in-desktop, /download
---

## The system warns about the app

Expected on first run, because builds are not yet code-signed. Compare the checksum first, then follow the Windows, macOS or Linux steps in [Install the desktop app](/docs/desktop/install-desktop-app).

## The checksum does not match

Do not run the file. Download it again, preferably on a different network, and compare again. If it still differs, write to team@keplar.one with the file name and version.

## The browser does not return to the app after sign-in

1. Make sure the desktop app is running before you confirm in the browser.
2. Allow your browser to open Keplar One when it asks.
3. If you have several browser profiles, confirm in the profile that is signed in to the account you want.
4. Start the sign-in again; each attempt uses a new short-lived code.

## A blank or white window

Close the app completely and reopen it. On Linux, check that your graphics drivers support hardware acceleration, or try launching with software rendering if your distribution documents a flag for Electron-style apps. If it persists, use the browser version and report the problem with your operating system and version.

## It signed me in to the wrong account

Open the account menu, choose Switch account, and sign in again with the account you want.

## The Mac build does not match my chip

If the download page offered both Mac builds because it could not tell your chip, check Apple menu, About This Mac. If the exact architecture has no build, the page warns that the offered file may not match.

## Mobile

On a phone, the download page offers "Get the desktop app on a computer" so you can send yourself the page. The desktop app is for computers; use Keplar in the mobile browser.

## Still stuck

Write to [team@keplar.one](mailto:team@keplar.one) with your operating system, the app version if it opens, and what you saw.
