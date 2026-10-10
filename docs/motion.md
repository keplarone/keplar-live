# Motion system

Quiet, fast, professional. Everything that appears or leaves moves a little; nothing bounces for show. Only transform-type
properties (`scale`, `translate`, `transform`) and `opacity` animate, plus color on hover and one accordion height on toggle.

## Where it lives

| Piece | File |
| --- | --- |
| Tokens, keyframes, overlay states, page transitions, loading, micro-interactions | `src/styles/motion.css` (imported by `globals.css`) |
| Presence rules (open / closing / closed, fallback timeout) | `src/lib/ui/presence.ts` |
| React hooks: `usePresence`, `useExit`, `<Presence>` | `src/components/motion/usePresence.ts` |
| Route transitions (React `<ViewTransition>`) | `src/components/motion/RouteTransition.tsx`, used by `template.tsx` in `(marketing)`, `(marketing)/docs`, `app` |
| /app tab switches (one mounted shell, pushState) | `src/lib/ui/view-transition.ts` (`withViewTransition`), called by the sidebar |
| Skeleton, Thinking, RouteLoading | `src/components/motion/Loading.tsx` (KLoader stays the one spinner) |
| Sliding tab indicator | `src/components/motion/useTabIndicator.ts` + `.m-tab-indicator` |
| Tests | `tests/motion.test.ts` |

## Tokens

`--m-dur-1` 120ms (exits, presses, hover color), `--m-dur-2` 180ms (menus, popovers, toasts), `--m-dur-3` 240ms (dialogs,
sheets, pages). `--m-ease-out` for enter, `--m-ease-in` for exit, `--m-ease-spring` (one soft overshoot) for toggles and tab
indicators. `--m-dist-1/2/3` 2/4/8px, `--m-scale-in` 0.96, `--m-press` 0.98, `--m-loading-delay` 150ms.
Under `prefers-reduced-motion: reduce` distances go to 0, scale and press to 1, exits are instant (the hook does not wait) and
enters are a short opacity fade; page transitions are instant.

## Overlays

```tsx
// The component owns `open`:
const menu = usePresence(open);
{menu.mounted ? <div role="menu" {...menu.motion("pop")} style={{ "--m-origin": "50% 100%" }}>…</div> : null}

// The parent unmounts the component ({open ? <Dialog onClose={…} /> : null}): close() plays the exit, then calls onClose.
const exit = useExit(onClose);
<div className={s.scrim} onMouseDown={exit.close} {...exit.motion("fade")}>
  <div role="dialog" aria-modal="true" {...exit.motion("pop", false)}>…</div>
</div>

// A value that disappears (a toast): the last value stays on screen while it animates out.
<Presence value={toast}>{(t, p) => <Toast key={t.id} {...p.motion("toast")} />}</Presence>
```

Variants: `pop` (scale 0.96 + fade from `--m-origin`), `fade` (scrims), `toast` (rise), `drop` (from the top), `tip`,
`sheet`, `drawer-left`, `drawer-right`. The element unmounts on its own `animationend` (children's bubbling events are ignored)
or after a 260ms fallback, so nothing gets stuck open. A closing element ignores pointer events.

Inherited without code: every `[role="menu"]`, `[role="dialog"]`, `[role="alertdialog"]`, `[role="tooltip"]` and open
`[popover]` that has not opted in gets the enter pop; native `<dialog>` (and `::backdrop`) animates both ways in CSS
(`@starting-style` + `allow-discrete`); `<details>` accordions animate their height; `[role="switch"]` knobs ease with the spring;
buttons dip to 0.98 while pressed and dim with `aria-busy` / `data-pending`; links and buttons ease their color on hover.

## Pages

Next.js route navigations are React transitions, so `<ViewTransition enter="kp-route-in" exit="kp-route-out" default="none">`
in each `template.tsx` fades the old page out (120ms) and the new one in with a 4px rise (240ms). Full page loads use
`@view-transition { navigation: auto }`. The marketing nav is an anchor (`.m-vt-nav`) and never moves. The /app tabs switch views
inside one shell with pushState, so the sidebar wraps the switch in `withViewTransition` and the sidebar itself stays still.
Browsers without the API swap instantly.

Loading: `(marketing)/docs/loading.tsx` and `app/loading.tsx` stay invisible for 150ms, then fade in (`.m-delayed`). There is no
`(marketing)/loading.tsx` on purpose: RevealRoot marks reveal blocks before a suspended page hydrates, which is a hydration mismatch.

## Adopted across the app shell, composer and Create

- `KeplarApp.tsx`: the chat log is `data-motion="stream"`; `goView` and back/forward go through `switchView`, which runs the
  switch in `withViewTransition` (the latest request wins over one still pending). Cmd+K search, the undo toast and the drawer
  scrim use `usePresence` / `<Presence>`; the shell carries `data-own-search` so the site palette does not open over it.
- `SearchDialog` takes the shell's presence (`useExit(onClose, { parent })`): Escape, the scrim and a Cmd+K toggle all animate out.
- `Composer.tsx`: attach, Modes and the routing panel use `usePresence` + `motion("pop")`; `usePopupOrigin` grows each one out
  of its button (one layout read per open). Nothing is keyed on the text, so typing stays instant.
- Create: `InviteDialog` and `PublishGate` use `useExit`; the live-session toast uses `usePresence` with the live region kept in
  the DOM; the Create kind tabs and the Live / Critic / Deploy tabs use `useTabIndicator` (`--ti-inset`, `--ti-bottom`,
  `--ti-color` match the old underline). Unused gradient shimmer keyframes are gone; the dictation "Finishing…" state pulses.
- Not yet: `AppBuilder.tsx` "App views" tabs (the file had someone else's uncommitted edits) and `SlashCommandMenu` (enter only).
