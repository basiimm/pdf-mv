// Runs synchronously in <head> before first paint, so pages never render
// without the studio theme. Keep it tiny, classic (non-module) and CSP-safe.
(function () {
  var root = document.documentElement;
  var preference = 'system';
  try {
    var saved = localStorage.getItem('pdf-studio-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch (e) {
    /* Storage can be unavailable; follow the system theme. */
  }
  var theme =
    preference === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : preference;
  root.dataset.studioTheme = theme;
  root.style.colorScheme = theme;

  var params = new URLSearchParams(location.search);
  var embedded = window.parent !== window && params.get('workspace') === '1';
  // Legacy tool pages are not a destination: open the tool inside the
  // workspace instead. ?standalone=1 keeps the page for debugging.
  var script = document.currentScript;
  var tool = script && script.dataset.tool;
  if (tool && !embedded && !params.has('standalone')) {
    var base = new URL(script.src).pathname.replace(/theme-boot\.js$/, '');
    location.replace(base + 'workspace.html?tool=' + encodeURIComponent(tool));
    return;
  }
  if (!embedded) return;
  root.classList.add('workspace-embedded-tool');
  if (
    /\/(digital-sign-pdf|validate-signature-pdf|timestamp-pdf)(\.html)?$/.test(
      location.pathname
    )
  )
    root.classList.add('workspace-signature-tool');

  // Tell the workspace the page is parsed and styled, before heavy modules finish.
  // Waits for a frame so styles are applied; the timer covers background tabs,
  // where animation frames are paused.
  var announced = false;
  function send() {
    if (announced) return;
    announced = true;
    window.parent.postMessage({ type: 'studio-tool-styled' }, location.origin);
  }
  function announce() {
    if (document.readyState === 'loading') return;
    requestAnimationFrame(function () {
      requestAnimationFrame(send);
    });
    setTimeout(send, 50);
  }
  document.addEventListener('readystatechange', announce);
  announce();
})();
