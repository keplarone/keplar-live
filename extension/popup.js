import { ASK_URL, STAGE_TEXT, USAGE_URL, composeQuestion, describeAnswer, errorText, looksLikeKey, parseSse, MAX_PAGE_CHARS } from "./lib.js";

const api = globalThis.chrome;
const $ = (id) => document.getElementById(id);
let context = { kind: "selection", text: "", url: "" };
let controller = null;

const show = (id, on) => { $(id).hidden = !on; };
const say = (el, text, bad = false) => { el.textContent = text; el.classList.toggle("err", bad); };

async function getKey() {
  const { apiKey } = await api.storage.local.get("apiKey");
  return looksLikeKey(apiKey) ? apiKey : null;
}

async function render() {
  const key = await getKey();
  show("setup", !key);
  show("ask", Boolean(key));
  show("forget", Boolean(key));
  if (key) { void showWho(key); return; }
  // Connecting: the person is approving on keplar.one; the service worker collects the connection and storage changes re-render.
  const { connect, connectError } = await api.storage.session.get(["connect", "connectError"]);
  const waiting = Boolean(connect?.rid);
  show("connect-wait", waiting);
  show("connect-cancel", waiting);
  $("connect").disabled = waiting;
  if (waiting) $("connect-wait").textContent = `Approve in the keplar.one tab that opened. It shows the code ${connect.code || "this extension started"}.`;
  say($("setup-msg"), connectError || "", Boolean(connectError));
}

/** Which account is connected, and the credits left this period (the usage endpoint spends nothing). */
async function showWho(key) {
  const { account } = await api.storage.local.get("account");
  const who = account?.email ? `Connected as ${account.email}.` : "Using an API key.";
  $("who").textContent = who;
  try {
    const res = await fetch(USAGE_URL, { headers: { authorization: `Bearer ${key}` }, credentials: "omit", cache: "no-store" });
    if (res.status === 401) { await api.storage.local.remove(["apiKey", "account"]); return; } // disconnected elsewhere: render() runs again
    const u = res.ok ? await res.json() : null;
    const left = u?.credits?.left;
    if (typeof left === "number") $("who").textContent = `${who} ${left.toLocaleString("en-US")} credits left this period.`;
  } catch { /* offline: the line without the count */ }
}

function setContext(c) {
  context = c;
  const has = Boolean(c.text.trim());
  show("ctx", has);
  show("clear-ctx", has);
  if (has) {
    const n = c.text.length;
    $("ctx").textContent = `${c.kind === "page" ? "Page text" : "Selected text"} added (${n.toLocaleString("en-US")} characters): ${c.text.slice(0, 160).replace(/\s+/g, " ")}${n > 160 ? "…" : ""}`;
  }
}

async function readTab(kind) {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  const [res] = await api.scripting.executeScript({
    target: { tabId: tab.id },
    func: (k, max) => (k === "page" ? (document.body ? document.body.innerText : "").slice(0, max) : String(window.getSelection() ?? "")),
    args: [kind, MAX_PAGE_CHARS],
  });
  return { kind, text: String(res?.result ?? ""), url: tab.url ?? "" };
}

async function addFromTab(kind) {
  say($("status"), "");
  try {
    const c = await readTab(kind);
    if (!c.text.trim()) { say($("status"), kind === "page" ? "This page has no readable text." : "Select some text on the page first, then open Keplar again.", true); return; }
    setContext(c);
  } catch {
    say($("status"), "Keplar can't read this page (browser pages and some stores are off limits). You can still type your question.", true);
  }
}

async function ask() {
  const key = await getKey();
  if (!key) { await render(); return; }
  const { question, truncated } = composeQuestion({ ask: $("q").value, context: context.text, kind: context.kind, url: context.url });
  if (!question) { say($("status"), "Type a question or add some text first.", true); return; }
  controller?.abort();
  controller = new AbortController();
  show("result", false);
  $("go").disabled = true;
  say($("status"), truncated ? "Sending (the added text was shortened to fit)…" : "Sending…");
  try {
    const res = await fetch(ASK_URL, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify({ question, stream: true }), signal: controller.signal, credentials: "omit", cache: "no-store" });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => null);
      say($("status"), errorText(res.status, body), true);
      if (res.status === 401) await api.storage.local.remove(["apiKey", "account"]); // disconnected or expired: offer Connect again
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let final = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += dec.decode(value, { stream: !done });
      const { events, rest } = parseSse(buf);
      buf = rest;
      for (const e of events) {
        if (e.event === "progress") say($("status"), STAGE_TEXT[e.data?.stage] ?? "Working…");
        else if (e.event === "answer") final = e.data;
        else if (e.event === "error") { say($("status"), errorText(0, { error: e.data }), true); return; }
      }
      if (done) break;
    }
    if (!final) { say($("status"), "No answer came back. Nothing was charged. Try again.", true); return; }
    renderAnswer(final);
    say($("status"), "");
  } catch (e) {
    if (e?.name !== "AbortError") say($("status"), "Couldn't reach Keplar. Check your connection and try again.", true);
  } finally {
    $("go").disabled = false;
  }
}

/** Builds the answer from blocks (markdownBlocks in lib.js) with DOM APIs only: text never becomes HTML. */
function renderBlocks(blocks) {
  const out = [];
  let list = null;
  for (const b of blocks) {
    if (b.type === "li") {
      if (!list) { list = document.createElement("ul"); out.push(list); }
      list.append(inlineEl("li", b.parts));
      continue;
    }
    list = null;
    out.push(b.type === "code" ? inlineEl("pre", b.parts) : inlineEl(b.type === "h" ? "h3" : "p", b.parts));
  }
  return out;
}
function inlineEl(tag, parts) {
  const el = document.createElement(tag);
  for (const p of parts) {
    const node = p.bold ? document.createElement("strong") : p.em ? document.createElement("em") : p.code ? document.createElement("code") : null;
    if (node) { node.textContent = p.text; el.append(node); } else el.append(document.createTextNode(p.text));
  }
  return el;
}

function renderAnswer(a) {
  const d = describeAnswer(a);
  $("agreement").textContent = d.agreement;
  $("answer").replaceChildren(...renderBlocks(d.blocks));
  show("differ", Boolean(d.headline));
  $("headline").textContent = d.headline;
  const ul = $("positions");
  ul.replaceChildren(...d.positions.map((t) => { const li = document.createElement("li"); li.textContent = t; return li; }));
  $("meta").textContent = d.meta;
  show("result", true);
}

$("save").addEventListener("click", async () => {
  const v = $("key").value.trim();
  if (!looksLikeKey(v)) { say($("setup-msg"), "That doesn't look like a Keplar key. It starts with kpl_.", true); return; }
  await api.storage.local.set({ apiKey: v });
  await api.storage.local.remove("account");
  $("key").value = "";
  say($("setup-msg"), "");
  await render();
});
$("connect").addEventListener("click", async () => {
  say($("setup-msg"), "");
  $("connect").disabled = true;
  const res = await api.runtime.sendMessage({ type: "keplar-connect" }).catch(() => null);
  if (!res?.ok) { $("connect").disabled = false; say($("setup-msg"), res?.text || "Couldn't reach Keplar. Check your connection and try again.", true); return; }
  await render();
});
$("connect-cancel").addEventListener("click", async () => {
  await api.runtime.sendMessage({ type: "keplar-connect-cancel" }).catch(() => null);
  await render();
});
$("forget").addEventListener("click", async () => {
  await api.runtime.sendMessage({ type: "keplar-disconnect" }).catch(() => null);
  await api.storage.local.remove(["apiKey", "account"]);
  controller?.abort();
  show("result", false);
  setContext({ kind: "selection", text: "", url: "" });
  await render();
});
$("lens").addEventListener("click", async () => {
  say($("lens-msg"), "");
  try {
    const [here] = await api.tabs.query({ active: true, currentWindow: true });
    let tab = here;
    if (!tab?.id || String(tab.url ?? "").startsWith("chrome-extension:")) {
      const [normal] = await api.tabs.query({ active: true, windowType: "normal" });
      tab = normal;
    }
    if (!tab?.id) { say($("lens-msg"), "No tab to search.", true); return; }
    const res = await api.runtime.sendMessage({ type: "keplar-lens-open", tabId: tab.id });
    if (!res?.ok) { say($("lens-msg"), "Keplar can't open on this page.", true); return; }
    window.close();
  } catch {
    say($("lens-msg"), "Keplar can't open on this page.", true);
  }
});
$("add-sel").addEventListener("click", () => void addFromTab("selection"));
$("add-page").addEventListener("click", () => void addFromTab("page"));
$("clear-ctx").addEventListener("click", () => setContext({ kind: "selection", text: "", url: "" }));
$("go").addEventListener("click", () => void ask());
$("q").addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void ask(); });

// The connection finishing (or being removed) anywhere re-renders this popup.
api.storage.onChanged.addListener((changes) => { if (changes.apiKey || changes.connect || changes.connectError) void render(); });

(async () => {
  await render();
  void api.runtime.sendMessage({ type: "keplar-connect-resume" }).catch(() => null); // a worker that was asleep picks the poll back up
  if (new URLSearchParams(location.search).has("menu")) {
    const { pending } = await api.storage.session.get("pending");
    await api.storage.session.remove("pending");
    if (pending && Date.now() - pending.at < 60_000) setContext({ kind: pending.kind, text: String(pending.text ?? ""), url: String(pending.url ?? "") });
  }
})();
