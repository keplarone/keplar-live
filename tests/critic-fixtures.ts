/** Fixtures for tests/critic-rules.test.ts: a deliberately flawed creation. */
export const PAGE = `<!doctype html>
<html>
<head>
  <title>Document</title>
  <script src="vendor.js"></script>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces">
</head>
<body>
  <div id="app">
    <h1>Unlock the power of bread</h1>
    <h3>Skipped a level</h3>
    <img src="hero-sourdough.jpg">
    <button class="icon-close"><svg viewBox="0 0 10 10"></svg></button>
    <input name="email" placeholder="Your email">
    <a href="#">Learn more</a>
    <a href="pricing.html">Pricing</a>
    <div onclick="go()">Go</div>
    <span tabindex="3">x</span>
  </div>
</body>
</html>`;

export const CSS = `:root { --bg: #ffffff; --ink: #1a1a1a; --muted: #b0b0b0; --accent: #7c3aed; }
.hero h1 { background: linear-gradient(90deg, #7c3aed, #2563eb); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
.card { padding: 13px 22px; box-shadow: 0 0 40px rgba(124, 58, 237, 0.6); }
.note { color: #aaaaaa; background: #ffffff; font-size: 10px; }
.fade { animation: fade 1s ease; }
button:focus { outline: none; }
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
`;

export const JS = `import { html } from "./lib/ui.js";
export function List({ items }) {
  if (items.length == 0) console.log("empty");
  var total = 0;
  try { total = items.length; } catch (e) {}
  return html\`<ul>\${items.map((p) => html\`<li><img src=\${p.photo} /><button onClick=\${() => go(p)}></button></li>\`)}</ul>\`;
}
`;

