"use client";

import { useEffect } from "react";

/**
 * Site-wide custom menus for native <select> (keplar.one, Keplar Business, every form). The <select> stays in place as the trigger,
 * so labels, form posts, validation, focus order and React's onChange all keep working; only the browser's own popup is replaced by a
 * themed listbox. One set of document listeners covers every select, including ones rendered later.
 *
 * Opens on click, tap, Enter, Space, Alt+Down, F4 and the arrow keys. In the menu: arrows, Home/End, Page Up/Down, type-ahead, Enter or
 * Space to choose, Escape to close, Tab to choose nothing and move on. The current value carries a checkmark (HIG menus.md › checkmark).
 * Opt out with data-native on the select or an ancestor. Multi-selects and list boxes (multiple, size > 1) keep the native control.
 */

type Item = { kind: "option"; el: HTMLOptionElement; label: string; disabled: boolean } | { kind: "group"; label: string };

const OPEN_KEYS = new Set(["Enter", " ", "ArrowDown", "ArrowUp", "F4"]);
let uid = 0;

function eligible(t: EventTarget | null): HTMLSelectElement | null {
  if (!(t instanceof HTMLSelectElement)) return null;
  if (t.multiple || t.size > 1 || t.disabled || t.closest("[data-native]")) return null;
  return t;
}

function itemsOf(sel: HTMLSelectElement): Item[] {
  const out: Item[] = [];
  for (const child of Array.from(sel.children)) {
    if (child instanceof HTMLOptGroupElement) {
      out.push({ kind: "group", label: child.label });
      for (const o of Array.from(child.children)) {
        if (o instanceof HTMLOptionElement && !o.hidden) out.push({ kind: "option", el: o, label: o.label || o.text, disabled: o.disabled || child.disabled });
      }
    } else if (child instanceof HTMLOptionElement && !child.hidden) {
      out.push({ kind: "option", el: child, label: child.label || child.text, disabled: child.disabled });
    }
  }
  return out;
}

/** The menu lives outside the select's subtree, so it borrows the theme of wherever the select sits (Keplar One, Business, a dialog). */
function themeFrom(sel: HTMLSelectElement, menu: HTMLElement) {
  const cs = getComputedStyle(sel);
  const first = (...names: string[]) => {
    for (const n of names) {
      const v = cs.getPropertyValue(n).trim();
      if (v) return v;
    }
    return "";
  };
  const set = (k: string, v: string) => (v ? menu.style.setProperty(k, v) : menu.style.removeProperty(k));
  set("--ks-bg", first("--g-container-high", "--kb-surface-2", "--c-surface-2"));
  set("--ks-ink", first("--c-ink", "--kb-ink"));
  set("--ks-ink-3", first("--c-ink-3", "--kb-ink-3"));
  set("--ks-hover", first("--hover-wash"));
  // The 1px graphite edge lives in select-menu.css. Do not copy --g-menu-shadow onto the menu:
  // on keplar.one that token is `none`, and `box-shadow: none, 0 0 0 1px …` is invalid, so the browser drops it.
  menu.style.fontFamily = cs.fontFamily;
  const size = parseFloat(cs.fontSize);
  menu.style.fontSize = `${Math.min(16, Math.max(13, Number.isFinite(size) ? size : 14))}px`;
  menu.dataset.scheme = cs.colorScheme.includes("light") && !cs.colorScheme.includes("dark") ? "light" : document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setValue(sel: HTMLSelectElement, value: string) {
  if (sel.value === value) return;
  // The prototype setter goes around React's value tracker, so a controlled select still sees the change event as a real change.
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(sel, value);
  sel.dispatchEvent(new Event("input", { bubbles: true }));
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}

export function SelectMenus() {
  useEffect(() => {
    let open: { sel: HTMLSelectElement; menu: HTMLDivElement; opts: HTMLElement[]; active: number; cleanup: () => void } | null = null;
    let typed = "";
    let typedAt = 0;
    let suppressClick: HTMLSelectElement | null = null;
    let touchFrom: { x: number; y: number } | null = null;

    const close = (refocus: boolean) => {
      if (!open) return;
      const { sel, menu, cleanup } = open;
      open = null;
      cleanup();
      try { menu.hidePopover?.(); } catch { /* not shown as a popover */ }
      menu.remove();
      sel.removeAttribute("aria-expanded");
      if (refocus && sel.isConnected) sel.focus({ preventScroll: true });
    };

    const move = (to: number) => {
      if (!open) return;
      const { opts, menu } = open;
      if (!opts.length) return;
      const i = Math.max(0, Math.min(opts.length - 1, to));
      opts[open.active]?.removeAttribute("data-active");
      open.active = i;
      const el = opts[i];
      el.setAttribute("data-active", "");
      menu.setAttribute("aria-activedescendant", el.id);
      el.scrollIntoView({ block: "nearest" });
    };

    const step = (from: number, dir: 1 | -1) => {
      if (!open) return from;
      const { opts } = open;
      for (let i = from + dir; i >= 0 && i < opts.length; i += dir) if (opts[i].getAttribute("aria-disabled") !== "true") return i;
      return from;
    };

    const choose = (i: number) => {
      if (!open) return;
      const opt = open.opts[i];
      if (!opt || opt.getAttribute("aria-disabled") === "true") return;
      const sel = open.sel;
      const value = opt.dataset.value ?? "";
      close(true);
      setValue(sel, value);
    };

    const place = (sel: HTMLSelectElement, menu: HTMLDivElement) => {
      const r = sel.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const gap = 6;
      const edge = 8;
      menu.style.minWidth = `${Math.round(r.width)}px`;
      menu.style.maxWidth = `${Math.max(160, vw - edge * 2)}px`;
      const below = vh - r.bottom - gap - edge;
      const above = r.top - gap - edge;
      const natural = menu.scrollHeight;
      const up = natural > below && above > below;
      menu.style.maxHeight = `${Math.max(120, Math.min(360, up ? above : below))}px`;
      const h = Math.min(natural, parseFloat(menu.style.maxHeight));
      const w = menu.offsetWidth;
      const rtl = getComputedStyle(sel).direction === "rtl";
      let left = rtl ? r.right - w : r.left;
      left = Math.max(edge, Math.min(left, vw - w - edge));
      menu.style.left = `${Math.round(left)}px`;
      menu.style.top = `${Math.round(up ? r.top - gap - h : r.bottom + gap)}px`;
      menu.dataset.side = up ? "top" : "bottom";
    };

    const show = (sel: HTMLSelectElement) => {
      close(false);
      const items = itemsOf(sel);
      if (!items.some((x) => x.kind === "option")) return;
      const id = `ks-menu-${++uid}`;
      const menu = document.createElement("div");
      menu.className = "ks-menu";
      menu.id = id;
      menu.setAttribute("role", "listbox");
      menu.tabIndex = -1;
      const name = sel.getAttribute("aria-label") || (sel.labels?.[0]?.textContent ?? "").trim();
      if (sel.getAttribute("aria-labelledby")) menu.setAttribute("aria-labelledby", sel.getAttribute("aria-labelledby")!);
      else if (name) menu.setAttribute("aria-label", name);
      const supportsPopover = typeof menu.showPopover === "function";
      if (supportsPopover) menu.setAttribute("popover", "manual");

      const opts: HTMLElement[] = [];
      let active = -1;
      let group: HTMLElement = menu;
      items.forEach((it) => {
        if (it.kind === "group") {
          group = document.createElement("div");
          group.setAttribute("role", "group");
          const head = document.createElement("div");
          head.className = "ks-group";
          head.id = `${id}-g${opts.length}`;
          head.textContent = it.label;
          group.setAttribute("aria-labelledby", head.id);
          group.append(head);
          menu.append(group);
          return;
        }
        const o = document.createElement("div");
        o.className = "ks-option";
        o.id = `${id}-${opts.length}`;
        o.setAttribute("role", "option");
        o.dataset.value = it.el.value;
        const selected = it.el.selected;
        o.setAttribute("aria-selected", String(selected));
        if (it.disabled) o.setAttribute("aria-disabled", "true");
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("viewBox", "0 0 16 16");
        check.setAttribute("aria-hidden", "true");
        check.classList.add("ks-check");
        check.innerHTML = '<path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>';
        const text = document.createElement("span");
        text.className = "ks-label";
        text.textContent = it.label || " ";
        o.append(check, text);
        if (selected) active = opts.length;
        opts.push(o);
        group.append(o);
      });

      // A modal dialog makes everything outside it inert, so a menu opened from inside one has to live inside it too.
      const host = sel.closest("dialog[open]") ?? document.body;
      themeFrom(sel, menu);
      host.append(menu);
      if (supportsPopover) {
        try { menu.showPopover(); } catch { /* fall back to plain fixed positioning */ }
      }
      place(sel, menu);
      sel.setAttribute("aria-expanded", "true");

      const onMenuPointer = (e: PointerEvent) => {
        const o = (e.target as Element).closest<HTMLElement>(".ks-option");
        if (o && open) move(open.opts.indexOf(o));
      };
      const onMenuClick = (e: MouseEvent) => {
        const o = (e.target as Element).closest<HTMLElement>(".ks-option");
        if (o && open) choose(open.opts.indexOf(o));
      };
      const onMenuKey = (e: KeyboardEvent) => {
        if (!open) return;
        const page = Math.max(1, Math.floor(menu.clientHeight / 36) - 1);
        const k = e.key;
        if (k === "ArrowDown") move(step(open.active, 1));
        else if (k === "ArrowUp") { if (e.altKey) { choose(open.active); } else move(step(open.active, -1)); }
        else if (k === "Home") move(step(-1, 1));
        else if (k === "End") move(step(open.opts.length, -1));
        else if (k === "PageDown") move(Math.min(open.opts.length - 1, open.active + page));
        else if (k === "PageUp") move(Math.max(0, open.active - page));
        else if (k === "Enter" || (k === " " && !typed)) choose(open.active);
        else if (k === "Escape") { e.stopPropagation(); close(true); }
        else if (k === "Tab") { close(true); return; } // focus is back on the select, so Tab carries on from there
        else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          typed = now - typedAt > 700 ? k.toLowerCase() : typed + k.toLowerCase();
          typedAt = now;
          const labels = open.opts.map((x) => (x.textContent ?? "").trim().toLowerCase());
          const start = typed.length === 1 ? open.active + 1 : open.active;
          for (let n = 0; n < labels.length; n++) {
            const i = (start + n) % labels.length;
            if (labels[i].startsWith(typed) && open.opts[i].getAttribute("aria-disabled") !== "true") { move(i); break; }
          }
        } else return;
        e.preventDefault();
      };
      const onOutside = (e: Event) => {
        const t = e.target as Node;
        if (!menu.contains(t) && t !== sel) close(false);
      };
      const onScroll = (e: Event) => { if (!menu.contains(e.target as Node)) close(false); };
      const onResize = () => close(false);
      const onBlur = () => close(false);
      const watch = new MutationObserver(() => { if (!sel.isConnected) close(false); });
      watch.observe(document.body, { childList: true, subtree: true });

      menu.addEventListener("pointermove", onMenuPointer);
      menu.addEventListener("click", onMenuClick);
      menu.addEventListener("keydown", onMenuKey);
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      window.addEventListener("blur", onBlur);

      open = {
        sel, menu, opts, active: -1,
        cleanup: () => {
          watch.disconnect();
          document.removeEventListener("pointerdown", onOutside, true);
          document.removeEventListener("scroll", onScroll, true);
          window.removeEventListener("resize", onResize);
          window.removeEventListener("blur", onBlur);
        },
      };
      typed = "";
      move(active >= 0 ? active : step(-1, 1));
      menu.focus({ preventScroll: true });
    };

    const toggle = (sel: HTMLSelectElement) => {
      if (open?.sel === sel) close(true);
      else show(sel);
    };

    // Mouse and pen: stop the native popup on press, open ours. Touch: let the tap through, stop its native picker on touchend.
    const onPointerDown = (e: PointerEvent) => {
      const sel = eligible(e.target);
      if (!sel || e.button !== 0 || e.pointerType === "touch") return;
      e.preventDefault();
      sel.focus({ preventScroll: true });
      suppressClick = sel;
      toggle(sel);
    };
    const onTouchStart = (e: TouchEvent) => {
      const p = e.touches[0];
      touchFrom = p ? { x: p.clientX, y: p.clientY } : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const sel = eligible(e.target);
      const p = e.changedTouches[0];
      // A finger that moved was scrolling past the select, not tapping it.
      if (!sel || !p || !touchFrom || Math.hypot(p.clientX - touchFrom.x, p.clientY - touchFrom.y) > 10) return;
      e.preventDefault();
      sel.focus({ preventScroll: true });
      toggle(sel);
    };
    const onClick = (e: MouseEvent) => {
      const sel = eligible(e.target);
      if (!sel) return;
      if (suppressClick === sel) { suppressClick = null; return; }
      // Keyboard-synthesised or assistive-tech clicks with no press before them.
      e.preventDefault();
      if (open?.sel !== sel) show(sel);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const sel = eligible(e.target);
      if (!sel || e.ctrlKey || e.metaKey) return;
      if (OPEN_KEYS.has(e.key) || (e.altKey && e.key === "ArrowDown")) {
        e.preventDefault();
        show(sel);
      }
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      close(false);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
  return null;
}
