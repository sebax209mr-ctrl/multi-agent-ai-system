'use strict';

/* Sign-in page.
 *
 * The form posts through fetch so validation errors land next to the field, but it is a
 * real <form> with real inputs: pressing Enter works, and password managers can see it.
 */

(function () {
  var form = document.getElementById('login-form');
  var banner = document.getElementById('login-notice');
  var submit = document.getElementById('login-submit');
  if (!form) return;

  // ?next=/schedule from middleware/session.js requirePage. Only ever followed when it is a
  // path on this site - an absolute URL here would be an open redirect.
  function nextPath() {
    var raw = new URLSearchParams(window.location.search).get('next');
    if (!raw) return '/dashboard';
    if (raw.charAt(0) !== '/' || raw.charAt(1) === '/') return '/dashboard';
    return raw;
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    PF.clearFieldErrors(form);
    PF.notice(banner, null);
    PF.busy(submit, true, 'Signing in...');

    var values = PF.formValues(form);

    try {
      await PF.api.post('/api/auth/login', {
        email: values.email || '',
        password: form.elements.password.value || '',
      });
      window.location.href = nextPath();
    } catch (err) {
      var leftovers = PF.showFieldErrors(form, err.details);
      PF.notice(banner, leftovers.length ? leftovers.join(' ') : err.message, 'error');
      form.elements.password.value = '';
      form.elements.password.focus();
    } finally {
      PF.busy(submit, false);
    }
  });
})();

