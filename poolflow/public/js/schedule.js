'use strict';

/* Week-view scheduling - build order week 3.
 *
 * Two jobs on one screen: see the week, and put something in it. Marking a visit
 * completed or no-show is a single tap from the same view, because that is what an
 * operator does at the end of every stop and it must not require navigation.
 *
 * The times offered in the booking panel come from GET /api/jobs/slots - the same slot
 * calculation the SMS agent uses. The manual UI cannot offer a time the agent would refuse,
 * and neither of them can offer a time that is already taken.
 */

(function () {
  var noticeBox = document.getElementById('page-notice');
  var weekBox = document.getElementById('week-grid');
  var weekLabel = document.getElementById('week-label');
  var prevButton = document.getElementById('week-prev');
  var nextButton = document.getElementById('week-next');
  var todayButton = document.getElementById('week-today');
  var bookForm = document.getElementById('book-form');
  var bookButton = document.getElementById('book-submit');
  var bookNotice = document.getElementById('book-notice');

  var params = new URLSearchParams(window.location.search);
  var weekStart = PF.time.startOfWeek(params.get('week') || PF.time.today());
  var preselectCustomer = params.get('customer');

  function setWeek(date) {
    weekStart = PF.time.startOfWeek(date);
    window.history.replaceState({}, '', '/schedule?week=' + weekStart);
    loadWeek();
  }

  /* --------------------------------------------------------------- actions */

  async function setStatus(job, status, button) {
    PF.busy(button, true, '...');
    try {
      await PF.api.patch('/api/jobs/' + job.id, { status: status });
      PF.notice(noticeBox, 'Marked ' + status.replace(/_/g, ' ') + '.', 'ok');
      loadWeek();
    } catch (err) {
      PF.notice(noticeBox, err.message, 'error');
      PF.busy(button, false);
    }
  }

  function actionButton(job, status, label) {
    var button = PF.el('button', { class: 'small quiet', type: 'button', text: label });
    button.addEventListener('click', function () { setStatus(job, status, button); });
    return button;
  }

  function visit(job) {
    var actions = PF.el('div', { class: 'acts' }, [PF.badge(job.status)]);

    // Only a scheduled visit has outcomes to record. A completed one is history; offering
    // buttons on it just invites mis-taps.
    if (job.status === 'scheduled') {
      actions.appendChild(actionButton(job, 'completed', 'Done'));
      actions.appendChild(actionButton(job, 'no_show', 'No-show'));
      actions.appendChild(actionButton(job, 'canceled', 'Cancel'));
    }

    return PF.el('div', { class: 'visit status-' + job.status }, [
      PF.el('div', { class: 'when', text: PF.time.clockLabel(job.starts_at) }),
      PF.el('div', { class: 'who', text: job.customer_name || 'Unnamed customer' }),
      job.customer_address ? PF.el('div', { class: 'where', text: job.customer_address }) : null,
      job.service_type !== 'maintenance'
        ? PF.el('div', { class: 'where', text: job.service_type })
        : null,
      job.notes ? PF.el('div', { class: 'where', text: job.notes }) : null,
      actions,
    ]);
  }

  /* ----------------------------------------------------------------- week */

  async function loadWeek() {
    try {
      var week = await PF.api.get('/api/jobs?week=' + weekStart);
      weekLabel.textContent =
        PF.time.dayLabel(week.week_start) + ' to ' + PF.time.dayLabel(week.week_end);

      var byDay = {};
      week.jobs.forEach(function (job) {
        var day = job.starts_at.split(' ')[0];
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(job);
      });

      var today = PF.time.today();
      PF.clear(weekBox);

      for (var i = 0; i < 7; i += 1) {
        var date = PF.time.addDays(week.week_start, i);
        var jobs = byDay[date] || [];
        var column = PF.el('div', { class: 'day' + (date === today ? ' today' : '') }, [
          PF.el('h3', { text: PF.time.dayLabel(date) }),
        ]);
        if (!jobs.length) {
          column.appendChild(PF.el('div', { class: 'empty', text: 'No visits' }));
        } else {
          jobs.forEach(function (job) { column.appendChild(visit(job)); });
        }
        weekBox.appendChild(column);
      }
    } catch (err) {
      PF.notice(noticeBox, err.message, 'error');
    }
  }

  /* -------------------------------------------------------------- booking */

  async function loadCustomerOptions() {
    var select = bookForm.elements.customer_id;
    var payload = await PF.api.get('/api/customers');
    PF.clear(select);
    select.appendChild(PF.el('option', { value: '', text: 'Choose a customer...' }));

    payload.customers
      .filter(function (customer) { return customer.status !== 'lost'; })
      .forEach(function (customer) {
        select.appendChild(PF.el('option', {
          value: String(customer.id),
          text: (customer.name || 'Unnamed') + ' - ' + customer.phone_display +
            (customer.status === 'lead' ? ' (lead)' : ''),
        }));
      });

    if (preselectCustomer) select.value = preselectCustomer;
  }

  async function loadSlotOptions() {
    var select = bookForm.elements.starts_at;
    var payload = await PF.api.get('/api/jobs/slots?days=14');
    PF.clear(select);

    if (!payload.slots.length) {
      select.appendChild(PF.el('option', { value: '', text: 'No open slots in the next 14 days' }));
      return;
    }
    select.appendChild(PF.el('option', { value: '', text: 'Choose a time...' }));
    payload.slots.forEach(function (slot) {
      select.appendChild(PF.el('option', { value: slot.starts_at, text: slot.label }));
    });
  }

  if (bookForm) {
    bookForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      PF.clearFieldErrors(bookForm);
      PF.notice(bookNotice, null);
      PF.busy(bookButton, true, 'Booking...');

      var values = PF.formValues(bookForm);

      try {
        var payload = await PF.api.post('/api/jobs', {
          customer_id: Number(values.customer_id),
          starts_at: values.starts_at,
          service_type: values.service_type,
          notes: values.notes,
        });

        var message = 'Booked for ' + PF.time.longLabel(payload.job.starts_at) + '.';
        if (payload.customer_promoted_to_active) message += ' Lead is now an active customer.';
        PF.notice(bookNotice, message, 'ok');

        bookForm.reset();
        // Both lists move when a job is created: the week gains a visit and that slot is no
        // longer offerable.
        await Promise.all([loadWeek(), loadSlotOptions()]);
      } catch (err) {
        var leftovers = PF.showFieldErrors(bookForm, err.details);
        PF.notice(bookNotice, leftovers.length ? leftovers.join(' ') : err.message, 'error');
        if (err.code === 'slot_unavailable') loadSlotOptions();
      } finally {
        PF.busy(bookButton, false);
      }
    });
  }

  if (prevButton) prevButton.addEventListener('click', function () { setWeek(PF.time.addDays(weekStart, -7)); });
  if (nextButton) nextButton.addEventListener('click', function () { setWeek(PF.time.addDays(weekStart, 7)); });
  if (todayButton) todayButton.addEventListener('click', function () { setWeek(PF.time.today()); });

  PF.ready
    .then(function () {
      return Promise.all([loadWeek(), loadCustomerOptions(), loadSlotOptions()]);
    })
    .catch(function (err) {
      if (err && err.message) PF.notice(noticeBox, err.message, 'error');
    });
})();

