/**
 * The contract between generated code and the Keplar app runtime. This text is given to every code-writing model call and
 * must match sdk/kapp.src.js and app-runtime/router.ts exactly: a mismatch here is a broken app.
 */

export const SDK_DOC = `KEPLAR APP RUNTIME (already loaded before your code; never import or re-implement it)
Your files run in a sandboxed page: plain ES modules, no build step, no npm, no CDN, no external network. Relative imports only, always with the .js extension (import { Avatar } from "../lib/ui.js").

UI LIBRARY: window.kui = Preact + hooks + htm (loaded when the spec "uses" contains "ui").
  const { html, render, useState, useEffect, useMemo, useCallback, useRef, useReducer, useContext, createContext, Fragment } = window.kui;
  Components are functions returning html\`...\` tagged templates: html\`<button class="k-btn" onClick=\${() => go()}>Save</button>\`.
  htm rules: attributes are class (not className), onClick/onInput/onSubmit, value=\${x}; components as <\${Card} title=\${t} />; close every tag (<img ... />, <input ... />); lists: \${items.map(i => html\`<li key=\${i.id}>\${i.title}</li>\`)}; inline style objects style=\${{ width: w + "px" }} or strings; boolean attrs disabled=\${busy}. Never JSX, never React imports.
  window.THREE = three.js (only when "uses" contains "three").

keplar.ready -> Promise that resolves once the session is restored. Call render after: keplar.ready.then(() => render(html\`<\${App} />\`, document.getElementById("app"))).

ROUTER (hash based, links are href="#/path"):
  keplar.router.current() -> { path, query }        keplar.router.go("/post/abc")       keplar.router.back()
  keplar.router.match("/post/:id", path) -> { id } | null
  keplar.router.resolve(["/", "/post/:id"], path) -> { pattern, params } | null
  keplar.router.on(fn) -> unsubscribe; fn({ path, query }) runs now and on every change.

AUTH (only when the spec has auth.enabled):
  keplar.auth.user() -> { id, name, email, role, profile: { avatar?, bio?, ...profileFields }, verified } | null   (sync)
  keplar.auth.isAdmin() -> boolean          keplar.auth.onChange(fn) -> unsubscribe; fn(user|null)
  await keplar.auth.signUp({ email, password, name, profile? })   (password >= 8 chars)
  await keplar.auth.signIn({ email, password })                   await keplar.auth.signOut()
  await keplar.auth.sendMagicLink(email)  (only if "magic" is in auth.methods; emails a sign-in link)
  await keplar.auth.require({ title?, mode?: "signin"|"signup" }) -> user | null   (opens the built-in sign-in dialog if signed out; null if dismissed)
  await keplar.auth.ui({ mode }) -> user | null      (always opens the dialog)
  await keplar.auth.updateProfile({ name?, profile? }) -> user
  await keplar.auth.getUser(id) -> { id, name, role, profile, createdAt } | null       (public profile of any end user)
  await keplar.auth.listUsers({ q?, limit?, ids? }) -> [publicUser]
  The app's owner signs in with the admin role (role === "admin"). Admin-only screens check keplar.auth.isAdmin().

DATA (only the collections in the spec; names exactly as in the spec):
  const posts = keplar.db.collection('posts');
  await posts.list({ where?, order?, limit?, cursor?, mine? }) -> { items, next }    (next = cursor string for the next page or null)
  await posts.all(query) -> items             await posts.get(id) -> item | null
  await posts.create(data) -> item            await posts.update(id, patch) -> item          await posts.remove(id)
  await posts.toggle(match) -> { on, item }   e.g. likes.toggle({ post: id }) creates/deletes the signed-in user's like (needs unique ["post","_owner"])
  await posts.count({ where? }) -> number     await likes.counts("post", [id1, id2]) -> { id1: 3, id2: 0 }   (counts grouped by a field)
  const stop = posts.watch(query, (items) => setItems(items))   live updates (polling); call stop() on unmount. Use for feeds, chat, boards.
  Item shape: { id, ...fields, _owner (creator's user id; "seed_<name>" for example content), _ownerName, _ownerAvatar, createdAt, updatedAt (ISO strings) }.
  where: equality { status: "open", _owner: userId }, or operators { price: { lte: 50 } }, { tags: { has: "film" } }, { title: { contains: "rain" } }, { id: { in: [a, b] } }, { status: { ne: "done" } }; up to 8 keys.
  order: "-createdAt" (default, newest first), "createdAt", "-likes", "title". limit: default 30, max 100.
  mine: true -> only the signed-in user's records.
  Fields of type ref store the other record's id (or a user id for ref "users"). To show the linked record, ask the server to fill it in:
    await posts.list({ expand: ["author", "team"] })  or  await posts.get(id, { expand: ["author"] })  (up to 3 ref fields)
    -> each item gets item._expand.author = the linked record (a public user for ref "users"), or null if it is gone or not visible to this user. item.author keeps the id.
  Prefer expand over fetching ids yourself.
  Access rules from the spec are enforced by the server; calls the user may not make throw a KeplarError with status 401/403. Catch errors and show them (err.message is human-readable).
  Records whose _owner starts with "seed" are example content created at build time; their authors have read-only public profiles (keplar.auth.getUser works), so link author names to profiles as usual.

FILES (uploads; images are shown with <img src=\${file.url} />):
  const file = await keplar.files.upload(fileFromInput) -> { id, url, name, type, size }   (images, PDF, text; up to 8 MB; signed-in users)
  Store file.url in an image/file field. keplar.files.url(id) -> url.

AI (only the actions in the spec; the system prompt lives on the server, you send only the input fields):
  await keplar.ai.run("actionName", { field: value, ... }, { history? }) -> string (output "text") or object (output "json")
  await keplar.ai.stream("actionName", input, (textSoFar, delta) => setText(textSoFar), { history? }) -> final string
  history: [{ role: "user"|"assistant", content }] for chat-style actions (last 12 kept). Errors: KeplarError with status 429 (limit) / 402 (owner out of credits): show a friendly message.
  Render AI text safely (as text, or split into paragraphs yourself). Never put AI text in innerHTML.

OTHER:
  keplar.local.get(key, default) / keplar.local.set(key, value) / keplar.local.remove(key)   per-visitor storage (JSON), e.g. game saves, drafts, preferences. localStorage also works.
  keplar.toast("Saved")      short confirmation at the bottom of the screen.
  Generated images: the string "keplar-image:<slot>" anywhere in your HTML, CSS or JS becomes the real image URL (e.g. <img src="keplar-image:hero" alt="..."/>, background-image: url(keplar-image:hero)). keplar.image(slot) -> url | null at runtime. Only slots listed in the spec exist.
  keplar.app -> { id, name, env }  (env "draft" in the builder preview, "live" when published).

DESIGN SYSTEM (kapp.css is always loaded; build on it, never replace it):
  Tokens: --bg --surface --surface-2 --ink --muted --line --accent --accent-2 --on-accent --accent-text; fonts --f-display --f-body --f-mono;
  radius --r-sm --r-md --r-lg --r-pill; spacing scale --s-1 .. --s-9 (density-aware); --ease, --dur (0 when motion is off); --shadow.
  Ready-made classes (use them and extend them in styles.css): .k-btn (primary, filled accent) .k-btn.k-ghost .k-btn.k-quiet .k-btn.k-danger .k-btn.k-sm;
  .k-input .k-textarea .k-select (form controls) .k-label (field label) .k-field (label + control + hint stack) .k-card .k-chip .k-badge .k-avatar
  .k-skeleton (loading shimmer) .k-empty (empty state block) .k-spinner .k-wrap (page width container) .k-stack .k-row .k-grid .k-display (display type) .k-eyebrow .k-mono .k-muted .k-sr (visually hidden).
  Your styles.css defines this product's own layout and components with the tokens; never hard-code colors or font names that bypass the tokens.`;

/** Rules for how generated JS apps are organised (paired with SDK_DOC). */
export const CODE_RULES = `PROJECT CONVENTIONS
- index.html is generated by Keplar: it has <div id="app"></div> and loads app.js as a module. Do not write index.html unless it is in your file list.
- app.js is the entry: it imports every page module, defines the route table, the app frame (header/nav/footer or sidebar, mobile nav), auth state (keplar.auth.onChange), and renders after keplar.ready. It must handle unknown routes with a designed not-found screen and pass { params, query, user } to pages.
- Each pages/*.js file default-exports one component: export default function FeedPage({ params, query, user }) { ... }.
- Shared code lives in lib/*.js with named exports exactly as listed in the file plan. Import only names that exist.
- Pages that need sign-in call keplar.auth.require() from an effect or show a sign-in prompt; admin pages check keplar.auth.isAdmin() and show a designed "admins only" state otherwise.
- Every data call is wrapped in try/catch with a visible error state and a loading state; lists render .k-skeleton while loading and a designed .k-empty when empty.
- Optimistic UI for toggles (likes/follows/saves): update local state first, roll back on error.
- No service workers, PWA manifests, IndexedDB, cookies or window.open popups: the app runs in a sandboxed opaque origin. Use keplar.local for saves.
- No placeholder or TODO code, no "coming soon", no fake data arrays standing in for the backend. Example content comes from the seeded records.
- Keep modules self-contained and complete. Write real, working, production-quality code.`;
