/**
 * Desktop app detection, before first paint (no layout shift): the Keplar desktop app (v0.1.3+) puts the token `keplar-desktop` in the user agent and sets html.keplar-desktop / [data-keplar-desktop]; plain Electron and
 * and any window-controls-overlay window exposes navigator.windowControlsOverlay. Sets <html data-desktop="1">, which the
 * nav and the app shell use to stay clear of the window controls and to make empty chrome draggable.
 */
// Also sets data-desktop-os ("mac" or "other"): where env(titlebar-area-*) is not exposed, CSS still knows which side the window
// controls are on (traffic lights on the left on macOS; minimise/maximise/close on the right elsewhere) and how much room to keep.
export const DESKTOP_SCRIPT = `(function(){try{var n=navigator,w=n.windowControlsOverlay,d=document.documentElement;if(/\\bElectron\\//.test(n.userAgent)||/keplar-desktop/.test(n.userAgent)||d.hasAttribute("data-keplar-desktop")||(w&&w.visible)||window.keplarDesktop){d.setAttribute("data-desktop","1");d.setAttribute("data-desktop-os",/Mac/.test(n.platform||n.userAgent)?"mac":"other")}}catch(e){}})();`;
