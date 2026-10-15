/**
 * The only pages Track B is allowed to touch: a local delivery form and a page that must be refused.
 * Inlined so a serverless bundle does not depend on a sibling HTML file surviving the build.
 */
export const FORM_HTML = `<!doctype html><html><body><h1>Local fixture: delivery form</h1>
<form id="f" onsubmit="event.preventDefault();document.getElementById('result').textContent='ok:'+document.getElementById('item').value">
<input id="item" name="item"><input id="qty" name="qty"><button id="submit" type="submit">Submit</button></form>
<div id="result"></div></body></html>`;

export const CAPTCHA_HTML = `<!doctype html><html><body><div class="g-captcha">captcha</div><input id="item"></body></html>`;
