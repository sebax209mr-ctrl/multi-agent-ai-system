'use strict';

/* Customers and leads - manual CRUD, build order weeks 1-2.
 *
 * This is the screen that has to be good before the booking bot is worth building. If an
 * operator will not keep their customer list here by hand, an SMS agent writing into it
 * solves nothing.
 *
 * Status is edited inline with a select rather than behind an edit page: changing someone
 * from lead to active is the single most common action, and it should cost one tap.
 */

(function () {
  var noticeBox = document.getElementById('page-notice');
  var tableBody = document.getElementById('customer-rows');
  var countLabel = document.getElementById('customer-count');
  var filterForm = document.getElementById('customer-filter');
  var createForm = document.getElementById('customer-create');
  var createButton = document.getElementById('customer-create-submit');
  var createNotice = document.getElementById('create-notice');

  var STATUSES = ['lead', 'active', 'paused', 'lost'];
  var PLANS = ['one_time', 'weekly', 'biweekly', 'monthly'];

  function currentFilter() {
    var params = new URLSearchParams(window.location.search);
    return {
      status: params.get('status') || '',
      q: params.get('q') || '',
    };
  }

  function statusSelect(customer) {
    var select = PF.el('select', { 'aria-label': 'Status for ' + (customer.name || customer.phone_display) });
    STATUSES.forEach(function (value) {
      select.appendChild(PF.el('option', {
        value: value,
        text: value.replace(/_/g, ' '),
        selected: value === customer.status ? 'selected' : null,
      }));
    });

    select.addEventListener('change', async function () {
      var previous = customer.status;
      select.disabled = true;
      try {
        await PF.api.patch('/api/customers/' + customer.id, { status: select.value });
        customer.status = select.value;
        PF.notice(noticeBox, 'Updated ' + (customer.name || customer.phone_display) + '.', 'ok');
      } catch (err) {
        select.value = previous;
        PF.notice(noticeBox, err.message, 'error');
      } finally {
        select.disabled = false;
      }
    });
    return select;
  }

  function planLabel(customer) {
    return customer.plan ? customer.plan.replace(/_/g, ' ') : '--';
  }

  function row(customer) {
    return PF.el('tr', null, [
      PF.el('td', null, [
        PF.el('div', { text: customer.name || 'Unnamed' }),
        PF.el('div', { class: 'faint', text: customer.address || '' }),
      ]),
      PF.el('td', { class: 'nowrap' }, [
        PF.el('a', { href: 'sms:' + customer.phone, text: customer.phone_display }),
      ]),
      PF.el('td', { class: 'nowrap' }, [statusSelect(customer)]),
      PF.el('td', { class: 'nowrap', text: planLabel(customer) }),
      PF.el('td', { class: 'nowrap' }, [PF.el('span', { class: 'faint', text: customer.source })]),
      PF.el('td', { class: 'nowrap' }, [
        PF.el('a', {
          class: 'btn small btn-quiet',
          href: '/schedule?customer=' + customer.id,
          text: 'Book visit',
        }),
      ]),
    ]);
  }

  async function load() {
    var filter = currentFilter();
    if (filterForm) {
      filterForm.elements.status.value = filter.status;
      filterForm.elements.q.value = filter.q;
    }

    var query = new URLSearchParams();
    if (filter.status) query.set('status', filter.status);
    if (filter.q) query.set('q', filter.q);

    try {
      var payload = await PF.api.get('/api/customers?' + query.toString());
      PF.clear(tableBody);
      countLabel.textContent = payload.count === 1 ? '1 record' : payload.count + ' records';

      if (!payload.customers.length) {
        tableBody.appendChild(
          PF.el('tr', null, [
            PF.el('td', { colspan: '6' }, [PF.emptyState('No customers match that filter yet.')]),
          ])
        );
        return;
      }
      payload.customers.forEach(function (customer) { tableBody.appendChild(row(customer)); });
    } catch (err) {
      PF.notice(noticeBox, err.message, 'error');
    }
  }

  if (filterForm) {
    filterForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var values = PF.formValues(filterForm);
      var query = new URLSearchParams();
      if (values.status) query.set('status', values.status);
      if (values.q) query.set('q', values.q);
      // Push the filter into the URL so a filtered list is linkable and survives a refresh.
      // It is a website: the address bar is part of the interface.
      var search = query.toString();
      window.history.replaceState({}, '', '/customers' + (search ? '?' + search : ''));
      load();
    });
  }

  if (createForm) {
    // Populate the plan select from one list rather than duplicating options in the HTML.
    var planSelect = createForm.elements.plan;
    PLANS.forEach(function (value) {
      planSelect.appendChild(PF.el('option', { value: value, text: value.replace(/_/g, ' ') }));
    });

    createForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      PF.clearFieldErrors(createForm);
      PF.notice(createNotice, null);
      PF.busy(createButton, true, 'Saving...');

      try {
        var payload = await PF.api.post('/api/customers', PF.formValues(createForm));
        createForm.reset();
        PF.notice(
          createNotice,
          payload.created ? 'Added.' : payload.message,
          payload.created ? 'ok' : 'info'
        );
        load();
      } catch (err) {
        var leftovers = PF.showFieldErrors(createForm, err.details);
        PF.notice(createNotice, leftovers.length ? leftovers.join(' ') : err.message, 'error');
      } finally {
        PF.busy(createButton, false);
      }
    });
  }

  PF.ready.then(load).catch(function () { /* nav.js already reported it */ });
})();

