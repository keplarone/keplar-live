// Keplar Lens: the in-tab overlay, injected only after "Search with Keplar One" or the toolbar button.
// Classic script (not a module). Draws with DOM APIs only (never HTML). The first time, it asks the person to agree that a
// search sends the words inside the area and a picture of it to Keplar; until they agree, nothing is sent. Nothing is stored.
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

  // keplar.one's theme tokens (src/styles/tokens.css dark, light.css light) and its aura colours for the Lens glow.
  const style = document.createElement("style");
  style.textContent = [
    ":host,:host([data-keplar='light']){--bg:#f7f8fa;--panel:#ffffff;--panel2:#f1f3f6;--ink:#0e0f12;--muted:#4b4f58;--faint:#686d78;--line:rgb(14 15 18 / .09);--strong:rgb(14 15 18 / .15);--btn:#0e0f12;--btnInk:#ffffff;--focus:#0a7a8a;--veil:rgb(14 15 18 / .38);--err:#b42318;--sh:0 1px 2px rgb(14 15 18 / .05),0 18px 48px -18px rgb(14 15 18 / .28)}",
    ":host([data-keplar='dark']){--bg:#0b0b0d;--panel:#141417;--panel2:#1c1c20;--ink:#ededf0;--muted:#a4a6ad;--faint:#8b8d94;--line:rgb(255 255 255 / .09);--strong:rgb(255 255 255 / .17);--btn:#ededf0;--btnInk:#0b0b0d;--focus:#5ecad8;--veil:rgb(11 11 13 / .55);--err:#ff9a8f;--sh:0 1px 2px rgb(0 0 0 / .4),0 20px 50px -20px rgb(0 0 0 / .75)}",
    ":host{all:initial;--g1:#6d8dff;--g2:#b48cff;--g3:#ff9f7a;--g4:#5fd3b5}",
    "*{box-sizing:border-box;font:14px/1.5 \"Google Sans\",\"Product Sans\",system-ui,-apple-system,\"Segoe UI\",sans-serif;-webkit-font-smoothing:antialiased}",
    // The colour sweep when Lens opens, then a soft veil over the page.
    ".wash{position:fixed;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 0%,color-mix(in srgb,var(--g1) 34%,transparent) 30%,color-mix(in srgb,var(--g2) 30%,transparent) 45%,color-mix(in srgb,var(--g3) 26%,transparent) 60%,color-mix(in srgb,var(--g4) 28%,transparent) 75%,transparent 100%);background-size:300% 300%;animation:sweep 1.5s cubic-bezier(.4,0,.2,1) forwards}",
    "@keyframes sweep{0%{background-position:100% 0;opacity:1}75%{opacity:1}100%{background-position:0 100%;opacity:0}}",
    ".veil{position:fixed;inset:0;background:var(--veil);cursor:crosshair;transition:background-color .2s}",
    ".veil[data-clear]{background:transparent}",
    ".pill{position:fixed;z-index:3;top:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:var(--panel);color:var(--ink);border-radius:999px;padding:8px 16px 8px 12px;font-size:13.5px;box-shadow:var(--sh),inset 0 0 0 1px var(--line);pointer-events:none;white-space:nowrap}",
    ".pill svg,.brand svg{width:18px;height:18px;fill:currentColor;flex:none}",
    ".tip{position:fixed;z-index:3;pointer-events:none;background:var(--panel);color:var(--ink);border-radius:999px;padding:6px 12px;font-size:12.5px;box-shadow:var(--sh),inset 0 0 0 1px var(--line)}",
    // The selection: page bright inside, dimmed outside, an animated glowing border in the aura colours.
    ".frame{position:fixed;z-index:2;pointer-events:none;border-radius:14px;box-shadow:0 0 0 9999px var(--veil)}",
    ".frame::before{content:\"\";position:absolute;inset:-3px;border-radius:17px;padding:3px;background:linear-gradient(90deg,var(--g1),var(--g2),var(--g3),var(--g4),var(--g1));background-size:300% 100%;animation:flow 3s linear infinite;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}",
    ".frame::after{content:\"\";position:absolute;inset:-10px;border-radius:24px;background:linear-gradient(90deg,var(--g1),var(--g2),var(--g3),var(--g4),var(--g1));background-size:300% 100%;animation:flow 3s linear infinite;filter:blur(16px);opacity:.45;z-index:-1;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;padding:10px}",
    "@keyframes flow{to{background-position:300% 0}}",
    ".tools{position:fixed;z-index:4;display:flex;gap:6px;background:var(--panel);color:var(--ink);border-radius:999px;padding:5px;box-shadow:var(--sh),inset 0 0 0 1px var(--line)}",
    "button{font:inherit;cursor:pointer;border:0}",
    ".tools button,.chip{background:transparent;color:var(--ink);border-radius:999px;padding:6px 12px;font-weight:500;font-size:13px}",
    ".tools button:hover,.chip:hover{background:var(--panel2)}",
    ".chip{box-shadow:inset 0 0 0 1px var(--line)}",
    ".primary{background:var(--btn);color:var(--btnInk);border-radius:999px;padding:8px 18px;font-weight:500;box-shadow:0 1px 2px rgb(14 15 18 / .2),0 8px 20px -12px rgb(14 15 18 / .45)}",
    ".ghost{background:var(--panel);color:var(--ink);border-radius:999px;padding:8px 18px;font-weight:500;box-shadow:inset 0 0 0 1px var(--line)}",
    // First-run consent, like Google Lens's.
    ".consent{position:fixed;z-index:6;top:50%;left:50%;transform:translate(-50%,-50%);width:min(420px,calc(100vw - 32px));background:var(--bg);color:var(--ink);border-radius:22px;padding:22px;box-shadow:var(--sh),inset 0 0 0 1px var(--line)}",
    ".consent h2{margin:10px 0 8px;font-size:18px;font-weight:500;letter-spacing:-.01em}",
    ".consent p{margin:0 0 10px;color:var(--muted);font-size:13.5px}",
    ".consent .row{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}",
    ".art{height:84px;border-radius:14px;background:linear-gradient(115deg,var(--g1),var(--g2),var(--g3),var(--g4));opacity:.9}",
    // The side panel.
    ".panel{position:fixed;z-index:5;top:0;right:0;bottom:0;width:min(420px,100vw);display:flex;flex-direction:column;background:var(--bg);color:var(--ink);box-shadow:var(--sh),inset 1px 0 0 var(--line);animation:slide .28s cubic-bezier(.2,.8,.2,1)}",
    "@keyframes slide{from{transform:translateX(24px);opacity:0}}",
    ".bar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 16px 10px}",
    ".brand{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:500;letter-spacing:-.01em}",
    ".x{background:transparent;color:var(--muted);font-size:20px;line-height:1;padding:4px 10px;border-radius:999px}.x:hover{background:var(--panel2);color:var(--ink)}",
    ".scroll{flex:1;overflow:auto;padding:0 16px 12px}",
    ".thumb{display:block;max-width:100%;max-height:150px;object-fit:contain;border-radius:14px;margin:2px 0 10px;background:var(--panel2);box-shadow:inset 0 0 0 1px var(--line)}",
    ".chips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 10px}",
    ".status{min-height:1.3em;color:var(--muted);margin:6px 0;font-size:13px}",
    ".status.bad{color:var(--err)}",
    ".skeleton{display:grid;gap:9px;margin:10px 0}.skeleton i{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,var(--panel2),var(--panel),var(--panel2));background-size:200% 100%;animation:shine 1.2s linear infinite}.skeleton i:nth-child(2){width:86%}.skeleton i:nth-child(3){width:64%}",
    "@keyframes shine{to{background-position:-200% 0}}",
    ".turn{background:var(--panel);border-radius:18px;padding:12px 14px;margin:0 0 10px;box-shadow:inset 0 0 0 1px var(--line)}",
    ".q{margin:0 0 8px;color:var(--muted);font-size:12.5px}",
    ".agreement{font-weight:600;margin:0 0 8px}",
    ".answer{overflow-wrap:anywhere}",
    ".answer p,.answer h3{margin:0 0 8px}.answer h3{font-size:13.5px}.answer ul{color:inherit;margin:0 0 8px;padding-left:18px}.answer strong{font-weight:600}",
    ".answer code,.answer pre{font:12px \"IBM Plex Mono\",ui-monospace,Consolas,monospace;background:var(--panel2);border-radius:8px}.answer code{padding:1px 5px}.answer pre{padding:8px 10px;white-space:pre-wrap;margin:0 0 8px}",
    ".differ h4{margin:8px 0 4px;font-size:13px;font-weight:600}.differ ul{margin:0;padding-left:18px;color:var(--muted)}",
    ".meta{color:var(--faint);font-size:12px;margin:6px 0 0}",
    "form{display:flex;gap:8px;padding:12px 16px 16px;border-top:1px solid var(--line)}",
    "input{flex:1;min-width:0;background:var(--panel);color:var(--ink);border:1px solid var(--strong);border-radius:999px;padding:10px 14px;font-size:14px}input::placeholder{color:var(--faint)}input:focus{outline:none;border-color:var(--focus)}",
    ":focus-visible{outline:2px solid var(--focus);outline-offset:2px}",
    "[hidden]{display:none!important}",
    "@media (prefers-reduced-motion:reduce){.wash{display:none}.frame::before,.frame::after,.skeleton i{animation:none}.panel{animation:none}}",
  ].join("");

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  /** The Keplar mark (src/components/brand/geometry.ts) as SVG elements, never as markup. */
  function mark() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 398 398");
    svg.setAttribute("aria-hidden", "true");
    const rect = document.createElementNS(NS, "rect");
    for (const [k, v] of [["x", "0"], ["y", "0"], ["width", "229"], ["height", "229"], ["rx", "70"]]) rect.setAttribute(k, v);
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M204.95 11.95A7 7 0 0 1 209.9 0L362 0A16 16 0 0 1 378 16L378 168.1A7 7 0 0 1 366.05 173.05Z");
    const circle = document.createElementNS(NS, "circle");
    for (const [k, v] of [["cx", "281"], ["cy", "281"], ["r", "117"]]) circle.setAttribute(k, v);
    svg.append(rect, path, circle);
    return svg;
  }
  function button(cls, label) {
    const b = el("button", cls, label);
    b.type = "button";
    return b;
  }

  // ── layers ──────────────────────────────────────────────────────────────────
  const wash = el("div", "wash");
  const veil = el("div", "veil");
  const pill = el("div", "pill");
  pill.append(mark(), el("span", "", "Select any text or image to search with Keplar One"));
  const tip = el("div", "tip", "Drag to search");
  tip.hidden = true;
  const frame = el("div", "frame");
  frame.hidden = true;
  const tools = el("div", "tools");
  tools.hidden = true;
  const copyText = button("", "Copy text");
  const translate = button("", "Translate");
  const copyImage = button("", "Copy as image");
  tools.append(copyText, translate, copyImage);

  const consent = el("div", "consent");
  consent.setAttribute("role", "dialog");
  consent.setAttribute("aria-label", "Search with Keplar One");
  consent.hidden = true;
  const okBtn = button("primary", "Continue");
  const cancelBtn = button("ghost", "Cancel");
  const consentRow = el("div", "row");
  consentRow.append(cancelBtn, okBtn);
  consent.append(
    el("div", "art"),
    el("h2", "", "Search anything on this page with Keplar One"),
    el("p", "", "When you search, the words inside the area you drag and a picture of that area are sent to Keplar with your API key, so several AI models can answer. Only the area you choose, only when you drag it."),
    el("p", "", "Nothing is saved by the extension or by Keplar. Each search uses credits like a question in the app."),
    consentRow,
  );

  const panel = el("div", "panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Keplar One search results");
  panel.hidden = true;
  const bar = el("div", "bar");
  const brand = el("div", "brand");
  brand.append(mark(), el("span", "", "Keplar One"));
  const closeBtn = button("x", "×");
  closeBtn.setAttribute("aria-label", "Close");
  bar.append(brand, closeBtn);
  const scroll = el("div", "scroll");
  const thumb = el("img", "thumb");
  thumb.alt = "The area you selected";
  thumb.hidden = true;
  const chips = el("div", "chips");
  const thread = el("div", "");
  const skeleton = el("div", "skeleton");
  skeleton.append(el("i"), el("i"), el("i"));
  skeleton.hidden = true;
  const status = el("p", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  scroll.append(thumb, chips, thread, skeleton, status);
  const form = el("form", "");
  const input = el("input", "");
  input.type = "text";
  input.placeholder = "Ask a follow-up";
  input.setAttribute("aria-label", "Ask a follow-up");
  const go = el("button", "primary", "Ask");
  go.type = "submit";
  form.append(input, go);
  panel.append(bar, scroll, form);

  shadow.append(style, wash, veil, pill, tip, frame, tools, consent, panel);
  page.append(host);

  // ── state ───────────────────────────────────────────────────────────────────
  let port = null;
  let awaiting = false;
  let done = false;
  let dragging = false;
  let agreed = false;
  let x0 = 0;
  let y0 = 0;
  let region = null;
  let regionText = "";
  let shotUrl = "";
  let sendImage = null;
  let busy = false;
  let history = [];
  let lastAsk = "";

  function say(text, bad) {
    status.textContent = text || "";
    status.classList.toggle("bad", Boolean(bad));
  }
  function placeTip(x, y) {
    tip.hidden = false;
    tip.style.left = `${Math.min(x + 16, window.innerWidth - 140)}px`;
    tip.style.top = `${Math.max(8, y + 18)}px`;
  }
  function showFrame(left, top, width, height) {
    frame.hidden = false;
    frame.style.left = `${left}px`;
    frame.style.top = `${top}px`;
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
  }
  function placeTools(rect) {
    tools.hidden = false;
    const room = window.innerWidth - (panel.hidden ? 0 : panel.getBoundingClientRect().width);
    const below = rect.top + rect.height + 12;
    tools.style.left = `${Math.max(8, Math.min(rect.left, room - 300))}px`;
    tools.style.top = `${below + 44 < window.innerHeight ? below : Math.max(8, rect.top - 52)}px`;
  }

  // ── reading the area (unchanged rules: the words inside the drag, in reading order) ─────────
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
  /** The picture of the area, cropped by the background from the visible tab. The overlay is hidden while it is taken. */
  function takeShot(rect) {
    shotUrl = "";
    sendImage = null;
    thumb.hidden = true;
    thumb.removeAttribute("src");
    return new Promise((resolve) => {
      host.style.setProperty("visibility", "hidden", "important");
      // Two frames so the overlay is really gone from the screen before the tab is captured.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          api.runtime.sendMessage({ type: "keplar-lens-shot", rect, viewport: { w: window.innerWidth, h: window.innerHeight } }, (res) => {
            host.style.removeProperty("visibility");
            if (api.runtime.lastError || !res?.dataUrl) { resolve(); return; }
            shotUrl = res.dataUrl;
            sendImage = res.send && typeof res.send.dataUrl === "string" ? res.send : null;
            thumb.src = shotUrl;
            thumb.hidden = false;
            resolve();
          });
        } catch {
          host.style.removeProperty("visibility");
          resolve();
        }
      }));
    });
  }

  // ── asking ──────────────────────────────────────────────────────────────────
  function wire(p) {
    p.onMessage.addListener((msg) => {
      if (msg?.type === "status") { say(msg.text || ""); return; }
      awaiting = false;
      busy = false;
      go.disabled = false;
      skeleton.hidden = true;
      if (msg?.type === "answer") { say(""); showAnswer(msg.data || {}); }
      else if (msg?.type === "error") say(msg.text || "Something went wrong.", true);
    });
    p.onDisconnect.addListener(() => {
      if (port === p) port = null;
      if (awaiting && !done) {
        awaiting = false;
        busy = false;
        go.disabled = false;
        skeleton.hidden = true;
        say("Keplar hit a problem. Ask again.", true);
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
  function openPanel() {
    if (!panel.hidden) return;
    panel.hidden = false;
    pill.hidden = true;
    if (region) placeTools(region);
  }
  function search(ask) {
    if (!agreed) return;
    const p = ensurePort();
    if (!p) { say("Keplar can't run on this page.", true); return; }
    if (busy) return;
    if (!regionText.trim() && !sendImage && !ask) { say("Drag over part of the page, or type a question.", true); return; }
    busy = true;
    awaiting = true;
    go.disabled = true;
    lastAsk = ask;
    openPanel();
    skeleton.hidden = false;
    say(sendImage ? "Searching the area…" : "Searching…");
    const payload = { type: "ask", lens: true, ask, context: regionText, url: location.href, image: sendImage, history };
    try { p.postMessage(payload); }
    catch {
      port = null;
      const again = ensurePort();
      try { if (!again) throw new Error("no port"); again.postMessage(payload); }
      catch { busy = false; awaiting = false; go.disabled = false; skeleton.hidden = true; say("Keplar can't run on this page.", true); }
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
    const turn = el("div", "turn");
    if (lastAsk) turn.append(el("p", "q", lastAsk));
    if (d.agreement) turn.append(el("p", "agreement", d.agreement));
    const body = el("div", "answer");
    if (Array.isArray(d.blocks)) body.replaceChildren(...renderBlocks(d.blocks));
    else body.textContent = d.answer || "";
    turn.append(body);
    if (d.headline) {
      const differ = el("div", "differ");
      const ul = el("ul", "");
      for (const p of d.positions || []) ul.append(el("li", "", p));
      differ.append(el("h4", "", d.headline), ul);
      turn.append(differ);
    }
    turn.append(el("p", "meta", typeof d.meta === "string" ? d.meta : "Answers can be wrong; agreement isn't proof."));
    thread.append(turn);
    history = [...history, { role: "user", content: lastAsk || "What is in this area?" }, { role: "assistant", content: String(d.answer || "") }].slice(-10);
    turn.scrollIntoView({ block: "start", behavior: "smooth" });
    input.focus();
  }
  function setChips() {
    chips.replaceChildren();
    for (const [label, ask] of [["Explain this", "Explain this simply."], ["Key points", "What are the key points?"], ["Is this accurate?", "Is this accurate? Say what to double-check."]]) {
      const c = button("chip", label);
      c.addEventListener("click", () => search(ask));
      chips.append(c);
    }
  }

  // ── selecting ───────────────────────────────────────────────────────────────
  async function lockRegion(rect) {
    region = rect;
    regionText = wordsInDrag(rect);
    history = [];
    thread.replaceChildren();
    veil.setAttribute("data-clear", "");
    showFrame(rect.left, rect.top, rect.width, rect.height);
    tip.hidden = true;
    say("");
    await takeShot(rect);
    placeTools(rect);
    setChips();
    search("");
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
  function start() {
    agreed = true;
    consent.hidden = true;
    pill.hidden = false;
    veil.hidden = false;
  }

  host.addEventListener("keplar-lens-close", close);
  closeBtn.addEventListener("click", close);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, true);
  veil.addEventListener("contextmenu", (e) => e.preventDefault());
  veil.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  veil.addEventListener("pointermove", (e) => {
    if (!agreed) return;
    if (!dragging) { if (!region) placeTip(e.clientX, e.clientY); return; }
    showFrame(Math.min(x0, e.clientX), Math.min(y0, e.clientY), Math.abs(e.clientX - x0), Math.abs(e.clientY - y0));
  });
  veil.addEventListener("pointerleave", () => { tip.hidden = true; });
  veil.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !agreed || busy) return;
    dragging = true;
    x0 = e.clientX;
    y0 = e.clientY;
    veil.setPointerCapture(e.pointerId);
    veil.setAttribute("data-clear", "");
    tools.hidden = true;
    tip.hidden = true;
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
      // A click (no drag): back to choosing, keeping any answer in the panel.
      frame.hidden = true;
      region = null;
      veil.removeAttribute("data-clear");
      return;
    }
    void lockRegion({ left, top, width, height });
  });
  copyText.addEventListener("click", async () => {
    if (!regionText.trim()) { say("There are no words in this area to copy.", true); return; }
    try { await navigator.clipboard.writeText(regionText); say("Copied the words."); }
    catch { say("Couldn't copy the words.", true); }
  });
  translate.addEventListener("click", () => {
    if (!regionText.trim() && !sendImage) { say("Drag over some words first.", true); return; }
    const code = String(navigator.language || "en").split("-")[0].toLowerCase();
    let name = "English";
    try { name = new Intl.DisplayNames(["en"], { type: "language" }).of(code) || "English"; } catch { /* keep English */ }
    search(code === "en" ? "Translate the words in this area into English. If they are already English, say so and translate them into Spanish instead." : `Translate the words in this area into ${name}.`);
  });
  copyImage.addEventListener("click", async () => {
    if (!shotUrl) { say("No picture of that area yet.", true); return; }
    try {
      // Decoded here, not with fetch(): a page's own CSP can block fetching data: URLs.
      const [head, b64] = shotUrl.split(",", 2);
      const bin = atob(b64 || "");
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: /^data:([^;]+);/.exec(head)?.[1] || "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
      say("Copied the picture.");
    } catch { say("Couldn't copy the picture.", true); }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    search(q);
  });
  okBtn.addEventListener("click", () => {
    try { api.storage.local.set({ lensConsent: 1 }); } catch { /* still agreed for this time */ }
    start();
  });
  cancelBtn.addEventListener("click", close);

  // ── open ────────────────────────────────────────────────────────────────────
  ensurePort();
  pill.hidden = true;
  const ask = () => { consent.hidden = false; okBtn.focus(); };
  try {
    api.storage.local.get("lensConsent", (got) => {
      if (api.runtime.lastError) { ask(); return; }
      if (got?.lensConsent === 1) start();
      else ask();
    });
  } catch { ask(); }
})();
