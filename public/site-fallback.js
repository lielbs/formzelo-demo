/* GitHub Pages serves one 404.html for the whole site: it is the production app (built for /live/),
 * so customer links such as /live/t/<venue> or /live/f/<form> open in a single page load.
 * Any other unknown path belongs to the demo at the site root: remember it and reopen it there. */
(function () {
  var path = location.pathname;
  if (path === '/live' || path.indexOf('/live/') === 0) return;
  try {
    sessionStorage.setItem('formangle:deep-link', path + location.search + location.hash);
  } catch (e) {
    /* storage blocked: the demo opens at its start page */
  }
  location.replace('/');
})();
