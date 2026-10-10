/** Import before any module that reads isIndexable (src/lib/site.ts evaluates it at import time). */
process.env.NEXT_PUBLIC_SITE_INDEXABLE = "true";
