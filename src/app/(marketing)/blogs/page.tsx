import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { allPosts, blogCategories } from "@/lib/kb/blog";
import { abs, pageMeta } from "@/lib/seo";
import { breadcrumbs } from "@/lib/seo-graph";
import s from "@/components/kb/kb.module.css";
import { TwoTone } from "@/components/page/TwoTone";
import { BlogCover } from "@/components/kb/BlogCover";

export const metadata = pageMeta("/blogs", "Keplar blog: honest answers to the questions people ask about AI", "Plain-English articles on the AI questions people search for, each ending with how Keplar approaches it. No invented statistics, no testimonials.");

const date = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function BlogIndex() {
  const posts = allPosts();
  return (
    <div className={s.shell}>
      <div className={s.hubWrap}>
        <header>
          <p className={s.crumbs}>Blog</p>
          <h1 className={s.h1}><TwoTone text={"The Keplar blog"} /></h1>
          <p className={s.lede}>Articles on the questions people actually ask about AI: which model to use, why answers differ, how to check them, what the trends mean. Each one ends with how Keplar handles the question, including where it falls short.</p>
          <div className={s.pills} style={{ marginTop: "var(--s-5)" }}>
            {blogCategories().map((c) => <span key={c} className={s.pill}>{c}</span>)}
          </div>
        </header>
        {posts[0] ? (
          <Link href={posts[0].path} className={s.featured}>
            <BlogCover slug={posts[0].slug} uid="bc-f" featured />
            <span className={s.featuredBody}>
              <small>Featured · {posts[0].readingMinutes} min read</small>
              <h2>{posts[0].title}</h2>
              <p>{posts[0].description}</p>
            </span>
          </Link>
        ) : null}
        <div className={s.cards}>
          {posts.slice(1).map((p, i) => (
            <Link key={p.slug} href={p.path} className={`${s.card} ${s.postCard}`}>
              <BlogCover slug={p.slug} uid={`bc-${i}`} />
              <small>{p.category} · {p.readingMinutes} min</small>
              <h2>{p.title}</h2>
              <p>{p.description}</p>
              <small>{date(p.published)}</small>
            </Link>
          ))}
        </div>
        <p className={s.meta}>Also see the <Link href="/docs">docs</Link>, the <Link href="/glossary">glossary</Link> and the <Link href="/prompts">prompt library</Link>.</p>
      </div>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "Blog", name: "Keplar blog", url: abs("/blogs"), publisher: { "@id": abs("/#organization") }, inLanguage: "en", blogPost: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: abs(p.path), datePublished: p.published })) }} />
      <JsonLd data={breadcrumbs([{ name: "Blog", path: "/blogs" }])} />
    </div>
  );
}
