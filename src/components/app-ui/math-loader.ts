/**
 * Loaded on demand the first time an answer contains math, so KaTeX (JS, CSS and its fonts, all self-hosted from our own
 * origin) never weighs on chats without formulas.
 */
import "katex/dist/katex.min.css";
import { renderTex } from "@/lib/math/katex";
import { installMathCopy } from "./math-copy";

installMathCopy();

export { renderTex };
