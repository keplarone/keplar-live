import "./setup";
import "./helpers/indexable-env";
import { site } from "../src/lib/site";
import assert from "node:assert/strict";
import { test } from "node:test";
import { allDocs } from "../src/lib/kb/docs";
import { glossary } from "../src/lib/kb/glossary";
import { GET } from "../src/app/llms-full.txt/route";
import { GET as llms } from "../src/app/llms.txt/route";

test("llms-full.txt carries every docs page and glossary term, with source URLs and no AGI/superintelligence claim", async () => {
  const res = await GET();
  assert.match(res.headers.get("content-type") ?? "", /^text\/plain/);
  const body = await res.text();
  for (const d of allDocs()) assert.ok(body.includes(`${site.url}${d.path}`), d.path);
  for (const g of glossary) assert.ok(body.includes(`## ${g.term}`), g.term);
  assert.match(body, /not AGI or superintelligence/);
  assert.ok((await (await llms()).text()).includes("/llms-full.txt"));
});
