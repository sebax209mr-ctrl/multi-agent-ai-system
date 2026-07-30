'use strict';

/* Header behaviour for every signed-in page: highlight the current link, paint who is
 * signed in, wire sign-out.
 *
 * It also owns PF.ready - a single promise for the session lookup. Page scripts await it
 * instead of each calling /api/auth/me, so a page costs one session request, not two.
 * Loaded with defer after api.js, so PF exists and page scripts run after this one.
 */

(function () {
  function markCurrentLink() {
    var path = window.location.pathname;
    document.querySelectorAll('.nav a').forEach(function (link) {
      if (link.getAttribute('href') === path) link.setAttribute('aria-current', 'page');
    });
  }

  function paint(user) {
    var name = document.getElementById('whoami-name');
    var business = document.getElementById('whoami-business');
    if (name) name.textContent = user.name;
    if (business) business.textContent = user.business_name;
  }

  function wireSignOut() {
    var button = document.getElementById('signout');
    if (!button) return;
    button.addEventListener('click', async function () {
      PF.busy(button, true, 'Signing out...');
      try {
        await PF.api.post('/api/auth/logout');
      } catch (err) {
        // Losing the cookie locally is the part that matters; a failed call should not trap
        // someone on a page they are trying to leave.
      }
      window.location.href = '/';
    });
  }

  markCurrentLink();
  wireSignOut();

  PF.ready = PF.session()
    .then(function (user) {
      PF.user = user;
      paint(user);
      return user;
    })
    .catch(function (err) {
      // PF.api already redirects on 401. Anything else is a real outage, so say so once
      // rather than letting every widget on the page fail silently.
      var banner = document.getElementById('page-notice');
      if (banner) PF.notice(banner, err.message, 'error');
      throw err;
    });
})();

