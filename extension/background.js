// Service worker. "Ask Keplar…" stores text and opens the popup; nothing is sent until Ask.
// "Search this tab" injects the overlay. A drag can be cropped into a picture for the page only.
// The ask request is the question string. The picture is never included.
import { ASK_URL, STAGE_TEXT, composeQuestion, cropRect, describeAnswer, errorText, looksLikeKey, parseSse } from "./lib.js";

const api = globalThis.chrome;

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({ id: "ask-selection", title: "Ask Keplar about “%s” (beta)", contexts: ["selection"] });
    api.contextMenus.create({ id: "ask-page", title: "Ask Keplar about this page (beta)", contexts: ["page"] });
    api.contextMenus.create({ id: "search-tab", title: "Search this tab with Keplar (beta)", contexts: ["page", "selection", "image", "link", "video", "audio", "editable"] });
  });
});

async function pageText(tabId) {
  const [res] = await api.scripting.executeScript({ target: { tabId }, func: () => (document.body ? document.body.innerText : "").slice(0, 20000) });
  return String(res?.result ?? "");
}

async function openLens(tabId) {
  await api.scripting.executeScript({ target: { tabId }, files: ["lens.js"] });
}

api.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === "search-tab") {
      if (tab?.id !== undefined) await openLens(tab.id);
      return;
    }
    const kind = info.menuItemId === "ask-selection" ? "selection" : "page";
    let text = kind === "selection" ? String(info.selectionText ?? "") : "";
    if (kind === "page" && tab?.id !== undefined) text = await pageText(tab.id);
    await api.storage.session.set({ pending: { kind, text, url: tab?.url ?? "", at: Date.now() } });
    await api.windows.create({ url: api.runtime.getURL("popup.html?menu=1"), type: "popup", width: 440, height: 680 });
  } catch {
    /* restricted pages (browser settings, the web store) can't be read; the popup explains this when opened directly */
  }
});

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function cropShot(sender, msg) {
  const windowId = sender?.tab?.windowId;
  if (windowId === undefined) return "";
  const shot = await api.tabs.captureVisibleTab(windowId, { format: "png" });
  const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
  const box = cropRect(msg?.rect, msg?.viewport, bitmap.width, bitmap.height);
  if (!box) { bitmap.close?.(); return ""; }
  const scale = Math.min(1, 1600 / Math.max(box.w, box.h));
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close?.(); return ""; }
  ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, w, h);
  bitmap.close?.();
  const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "keplar-lens-open" && Number.isInteger(msg.tabId)) {
    openLens(msg.tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "keplar-lens-shot") {
    cropShot(sender, msg).then((dataUrl) => sendResponse({ dataUrl })).catch(() => sendResponse({ dataUrl: "" }));
    return true;
  }
  return undefined;
});

const lensPorts = new Set();
api.runtime.onConnect.addListener((port) => {
  if (port.name !== "keplar-lens") return;
  lensPorts.add(port);
  let controller = null;
  port.onDisconnect.addListener(() => { controller?.abort(); lensPorts.delete(port); });
  port.onMessage.addListener((msg) => { if (msg?.type === "ask") void answer(port, msg, (next) => { controller?.abort(); controller = next; }); });
});

async function answer(port, msg, swap) {
  const controller = new AbortController();
  swap(controller);
  const post = (payload) => { try { port.postMessage(payload); } catch { /* overlay closed */ } };
  try {
    const { apiKey } = await api.storage.local.get("apiKey");
    if (!looksLikeKey(apiKey)) {
      post({ type: "error", text: "Open the Keplar toolbar button and paste a kpl_ key. Keys are on paid plans (Lite and above)." });
      return;
    }
  const kind = msg.kind === "page" || msg.kind === "region" ? msg.kind : "selection";
  const { question, truncated } = composeQuestion({ ask: msg.ask, context: msg.context, kind, url: msg.url });
  if (!question) { post({ type: "error", text: "Type a question or drag over words on the page." }); return; }
  post({ type: "status", text: truncated ? "Sending (the added text was shortened to fit)…" : "Sending…" });
  try {
    const res = await fetch(ASK_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ question, stream: true }),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok || !res.body) {
      post({ type: "error", text: errorText(res.status, await res.json().catch(() => null)) });
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let final = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buf += dec.decode(value, { stream: !done });
      const parsed = parseSse(buf);
      buf = parsed.rest;
      for (const e of parsed.events) {
        if (e.event === "progress") post({ type: "status", text: STAGE_TEXT[e.data?.stage] ?? "Working…" });
        else if (e.event === "answer") final = e.data;
        else if (e.event === "error") { post({ type: "error", text: errorText(0, { error: e.data }) }); return; }
      }
      if (done) break;
    }
    if (!final) { post({ type: "error", text: "No answer came back. Nothing was charged. Try again." }); return; }
    post({ type: "answer", data: describeAnswer(final) });
    } catch (e) {
      if (e?.name !== "AbortError") post({ type: "error", text: "Couldn't reach Keplar. Check your connection and try again." });
    }
  } catch {
    post({ type: "error", text: "Keplar hit a problem reading your key. Open the toolbar and try again." });
  }
}
