'use strict';

/* PoolFlow front-end plumbing, shared by every page.
 *
 * No framework and no build step. Four things every page needs:
 *   1. a fetch wrapper that understands the API's single error shape,
 *   2. DOM builders that create nodes instead of concatenating HTML strings - a customer
 *      note containing a left angle bracket must never be able to become markup,
 *   3. a form-error renderer that puts validation messages next to the field,
 *   4. small date helpers matching lib/time.js on the server.
 *
 * Exposed as one global (window.PF) rather than modules, so each page is a plain script
 * tag and works under the strict CSP with no inline code anywhere.
 */

window.PF = (function () {
  /* ----------------------------------------------------------------- http */

  function ApiError(status, code, message, details) {
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.message = message || 'Request failed.';
    this.details = details || null;
  }
  ApiError.prototype = Object.create(Error.prototype);

  async function request(method, path, body) {
    var options = {
      method: method,
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    var response;
    try {
      response = await fetch(path, options);
    } catch (err) {
      throw new ApiError(0, 'network', 'No connection. Check your signal and try again.');
    }

    if (response.status === 401) {
      // Session expired mid-session. Bounce to sign-in and keep where they were.
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
      }
      throw new ApiError(401, 'not_authenticated', 'Please sign in again.');
    }

    var payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }

    if (!response.ok) {
      var code = payload && payload.error ? payload.error : 'server_error';
      var message = payload && payload.message ? payload.message : 'Something went wrong.';
      throw new ApiError(response.status, code, message, payload ? payload.details : null);
    }
    return payload;
  }

  var api = {
    get: function (path) { return request('GET', path); },
    post: function (path, body) { return request('POST', path, body || {}); },
    patch: function (path, body) { return request('PATCH', path, body || {}); },
  };

  /* ------------------------------------------------------------------ dom */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') throw new Error('PF.el: html is not allowed, use text');
        else if (key.indexOf('on') === 0 && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'dataset') {
          Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
        } else node.setAttribute(key, value);
      });
    }
    (Array.isArray(children) ? children : children === undefined ? [] : [children])
      .forEach(function (child) {
        if (child === null || child === undefined || child === false) return;
        node.appendChild(typeof child === 'string' || typeof child === 'number'
          ? document.createTextNode(String(child))
          : child);
      });
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  function badge(value) {
    return el('span', { class: 'badge badge-' + value, text: String(value).replace(/_/g, ' ') });
  }

  function notice(container, message, kind) {
    if (!container) return;
    clear(container);
    if (!message) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');
    container.appendChild(el('div', { class: 'notice notice-' + (kind || 'info'), text: message }));
  }

  function emptyState(message) {
    return el('div', { class: 'empty-state', text: message });
  }

  /* ---------------------------------------------------------------- forms */

  function clearFieldErrors(form) {
    form.querySelectorAll('.field-error').forEach(function (node) { node.remove(); });
    form.querySelectorAll('[aria-invalid]').forEach(function (node) {
      node.removeAttribute('aria-invalid');
    });
  }

  // Renders { field: 'reason' } from the API next to the matching input. Anything without a
  // matching input (or the _form key) is returned so the caller can show it as a banner.
  function showFieldErrors(form, details) {
    clearFieldErrors(form);
    var leftovers = [];
    if (!details) return leftovers;

    Object.keys(details).forEach(function (field) {
      var input = form.elements ? form.elements[field] : null;
      if (!input || !input.parentNode) {
        leftovers.push(details[field]);
        return;
      }
      input.setAttribute('aria-invalid', 'true');
      input.parentNode.appendChild(el('div', { class: 'field-error', text: details[field] }));
    });
    return leftovers;
  }

  function formValues(form) {
    var out = {};
    new FormData(form).forEach(function (value, key) {
      var trimmed = typeof value === 'string' ? value.trim() : value;
      if (trimmed !== '') out[key] = trimmed;
    });
    return out;
  }

  function busy(button, isBusy, labelWhenBusy) {
    if (!button) return;
    if (isBusy) {
      button.dataset.label = button.textContent;
      button.textContent = labelWhenBusy || 'Working...';
      button.disabled = true;
    } else {
      if (button.dataset.label) button.textContent = button.dataset.label;
      button.disabled = false;
    }
  }

  /* ----------------------------------------------------------------- time */

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad(n) { return String(n).padStart(2, '0'); }

  // Matches lib/time.js: 'YYYY-MM-DD HH:MM' in the business's local time, parsed as local.
  function parse(value) {
    if (!value) return null;
    var parts = String(value).split(' ');
    var d = parts[0].split('-').map(Number);
    var t = (parts[1] || '00:00').split(':').map(Number);
    return new Date(d[0], d[1] - 1, d[2], t[0], t[1]);
  }

  function formatDate(dt) {
    return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  }

  function today() { return formatDate(new Date()); }

  function addDays(value, days) {
    var dt = parse(value);
    dt.setDate(dt.getDate() + days);
    return formatDate(dt);
  }

  function isoWeekday(value) {
    var day = parse(value).getDay();
    return day === 0 ? 7 : day;
  }

  function startOfWeek(value) {
    var date = String(value).split(' ')[0];
    return addDays(date, -(isoWeekday(date) - 1));
  }

  function clockLabel(value) {
    var dt = parse(value);
    var h = dt.getHours();
    var suffix = h < 12 ? 'AM' : 'PM';
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + pad(dt.getMinutes()) + ' ' + suffix;
  }

  function dayLabel(value) {
    var dt = parse(value);
    return DAYS[dt.getDay()].slice(0, 3) + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getDate();
  }

  function longLabel(value) {
    var dt = parse(value);
    return DAYS[dt.getDay()] + ' ' + MONTHS[dt.getMonth()] + ' ' + dt.getDate() + ', ' + clockLabel(value);
  }

  /* ------------------------------------------------------------- session */

  // Every signed-in page calls this first. The server already guards the route, so this is
  // about painting the header and giving the page the business's working hours.
  async function session() {
    var payload = await api.get('/api/auth/me');
    return payload.user;
  }

  return {
    ApiError: ApiError,
    api: api,
    el: el,
    clear: clear,
    badge: badge,
    notice: notice,
    emptyState: emptyState,
    showFieldErrors: showFieldErrors,
    clearFieldErrors: clearFieldErrors,
    formValues: formValues,
    busy: busy,
    session: session,
    time: {
      DAYS: DAYS,
      MONTHS: MONTHS,
      parse: parse,
      formatDate: formatDate,
      today: today,
      addDays: addDays,
      isoWeekday: isoWeekday,
      startOfWeek: startOfWeek,
      clockLabel: clockLabel,
      dayLabel: dayLabel,
      longLabel: longLabel,
    },
  };
})();

