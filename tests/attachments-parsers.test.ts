import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, deflateRawSync } from "node:zlib";
import { listZip, readText, ZipError } from "../src/lib/attachments/zip";
import { readDocx, readPptx, readXlsx, excelDate } from "../src/lib/attachments/office";
import { parseCsv, sniffDelimiter, profileColumn, pearson, tableFrom, tableBlock, toNumber, toDate, recordsIn } from "../src/lib/attachments/data";
import { rtfToText } from "../src/lib/attachments/rtf";
import { readHtml, paletteFrom } from "../src/lib/attachments/html";
import { extractFile, isExecutable } from "../src/lib/attachments/extract";
import { ATTACH_LIMITS, kindOfFile, urlsIn, youtubeId, READS } from "../src/lib/attachments/kinds";
import { pickTrack, captionsToText, xmlCaptionsToText, chaptersFrom, jsonAfter } from "../src/lib/attachments/youtube";
import { selectKeyframes, sigDiff, candidatesFor } from "../src/lib/attachments/keyframes";
import { wavInfo, rmsLevel, cleanTranscript } from "../src/lib/attachments/transcribe";
import { referenceBlock, linkBrief } from "../src/lib/attachments/reference-brief";
import { withReadSources } from "../src/lib/attachments/sources";

/** Build a real ZIP (deflate) in memory. `lie` overrides the central-directory uncompressed size to simulate a lying header. */
function zip(files: Record<string, string | Uint8Array>, opts: { store?: boolean; lie?: number } = {}): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const comp = opts.store ? data : deflateRawSync(data);
    const method = opts.store ? 0 : 8;
    const n = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0, 6); loc.writeUInt16LE(method, 8);
    loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(data.length, 22); loc.writeUInt16LE(n.length, 26);
    locals.push(loc, n, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0, 8); cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(opts.lie ?? data.length, 24); cen.writeUInt16LE(n.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, n);
    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, eocd]));
}
const ZL = { maxEntries: 50, maxTotalBytes: 5_000_000, maxEntryBytes: 4_000_000 };
const OL = { ...ZL, maxChars: 20_000, maxRows: 1000 };
const F = ATTACH_LIMITS.free;

test("zip: lists entries, reads text, drops traversal and absolute names", () => {
  const z = zip({ "a.txt": "hello", "../evil.sh": "rm -rf", "/etc/passwd": "x", "dir/b.md": "# B" });
  const e = listZip(z, ZL);
  assert.deepEqual(e.map((x) => x.name).sort(), ["a.txt", "dir/b.md"]);
  assert.equal(readText(z, e, "a.txt"), "hello");
});

test("zip: refuses too many entries, oversized totals and zip bombs (high ratio)", () => {
  const many: Record<string, string> = {};
  for (let i = 0; i < 60; i++) many[`f${i}.txt`] = "x";
  assert.throws(() => listZip(zip(many), ZL), (e: ZipError) => e.code === "too_many");
  const bomb = zip({ "zeros.txt": "0".repeat(3_000_000) });
  assert.throws(() => listZip(bomb, { ...ZL, maxTotalBytes: 50_000_000, maxEntryBytes: 50_000_000 }), (e: ZipError) => e.code === "bomb");
  assert.throws(() => listZip(zip({ "big.txt": "y" }, { lie: 9_000_000 }), ZL), (e: ZipError) => e.code === "too_large" || e.code === "bomb");
  assert.throws(() => listZip(new Uint8Array([1, 2, 3, 4, 5, 6]), ZL), ZipError);
});

const DOCX = {
  "[Content_Types].xml": "<Types/>",
  "docProps/core.xml": '<cp:coreProperties><dc:title>Quarterly Plan</dc:title></cp:coreProperties>',
  "word/document.xml": `<w:document><w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Goals &amp; scope</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Ship the </w:t></w:r><w:r><w:t>reader.</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>First item</w:t></w:r></w:p>
    <w:tbl><w:tr><w:tc><w:p><w:r><w:t>Metric</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Target</w:t></w:r></w:p></w:tc></w:tr>
    <w:tr><w:tc><w:p><w:r><w:t>Users</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>10k</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  </w:body></w:document>`,
};

test("docx: headings, runs joined, lists, tables as markdown, title from core props", () => {
  const d = readDocx(zip(DOCX), OL);
  assert.equal(d.title, "Quarterly Plan");
  assert.match(d.text, /^#{1,2} Goals & scope/m);
  assert.match(d.text, /Ship the reader\./);
  assert.match(d.text, /- First item/);
  assert.match(d.text, /\| Metric \| Target \|/);
  assert.match(d.text, /\| Users \| 10k \|/);
  assert.equal(d.tables, 1);
});

test("pptx: slides in order with titles, body and speaker notes", () => {
  const sp = (t: string, title = false) => `<p:sp>${title ? '<p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' : ""}<p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`;
  const z = zip({
    "[Content_Types].xml": "<Types/>",
    "ppt/presentation.xml": "<p:presentation/>",
    "ppt/slides/slide2.xml": `<p:sld>${sp("Roadmap", true)}${sp("Q3: launch")}</p:sld>`,
    "ppt/slides/slide1.xml": `<p:sld>${sp("Intro", true)}${sp("Why now")}</p:sld>`,
    "ppt/notesSlides/notesSlide1.xml": `<p:notes>${sp("Say hello first")}</p:notes>`,
    "ppt/slides/_rels/slide1.xml.rels": '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
  });
  const p = readPptx(z, OL);
  assert.equal(p.slides, 2);
  assert.ok(p.text.indexOf("Intro") < p.text.indexOf("Roadmap"), "slide order");
  assert.match(p.text, /Why now/);
  assert.match(p.text, /Say hello first/);
});

test("xlsx: shared strings, numbers and dates become a typed table", () => {
  const z = zip({
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": '<workbook><sheets><sheet name="Sales" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": "<sst><si><t>Region</t></si><si><t>Revenue</t></si><si><t>North</t></si><si><t>South</t></si></sst>",
    "xl/styles.xml": '<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1200.5</v></c><c r="C2" s="1"><v>45292</v></c></row><row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>800</v></c></row></sheetData></worksheet>',
  });
  const x = readXlsx(z, OL);
  assert.equal(x.sheets[0].name, "Sales");
  assert.deepEqual(x.sheets[0].rows[0].slice(0, 2), ["Region", "Revenue"]);
  assert.equal(Number(x.sheets[0].rows[1][1]), 1200.5);
  assert.equal(String(x.sheets[0].rows[1][2]).slice(0, 10), "2024-01-01");
  assert.equal(excelDate(45292).slice(0, 10), "2024-01-01");
});

test("csv: delimiter sniffing, quoted fields with commas, newlines and escaped quotes", () => {
  assert.equal(sniffDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(sniffDelimiter("a\tb\n1\t2"), "\t");
  const rows = parseCsv('name,note\n"Smith, J","said ""hi""\nthen left"\nLee,ok\n');
  assert.deepEqual(rows[1], ["Smith, J", 'said "hi"\nthen left']);
  assert.equal(rows.length, 3);
});

test("data: stats are computed exactly (mean, median, quartiles, std, sum), plus types and correlation", () => {
  const p = profileColumn("x", ["1", "2", "3", "4", "100", ""]);
  assert.equal(p.type, "number");
  const n = p as Extract<typeof p, { type: "number" }>;
  assert.equal(n.count, 5);
  assert.equal(n.missing, 1);
  assert.equal(n.sum, 110);
  assert.equal(n.mean, 22);
  assert.equal(n.median, 3);
  assert.equal(n.min, 1);
  assert.equal(n.max, 100);
  assert.equal(toNumber("$1,234.50"), 1234.5);
  assert.equal(toNumber("12%"), 12);
  assert.ok(toDate("2024-03-05") !== null);
  assert.equal(profileColumn("d", ["2024-01-01", "2024-02-01"]).type, "date");
  const r = pearson([1, 2, 3, 4], [2, 4, 6, 8]);
  assert.ok(Math.abs(r.r - 1) < 1e-9);
  const t = tableFrom("sales.csv", [["region", "units", "price"], ...["N", "S", "E", "W", "NE", "NW", "SE", "SW"].map((r, i) => [r, String((i + 1) * 10), String((i + 1) * 2)])], 1000);
  const b = tableBlock(t, 8000);
  assert.match(b.text, /Statistics computed exactly by Keplar/);
  assert.match(b.text, /units/);
  assert.match(b.text, /mean 45/);
  assert.match(b.text, /units ↔ price r=1\.00/);
});

test("json: finds the records array and turns it into a table", () => {
  const r = recordsIn({ meta: { n: 2 }, data: { items: [{ a: 1, b: "x" }, { a: 2, b: "y" }] } });
  assert.equal(r?.path, "data.items");
  assert.equal(r?.records.length, 2);
});

test("rtf: control words and groups stripped, escapes decoded", () => {
  const t = rtfToText("{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}{\\*\\generator Word;}\\f0 Hello \\b bold\\b0  world\\par Caf\\'e9 \\u8212? done}");
  assert.match(t, /Hello bold world/);
  assert.match(t, /Café/);
  assert.match(t, /—/);
  assert.doesNotMatch(t, /Arial|generator/);
});

test("extract: executables and old Office files are refused; text, code, CSV, JSON, docx and code zips are read", async () => {
  assert.equal(isExecutable(new Uint8Array([0x4d, 0x5a, 0x90, 0])), true);
  assert.equal(isExecutable(new Uint8Array([0x7f, 0x45, 0x4c, 0x46])), true);
  await assert.rejects(extractFile({ bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0, 1, 2]), name: "notes.pdf" }, F), /program/);
  await assert.rejects(extractFile({ bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]), name: "old.doc" }, F), /older Office/);
  await assert.rejects(extractFile({ bytes: new Uint8Array(0), name: "x.txt" }, F), /empty/);
  await assert.rejects(extractFile({ bytes: new Uint8Array(F.docBytes + 1), name: "big.txt" }, F), /plan reads files up to/);

  const code = await extractFile({ bytes: new TextEncoder().encode("export const add = (a: number, b: number) => a + b;\n"), name: "math.ts" }, F);
  assert.equal(code.kind, "code");
  assert.match(code.text, /```typescript/);

  const csv = await extractFile({ bytes: new TextEncoder().encode("city,temp\nOslo,4\nRome,18\nCairo,30\n"), name: "t.csv" }, F);
  assert.equal(csv.kind, "csv");
  assert.match(csv.text, /mean 17\.33/);

  const json = await extractFile({ bytes: new TextEncoder().encode(JSON.stringify([{ n: 1 }, { n: 2 }, { n: 3 }])), name: "d.json" }, F);
  assert.equal(json.kind, "json");
  assert.match(json.text, /mean 2/);

  const docx = await extractFile({ bytes: zip(DOCX), name: "plan.docx" }, F);
  assert.equal(docx.kind, "docx");
  assert.equal(docx.title, "Quarterly Plan");

  const proj = zip({ "app/src/index.ts": "console.log('hi')", "app/node_modules/x/index.js": "junk", "app/.env": "SECRET=1", "app/package.json": '{"name":"app"}', "app/README.md": "# App" });
  const z = await extractFile({ bytes: proj, name: "app.zip" }, F);
  assert.equal(z.kind, "zip");
  assert.match(z.text, /index\.ts/);
  assert.doesNotMatch(z.text, /SECRET=1/);
  assert.doesNotMatch(z.text, /junk/);
});

const PAGE = `<!doctype html><html lang="en"><head><title>How tides work | Ocean Notes</title>
<meta name="description" content="A plain guide to tides."><meta property="og:site_name" content="Ocean Notes"><meta name="author" content="R. Diaz">
<meta name="theme-color" content="#0b3d5c"><style>body{color:#1a1a1a;background:#fafafa} .cta{background:#e4572e}</style>
<script type="application/ld+json">{"@type":"Article","headline":"How tides work","datePublished":"2025-04-02"}</script></head>
<body><header><nav><a href="/">Home</a><a href="/guides">Guides</a><a href="/about">About</a></nav></header>
<aside class="sidebar"><a href="/a">Related 1</a><a href="/b">Related 2</a><a href="/c">Related 3</a></aside>
<main><article><h1>How tides work</h1><p>Tides are the regular rise and fall of the sea. The Moon's gravity pulls on the oceans and makes a bulge of water on the side facing it.</p>
<h2>Spring and neap tides</h2><p>When the Sun and Moon line up, their pulls add together, so high tides are higher. These are called spring tides, and they happen twice a month.</p>
<p>When they pull at right angles, the tides are weaker. These are neap tides. Most coasts see two high tides a day, about 12 hours and 25 minutes apart.</p></article></main>
<footer>© 2025 Ocean Notes. <a href="/privacy">Privacy</a></footer><script>window.track=1</script></body></html>`;

test("html: Readability-style read keeps the article, drops nav/aside/footer/scripts, and reads metadata", () => {
  const r = readHtml(PAGE, "https://ocean.example.com/tides");
  assert.equal(r.title, "How tides work");
  assert.equal(r.siteName, "Ocean Notes");
  assert.equal(r.author, "R. Diaz");
  assert.equal(r.lang, "en");
  assert.match(r.text, /Moon's gravity/);
  assert.match(r.text, /## Spring and neap tides/);
  assert.doesNotMatch(r.text, /Related 1|Privacy|window\.track/);
  assert.ok(r.headings.some((h) => /Spring and neap/.test(h)));
  assert.ok(r.words > 60);
  assert.ok(r.design.nav.includes("Guides"));
  assert.ok(r.design.palette.includes("#0b3d5c"));
  assert.ok(paletteFrom(".x{color:#e4572e}").includes("#e4572e"));
});

test("html: script-rendered shells are flagged rather than read as empty pages", () => {
  const r = readHtml('<html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>', "https://spa.example.com/");
  assert.equal(r.scriptRendered, true);
});

test("kinds: file routing, URL finding and YouTube ids", () => {
  assert.equal(kindOfFile({ name: "a.PDF" }), "pdf");
  assert.equal(kindOfFile({ name: "deck.pptx" }), "pptx");
  assert.equal(kindOfFile({ name: "sheet.xlsx" }), "xlsx");
  assert.equal(kindOfFile({ name: "song.mp3", type: "audio/mpeg" }), "audio");
  assert.equal(kindOfFile({ name: "main.rs" }), "code");
  assert.equal(kindOfFile({ name: "clip.mov", type: "video/quicktime" }), "video");
  assert.deepEqual(urlsIn("see https://example.com/a?b=1, and (https://x.org/y)."), ["https://example.com/a?b=1", "https://x.org/y"]);
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=3"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeId("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.deepEqual(READS.map((r) => r.label), ["Links", "Images", "Video", "Audio", "Documents", "Code", "Data"]);
});

test("youtube: caption track choice, json3 and XML captions become timestamped text, chapters, embedded JSON", () => {
  const t = pickTrack([{ baseUrl: "a", languageCode: "de", kind: "asr" }, { baseUrl: "b", languageCode: "en", kind: "asr" }, { baseUrl: "c", languageCode: "en" }] as never);
  assert.equal(t?.baseUrl, "c");
  const j = captionsToText({ events: [{ tStartMs: 0, segs: [{ utf8: "Hello" }, { utf8: " there" }] }, { tStartMs: 65_000, segs: [{ utf8: "Later" }] }] }, 1000);
  assert.match(j, /\[0:00\] Hello there/);
  assert.match(j, /\[1:05\] Later/);
  assert.match(xmlCaptionsToText('<transcript><text start="3.2" dur="1">It&amp;#39;s fine</text></transcript>', 1000), /\[0:03\] It's fine/);
  assert.deepEqual(chaptersFrom("Intro\n0:00 Start\n1:30 Middle part\nnot a chapter"), ["0:00 Start", "1:30 Middle part"]);
  assert.deepEqual(jsonAfter('var ytInitialPlayerResponse = {"a":{"b":"}"}};var x', "ytInitialPlayerResponse"), { a: { b: "}" } });
});

test("keyframes: picks scene changes, keeps spacing, returns times in order", () => {
  const flat = (v: number) => new Uint8Array(144).fill(v);
  const sigs = [flat(10), flat(11), flat(10), flat(200), flat(201), flat(200), flat(60), flat(61), flat(60), flat(62)];
  const times = sigs.map((_, i) => i);
  const pick = selectKeyframes(sigs, times, 3);
  assert.equal(pick.length, 3);
  assert.deepEqual([...pick].sort((a, b) => a - b), pick);
  assert.ok(pick.includes(3), "the cut to a bright scene");
  assert.ok(pick.includes(6), "the cut to the mid scene");
  assert.ok(sigDiff(flat(0), flat(255)) > sigDiff(flat(0), flat(10)));
  assert.equal(candidatesFor(16), 40);
});

function wav(samples: number[], rate = 16000): Uint8Array {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(s, 44 + i * 2));
  return new Uint8Array(b);
}

test("audio: strict WAV validation, silence detection and transcript cleanup", () => {
  const tone = Array.from({ length: 16000 }, (_, i) => Math.round(Math.sin(i / 5) * 8000));
  const info = wavInfo(wav(tone));
  assert.equal(info.sampleRate, 16000);
  assert.ok(Math.abs(info.seconds - 1) < 0.01);
  assert.ok(rmsLevel(wav(tone), info) > rmsLevel(wav(new Array(16000).fill(0)), wavInfo(wav(new Array(16000).fill(0)))));
  assert.throws(() => wavInfo(new Uint8Array(20)));
  assert.throws(() => wavInfo(wav(tone, 4000)));
  assert.equal(cleanTranscript("Transcript: hello world"), "hello world");
});

test("reference briefs: inspiration-only rules travel with the briefs and the block fits its budget", () => {
  const b = linkBrief("Linear", "linear.app", { palette: ["#08090a", "#f7f8f8"], fonts: ["Inter"], nav: ["Product", "Pricing"], ctas: ["Start building"], sections: ["Hero", "Features", "Pricing"] }, "Issue tracking");
  assert.match(b, /Section flow: Hero → Features → Pricing/);
  const block = referenceBlock([b, "Reference image: dark dashboard"], 600);
  assert.ok(block.length <= 600, `block ${block.length}`);
  assert.match(block, /Do not copy/);
  assert.equal(referenceBlock([b], 50), "");
});

test("sources: links Keplar read are listed first and labeled as read", () => {
  const out = withReadSources({ sources: [{ kind: "model", title: "x", url: "https://x.org", detail: "Cited" }] } as never, [{ name: "a — A", text: "t", source: "link", url: "https://a.example.com/p" }, { name: "f.pdf", text: "t" }]);
  const s = (out as unknown as { sources: { url?: string; detail?: string }[] }).sources;
  assert.equal(s[0].url, "https://a.example.com/p");
  assert.equal(s[0].detail, "Read by Keplar for this answer");
  assert.equal(s.length, 2);
});
