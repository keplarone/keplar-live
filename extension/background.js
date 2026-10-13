// Service worker. "Ask Keplar…" stores text and opens the popup; nothing is sent until Ask.
// "Search with Keplar One" (Keplar Lens) injects the overlay. After the person agreed once, a search sends the words inside
// the dragged area and one picture of it (cropped here from the visible tab) to Keplar with their connection. Nothing is stored.
// Connect: the person approves on keplar.one while signed in, and this worker collects the connection (a key for their own
// account, so searches spend their credits) with a PKCE verifier that never leaves the extension. No key to create or paste.
import {
  API_ORIGIN, ASK_URL, CONNECT_POLL_MS, CONNECT_TTL_MS, CONNECT_URL, DISCONNECT_URL, STAGE_TEXT, TOKEN_URL,
  composeQuestion, connectStatusText, cropRect, describeAnswer, errorText, lensRequest, looksLikeKey, parseSse, pkcePair,
} from "./lib.js";

const api = globalThis.chrome;

/* ── connecting to the person's Keplar account ───────────────────────────── */
let polling = false;
const post = (url, body, headers = {}) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body ?? {}), credentials: "omit", cache: "no-store" });

async function startConnect() {
  const { verifier, challenge } = await pkcePair();
  const browser = /\bEdg\//.test(navigator.userAgent) ? "Edge" : "Chrome";
  const res = await post(CONNECT_URL, { challenge, label: `Keplar One extension (${browser})` });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.rid !== "string" || typeof body?.url !== "string") return { ok: false, text: errorText(res.status, body) };
  const url = new URL(body.url);
  if (url.origin !== API_ORIGIN) return { ok: false, text: "Couldn't connect. Press Connect to try again." }; // only ever opens keplar.one
  await api.storage.session.set({ connect: { rid: body.rid, verifier, code: String(body.code ?? ""), at: Date.now() }, connectError: "" });
  await api.tabs.create({ url: url.toString() });
  void pollConnect();
  return { ok: true, code: String(body.code ?? "") };
}

/** Ask every 2 seconds whether the person approved. Each round reads extension storage, which also keeps this worker awake. */
async function pollConnect() {
  if (polling) return;
  polling = true;
  try {
    for (;;) {
      const { connect } = await api.storage.session.get("connect");
      if (!connect?.rid) return;
      if (Date.now() - connect.at > CONNECT_TTL_MS) { await finishConnect({ status: "expired" }); return; }
      let r = null;
      try {
        const res = await post(TOKEN_URL, { rid: connect.rid, verifier: connect.verifier });
        r = res.ok ? await res.json() : null; // busy or offline: ask again next round
      } catch { r = null; }
      if (r && r.status !== "pending") { await finishConnect(r); return; }
      await new Promise((done) => setTimeout(done, CONNECT_POLL_MS));
    }
  } finally {
    polling = false;
  }
}

async function finishConnect(r) {
  await api.storage.session.remove("connect");
  if (r.status === "connected" && looksLikeKey(r.key)) {
    await api.storage.local.set({ apiKey: r.key, account: { email: String(r.email ?? ""), connectedAt: Date.now() } });
    await api.storage.session.set({ connectError: "" });
  } else {
    await api.storage.session.set({ connectError: connectStatusText(r.status) });
  }
}

/** Forget the connection here, and revoke it on keplar.one too. A key pasted by hand is only forgotten (revoke it in Account). */
async function disconnect() {
  const { apiKey, account } = await api.storage.local.get(["apiKey", "account"]);
  await api.storage.local.remove(["apiKey", "account"]);
  if (account && looksLikeKey(apiKey)) {
    try { await post(DISCONNECT_URL, {}, { authorization: `Bearer ${apiKey}` }); } catch { /* forgotten here either way */ }
  }
}

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({ id: "ask-selection", title: "Ask Keplar One about “%s”", contexts: ["selection"] });
    api.contextMenus.create({ id: "ask-page", title: "Ask Keplar One about this page", contexts: ["page"] });
    api.contextMenus.create({ id: "search-tab", title: "Search with Keplar One", contexts: ["page", "selection", "image", "link", "video", "audio", "editable"] });
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

/** A data: URL as a Blob, without the network stack. */
function dataUrlBlob(url) {
  const [head, b64] = String(url).split(",", 2);
  const type = /^data:([^;]+);base64$/.exec(head)?.[1] ?? "application/octet-stream";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

async function drawCrop(bitmap, box, maxEdge) {
  const scale = Math.min(1, maxEdge / Math.max(box.w, box.h));
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff"; // JPEG has no transparency
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, w, h);
  return { canvas, w, h };
}

/**
 * The dragged area as pictures: a PNG (up to 1600 px) for the preview and "Copy as image", and a JPEG (up to 1280 px) that is
 * sent with a Lens search, small enough for the API's image limit.
 */
async function cropShot(sender, msg) {
  const windowId = sender?.tab?.windowId;
  if (windowId === undefined) return null;
  const shot = await api.tabs.captureVisibleTab(windowId, { format: "png" });
  // Decoded here, not with fetch(): the extension's CSP only allows connecting to keplar.one, which blocks data: URLs.
  const bitmap = await createImageBitmap(dataUrlBlob(shot));
  const box = cropRect(msg?.rect, msg?.viewport, bitmap.width, bitmap.height);
  if (!box) { bitmap.close?.(); return null; }
  try {
    const big = await drawCrop(bitmap, box, 1600);
    const small = await drawCrop(bitmap, box, 1280);
    if (!big || !small) return null;
    const png = new Uint8Array(await (await big.canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    const jpeg = new Uint8Array(await (await small.canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 })).arrayBuffer());
    return {
      dataUrl: `data:image/png;base64,${bytesToBase64(png)}`,
      send: { dataUrl: `data:image/jpeg;base64,${bytesToBase64(jpeg)}`, width: small.w, height: small.h },
    };
  } finally {
    bitmap.close?.();
  }
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Connecting and disconnecting come only from the extension's own pages (the popup), never from a script on a web page.
  const ownPage = String(sender?.url ?? "").startsWith(api.runtime.getURL(""));
  if (ownPage && msg?.type === "keplar-connect") {
    startConnect().then(sendResponse).catch(() => sendResponse({ ok: false, text: "Couldn't reach Keplar. Check your connection and try again." }));
    return true;
  }
  if (ownPage && msg?.type === "keplar-connect-resume") {
    void pollConnect();
    sendResponse({ ok: true });
    return false;
  }
  if (ownPage && msg?.type === "keplar-connect-cancel") {
    api.storage.session.remove("connect").then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (ownPage && msg?.type === "keplar-disconnect") {
    disconnect().then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "keplar-lens-open" && Number.isInteger(msg.tabId)) {
    openLens(msg.tabId).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === "keplar-lens-shot") {
    cropShot(sender, msg).then((r) => sendResponse(r ?? { dataUrl: "" })).catch(() => sendResponse({ dataUrl: "" }));
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
      post({ type: "error", text: "Open the Keplar toolbar button and press Connect. Searches use your Keplar credits; there is no key to paste." });
      return;
    }
  let body;
  if (msg.lens === true) {
    // Keplar Lens: the words in the area plus its picture (the overlay sends one only after the person agreed), and follow-ups.
    body = lensRequest({ ask: msg.ask, words: msg.context, url: msg.url, image: msg.image, history: msg.history });
    if (!body) { post({ type: "error", text: "Drag over part of the page, or type a question." }); return; }
    post({ type: "status", text: body.image ? "Searching the area…" : "Searching…" });
  } else {
    const kind = msg.kind === "page" || msg.kind === "region" ? msg.kind : "selection";
    const { question, truncated } = composeQuestion({ ask: msg.ask, context: msg.context, kind, url: msg.url });
    if (!question) { post({ type: "error", text: "Type a question or drag over words on the page." }); return; }
    body = { question, stream: true };
    post({ type: "status", text: truncated ? "Sending (the added text was shortened to fit)…" : "Sending…" });
  }
  try {
    const res = await fetch(ASK_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!res.ok || !res.body) {
      if (res.status === 401) await api.storage.local.remove(["apiKey", "account"]); // disconnected or expired: the popup offers Connect again
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
    post({ type: "error", text: "Keplar hit a problem reading your connection. Open the toolbar and try again." });
  }
}
