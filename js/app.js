'use strict';

/* ==================== Search Actions ==================== */

function revealTaskFromSearch(taskId) {
  var t = getTask(taskId);
  if (!t || isRoot(taskId)) return;
  highlightId = taskId;
  hideSearchResults();
  if (els.searchInput) els.searchInput.blur();
  logicNavigateToTask(t.parentId || state.rootId);
  render();
}

function canCreateLinkTo(targetId) {
  var target = getTask(targetId);
  var current = getTask(state.currentId);
  if (!target || !current) return false;
  if (isRoot(targetId) || isLinkTask(target)) return false;
  if (targetId === state.currentId) return false;
  return !current.children.some(function(childId) { return realId(childId) === targetId; });
}

function addSearchLink(targetId) {
  if (!canCreateLinkTo(targetId)) {
    alert('Сюда уже нельзя добавить такую ссылку: задача либо уже есть на этой доске, либо это текущая открытая задача.');
    return;
  }
  var link = logicCreateLinkTask(targetId, state.currentId);
  highlightId = link.id;
  hideSearchResults();
  if (els.searchInput) els.searchInput.blur();
  render({ preserveScroll: true });
}

/* ==================== Task Actions ==================== */

function addTaskFromInputs() {
  var title = els.titleInput.value.trim();
  var description = els.descInput.value.trim();
  if (!title) return;
  logicCreateTask(title, description, state.currentId);
  els.titleInput.value = '';
  els.descInput.value = '';
  render();
  els.titleInput.focus();
}

function addLinkTaskFromPrompt() {
  var query = prompt('Введи часть названия задачи, на которую нужна ссылка:');
  if (query === null) return;
  var q = query.trim().toLowerCase();
  if (!q) return;
  var matches = Object.values(state.tasks).filter(function(t) {
    return t && !isRoot(t.id) && !isLinkTask(t) && t.id !== state.currentId;
  }).filter(function(t) {
    return safeText(t.title).toLowerCase().indexOf(q) >= 0 || safeText(t.description).toLowerCase().indexOf(q) >= 0;
  }).slice(0, 12);
  if (!matches.length) {
    alert('Не нашла задач по такому запросу. Попробуй другое слово из названия.');
    return;
  }
  var sep = String.fromCharCode(10);
  var list = matches.map(function(t, i) { return String(i + 1) + '. ' + taskPath(t.id); }).join(sep);
  var chosen = prompt('Выбери номер задачи для ссылки:' + sep + sep + list);
  if (chosen === null) return;
  var idx = Number(chosen.trim()) - 1;
  if (!Number.isInteger(idx) || !matches[idx]) {
    alert('Неверный номер.');
    return;
  }
  logicCreateLinkTask(matches[idx].id, state.currentId);
  render();
}

function deleteItem(itemId) {
  var t = getTask(itemId);
  if (!t || isRoot(itemId)) return;
  var label = isLinkTask(t)
    ? 'Удалить эту ссылку? Оригинальная задача останется.'
    : 'Удалить задачу вместе со всеми вложенными задачами и ссылками на неё?';
  if (!confirm(label)) return;
  logicDeleteTaskTree(itemId, {});
  recalcAll(true);
  render();
}

function editItem(itemId) {
  var id = realId(itemId);
  var t = getTask(id);
  if (!t || isRoot(id)) return;
  var title = prompt('Название задачи:', t.title || '');
  if (title === null) return;
  title = title.trim();
  if (!title) return;
  var desc = prompt('Описание:', t.description || '');
  if (desc === null) return;
  logicEditItem(itemId, title, desc);
  render();
}

function editColumn(statusId) {
  var col = columnById(statusId);
  if (!col) return;
  var title = prompt('Название столбца:', col.title || '');
  if (title === null) return;
  title = title.trim();
  if (!title) return;
  var color = prompt('Цвет индикатора в формате #RRGGBB:', col.color || '#7c9cff');
  if (color === null) return;
  logicEditColumn(statusId, title, color);
  render({ preserveScroll: true });
}

function deleteColumn(statusId) {
  var col = columnById(statusId);
  if (!col || col.locked) return;
  var fallback = activeStatusId();
  if (!confirm('Удалить столбец «' + col.title + '»? Задачи из него будут перенесены в «' + columnTitle(fallback) + '».')) return;
  logicDeleteColumn(statusId);
  render({ preserveScroll: true });
}

/* ==================== Column Actions ==================== */

function addColumn() {
  var title = prompt('Название нового столбца:', 'Новый этап');
  if (title === null) return;
  title = title.trim();
  if (!title) return;
  var color = prompt('Цвет индикатора в формате #RRGGBB:', '#b99cff');
  if (color === null) return;
  logicAddColumn(title, color);
  render({ preserveScroll: true });
}

/* ==================== Navigation ==================== */

function appNavigateToTask(id) {
  logicNavigateToTask(id);
  render();
}

/* ==================== Export / Import / Reset ==================== */

function exportState() {
  recalcAll(false);
  var data = JSON.stringify(state, null, 2);
  var blob = new Blob([data], { type: 'application/json;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'recursive-kanban-board.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}

function importStateFromFile(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function() {
    try {
      var parsed = JSON.parse(String(reader.result));
      state = normalizeState(parsed);
      persist();
      render();
      alert('Импортировано.');
    } catch (err) {
      alert('Не удалось импортировать JSON: ' + (err && err.message ? err.message : err));
    }
  };
  reader.readAsText(file);
}

function resetDemo() {
  if (!confirm('Сбросить текущую доску и открыть демо? Экспортируй данные заранее, если они нужны.')) return;
  state = createDemoState();
  recalcAll(true);
  render();
}

/* ==================== UI Binding ==================== */

function bindUi() {
  els.stats = document.getElementById('stats');
  els.searchWrap = document.getElementById('searchWrap');
  els.searchInput = document.getElementById('searchInput');
  els.searchResults = document.getElementById('searchResults');
  els.menuBtn = document.getElementById('menuBtn');
  els.menu = document.getElementById('menu');
  els.crumbs = document.getElementById('crumbs');
  els.board = document.getElementById('board');
  els.titleInput = document.getElementById('titleInput');
  els.descInput = document.getElementById('descInput');
  els.addBtn = document.getElementById('addBtn');
  els.exportBtn = document.getElementById('exportBtn');
  els.importBtn = document.getElementById('importBtn');
  els.addColumnBtn = document.getElementById('addColumnBtn');
  els.resetBtn = document.getElementById('resetBtn');
  els.fileInput = document.getElementById('fileInput');

  els.menuBtn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    els.menu.classList.toggle('open');
  });
  document.addEventListener('click', function() { els.menu.classList.remove('open'); hideSearchResults(); });
  els.menu.addEventListener('click', function(ev) { ev.stopPropagation(); });

  els.searchWrap.addEventListener('click', function(ev) { ev.stopPropagation(); });
  els.searchInput.addEventListener('input', renderSearchResults);
  els.searchInput.addEventListener('focus', renderSearchResults);
  els.searchInput.addEventListener('keydown', function(ev) {
    if (ev.key === 'Escape') { hideSearchResults(); els.searchInput.blur(); }
    if (ev.key === 'Enter') {
      var first = searchMatches(els.searchInput.value)[0];
      if (first) revealTaskFromSearch(first.id);
    }
  });

  els.addBtn.addEventListener('click', addTaskFromInputs);
  els.titleInput.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') addTaskFromInputs(); });
  els.descInput.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') addTaskFromInputs(); });
  els.exportBtn.addEventListener('click', exportState);
  els.importBtn.addEventListener('click', function() { els.fileInput.click(); });
  els.addColumnBtn.addEventListener('click', addColumn);
  els.fileInput.addEventListener('change', function(ev) {
    importStateFromFile(ev.target.files[0]);
    ev.target.value = '';
  });
  els.resetBtn.addEventListener('click', resetDemo);
}

/* ==================== Init ==================== */

document.addEventListener('DOMContentLoaded', function() {
  bindUi();
  loadState();
  var urlTaskId = taskIdFromLocation();
  if (urlTaskId && getTask(urlTaskId) && !isLinkTask(getTask(urlTaskId))) {
    state.currentId = urlTaskId;
    persist();
  }
  updateBrowserHistory('replace');
  render();

  window.addEventListener('popstate', function(ev) {
    var id = ev.state && ev.state.currentId ? ev.state.currentId : taskIdFromLocation();
    state.currentId = validBoardId(id);
    persist();
    render();
  });
});
