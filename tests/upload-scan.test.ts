import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanBytes, scanRemote, scanUpload, scannerConfigured } from "@/lib/security/upload-scan";

const png = (w: number, h: number) => {
  const b = Buffer.alloc(64, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};

test("plain PDFs, images and text pass", () => {
  assert.deepEqual(scanBytes(Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n%%EOF"), "application/pdf"), { ok: true });
  assert.deepEqual(scanBytes(png(1200, 800), "image/png"), { ok: true });
  assert.deepEqual(scanBytes(Buffer.from("Shopping list\n- milk\n- bread\n"), "text/plain"), { ok: true });
});

test("PDFs with JavaScript, launch actions, embedded files or open actions are refused", () => {
  for (const marker of ["/JavaScript (app.alert(1))", "/JS (this.print())", "/Launch /F (cmd.exe)", "/EmbeddedFiles 3 0 R", "/OpenAction 4 0 R", "/AA << /O 5 0 R >>", "/SubmitForm", "/XFA 6 0 R"]) {
    const v = scanBytes(Buffer.from(`%PDF-1.7\n1 0 obj << ${marker} >> endobj`), "application/pdf");
    assert.equal(v.ok, false, marker);
    assert.equal(!v.ok && v.code, "active_pdf");
  }
});

test("executables hidden behind an allowed type, decompression bombs and image/HTML polyglots are refused", () => {
  const exe = scanBytes(Buffer.concat([Buffer.from("MZ"), Buffer.alloc(100)]), "image/png");
  assert.equal(!exe.ok && exe.code, "executable");
  const zip = scanBytes(Buffer.concat([Buffer.from("PK\x03\x04", "latin1"), Buffer.alloc(100)]), "text/plain");
  assert.equal(!zip.ok && zip.code, "executable");
  const bomb = scanBytes(png(60_000, 60_000), "image/png");
  assert.equal(!bomb.ok && bomb.code, "bomb");
  const poly = scanBytes(Buffer.concat([png(10, 10), Buffer.from("<script>alert(document.cookie)</script></html>")]), "image/png");
  assert.equal(!poly.ok && poly.code, "polyglot");
  const php = scanBytes(Buffer.from("hello <?php system($_GET['c']); ?>"), "text/plain");
  assert.equal(!php.ok && php.code, "polyglot");
});

test("the external scanner is optional: off by default, refuses on a malicious verdict, fails open unless required", async () => {
  assert.equal(scannerConfigured({}), false);
  assert.deepEqual(await scanRemote(Buffer.from("x"), "text/plain", {}), { ok: true });
  const env = { KEPLAR_MALWARE_SCAN_URL: "https://scanner.internal/scan", KEPLAR_MALWARE_SCAN_TOKEN: "t" };
  const calls: { url: string; auth: string | null }[] = [];
  const fake = (verdict: unknown, status = 200) => (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), auth: (init?.headers as Record<string, string>)?.authorization ?? null });
    return new Response(JSON.stringify(verdict), { status });
  }) as typeof fetch;
  assert.deepEqual(await scanRemote(Buffer.from("x"), "text/plain", env, fake({ malicious: false })), { ok: true });
  const bad = await scanRemote(Buffer.from("x"), "text/plain", env, fake({ malicious: true }));
  assert.equal(!bad.ok && bad.code, "scanner");
  assert.equal(calls[0].auth, "Bearer t");
  const down = await scanRemote(Buffer.from("x"), "text/plain", env, fake({}, 500));
  assert.deepEqual(down, { ok: true }, "fail open by default");
  const strict = await scanRemote(Buffer.from("x"), "text/plain", { ...env, KEPLAR_MALWARE_SCAN_REQUIRED: "1" }, fake({}, 500));
  assert.equal(!strict.ok && strict.code, "scanner_unavailable");
  assert.deepEqual(await scanUpload(Buffer.from("plain"), "text/plain"), { ok: true });
});
