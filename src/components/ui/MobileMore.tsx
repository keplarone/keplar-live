"use client";

import { createContext, useContext, useState, type ElementType, type HTMLAttributes, type ReactNode } from "react";

/**
 * Progressive disclosure for phones (640px and narrower): a block shows its first few items and a "See more" button reveals the
 * rest, which stays in the page (find-in-page and search engines still see it). Wider screens are untouched: the button is hidden
 * and every item shows (styles in src/styles/mobile.css). Mark the items that fold away with data-more-rest.
 *
 *   <MoreRoot as="li"> ...<li data-more-rest>...</li>... <MoreButton more="See everything in Plus" less="Show less" /></MoreRoot>
 *
 * The root carries data-more="closed|open"; the button is a real <button> with aria-expanded, so it is keyboard operable and
 * announced as a disclosure. Nothing is ever removed, only folded.
 */
const Ctx = createContext<{ open: boolean; toggle: () => void } | null>(null);

type RootProps = HTMLAttributes<HTMLElement> & { as?: ElementType; children: ReactNode };

export function MoreRoot({ as: Tag = "div", children, ...rest }: RootProps) {
  const [open, setOpen] = useState(false);
  return (
    <Ctx.Provider value={{ open, toggle: () => setOpen((o) => !o) }}>
      <Tag {...rest} data-more={open ? "open" : "closed"}>
        {children}
      </Tag>
    </Ctx.Provider>
  );
}

export function MoreButton({ more, less, className }: { more: string; less: string; className?: string }) {
  const c = useContext(Ctx);
  if (!c) return null;
  return (
    <button type="button" className={`more-btn${className ? ` ${className}` : ""}`} aria-expanded={c.open} onClick={c.toggle}>
      <span>{c.open ? less : more}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
