'use strict';

/* ==================== Search ==================== */

function hideSearchResults() {
  if (els.searchResults) els.searchResults.classList.remove('open');
}

function searchMatches(query) {
  var q = safeText(query).trim().toLowerCase();
  if (!q) return [];
  return Object.values(state.tasks).filter(function(t) {
    return t && !isRoot(t.id) && !isLinkTask(t);
  }).filter(function(t) {
    return safeText(t.title).toLowerCase().indexOf(q) >= 0 ||
           safeText(t.description).toLowerCase().indexOf(q) >= 0;
  }).sort(function(a, b) {
    var aTitle = safeText(a.title).toLowerCase();
    var bTitle = safeText(b.title).toLowerCase();
    var aStarts = aTitle.indexOf(q) === 0 ? 0 : 1;
    var bStarts = bTitle.indexOf(q) === 0 ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return aTitle.localeCompare(bTitle, 'ru');
  }).slice(0, 12);
}

function renderSearchResults() {
  if (!els.searchInput || !els.searchResults) return;
  var matches = searchMatches(els.searchInput.value);
  els.searchResults.innerHTML = '';
  if (!els.searchInput.value.trim()) {
    hideSearchResults();
    return;
  }
  if (!matches.length) {
    var empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = 'Ничего не найдено';
    els.searchResults.appendChild(empty);
    els.searchResults.classList.add('open');
    return;
  }
  matches.forEach(function(t) {
    var row = document.createElement('div');
    row.className = 'search-result';
    var openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'search-open-btn';
    var title = document.createElement('div');
    title.className = 'search-result-title';
    title.textContent = t.title || 'Без названия';
    var meta = document.createElement('div');
    meta.className = 'search-result-meta';
    meta.textContent = columnTitle(t.status) + ' • ' + taskPath(t.id);
    openBtn.appendChild(title);
    openBtn.appendChild(meta);
    openBtn.addEventListener('click', function(ev) {
      ev.stopPropagation();
      revealTaskFromSearch(t.id);
    });
    var linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'search-link-btn';
    linkBtn.textContent = '+ ссылка';
    if (!canCreateLinkTo(t.id)) {
      linkBtn.disabled = true;
      linkBtn.title = 'Эту задачу нельзя добавить ссылкой на текущую доску';
    } else {
      linkBtn.title = 'Добавить ссылку на текущую доску';
      linkBtn.addEventListener('click', function(ev) {
        ev.stopPropagation();
        addSearchLink(t.id);
      });
    }
    row.appendChild(openBtn);
    row.appendChild(linkBtn);
    els.searchResults.appendChild(row);
  });
  els.searchResults.classList.add('open');
}

/* ==================== Breadcrumbs ==================== */

function buildBreadcrumbs() {
  els.crumbs.innerHTML = '';
  var chain = [];
  var current = getTask(state.currentId);
  var guard = 0;
  while (current && guard < 200) {
    chain.unshift(current);
    if (!current.parentId) break;
    current = getTask(current.parentId);
    guard += 1;
  }
  chain.forEach(function(t, i) {
    if (i > 0) {
      var sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.textContent = '/';
      els.crumbs.appendChild(sep);
    }
    var btn = document.createElement('button');
    btn.textContent = isRoot(t.id) ? 'Главная' : t.title;
    btn.title = 'Открыть уровень. Во время перетаскивания можно отпустить задачу сюда, чтобы вынести её на этот уровень.';
    btn.addEventListener('click', function() { appNavigateToTask(t.id); });
    btn.addEventListener('dragover', function(ev) {
      if (!draggingId || !canMoveToContainer(draggingId, t.id)) return;
      ev.preventDefault();
      ev.stopPropagation();
      clearDropMarkers();
      btn.classList.add('crumb-drop');
      ev.dataTransfer.dropEffect = 'move';
    });
    btn.addEventListener('dragleave', function(ev) {
      if (!btn.contains(ev.relatedTarget)) btn.classList.remove('crumb-drop');
    });
    btn.addEventListener('drop', function(ev) {
      if (!draggingId || !canMoveToContainer(draggingId, t.id)) return;
      ev.preventDefault();
      ev.stopPropagation();
      var dragged = ev.dataTransfer.getData('text/plain') || draggingId;
      btn.classList.remove('crumb-drop');
      clearDropMarkers();
      if (dragged) {
        logicMoveToContainer(dragged, t.id);
        render({ preserveScroll: true });
      }
    });
    els.crumbs.appendChild(btn);
  });
}

/* ==================== Stats ==================== */

function renderStats() {
  var tasks = Object.values(state.tasks);
  var realTasks = tasks.filter(function(t) { return t && !isLinkTask(t) && !isRoot(t.id); });
  var links = tasks.filter(function(t) { return isLinkTask(t); });
  var done = realTasks.filter(function(t) { return t.status === 'done'; }).length;
  els.stats.textContent = String(realTasks.length) + ' задач • ' + String(done) + ' сделано • ' + String(links.length) + ' ссылок';
}

/* ==================== Button ==================== */

function makeButton(text, className, handler) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'small ' + (className || '');
  btn.textContent = text;
  btn.draggable = false;
  btn.addEventListener('click', function(ev) { ev.stopPropagation(); handler(); });
  return btn;
}

/* ==================== Drop Markers ==================== */

function clearDropMarkers() {
  document.querySelectorAll('.drop-inside, .drop-before, .drop-after').forEach(function(el) {
    el.classList.remove('drop-inside', 'drop-before', 'drop-after');
  });
  document.querySelectorAll('.nest-zone.over').forEach(function(el) { el.classList.remove('over'); });
  document.querySelectorAll('.crumb-drop').forEach(function(el) { el.classList.remove('crumb-drop'); });
}

function captureScrollState() {
  var snapshot = { columns: {}, windowY: window.scrollY || document.documentElement.scrollTop || 0 };
  document.querySelectorAll('.column').forEach(function(column) {
    var status = column.dataset.status;
    var cards = column.querySelector('.cards');
    if (status && cards) snapshot.columns[status] = cards.scrollTop;
  });
  return snapshot;
}

function restoreScrollState(snapshot) {
  if (!snapshot) return;
  requestAnimationFrame(function() {
    Object.keys(snapshot.columns || {}).forEach(function(status) {
      var cards = document.querySelector('.column[data-status="' + status + '"] .cards');
      if (cards) cards.scrollTop = snapshot.columns[status];
    });
    if (typeof snapshot.windowY === 'number') window.scrollTo(window.scrollX || 0, snapshot.windowY);
  });
}

function scrollToHighlightedCard() {
  if (!highlightId) return;
  requestAnimationFrame(function() {
    var card = document.querySelector('.card[data-id="' + highlightId + '"]');
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(function() {
      card.classList.remove('highlighted');
      if (highlightId === card.dataset.id) highlightId = null;
    }, 3200);
  });
}

function getDropPosition(ev, card) {
  var rect = card.getBoundingClientRect();
  return ev.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

/* ==================== Card ==================== */

function renderCard(itemId) {
  var item = getTask(itemId);
  if (!item) return null;
  realTask(itemId);

  var card = document.createElement('article');
  card.className = 'card' + (isLinkTask(item) ? ' link-card' : '') + (itemId === highlightId ? ' highlighted' : '');
  card.draggable = !isRoot(itemId);
  card.dataset.id = itemId;

  card.addEventListener('click', function(ev) {
    if (suppressNextClick) return;
    if (ev.target.closest('button') || ev.target.closest('.nest-zone')) return;
    logicOpenTask(itemId);
    render();
  });

  card.addEventListener('dragstart', function(ev) {
    draggingId = itemId;
    suppressNextClick = true;
    card.classList.add('dragging');
    document.body.classList.add('is-dragging');
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', itemId);
  });
  card.addEventListener('dragend', function() {
    draggingId = null;
    card.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    clearDropMarkers();
    setTimeout(function() { suppressNextClick = false; }, 120);
  });
  card.addEventListener('dragover', function(ev) {
    if (!draggingId || draggingId === itemId || ev.target.closest('.nest-zone')) return;
    ev.preventDefault();
    ev.stopPropagation();
    clearDropMarkers();
    var position = getDropPosition(ev, card);
    card.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
    ev.dataTransfer.dropEffect = 'move';
  });
  card.addEventListener('dragleave', function(ev) {
    if (!card.contains(ev.relatedTarget)) card.classList.remove('drop-before', 'drop-after');
  });
  card.addEventListener('drop', function(ev) {
    if (ev.target.closest('.nest-zone')) return;
    ev.preventDefault();
    ev.stopPropagation();
    var dragged = ev.dataTransfer.getData('text/plain') || draggingId;
    var position = card.classList.contains('drop-before') ? 'before' : 'after';
    clearDropMarkers();
    if (dragged && dragged !== itemId) {
      logicMoveToColumn(dragged, effectiveStatus(itemId), itemId, position);
      render({ preserveScroll: true });
    }
  });

  var nestZone = document.createElement('div');
  nestZone.className = 'nest-zone';
  nestZone.title = 'Вложить перетаскиваемую задачу внутрь этой';
  nestZone.textContent = '↘';
  nestZone.addEventListener('click', function(ev) { ev.stopPropagation(); });
  nestZone.addEventListener('dragover', function(ev) {
    if (!draggingId || draggingId === itemId) return;
    var containerId = realId(itemId);
    if (!canMoveInside(draggingId, containerId)) return;
    ev.preventDefault();
    ev.stopPropagation();
    clearDropMarkers();
    nestZone.classList.add('over');
    card.classList.add('drop-inside');
    ev.dataTransfer.dropEffect = 'move';
  });
  nestZone.addEventListener('dragleave', function() {
    nestZone.classList.remove('over');
    card.classList.remove('drop-inside');
  });
  nestZone.addEventListener('drop', function(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    var dragged = ev.dataTransfer.getData('text/plain') || draggingId;
    clearDropMarkers();
    if (dragged) {
      logicMoveInside(dragged, itemId);
      render({ preserveScroll: true });
    }
  });
  card.appendChild(nestZone);

  var top = document.createElement('div');
  top.className = 'card-top';
  var content = document.createElement('div');
  content.className = 'card-main';
  var title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = effectiveTitle(itemId);
  content.appendChild(title);
  var descText = effectiveDescription(itemId);
  if (descText) {
    var desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = descText;
    content.appendChild(desc);
  }
  top.appendChild(content);
  card.appendChild(top);

  var badges = document.createElement('div');
  badges.className = 'badges';
  if (isLinkTask(item)) {
    var linkBadge = document.createElement('span');
    linkBadge.className = 'badge link';
    linkBadge.textContent = 'ссылка';
    badges.appendChild(linkBadge);
  }
  var childrenCount = effectiveChildrenCount(itemId);
  if (childrenCount > 0) {
    var childBadge = document.createElement('span');
    childBadge.className = 'badge';
    childBadge.textContent = String(doneChildrenCount(itemId)) + '/' + String(childrenCount) + ' внутри';
    badges.appendChild(childBadge);
  }
  if (badges.children.length) card.appendChild(badges);

  var actions = document.createElement('div');
  actions.className = 'actions';
  actions.appendChild(makeButton('Изм.', '', function() { editItem(itemId); }));
  actions.appendChild(makeButton('Удалить', 'delete', function() { deleteItem(itemId); }));
  card.appendChild(actions);

  return card;
}

/* ==================== Column ==================== */

function renderColumn(statusId) {
  var column = document.createElement('section');
  column.className = 'column';
  column.dataset.status = statusId;

  column.addEventListener('dragover', function(ev) {
    if (!draggingId) return;
    if (ev.target.closest('.card')) return;
    ev.preventDefault();
    clearDropMarkers();
    column.classList.add('drag-over');
    ev.dataTransfer.dropEffect = 'move';
  });
  column.addEventListener('dragleave', function(ev) {
    if (!column.contains(ev.relatedTarget)) column.classList.remove('drag-over');
  });
  column.addEventListener('drop', function(ev) {
    if (ev.target.closest('.card')) return;
    ev.preventDefault();
    column.classList.remove('drag-over');
    clearDropMarkers();
    var dragged = ev.dataTransfer.getData('text/plain') || draggingId;
    if (dragged) {
      logicMoveToColumn(dragged, statusId, null, 'after');
      render({ preserveScroll: true });
    }
  });

  var head = document.createElement('div');
  head.className = 'column-head';
  var columnConfig = columnById(statusId) || { title: statusId, color: '#7c9cff', locked: true };
  var title = document.createElement('div');
  title.className = 'column-title';
  var dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = validateColor(columnConfig.color, '#7c9cff');
  title.appendChild(dot);
  var name = document.createElement('span');
  name.className = 'column-name';
  name.textContent = columnConfig.title;
  title.appendChild(name);
  var count = document.createElement('span');
  count.className = 'count';
  var tools = document.createElement('div');
  tools.className = 'column-tools';
  var editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'column-icon';
  editBtn.textContent = '✎';
  editBtn.title = 'Переименовать столбец и изменить цвет';
  editBtn.addEventListener('click', function(ev) { ev.stopPropagation(); editColumn(statusId); });
  tools.appendChild(editBtn);
  if (!columnConfig.locked) {
    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'column-icon delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Удалить пользовательский столбец';
    deleteBtn.addEventListener('click', function(ev) { ev.stopPropagation(); deleteColumn(statusId); });
    tools.appendChild(deleteBtn);
  }
  var right = document.createElement('div');
  right.className = 'column-right';
  right.appendChild(count);
  right.appendChild(tools);
  head.appendChild(title);
  head.appendChild(right);
  column.appendChild(head);

  var cards = document.createElement('div');
  cards.className = 'cards';
  var current = getTask(state.currentId);
  var children = current && Array.isArray(current.children) ? current.children.slice() : [];
  var filtered = children.filter(function(id) { return effectiveStatus(id) === statusId; });
  count.textContent = String(filtered.length);
  if (!filtered.length) {
    var empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Пока пусто';
    cards.appendChild(empty);
  } else {
    filtered.forEach(function(id) {
      var card = renderCard(id);
      if (card) cards.appendChild(card);
    });
  }
  column.appendChild(cards);
  return column;
}

/* ==================== Board ==================== */

function render(options) {
  var scrollSnapshot = options && options.preserveScroll ? captureScrollState() : null;
  if (!getTask(state.currentId) || isLinkTask(getTask(state.currentId))) state.currentId = state.rootId;
  buildBreadcrumbs();
  renderStats();
  els.board.innerHTML = '';
  var columns = columnIds();
  els.board.style.setProperty('--columns-count', String(columns.length));
  columns.forEach(function(statusId) {
    els.board.appendChild(renderColumn(statusId));
  });
  restoreScrollState(scrollSnapshot);
  scrollToHighlightedCard();
}
