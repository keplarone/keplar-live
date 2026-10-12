// In-tab overlay, injected only after "Search this tab with Keplar One" or the toolbar button.
// Classic script (not a module). Draws with DOM APIs. The picture never leaves this page; Ask sends words only.
(() => {
  const HOST_ID = "keplar-lens-host";
  const previous = document.getElementById(HOST_ID);
  if (previous) previous.dispatchEvent(new Event("keplar-lens-close"));

  const api = globalThis.chrome;
  const host = document.createElement("div");
  host.id = HOST_ID;
  // Like keplar.one: the page's own light/dark choice when it states one, else the browser's setting.
  const darkQuery = globalThis.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  const syncTheme = () => {
    const t = document.documentElement.getAttribute("data-theme");
    host.setAttribute("data-keplar", t === "light" || t === "dark" ? t : darkQuery?.matches ? "dark" : "light");
  };
  darkQuery?.addEventListener?.("change", syncTheme);
  syncTheme();
  const themeObs = new MutationObserver(syncTheme);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  for (const [k, v] of [["position", "fixed"], ["inset", "0"], ["z-index", "2147483647"], ["margin", "0"], ["padding", "0"], ["border", "0"], ["background", "transparent"], ["display", "block"]]) {
    host.style.setProperty(k, v, "important");
  }
  const shadow = host.attachShadow({ mode: "open" });
  const page = document.documentElement;
  if (!page.hasAttribute("data-keplar-lens-overflow")) page.setAttribute("data-keplar-lens-overflow", page.style.overflow || "");
  page.style.overflow = "hidden";

  const style = document.createElement("style");
  style.textContent = [
    ":host,:host([data-keplar='light']){--bg:#f7f8fa;--panel:#ffffff;--panel2:#f1f3f6;--ink:#0e0f12;--muted:#4b4f58;--faint:#686d78;--line:rgb(14 15 18 / .09);--strong:rgb(14 15 18 / .15);--btn:#0e0f12;--btnInk:#ffffff;--focus:#0a7a8a;--veil:rgb(14 15 18 / .34);--err:#b42318;--sh:0 1px 2px rgb(14 15 18 / .05),0 18px 48px -18px rgb(14 15 18 / .28)}",
    ":host([data-keplar='dark']){--bg:#0b0b0d;--panel:#141417;--panel2:#1c1c20;--ink:#ededf0;--muted:#a4a6ad;--faint:#8b8d94;--line:rgb(255 255 255 / .09);--strong:rgb(255 255 255 / .17);--btn:#ededf0;--btnInk:#0b0b0d;--focus:#5ecad8;--veil:rgb(11 11 13 / .5);--err:#ff9a8f;--sh:0 1px 2px rgb(0 0 0 / .4),0 20px 50px -20px rgb(0 0 0 / .75)}",
    ":host{all:initial}",
    "*{box-sizing:border-box;font:14px/1.5 \"Google Sans\",\"Product Sans\",system-ui,-apple-system,\"Segoe UI\",sans-serif;-webkit-font-smoothing:antialiased}",
    ".veil{position:fixed;inset:0;background:var(--veil);cursor:crosshair}",
    ".tip{position:fixed;z-index:3;pointer-events:none;background:var(--panel);color:var(--ink);border-radius:999px;padding:7px 13px;font-size:13px;box-shadow:var(--sh),inset 0 0 0 1px var(--line)}",
    ".frame{position:fixed;z-index:2;pointer-events:none;border-radius:6px;box-shadow:0 0 0 2px var(--btn),0 0 0 9999px var(--veil)}",
    ".menu{position:fixed;z-index:4;display:flex;gap:6px;background:var(--panel);color:var(--ink);border-radius:999px;padding:6px;box-shadow:var(--sh),inset 0 0 0 1px var(--line)}",
    ".menu button,.chip,.ask{background:var(--panel);color:var(--ink);border:0;box-shadow:inset 0 0 0 1px var(--line);border-radius:999px;padding:7px 13px;cursor:pointer;font-weight:500}",
    ".menu button:hover,.chip:hover{background:var(--panel2)}",
    ".ask{background:var(--btn);color:var(--btnInk);box-shadow:0 1px 2px rgb(14 15 18 / .2),0 8px 20px -12px rgb(14 15 18 / .45);padding:7px 18px}",
    ".panel{position:fixed;z-index:5;top:16px;right:16px;width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:var(--bg);color:var(--ink);border-radius:20px;padding:16px 16px 14px;box-shadow:var(--sh),inset 0 0 0 1px var(--line)}",
    ".head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
    "h1{font-size:16px;margin:0;font-weight:500;letter-spacing:-.01em}",
    ".x{background:transparent;color:var(--muted);border:0;font-size:20px;line-height:1;cursor:pointer;padding:4px 9px;border-radius:999px}.x:hover{background:var(--panel2);color:var(--ink)}",
    ".chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}",
    ".note{color:var(--faint);font-size:12px;margin:8px 0}",
    "form{display:flex;gap:8px;margin-top:8px}",
    "input{flex:1;min-width:0;background:var(--panel);color:var(--ink);border:1px solid var(--strong);border-radius:999px;padding:10px 14px}input::placeholder{color:var(--faint)}input:focus{outline:none;border-color:var(--focus)}",
    ".status{min-height:1.3em;color:var(--muted);margin:8px 0 0}",
    ".status.bad{color:var(--err)}",
    ".result{margin-top:12px;background:var(--panel);border-radius:16px;padding:12px 14px;box-shadow:inset 0 0 0 1px var(--line)}",
    ".agreement{font-weight:600;margin:0 0 8px}",
    ".answer{overflow-wrap:anywhere}",
    ".answer p,.answer h3{margin:0 0 8px}.answer h3{font-size:13px}.answer ul{color:inherit;margin:0 0 8px}.answer strong{font-weight:600}",
    ".answer code,.answer pre{font:12px \"IBM Plex Mono\",ui-monospace,Consolas,monospace;background:var(--panel2);border-radius:8px}.answer code{padding:1px 5px}.answer pre{padding:8px 10px;white-space:pre-wrap;margin:0 0 8px}",
    "ul{margin:6px 0 0;padding-left:18px;color:var(--muted)}",
    "img{display:block;width:100%;max-height:120px;object-fit:contain;border-radius:12px;margin-top:8px;background:var(--panel2)}",
    ":focus-visible{outline:2px solid var(--focus);outline-offset:2px}",
  ].join("");

  function el(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }
  function menuButton(label) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    return b;
  }

  const veil = el("div", "veil");
  const tip = el("div", "tip");
  tip.textContent = "Drag to search";
  tip.hidden = true;
  const frame = el("div", "frame");
  frame.hidden = true;
  const menu = el("div", "menu");
  menu.hidden = true;
  const panel = el("div", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Search this tab with Keplar One");
  const head = el("div", "head");
  const title = document.createElement("h1");
  title.textContent = "Ask about this page";
  const closeBtn = el("button", "x");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "×";
  head.append(title, closeBtn);
  const chips = el("div", "chips");
  const preview = document.createElement("img");
  preview.alt = "";
  preview.hidden = true;
  const note = el("p", "note");
  note.textContent = "This tab only. The picture stays here; Ask sends the words.";
  const form = document.createElement("form");
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Ask anything";
  input.setAttribute("aria-label", "Ask anything");
  const go = el("button", "ask");
  go.type = "submit";
  go.textContent = "Ask";
  form.append(input, go);
  const status = el("p", "status");
  status.setAttribute("role", "status");
  const result = el("div", "result");
  result.hidden = true;
  const agreement = el("p", "agreement");
  const answer = el("div", "answer");
  const differ = el("div", "");
  const headline = document.createElement("h1");
  const positions = document.createElement("ul");
  differ.append(headline, positions);
  const meta = el("p", "note");
  result.append(agreement, answer, differ, meta);
  panel.append(head, chips, preview, note, form, status, result);
  shadow.append(style, veil, tip, frame, menu, panel);
  page.append(host);

  const askAbout = menuButton("Ask about this");
  const copyText = menuButton("Copy text");
  const copyImage = menuButton("Copy as image");
  menu.append(askAbout, copyText, copyImage);

  let port = null;
  let awaiting = false;
  let done = false;
  let dragging = false;
  let locked = false;
  let x0 = 0;
  let y0 = 0;
  let region = null;
  let regionText = "";
  let shotUrl = "";
  let busy = false;

  function say(text, bad) {
    status.textContent = text || "";
    status.classList.toggle("bad", Boolean(bad));
  }
  function placeTip(x, y) {
    tip.hidden = false;
    tip.style.transform = "none";
    const w = 180;
    tip.style.left = `${Math.min(x + 14, window.innerWidth - w)}px`;
    tip.style.top = `${Math.max(8, y - 36)}px`;
  }
  function showFrame(left, top, width, height) {
    frame.hidden = false;
    frame.style.left = `${left}px`;
    frame.style.top = `${top}px`;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
  }
  function placeMenu(rect) {
    menu.hidden = false;
    const top = Math.min(rect.top + rect.height + 8, window.innerHeight - 52);
    menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 280))}px`;
    menu.style.top = `${Math.max(8, top)}px`;
  }
  function chip(label, prompt, mode) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = label;
    b.addEventListener("click", () => {
      if (mode === "region") {
        if (!regionText.trim()) { say("Drag over words on the page. Keplar can't read a picture.", true); return; }
        send(prompt, regionText, "region");
      } else {
        const text = pageWords();
        if (!text.trim()) { say("This page has no readable text.", true); return; }
        send(prompt, text, "page");
      }
    });
    return b;
  }
  function setChips(mode) {
    chips.replaceChildren();
    if (mode === "region") chips.append(chip("Explain this", "Explain this.", "region"), chip("What are the key points?", "What are the key points?", "region"));
    else chips.append(chip("Explain this page", "Explain this page.", "page"), chip("What are the key points?", "What are the key points?", "page"));
  }
  function pageWords() {
    return String(document.body ? document.body.innerText : "").slice(0, 20000);
  }
  function caretAt(x, y) {
    const pos = document.caretPositionFromPoint?.(x, y);
    if (pos?.offsetNode) return { node: pos.offsetNode, offset: pos.offset };
    const range = document.caretRangeFromPoint?.(x, y);
    if (range) return { node: range.startContainer, offset: range.startOffset };
    return null;
  }
  function wordsInDrag(rect) {
    const fromCaret = textFromCaret(rect);
    if (fromCaret.trim()) return fromCaret.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 20000);
    return wordsFromBoxes(rect).slice(0, 20000);
  }
  function textFromCaret(rect) {
    host.style.setProperty("display", "none", "important");
    let a;
    let b;
    try {
      const right = rect.left + rect.width;
      const bottom = rect.top + rect.height;
      a = caretAt(Math.min(rect.left + 2, rect.left + rect.width / 2), Math.min(rect.top + 2, rect.top + rect.height / 2));
      b = caretAt(Math.max(right - 2, rect.left + rect.width / 2), Math.max(bottom - 2, rect.top + rect.height / 2));
    } finally {
      host.style.removeProperty("display");
    }
    if (!a || !b || a.node === host || b.node === host) return "";
    const range = document.createRange();
    const set = (s, e) => { range.setStart(s.node, s.offset); range.setEnd(e.node, e.offset); };
    try { set(a, b); } catch { try { set(b, a); } catch { return ""; } }
    return range.toString();
  }
  function wordsFromBoxes(rect) {
    if (!document.body) return "";
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const skip = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);
    const boxes = [];
    let n = walker.nextNode();
    while (n && boxes.length < 4000) {
      const parent = n.parentElement;
      const raw = n.nodeValue;
      if (parent && !skip.has(parent.tagName) && raw && raw.trim()) {
        try {
          const range = document.createRange();
          range.selectNodeContents(n);
          let top = Infinity;
          let left = Infinity;
          let bottom = -Infinity;
          let hit = false;
          for (const r of range.getClientRects()) {
            if (r.width < 1 || r.height < 1) continue;
            if (!(r.right > rect.left && r.left < rect.left + rect.width && r.bottom > rect.top && r.top < rect.top + rect.height)) continue;
            hit = true;
            top = Math.min(top, r.top);
            left = Math.min(left, r.left);
            bottom = Math.max(bottom, r.bottom);
          }
          if (hit) boxes.push({ text: raw, left, top, right: left + 1, bottom });
        } catch { /* a node the browser won't measure */ }
      }
      n = walker.nextNode();
    }
    return joinBoxes(boxes, rect);
  }
  function joinBoxes(boxes, rect) {
    const left = rect.left, top = rect.top, right = left + rect.width, bottom = top + rect.height;
    const hits = [];
    for (const b of boxes) {
      const text = String(b.text).replace(/\s+/g, " ").trim();
      if (!text) continue;
      if (!(b.right > left && b.left < right && b.bottom > top && b.top < bottom)) continue;
      hits.push({ text, left: b.left, top: b.top, bottom: b.bottom });
    }
    hits.sort((a, b) => a.top - b.top || a.left - b.left);
    const lines = [];
    let line = [];
    let lineBottom = -Infinity;
    for (const h of hits) {
      if (line.length && h.top > lineBottom + 4) { lines.push(line.join(" ")); line = []; }
      line.push(h.text);
      lineBottom = Math.max(lineBottom, h.bottom);
    }
    if (line.length) lines.push(line.join(" "));
    return lines.join("\n");
  }
  function takeShot(rect) {
    shotUrl = "";
    preview.hidden = true;
    preview.removeAttribute("src");
    try {
      api.runtime.sendMessage({ type: "keplar-lens-shot", rect, viewport: { w: window.innerWidth, h: window.innerHeight } }, (res) => {
        if (api.runtime.lastError || !res?.dataUrl) return;
        shotUrl = res.dataUrl;
        preview.src = shotUrl;
        preview.hidden = false;
      });
    } catch { /* picture is optional */ }
  }
  function lockRegion(rect) {
    locked = true;
    region = rect;
    regionText = wordsInDrag(rect);
    veil.style.background = "transparent";
    showFrame(rect.left, rect.top, rect.width, rect.height);
    placeMenu(rect);
    tip.textContent = "Click to exit";
    title.textContent = "Ask about this area";
    setChips("region");
    takeShot(rect);
    if (!regionText.trim()) say("Drag over words on the page. Keplar can't read a picture.", true);
    else say("");
  }
  function wire(p) {
    p.onMessage.addListener((msg) => {
      awaiting = false;
      busy = false;
      go.disabled = false;
      if (msg?.type === "status") say(msg.text || "");
      else if (msg?.type === "answer") { say(""); showAnswer(msg.data || {}); }
      else if (msg?.type === "error") say(msg.text || "Something went wrong.", true);
    });
    p.onDisconnect.addListener(() => {
      if (port === p) port = null;
      if (awaiting && !done) {
        awaiting = false;
        busy = false;
        go.disabled = false;
        say("Keplar hit a problem. Press Ask again.", true);
      }
    });
  }
  function ensurePort() {
    if (port) return port;
    try {
      port = api.runtime.connect({ name: "keplar-lens" });
      wire(port);
      return port;
    } catch {
      port = null;
      return null;
    }
  }
  function send(ask, context, kind) {
    const p = ensurePort();
    if (!p) { say("Keplar can't run on this page.", true); return; }
    if (busy) return;
    busy = true;
    awaiting = true;
    go.disabled = true;
    result.hidden = true;
    say("Sending…");
    const payload = { type: "ask", ask, context, kind, url: location.href };
    try { p.postMessage(payload); }
    catch {
      port = null;
      const again = ensurePort();
      if (!again) { busy = false; awaiting = false; go.disabled = false; say("Keplar can't run on this page.", true); return; }
      try { again.postMessage(payload); }
      catch { busy = false; awaiting = false; go.disabled = false; say("Keplar can't run on this page.", true); }
    }
  }
  // The answer arrives as blocks (markdownBlocks in lib.js, via the background); built with DOM APIs, never as HTML.
  function inline(tag, parts) {
    const node = document.createElement(tag);
    for (const p of parts || []) {
      const wrap = p.bold ? "strong" : p.em ? "em" : p.code ? "code" : null;
      if (wrap) { const w = document.createElement(wrap); w.textContent = String(p.text ?? ""); node.append(w); }
      else node.append(document.createTextNode(String(p.text ?? "")));
    }
    return node;
  }
  function renderBlocks(blocks) {
    const out = [];
    let list = null;
    for (const b of blocks || []) {
      if (b.type === "li") { if (!list) { list = document.createElement("ul"); out.push(list); } list.append(inline("li", b.parts)); continue; }
      list = null;
      out.push(inline(b.type === "code" ? "pre" : b.type === "h" ? "h3" : "p", b.parts));
    }
    return out;
  }
  function showAnswer(d) {
    agreement.textContent = d.agreement || "";
    if (Array.isArray(d.blocks)) answer.replaceChildren(...renderBlocks(d.blocks));
    else answer.textContent = d.answer || "";
    headline.textContent = d.headline || "";
    positions.replaceChildren();
    for (const p of d.positions || []) {
      const li = document.createElement("li");
      li.textContent = p;
      positions.append(li);
    }
    differ.hidden = !d.headline;
    meta.textContent = typeof d.meta === "string" ? d.meta : "Answers can be wrong; agreement isn't proof.";
    result.hidden = false;
  }
  function close() {
    if (done) return;
    done = true;
    page.style.overflow = page.getAttribute("data-keplar-lens-overflow") || "";
    page.removeAttribute("data-keplar-lens-overflow");
    try { port?.disconnect(); } catch { /* already gone */ }
    themeObs.disconnect();
    host.remove();
  }

  host.addEventListener("keplar-lens-close", close);
  closeBtn.addEventListener("click", close);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, true);
  veil.addEventListener("contextmenu", (e) => e.preventDefault());
  veil.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  veil.addEventListener("pointermove", (e) => {
    placeTip(e.clientX, e.clientY);
    if (!dragging) return;
    const left = Math.min(x0, e.clientX);
    const top = Math.min(y0, e.clientY);
    showFrame(left, top, Math.abs(e.clientX - x0), Math.abs(e.clientY - y0));
  });
  veil.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    x0 = e.clientX;
    y0 = e.clientY;
    veil.setPointerCapture(e.pointerId);
    veil.style.background = "transparent";
    menu.hidden = true;
    showFrame(x0, y0, 0, 0);
  });
  veil.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    const left = Math.min(x0, e.clientX);
    const top = Math.min(y0, e.clientY);
    const width = Math.abs(e.clientX - x0);
    const height = Math.abs(e.clientY - y0);
    if (width < 12 || height < 12) {
      if (locked) close();
      else { frame.hidden = true; veil.style.background = ""; }
      return;
    }
    lockRegion({ left, top, width, height });
  });
  askAbout.addEventListener("click", () => {
    if (!regionText.trim()) { say("Drag over words on the page. Keplar can't read a picture.", true); return; }
    send("Explain this.", regionText, "region");
  });
  copyText.addEventListener("click", async () => {
    if (!regionText.trim()) { say("Drag over words on the page. Keplar can't read a picture.", true); return; }
    try { await navigator.clipboard.writeText(regionText); say("Copied the words."); }
    catch { say("Couldn't copy the words.", true); }
  });
  copyImage.addEventListener("click", async () => {
    if (!shotUrl) { say("No picture of that area yet.", true); return; }
    try {
      const blob = await (await fetch(shotUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      say("Copied the picture. It stays on this device.");
    } catch { say("Couldn't copy the picture.", true); }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (region) {
      if (!q && !regionText.trim()) { say("Drag over words on the page. Keplar can't read a picture.", true); return; }
      send(q, regionText, "region");
      return;
    }
    if (!q) { say("Drag an area, or type a question.", true); return; }
    send(q, "", "selection");
  });
  ensurePort();
  setChips("page");
  tip.hidden = false;
  tip.style.left = "50%";
  tip.style.top = "72px";
  tip.style.transform = "translateX(-50%)";
  closeBtn.focus();
})();
