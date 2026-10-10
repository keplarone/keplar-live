import { coverSvg } from "./blogCovers";
import s from "./kb.module.css";

/** A post's cover illustration (blogCovers.ts). Decorative: the card's heading carries the meaning. */
export function BlogCover({ slug, uid, featured = false }: { slug: string; uid: string; featured?: boolean }) {
  return <div className={featured ? `${s.cover} ${s.coverFeatured}` : s.cover} aria-hidden="true" dangerouslySetInnerHTML={{ __html: coverSvg(slug, uid) }} />;
}
