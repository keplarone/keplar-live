import { breadcrumbs } from "@/lib/seo-graph";
import Link from "next/link";
import { PageHero } from "@/components/page/PageHero";
import { DownloadView } from "@/components/download/DownloadView";
import { JsonLd } from "@/components/seo/JsonLd";
import { getDesktopRelease } from "@/lib/desktop/releases";
import { downloadPageGraph } from "@/lib/structuredData";
import { pageMeta, abs } from "@/lib/seo";
import { brand } from "@/lib/site";
import sec from "@/components/sections/sections.module.css";
import s from "@/components/download/download.module.css";

/** Static page, rebuilt in the background about every 10 minutes; the release list is fetched on the server only. */
export const revalidate = 600; // keep equal to REVALIDATE_SECONDS (segment config must be a literal)

export const metadata = pageMeta(
  "/download",
  `Download the ${brand.companyName} desktop app for Windows, macOS and Linux`,
  `Get the ${brand.companyName} desktop app: Windows, macOS and Linux downloads with checksums, install steps and release notes. The app is a client for the ${brand.name} cloud service; you can also use ${brand.name} in your browser.`,
);

export default async function DownloadPage() {
  const state = await getDesktopRelease();
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "Download", path: "/download" }])} />
      <PageHero
        label="Desktop app"
        title={`${brand.companyName} for your desktop`}
        lede={`A desktop app for Windows, macOS and Linux. It is a client for the ${brand.name} cloud service: your account, conversations and files stay in the cloud, and nothing installed on your computer holds your data.`}
      />
      <section className={sec.section} style={{ paddingTop: 0 }}>
        <div className={sec.inner}>
          <DownloadView state={state} pageUrl={abs("/download")} />

          <div className={s.stack} style={{ marginTop: "var(--s-16)" }}>
            <section aria-labelledby="dl-install" className={s.block}>
              <h2 id="dl-install" className={s.h2}>Install</h2>
              <p className={s.fine}>
                The desktop builds are <strong>not yet code-signed or notarized</strong>, so your system will show a warning the first time. That is expected for now; compare the SHA-256 in the table before you open a file you downloaded.
              </p>
              <div className={s.grid}>
                <div className={s.card}>
                  <h3 className={s.h3}>Windows</h3>
                  <ol className={s.steps}>
                    <li>Run the <code>.exe</code> installer.</li>
                    <li>If Windows SmartScreen says &ldquo;Windows protected your PC&rdquo;, choose <strong>More info</strong>, then <strong>Run anyway</strong>.</li>
                    <li>Follow the installer, then open Keplar One from the Start menu and sign in.</li>
                  </ol>
                </div>
                <div className={s.card}>
                  <h3 className={s.h3}>macOS</h3>
                  <ol className={s.steps}>
                    <li>Open the <code>.dmg</code> and drag Keplar One to Applications.</li>
                    <li>The first time, Control-click (right-click) Keplar One, choose <strong>Open</strong>, then <strong>Open</strong> again.</li>
                    <li>If macOS says the app is damaged or can&apos;t be checked, run <code>xattr -dr com.apple.quarantine &quot;/Applications/Keplar One.app&quot;</code> in Terminal, then open it again.</li>
                  </ol>
                </div>
                <div className={s.card}>
                  <h3 className={s.h3}>Linux</h3>
                  <ol className={s.steps}>
                    <li><strong>AppImage:</strong> <code>chmod +x Keplar-One-*.AppImage</code>, then run it. Some distributions need FUSE 2 installed.</li>
                    <li><strong>Debian/Ubuntu:</strong> <code>sudo apt install ./Keplar-One-*.deb</code></li>
                    <li><strong>Fedora/RHEL:</strong> <code>sudo dnf install ./Keplar-One-*.rpm</code></li>
                  </ol>
                </div>
              </div>
            </section>

            <section aria-labelledby="dl-reqs" className={s.block}>
              <h2 id="dl-reqs" className={s.h2}>System requirements</h2>
              <p className={s.fine}>Expected minimums for a desktop app of this kind. Each release&apos;s notes list anything that differs.</p>
              <div className={s.reqs}>
                <div className={s.card}><h3 className={s.h3}>Windows</h3><p className={s.fine}>Windows 10 or 11, 64-bit (x64 or ARM64).</p></div>
                <div className={s.card}><h3 className={s.h3}>macOS</h3><p className={s.fine}>macOS 12 or later, on Apple silicon or Intel.</p></div>
                <div className={s.card}><h3 className={s.h3}>Linux</h3><p className={s.fine}>A recent 64-bit distribution with a desktop environment (for example Ubuntu 22.04 or later, Fedora 38 or later).</p></div>
              </div>
              <p className={s.fine}>All platforms: an internet connection and a {brand.name} account, because the app uses the cloud service.</p>
            </section>

            <section aria-labelledby="dl-cloud" className={s.block}>
              <h2 id="dl-cloud" className={s.h2}>Prefer the browser?</h2>
              <p className={s.text} style={{ marginTop: 0 }}>
                The desktop app talks to the same {brand.name} account and cloud service as the website, so you don&apos;t lose anything by skipping it. You can <Link href="/app">use {brand.name} in your browser instead</Link> any time. Read how we handle your data in the <Link href="/privacy">privacy policy</Link>.
              </p>
            </section>
          </div>
        </div>
      </section>
      <JsonLd data={downloadPageGraph(state)} />
    </>
  );
}
