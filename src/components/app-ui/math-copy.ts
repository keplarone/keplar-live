/**
 * Copying a selection that includes rendered math puts the LaTeX source on the clipboard (\( … \) inline, $$ … $$
 * display), like KaTeX's copy-tex, but keeps paragraph breaks. Installed once, only after math has been rendered.
 */
let installed = false;

export function installMathCopy() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("copy", (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return;
    const frag = sel.getRangeAt(0).cloneContents();
    if (!frag.querySelector(".katex")) return;
    const texOf = (el: Element) => el.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? "";
    for (const d of Array.from(frag.querySelectorAll(".katex-display"))) d.replaceWith(document.createTextNode(`$$${texOf(d)}$$`));
    for (const k of Array.from(frag.querySelectorAll(".katex"))) k.replaceWith(document.createTextNode(`\\(${texOf(k)}\\)`));
    // innerText of an attached, off-screen copy keeps block breaks; textContent would run paragraphs together
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-9999px;top:0;white-space:pre-wrap;width:600px";
    holder.appendChild(frag);
    document.body.appendChild(holder);
    const text = holder.innerText;
    holder.remove();
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
  });
}
