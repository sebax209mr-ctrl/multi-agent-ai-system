'use strict';

/* Dashboard.
 *
 * Spec item 6 and nothing else: this week's jobs, count of open leads, count of active
 * customers - plus the escalation queue, because a flagged conversation is work that will
 * otherwise sit unseen. One GET /api/dashboard fills the whole screen.
 */

(function () {
  var noticeBox = document.getElementById('page-notice');
  var metricsBox = document.getElementById('metrics');
  var todayBox = document.getElementById('today-list');
  var weekBox = document.getElementById('week-list');
  var flaggedBox = document.getElementById('flagged-list');
  var weekLabel = document.getElementById('week-label');

  function metric(value, label, href) {
    var number = PF.el('div', { class: 'n', text: String(value) });
    var caption = href
      ? PF.el('div', { class: 'k' }, [PF.el('a', { href: href, text: label })])
      : PF.el('div', { class: 'k', text: label });
    return PF.el('div', { class: 'metric' }, [number, caption]);
  }

  function jobLine(job) {
    return PF.el('div', { class: 'visit status-' + job.status }, [
      PF.el('div', { class: 'when', text: PF.time.clockLabel(job.starts_at) }),
      PF.el('div', { class: 'who', text: job.customer_name || 'Unnamed customer' }),
      job.customer_address ? PF.el('div', { class: 'where', text: job.customer_address }) : null,
      PF.el('div', { class: 'acts' }, [PF.badge(job.status)]),
    ]);
  }

  function renderToday(jobs) {
    PF.clear(todayBox);
    if (!jobs.length) {
      todayBox.appendChild(PF.emptyState('Nothing on the calendar today.'));
      return;
    }
    jobs.forEach(function (job) { todayBox.appendChild(jobLine(job)); });
  }

  function renderWeek(week) {
    PF.clear(weekBox);
    weekLabel.textContent = PF.time.dayLabel(week.week_start) + ' to ' + PF.time.dayLabel(week.week_end);

    var today = PF.time.today();
    var byDay = {};
    week.jobs.forEach(function (job) {
      var day = job.starts_at.split(' ')[0];
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(job);
    });

    for (var i = 0; i < 7; i += 1) {
      var date = PF.time.addDays(week.week_start, i);
      var jobs = byDay[date] || [];
      var column = PF.el('div', { class: 'day' + (date === today ? ' today' : '') }, [
        PF.el('h3', { text: PF.time.dayLabel(date) }),
      ]);
      if (!jobs.length) {
        column.appendChild(PF.el('div', { class: 'empty', text: 'Free' }));
      } else {
        jobs.forEach(function (job) { column.appendChild(jobLine(job)); });
      }
      weekBox.appendChild(column);
    }
  }

  function renderFlagged(rows) {
    PF.clear(flaggedBox);
    if (!rows.length) {
      flaggedBox.appendChild(PF.emptyState('No conversations need you right now.'));
      return;
    }
    rows.forEach(function (row) {
      flaggedBox.appendChild(
        PF.el('div', { class: 'visit' }, [
          PF.el('div', { class: 'who', text: row.customer_name || row.customer_phone }),
          PF.el('div', { class: 'where', text: row.last_message || '' }),
          PF.el('div', { class: 'acts' }, [
            PF.badge(row.status),
            PF.el('span', { class: 'faint', text: row.turn_count + ' turns' }),
            PF.el('a', {
              class: 'btn small btn-quiet',
              href: '/conversations?id=' + row.id,
              text: 'Open thread',
            }),
          ]),
        ])
      );
    });
  }

  async function load() {
    try {
      var data = await PF.api.get('/api/dashboard');
      var scheduled = data.week.by_status.scheduled;

      PF.clear(metricsBox);
      metricsBox.appendChild(metric(scheduled, 'Jobs scheduled this week', '/schedule'));
      metricsBox.appendChild(metric(data.counts.open_leads, 'Open leads', '/customers?status=lead'));
      metricsBox.appendChild(metric(data.counts.active_customers, 'Active customers', '/customers?status=active'));

      renderToday(data.today);
      renderWeek(data.week);
      renderFlagged(data.flagged);
    } catch (err) {
      PF.notice(noticeBox, err.message, 'error');
    }
  }

  PF.ready.then(load).catch(function () { /* nav.js already reported it */ });
})();

