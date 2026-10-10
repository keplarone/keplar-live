---
title: Install the desktop app
description: Download Keplar One for Windows, macOS or Linux, verify the checksum, and get past the first-run warning that appears because builds are not yet code-signed.
order: 1
updated: 2026-10-03
keywords: Keplar desktop app, download Keplar, install, SHA-256, SmartScreen
howto: true
related: /download, /docs/desktop/sign-in-desktop, /docs/desktop/desktop-troubleshooting
---

The desktop app is a client for the Keplar cloud service. Your account, conversations and files stay in the cloud; nothing installed on your computer holds your data. You can also use Keplar in a browser.

## Steps

1. Open the [download page](/download). It lists only real files from published releases, with a SHA-256 checksum for each.
2. Pick your system. The page tries to detect it; if it cannot tell which Mac chip you have, it offers both builds.
3. Download the file and compare its SHA-256 with the one on the page before you open it.
4. Install following the section for your system below.
5. Open Keplar One and [sign in](/docs/desktop/sign-in-desktop).

## Windows

Run the `.exe` installer. If SmartScreen says "Windows protected your PC", choose More info, then Run anyway.

## macOS

Open the `.dmg`, drag Keplar One to Applications, then Control-click it and choose Open the first time. If macOS says the app is damaged or cannot be checked, run this in Terminal and open it again:

```bash
xattr -dr com.apple.quarantine "/Applications/Keplar One.app"
```

## Linux

For the AppImage, make it executable and run it. Some distributions need FUSE 2 installed.

```bash
chmod +x Keplar-One-*.AppImage
./Keplar-One-*.AppImage
```

## Why the warnings

The builds are **not yet code-signed or notarized**, so the system warns the first time. That is expected for now, and it is why the checksum matters. If signing is added, the download page will say so.

## Verify the checksum

```bash
# macOS or Linux
shasum -a 256 Keplar-One-*.dmg
# Windows PowerShell
Get-FileHash .\Keplar-One-*.exe -Algorithm SHA256
```

Compare the output to the value on the download page. If they differ, do not open the file.

## When there is no release

If the page says the first release is coming soon, or that releases are temporarily unavailable, nothing is wrong with your browser. Use Keplar in a browser meanwhile.
