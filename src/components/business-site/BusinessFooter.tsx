import Link from "next/link";
import { BusinessMark } from "./BusinessMark";
import s from "./business-site.module.css";

const APP = "https://keplar.one";

/**
 * The Business site's footer (business.keplar.one): the storefront and the Status, Terms, Privacy and Security pages.
 * Section links go to the storefront ("/#pricing"; on the storefront itself they only scroll). Status and the legal pages are
 * Business's own copies of keplar.one's (src/app/(business)/biz).
 */
export function BusinessFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.footInner}>
        <div className={s.footBrand}>
          <span className={s.brand} role="img" aria-label="Keplar Business"><BusinessMark size={24} /></span>
          <p>© Keplar</p>
        </div>
        <nav className={s.footCols} aria-label="Footer">
          <div><h2>Product</h2><Link href="/work">Workspace</Link><Link href="/chatgpt">ChatGPT plugin</Link><Link href="/#pricing">Pricing</Link><Link href="/#download-app">Desktop app</Link></div>
          <div><h2>Company</h2><a href={APP}>Keplar One</a><Link href="/#contact">Contact sales</Link><Link href="/status">Status</Link></div>
          <div><h2>Legal</h2><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/security">Security</Link></div>
        </nav>
      </div>
    </footer>
  );
}
