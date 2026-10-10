/**
 * Desktop app detection, before first paint (no layout shift): the Keplar desktop app (v0.1.3+) puts the token `keplar-desktop` in the user agent and sets html.keplar-desktop / [data-keplar-desktop]; plain Electron and
 * and any window-controls-overlay window exposes navigator.windowControlsOverlay. Sets <html data-desktop="1">, which the
 * nav and the app shell use to stay clear of the window controls and to make empty chrome draggable.
 */
export const DESKTOP_SCRIPT = `(function(){try{var n=navigator,w=n.windowControlsOverlay;if(/\\bElectron\\//.test(n.userAgent)||/keplar-desktop/.test(n.userAgent)||document.documentElement.hasAttribute("data-keplar-desktop")||(w&&w.visible)||window.keplarDesktop)document.documentElement.setAttribute("data-desktop","1")}catch(e){}})();`;
