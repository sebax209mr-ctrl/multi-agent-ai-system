'use strict';

/* Conversations - the human half of the booking assistant.
 *
 * The agent is allowed to give up. What it is not allowed to do is give up quietly, so
 * every escalation lands here with the full transcript and a reply box. Replying resolves
 * the escalation server-side: the thread reopens and the agent's turn budget resets.
 */

(function () {
  var noticeBox = document.getElementById('page-notice');
  var listBox = document.getElementById('thread-list');
  var filterSelect = document.getElementById('thread-filter');
  var detailBox = document.getElementById('thread-detail');
  var emptyBox = document.getElementById('thread-empty');

  var selectedId = new URLSearchParams(window.location.search).get('id');

  function summaryLine(row) {
    var button = PF.el('button', {
      class: 'quiet',
      type: 'button',
      style: 'display:block;width:100%;text-align:left;',
    }, [
      PF.el('div', { class: 'spread' }, [
        PF.el('strong', { text: row.customer_name || row.customer_phone }),
        PF.badge(row.status),
      ]),
      PF.el('div', { class: 'faint', text: row.last_message || 'No messages yet' }),
    ]);

    button.addEventListener('click', function () { select(row.id); });
    return PF.el('div', { style: 'margin-bottom:0.5rem;' }, [button]);
  }

  async function loadList() {
    var status = filterSelect ? filterSelect.value : '';
    try {
      var payload = await PF.api.get('/api/conversations' + (status ? '?status=' + status : ''));
      PF.clear(listBox);

      if (!payload.conversations.length) {
        listBox.appendChild(PF.emptyState('No conversations here.'));
        return;
      }
      payload.conversations.forEach(function (row) { listBox.appendChild(summaryLine(row)); });

      // Nothing chosen yet: open the first thread so the page is never a dead end.
      if (!selectedId) select(payload.conversations[0].id);
    } catch (err) {
      PF.notice(noticeBox, err.message, 'error');
    }
  }

  function messageBubble(message) {
    var who = message.author === 'system'
      ? 'system'
      : message.direction === 'inbound' ? 'inbound' : 'outbound';

    return PF.el('div', { class: 'msg msg-' + who }, [
      PF.el('span', { text: message.body }),
      PF.el('span', { class: 'meta', text: message.author + ' - ' + message.created_at }),
    ]);
  }

  function replyBox(conversation) {
    var form = PF.el('form', { id: 'reply-form' });
    var textarea = PF.el('textarea', {
      name: 'body',
      maxlength: '480',
      required: 'required',
      placeholder: 'Reply as the owner. This goes out as an SMS.',
      'aria-label': 'Reply message',
    });
    var send = PF.el('button', { type: 'submit', text: 'Send reply' });
    var notice = PF.el('div', { class: 'hidden' });

    form.appendChild(PF.el('div', { class: 'field' }, [
      PF.el('label', { for: 'reply-body', text: 'Your reply' }),
      textarea,
    ]));
    textarea.id = 'reply-body';
    form.appendChild(PF.el('div', { class: 'row' }, [send]));
    form.appendChild(notice);

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var body = textarea.value.trim();
      if (!body) return;

      PF.busy(send, true, 'Sending...');
      try {
        await PF.api.post('/api/conversations/' + conversation.id + '/reply', { body: body });
        textarea.value = '';
        PF.notice(notice, 'Sent. This thread is back with the assistant.', 'ok');
        await select(conversation.id);
        loadList();
      } catch (err) {
        PF.notice(notice, err.message, 'error');
      } finally {
        PF.busy(send, false);
      }
    });

    return form;
  }

  function closeButton(conversation) {
    var isClosed = conversation.status === 'closed';
    var button = PF.el('button', {
      class: 'small quiet',
      type: 'button',
      text: isClosed ? 'Reopen thread' : 'Close thread',
    });

    button.addEventListener('click', async function () {
      PF.busy(button, true, '...');
      try {
        await PF.api.patch('/api/conversations/' + conversation.id, {
          status: isClosed ? 'open' : 'closed',
        });
        await select(conversation.id);
        loadList();
      } catch (err) {
        PF.notice(noticeBox, err.message, 'error');
      } finally {
        PF.busy(button, false);
      }
    });
    return button;
  }

  async function select(id) {
    selectedId = String(id);
    window.history.replaceState({}, '', '/conversations?id=' + selectedId);

    try {
      var thread = await PF.api.get('/api/conversations/' + selectedId);
      var conversation = thread.conversation;

      emptyBox.classList.add('hidden');
      detailBox.classList.remove('hidden');
      PF.clear(detailBox);

      detailBox.appendChild(PF.el('div', { class: 'card-head' }, [
        PF.el('div', null, [
          PF.el('h2', { text: conversation.customer_name || conversation.customer_phone }),
          PF.el('div', { class: 'faint', text: conversation.customer_phone + ' - intent: ' + conversation.intent }),
        ]),
        PF.el('div', { class: 'row' }, [PF.badge(conversation.status), closeButton(conversation)]),
      ]));

      if (conversation.status === 'needs_human') {
        detailBox.appendChild(PF.el('div', { class: 'notice notice-error' }, [
          'The assistant handed this over after ' + conversation.turn_count +
          ' turns. It will stay quiet until you reply.',
        ]));
      }

      var thread_el = PF.el('div', { class: 'thread' });
      thread.messages.forEach(function (message) { thread_el.appendChild(messageBubble(message)); });
      detailBox.appendChild(thread_el);
      thread_el.scrollTop = thread_el.scrollHeight;

      detailBox.appendChild(replyBox(conversation));
    } catch (err) {
      PF.notice(noticeBox, err.message, 'error');
    }
  }

  if (filterSelect) {
    filterSelect.addEventListener('change', function () {
      selectedId = null;
      loadList();
    });
  }

  PF.ready
    .then(function () {
      if (selectedId) select(selectedId);
      return loadList();
    })
    .catch(function () { /* nav.js already reported it */ });
})();

