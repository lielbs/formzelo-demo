/* GitHub Pages serves one 404.html for the whole site. A deep link into the production app
 * (/live/f/<slug>, /live/app/requests/<id>) is remembered and reopened by the app at /live/. */
(function () {
  var path = location.pathname;
  if (path.indexOf('/live/') !== 0 || path === '/live/') return;
  try {
    sessionStorage.setItem('formangle:deep-link', path + location.search + location.hash);
  } catch (e) {
    /* storage blocked: the app opens at its start page */
  }
  location.replace('/live/');
})();
