import Link from "next/link";
import { BusinessFooter } from "./BusinessFooter";
import { BusinessMark } from "./BusinessMark";
import d from "./business-doc.module.css";

/**
 * A Business page that shows one of keplar.one's documents (Status, Terms, Privacy, Security) in the Business look: the
 * Business header and footer around keplar.one's own component, with its design tokens re-pointed (business-doc.module.css).
 */
export function BusinessDoc({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className={d.header}>
        <Link href="/" className={d.home} aria-label="Keplar Business home">
          <BusinessMark size={26} />
        </Link>
        <Link href="/" className={d.back}>Back to Keplar Business</Link>
      </header>
      <div className={d.doc}>{children}</div>
      <BusinessFooter />
    </>
  );
}
