/**
 * Whop Pixel (ad measurement). Docs: https://docs.whop.com/developer/ads/pixel
 *
 * WHOP_PIXEL_SCRIPT is Whop's install snippet, verbatim (only the account id filled in). Do not reformat or edit it:
 * tests/whop-pixel.test.ts pins it character for character. It is not run as a plain head script: WHOP_PIXEL_LOADER_SCRIPT (below) wraps it
 * and runs it after window load + idle, or at the first user interaction. That loader is rendered as an inline <script> in the root layout
 * <head> (src/components/analytics/WhopPixel.tsx), so the CSP needs `script-src 'unsafe-inline'` (already set, see security/headers.ts) and
 * https://t.whop.tw in script-src (the pixel's /s.js and chunks) and connect-src (its beacons).
 *
 * The pixel's own script also reads email / phone / name fields on `change` events and sends them as visitor traits, so it must never
 * run on a page with such a form or on a signed-in page. whopPixelAllowed() is the one list of where it does not load.
 */
export const WHOP_PIXEL_ORIGIN = "https://t.whop.tw";

export const WHOP_PIXEL_SCRIPT = `!function(w,d,s,u,n,a,b){if(w[n])return;a=w[n]={q:[],t:+new Date,s:[],o:u,track:function(){a.q.push([+new Date].concat([].slice.call(arguments)))},setScope:function(){a.s=[].slice.call(arguments).filter(function(x){return typeof x==="string"});a.q.push([+new Date,"setScope"].concat(a.s))},scope:function(){var c=[].slice.call(arguments);return{track:function(){a.q.push([+new Date].concat([].slice.call(arguments)).concat([{__scope:c}]))}}}};b=d.createElement(s);b.async=1;b.src=u+"/s.js";d.getElementsByTagName(s)[0].parentNode.insertBefore(b,d.getElementsByTagName(s)[0])}(window,document,"script","https://t.whop.tw","whop");whop.setScope("biz_z2gxvcmr06XrpI");whop.track("page");`;

/**
 * Why deferred: the pixel's fingerprint.js is a ~1.3 s main-thread task on a throttled phone (Lighthouse TBT 1.2-1.4 s on / and /pricing,
 * mobile score 95-98 -> 70-72). Running it after load + idle keeps it off the critical path. It still runs on the first pointerdown /
 * keydown / scroll / touchstart (whichever comes first, even before load), and at the latest ~3 s after load, so a visitor who interacts
 * and leaves is still counted. The snippet is pasted untouched into go(); go() runs once, so whop.track("page") fires once per page load.
 */
export const WHOP_PIXEL_LOADER_SCRIPT = `(function(){var done=0,t,ev=["pointerdown","keydown","scroll","touchstart"];function go(){if(done)return;done=1;clearTimeout(t);for(var i=0;i<ev.length;i++)removeEventListener(ev[i],go,true);${WHOP_PIXEL_SCRIPT}}function later(){if(done)return;t=setTimeout(go,3500);if(window.requestIdleCallback)requestIdleCallback(go,{timeout:3000})}for(var i=0;i<ev.length;i++)addEventListener(ev[i],go,{capture:true,passive:true});if(document.readyState==="complete")later();else addEventListener("load",later)})();`;

/**
 * Read by the pixel when it starts (`{ ...window.__whopApp, ...whop.c }`), so it must run before the snippet. `forms: false` turns off the
 * pixel's automatic capture of email, phone and name values typed into any form field; `links`/`iframes` turn off identity hand-off to
 * whop.com links and frames. Page views (path, referrer, browser details) still go out. Defence in depth on top of whopPixelAllowed().
 */
export const WHOP_PIXEL_OPTIONS_SCRIPT = "window.__whopApp={forms:false,links:false,iframes:false};";

/** Path prefixes where the pixel never loads: signed-in app, admin, account, checkout, onboarding, every auth or contact form, and shared or user-site routes. */
const EXCLUDED = [
  "/app", "/admin", "/account", "/checkout", "/welcome",
  "/signin", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/two-factor", "/secure-account",
  "/contact", "/feedback", "/inquire",
  "/embed", // the Ask widget framed on other sites: no ad pixel there
  "/r", "/s", "/sites", "/i", "/api", "/dev",
];

/** True when the pixel may load on this path (public marketing and content pages). Unknown path: allowed only if it is not under an excluded prefix. */
export function whopPixelAllowed(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "/").split(/[?#]/)[0].toLowerCase();
  return !EXCLUDED.some((x) => p === x || p.startsWith(`${x}/`));
}
