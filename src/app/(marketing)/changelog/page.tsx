import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { latestRelease, releaseDate, releases } from "@/lib/kb/changelog";
import { RELEASES_PAGE, releasesPageVisibility } from "@/lib/desktop/releases";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import s from "@/components/kb/kb.module.css";
import { TwoTone } from "@/components/page/TwoTone";

export const metadata = {
  ...pageMeta("/changelog", "Keplar release notes: what changed and when", "Dated release notes for Keplar: new features, changes and fixes you can see, newest first. Beta features are marked beta."),
  alternates: { canonical: "/changelog", types: { "application/atom+xml": "/changelog/feed.xml" } },
};

export default async function Changelog() {
  const showGithubReleases = (await releasesPageVisibility()) === "public";
  const org = { "@id": abs("/#organization") };
  return (
    <div className={s.shell}>
      <div className={s.hubWrap}>
        <header>
          <p className={s.crumbs}>Release notes</p>
          <h1 className={s.h1}><TwoTone text={"Release notes"} /></h1>
          <p className={s.lede}>What changed in Keplar and when, newest first. Only changes you can see are listed. Beta features say so. Last updated {releaseDate(latestRelease())}. <a href="/changelog/feed.xml">Atom feed</a>.</p>
        </header>
        <div className={s.prose}>
          {releases.map((r) => (
            <section key={r.id} id={r.id} className={s.release}>
              <h2><a href={`#${r.id}`} style={{ color: "inherit", textDecoration: "none" }}>{r.title}</a></h2>
              <p className={s.meta}><time dateTime={r.date}>{releaseDate(r.date)}</time></p>
              <p>{r.summary}</p>
              <ul>{r.items.map((i) => <li key={i}>{i}</li>)}</ul>
              {r.links?.length ? <p className={s.relatedLine}>{r.links.map((l, i) => <span key={l.href}>{i ? " · " : "Related: "}<Link href={l.href}>{l.label}</Link></span>)}</p> : null}
            </section>
          ))}
          <h2>Desktop app releases</h2>
          <p>The desktop app has its own versions and checksums{showGithubReleases ? <> on <a href={RELEASES_PAGE} rel="noopener">GitHub releases</a></> : null}. The <Link href="/download">download page</Link> always links the latest one.</p>
        </div>
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "@id": abs("/changelog#page"),
          name: "Keplar release notes",
          url: abs("/changelog"),
          inLanguage: "en",
          dateModified: latestRelease(),
          hasPart: releases.map((r) => ({ "@type": "Article", headline: r.title, description: r.summary, datePublished: r.date, dateModified: r.date, url: abs(`/changelog#${r.id}`), author: org, publisher: org })),
        }}
      />
      <JsonLd data={breadcrumbs([{ name: "Release notes", path: "/changelog" }])} />
    </div>
  );
}
