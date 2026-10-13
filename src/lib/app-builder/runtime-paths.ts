/** Public paths of the Keplar Apps browser runtime (built by scripts/build-kapp.mjs into public/fx; /fx/*.js is also served on custom domains). */
// 2: list/get take `expand` (2026-10). The /fx/*.1.js files stay for anything cached against them.
export const KAPP_VERSION = "2";
export const KAPP_SDK_PATH = `/fx/kapp.${KAPP_VERSION}.js`;
export const KAPP_UI_PATH = `/fx/kapp-ui.${KAPP_VERSION}.js`;
export const KAPP_THREE_PATH = `/fx/kapp-three.${KAPP_VERSION}.js`;
/** Draft previews only: reports the app's runtime errors to the builder hosting the preview (public/fx/kapp-report.1.js). */
export const KAPP_REPORT_PATH = "/fx/kapp-report.1.js";
