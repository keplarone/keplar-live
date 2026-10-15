/** An in-memory page for Track B tests. It speaks the same driver the Playwright opener does. */
import type { OpenPage, PageDriver } from "@/lib/wants/browser";

export function scriptedPage(html: string): { open: OpenPage; fills: Array<[string, string]>; clicks: string[]; wasClosed: () => boolean } {
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const hasCaptcha = /captcha/i.test(html);
  const hasPassword = /type=["']password["']/i.test(html);
  const fills: Array<[string, string]> = [];
  const clicks: string[] = [];
  const values = new Map<string, string>();
  let submitted = false;
  let closed = false;
  const open: OpenPage = async () => {
    const page: PageDriver = {
      goto: async () => undefined,
      has: async (sel) => {
        if (sel.includes("captcha")) return hasCaptcha;
        if (sel.includes("password")) return hasPassword;
        const id = sel.startsWith("#") ? sel.slice(1) : "";
        return id ? ids.has(id) || (sel === "#result" && submitted) : false;
      },
      fill: async (sel, value) => {
        const id = sel.startsWith("#") ? sel.slice(1) : "";
        if (!ids.has(id)) throw new Error(`Timeout waiting for locator('${sel}')`);
        fills.push([sel, value]);
        values.set(sel, value);
      },
      waitFor: async (sel) => {
        const id = sel.startsWith("#") ? sel.slice(1) : "";
        if (id && !ids.has(id)) throw new Error(`waiting for ${sel}`);
      },
      click: async (sel) => {
        clicks.push(sel);
        if (sel === "#submit" && ids.has("submit")) submitted = true;
      },
      text: async (sel) => (sel === "#result" && submitted ? `ok:${values.get("#item") ?? ""}` : null),
      close: async () => {
        closed = true;
      },
    };
    return page;
  };
  return { open, fills, clicks, wasClosed: () => closed };
}
