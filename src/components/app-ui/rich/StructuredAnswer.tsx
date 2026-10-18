"use client";

import type { CiteRenderer } from "../Markdown";
import { Markdown } from "../Markdown";
import { streamView } from "@/lib/rich-answer/parse";
import type { AgreementCounts, RichAnswer as RichData } from "@/lib/rich-answer/types";
import { RichAnswer, RichSkeleton } from "./RichAnswer";

/**
 * Prose renders immediately. A half-written keplar-ui fence is a skeleton; a finished answer's
 * `rich` (already grounded on the server) replaces it. Invalid or missing structure is just the markdown.
 */
export function StructuredAnswer({
  source,
  streaming,
  caret,
  cite,
  rich,
  consensus,
}: {
  source: string;
  streaming?: boolean;
  caret?: boolean;
  cite?: CiteRenderer;
  rich?: RichData;
  consensus?: AgreementCounts;
}) {
  const live = streaming ? streamView(source) : { prose: source, pending: false, data: null };
  const data = rich ?? (streaming ? live.data : null);
  return (
    <>
      <Markdown source={live.prose} streaming={streaming} caret={caret} cite={cite} />
      {live.pending && !data ? <RichSkeleton /> : null}
      {data ? <RichAnswer data={data} consensus={consensus} /> : null}
    </>
  );
}
