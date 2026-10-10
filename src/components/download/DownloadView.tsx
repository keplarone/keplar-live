"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { brand } from "@/lib/site";
import { track } from "@/lib/analytics";
import { detectPlatform, formatSize, pickPrimary, ARCH_LABEL, OS_LABEL, TYPE_LABEL, type Hints } from "@/lib/desktop/platform";
import { RELEASES_PAGE, type DesktopFile, type ReleaseState } from "@/lib/desktop/releases";
import btn from "@/components/ui/Button.module.css";
import s from "./download.module.css";

type Props = { state: ReleaseState; pageUrl: string };

const noop = () => () => {};
function readHints(): string {
  const n = navigator as Navigator & { userAgentData?: { mobile?: boolean; platform?: string } };
  return JSON.stringify({ ua: n.userAgent, platform: n.userAgentData?.platform ?? n.platform, mobile: n.userAgentData?.mobile, touchPoints: n.maxTouchPoints } satisfies Hints);
}

const dateFmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "");

export function DownloadView({ state, pageUrl }: Props) {
  const raw = useSyncExternalStore(noop, readHints, () => "");
  const [arch, setArch] = useState<{ architecture?: string; bitness?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues?: (h: string[]) => Promise<{ architecture?: string; bitness?: string }> } }).userAgentData;
    let on = true;
    uad?.getHighEntropyValues?.(["architecture", "bitness"]).then((v) => on && setArch(v)).catch(() => undefined);
    return () => {
      on = false;
    };
  }, []);

  const platform = useMemo(() => (raw ? detectPlatform({ ...(JSON.parse(raw) as Hints), ...(arch ?? {}) }) : null), [raw, arch]);
  const release = state.status === "ok" ? state.release : null;
  const picks = useMemo(() => (release && platform ? pickPrimary(release.files, platform) : []), [release, platform]);

  const onDownload = (f: DesktopFile, placement: string) =>
    track("download_click", { os: f.os, arch: f.arch, type: f.type, version: release?.version ?? "", placement });

  async function copy() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the address is shown for manual copy */
    }
  }

  const mail = `mailto:?subject=${encodeURIComponent("Keplar One desktop app")}&body=${encodeURIComponent(`Download the Keplar One desktop app on your computer: ${pageUrl}`)}`;

  return (
    <div className={s.stack}>
      {/* ── main action ── */}
      <section className={s.panel} aria-labelledby="dl-main">
        {state.status !== "ok" ? (
          <>
            <h2 id="dl-main" className={s.h2}>{state.status === "none" ? "First release coming soon" : "Downloads are temporarily unavailable"}</h2>
            <p className={s.text}>
              {state.status === "none"
                ? "The desktop app hasn't been released yet, so there is nothing to download today. This page lists real files as soon as the first version is published, and nothing before then."
                : state.reason === "rate_limited"
                  ? "We couldn't load the release list from GitHub just now (it is rate limiting requests). Nothing is wrong with your device. Try again in a few minutes, or see the releases page directly."
                  : "We couldn't load the release list from GitHub just now. Try again in a few minutes, or see the releases page directly."}
            </p>
            <div className={s.row}>
              <Link href="/app" className={`${btn.button} ${btn.primary} ${btn.lg}`} data-lit="on-ink"><span>Use Keplar in your browser</span></Link>
              {state.status === "unavailable" ? <a href={RELEASES_PAGE} className={`${btn.button} ${btn.secondary} ${btn.lg}`} data-lit="" rel="noopener noreferrer"><span>GitHub releases</span></a> : null}
            </div>
          </>
        ) : platform?.mobile ? (
          <>
            <h2 id="dl-main" className={s.h2}>Get the desktop app on a computer</h2>
            <p className={s.text}>Keplar&apos;s desktop app is for Windows, macOS and Linux, so there is no download for this device. You can use Keplar in your browser here right now, or send yourself this page to open on a computer.</p>
            <div className={s.row}>
              <Link href="/app" className={`${btn.button} ${btn.primary} ${btn.lg}`} data-lit="on-ink"><span>Use Keplar in your browser</span></Link>
              <button type="button" className={`${btn.button} ${btn.secondary} ${btn.lg}`} data-lit="" onClick={copy}><span>{copied ? "Link copied" : "Copy link"}</span></button>
              <a href={mail} className={`${btn.button} ${btn.secondary} ${btn.lg}`} data-lit=""><span>Email me the link</span></a>
            </div>
            <p className={s.fine}>&ldquo;Email me the link&rdquo; opens a message in your own email app; we don&apos;t send anything. {pageUrl}</p>
          </>
        ) : picks.length ? (
          <>
            <h2 id="dl-main" className={s.h2}>Download {brand.companyName} for {OS_LABEL[picks[0].file.os]}</h2>
            <div className={s.row}>
              {picks.map(({ file }, i) => (
                <a key={file.name} href={file.url} className={`${btn.button} ${i === 0 ? btn.primary : btn.secondary} ${btn.lg}`} data-lit={i === 0 ? "on-ink" : ""} rel="noopener noreferrer" onClick={() => onDownload(file, "primary")}>
                  <span>
                    {ARCH_LABEL[file.os][file.arch]} · {TYPE_LABEL[file.type] ?? file.type}
                    {formatSize(file.size) ? ` · ${formatSize(file.size)}` : ""}
                  </span>
                </a>
              ))}
            </div>
            <p className={s.fine}>
              Version {release!.version}
              {release!.publishedAt ? ` · released ${dateFmt(release!.publishedAt)}` : ""}.{" "}
              {picks.length > 1 ? "Your browser can't tell which Mac chip you have (Apple menu > About This Mac), so both builds are shown. " : ""}
              {picks.some((p) => !p.exact) ? "We couldn't confirm this build matches your processor; if it doesn't run, pick another from the table below. " : ""}
              Not on {OS_LABEL[picks[0].file.os]}? See all downloads below.
            </p>
          </>
        ) : (
          <>
            <h2 id="dl-main" className={s.h2}>Download {brand.companyName}</h2>
            <p className={s.text}>
              {platform?.os === "windows" || platform?.os === "macos" || platform?.os === "linux"
                ? `This release has no build for ${OS_LABEL[platform.os]} on your kind of device. Choose from the table below, or use Keplar in your browser.`
                : "Choose your system from the table below, or use Keplar in your browser."}
            </p>
            <div className={s.row}>
              <Link href="/app" className={`${btn.button} ${btn.secondary} ${btn.lg}`} data-lit=""><span>Use in browser instead</span></Link>
            </div>
          </>
        )}
        {state.status === "ok" && !platform?.mobile && picks.length ? (
          <p className={s.fine}><Link href="/app">Use in browser instead</Link></p>
        ) : null}
      </section>

      {/* ── all downloads ── */}
      {release ? (
        <section aria-labelledby="dl-all" className={s.block}>
          <h2 id="dl-all" className={s.h2}>All downloads</h2>
          <p className={s.fine}>
            Version {release.version}{release.publishedAt ? `, released ${dateFmt(release.publishedAt)}` : ""} ·{" "}
            <a href={release.notesUrl} rel="noopener noreferrer">Release notes</a>
            {release.checksumsUrl ? <> · <a href={release.checksumsUrl} rel="noopener noreferrer">SHA256SUMS</a></> : null}
          </p>
          {release.files.length ? (
            <div className={s.scroller} role="region" aria-label="All downloads" tabIndex={0}>
              <table className={s.table}>
                <thead>
                  <tr><th scope="col">System</th><th scope="col">Processor</th><th scope="col">File type</th><th scope="col">Size</th><th scope="col">Version</th><th scope="col">Released</th><th scope="col">SHA-256</th></tr>
                </thead>
                <tbody>
                  {release.files.map((f) => (
                    <tr key={f.name}>
                      <th scope="row">{OS_LABEL[f.os]}</th>
                      <td>{ARCH_LABEL[f.os][f.arch]}</td>
                      <td><a href={f.url} rel="noopener noreferrer" onClick={() => onDownload(f, "table")}>{TYPE_LABEL[f.type] ?? f.type}</a><span className={s.fn}>{f.name}</span></td>
                      <td>{formatSize(f.size)}</td>
                      <td>{release.version}</td>
                      <td>{dateFmt(release.publishedAt)}</td>
                      <td>{f.sha256 ? <code className={s.hash} title={f.sha256}>{f.sha256}</code> : <span className={s.fine}>Not published</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={s.text}>This release has no installable files attached yet. Check back soon, or see the <a href={release.notesUrl} rel="noopener noreferrer">release page</a>.</p>
          )}
          <p className={s.fine}>Check a download: <code>shasum -a 256 &lt;file&gt;</code> (macOS/Linux) or <code>Get-FileHash &lt;file&gt;</code> (Windows PowerShell), and compare it with the value above.</p>
        </section>
      ) : null}
    </div>
  );
}
