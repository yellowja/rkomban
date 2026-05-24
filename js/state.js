'use strict';

/* ==================== Constants ==================== */

var STORAGE_KEY = 'recursive-kanban-board-v3';
var LEGACY_STORAGE_KEY = 'recursive-kanban-board-v2';
var DEFAULT_COLUMNS = [
  { id: 'planned', title: 'Запланировано', color: '#7ea1ff', locked: true },
  { id: 'in_progress', title: 'В процессе', color: '#ffbf69', locked: true },
  { id: 'done', title: 'Сделано', color: '#77e4a1', locked: true }
];
var CORE_COLUMN_IDS = ['planned', 'in_progress', 'done'];

/* ==================== State ==================== */

var state = null;
var els = {};
var draggingId = null;
var suppressNextClick = false;
var highlightId = null;

/* ==================== Pure Helpers ==================== */

function safeText(value) {
  return value === undefined || value === null ? '' : String(value);
}

function now() { return Date.now(); }

function uid() {
  state.nextId = (state.nextId || 1) + 1;
  return 'task_' + state.nextId;
}

function validateColor(value, fallback) {
  var color = safeText(value).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return fallback || '#7c9cff';
}

function normalizeColumnId(value) {
  return safeText(value).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

function cloneDefaultColumns() {
  return DEFAULT_COLUMNS.map(function(col) {
    return { id: col.id, title: col.title, color: col.color, locked: !!col.locked };
  });
}

/* ==================== Column Helpers ==================== */

function normalizeColumns(input) {
  var defaults = cloneDefaultColumns();
  if (!Array.isArray(input)) return defaults;

  var byId = {};
  input.forEach(function(raw) {
    if (!raw || typeof raw !== 'object') return;
    var id = normalizeColumnId(raw.id);
    if (!id) return;
    byId[id] = raw;
  });

  var result = defaults.map(function(base) {
    var raw = byId[base.id] || {};
    return {
      id: base.id,
      title: safeText(raw.title || base.title).trim() || base.title,
      color: validateColor(raw.color, base.color),
      locked: true
    };
  });

  var custom = [];
  var seen = { planned: true, in_progress: true, done: true };
  input.forEach(function(raw) {
    if (!raw || typeof raw !== 'object') return;
    var id = normalizeColumnId(raw.id);
    if (!id || seen[id] || CORE_COLUMN_IDS.indexOf(id) >= 0) return;
    seen[id] = true;
    custom.push({
      id: id,
      title: safeText(raw.title || 'Новый этап').trim() || 'Новый этап',
      color: validateColor(raw.color, '#b99cff'),
      locked: false
    });
  });

  return [result[0], result[1]].concat(custom, [result[2]]);
}

function columnById(id) {
  var cols = state && Array.isArray(state.columns) ? state.columns : DEFAULT_COLUMNS;
  return cols.find(function(col) { return col.id === id; }) || null;
}

function columnTitle(id) {
  var col = columnById(id);
  return col ? col.title : id;
}

function columnIds() {
  var cols = state && Array.isArray(state.columns) ? state.columns : DEFAULT_COLUMNS;
  return cols.map(function(col) { return col.id; });
}

function plannedStatusId()  { return 'planned'; }
function activeStatusId()   { return 'in_progress'; }
function doneStatusId()     { return 'done'; }

function isKnownStatus(status) {
  return columnIds().indexOf(status) >= 0;
}

/* ==================== Task Helpers ==================== */

function isRoot(id)          { return id === state.rootId; }
function isLinkTask(task)    { return !!(task && task.type === 'link' && task.targetId); }
function getTask(id)         { return state.tasks[id] || null; }
function realId(id)          { var t = getTask(id); return isLinkTask(t) ? t.targetId : id; }
function realTask(id)        { return getTask(realId(id)); }

function taskHash(id) {
  return '#task=' + encodeURIComponent(id || 'root');
}

function taskIdFromLocation() {
  var hash = window.location.hash || '';
  var match = hash.match(/^#task=(.+)$/);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch (err) { return null; }
}

function validBoardId(id) {
  var t = id ? getTask(id) : null;
  if (!t || isLinkTask(t)) return state ? state.rootId : 'root';
  return t.id;
}

/* ==================== Computed Status ==================== */

function effectiveStatus(itemId) {
  var t = getTask(itemId);
  if (!t) return 'planned';
  if (isLinkTask(t)) {
    var target = getTask(t.targetId);
    return target ? target.status : 'planned';
  }
  return isKnownStatus(t.status) ? t.status : plannedStatusId();
}

function effectiveTitle(itemId) {
  var t = getTask(itemId);
  if (!t) return 'Удалённая задача';
  if (isLinkTask(t)) {
    var target = getTask(t.targetId);
    return target ? target.title : 'Удалённая ссылка';
  }
  return t.title;
}

function effectiveDescription(itemId) {
  var t = getTask(itemId);
  if (!t) return '';
  if (isLinkTask(t)) {
    var target = getTask(t.targetId);
    return target ? target.description : '';
  }
  return t.description || '';
}

function effectiveChildrenCount(itemId) {
  var t = realTask(itemId);
  return t && Array.isArray(t.children) ? t.children.length : 0;
}

function doneChildrenCount(itemId) {
  var t = realTask(itemId);
  if (!t || !Array.isArray(t.children)) return 0;
  return t.children.filter(function(childId) { return effectiveStatus(childId) === 'done'; }).length;
}

/* ==================== State Management ==================== */

function createDemoState() {
  var s = {
    rootId: 'root',
    currentId: 'root',
    nextId: 8,
    nextColumnId: 1,
    columns: cloneDefaultColumns(),
    tasks: {
      root: {
        id: 'root', parentId: null, title: 'Демо-доска', description: 'Пример рекурсивной канбан-доски. Кликни по карточке, чтобы открыть вложенную доску.',
        status: 'planned', manualDone: false, manualInProgress: false,
        children: ['task_1', 'task_4', 'task_6'], createdAt: now(), updatedAt: now()
      },
      task_1: {
        id: 'task_1', parentId: 'root', title: 'Пример: подготовка к отпуску',
        description: 'Кликни, чтобы открыть вложенную доску с подзадачами. Работает рекурсивно — внутри каждой задачи может быть своя доска.',
        status: 'in_progress', manualDone: false, manualInProgress: true,
        children: ['task_2', 'task_3'], createdAt: now(), updatedAt: now()
      },
      task_2: {
        id: 'task_2', parentId: 'task_1', title: 'Пример: купить билеты', description: 'Перетащи меня в колонку «Сделано», чтобы увидеть, как меняется статус родительской задачи',
        status: 'done', manualDone: true, manualInProgress: false,
        children: [], createdAt: now(), updatedAt: now()
      },
      task_3: {
        id: 'task_3', parentId: 'task_1', title: 'Пример: забронировать отель', description: '',
        status: 'planned', manualDone: false, manualInProgress: false,
        children: [], createdAt: now(), updatedAt: now()
      },
      task_4: {
        id: 'task_4', parentId: 'root', title: 'Пример: изучить React',
        description: 'Задача со вложенностью. Когда все подзадачи сделаны, родитель не становится «Сделано» автоматически — это особенность логики проекта.',
        status: 'in_progress', manualDone: false, manualInProgress: true,
        children: ['task_5'], createdAt: now(), updatedAt: now()
      },
      task_5: {
        id: 'task_5', parentId: 'task_4', title: 'Пример: пройти туториал', description: '',
        status: 'in_progress', manualDone: false, manualInProgress: true,
        children: [], createdAt: now(), updatedAt: now()
      },
      task_6: {
        id: 'task_6', parentId: 'root', title: 'Пример: ссылка на задачу', description: 'Найди задачу через поиск (справа вверху) и нажми «+ ссылка» — она появится и здесь, и в оригинальном месте.',
        status: 'planned', manualDone: false, manualInProgress: false,
        children: ['task_7'], createdAt: now(), updatedAt: now()
      },
      task_7: {
        id: 'task_7', parentId: 'task_6', title: 'Пример: заметки', description: '',
        status: 'planned', manualDone: false, manualInProgress: false,
        children: [], createdAt: now(), updatedAt: now()
      }
    }
  };
  return s;
}

function normalizeState(input) {
  var fallback = createDemoState();
  if (!input || typeof input !== 'object' || !input.tasks || typeof input.tasks !== 'object') return fallback;

  var s = {
    rootId: input.rootId || 'root',
    currentId: input.currentId || input.rootId || 'root',
    nextId: Number(input.nextId || 1),
    nextColumnId: Number(input.nextColumnId || 1),
    columns: normalizeColumns(input.columns),
    tasks: input.tasks
  };

  var maxColumnNumber = 0;
  s.columns.forEach(function(col) {
    var match = safeText(col.id).match(/^custom_(\d+)$/);
    if (match) maxColumnNumber = Math.max(maxColumnNumber, Number(match[1]));
  });
  s.nextColumnId = Math.max(1, s.nextColumnId, maxColumnNumber + 1);
  var validStatuses = s.columns.map(function(col) { return col.id; });

  if (!s.tasks[s.rootId]) {
    s.tasks[s.rootId] = fallback.tasks.root;
  }

  Object.keys(s.tasks).forEach(function(id) {
    var t = s.tasks[id];
    if (!t || typeof t !== 'object') {
      delete s.tasks[id];
      return;
    }
    t.id = t.id || id;
    if (!Array.isArray(t.children)) t.children = [];
    t.children = t.children.filter(function(childId) { return !!s.tasks[childId]; });
    t.title = safeText(t.title || (isLinkTask(t) ? 'Ссылка' : 'Без названия'));
    t.description = safeText(t.description);
    t.status = validStatuses.indexOf(t.status) >= 0 ? t.status : 'planned';
    t.manualDone = !!t.manualDone;
    t.manualInProgress = !!t.manualInProgress;
    t.manualStatus = validStatuses.indexOf(t.manualStatus) >= 0 && t.manualStatus !== 'done' ? t.manualStatus : (t.manualInProgress ? 'in_progress' : null);
    t.createdAt = t.createdAt || now();
    t.updatedAt = t.updatedAt || now();
    if (isLinkTask(t) && !s.tasks[t.targetId]) delete s.tasks[id];
  });

  Object.keys(s.tasks).forEach(function(id) {
    var t = s.tasks[id];
    if (!t) return;
    t.children = t.children.filter(function(childId) { return !!s.tasks[childId] && childId !== id; });
    if (id !== s.rootId && !t.parentId) t.parentId = s.rootId;
  });

  Object.keys(s.tasks).forEach(function(id) {
    var t = s.tasks[id];
    if (id === s.rootId || !t || !t.parentId || !s.tasks[t.parentId]) return;
    var parent = s.tasks[t.parentId];
    if (parent.children.indexOf(id) < 0) parent.children.push(id);
  });

  state = s;
  if (!getTask(state.currentId) || isLinkTask(getTask(state.currentId))) state.currentId = state.rootId;
  recalcAll(false);
  return state;
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw));
  } catch (err) {
    console.warn('Не удалось загрузить localStorage:', err);
  }
  state = createDemoState();
  recalcAll(false);
  return state;
}

function persist() {
  if (!state) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ==================== Recalculation ==================== */

function allRealTaskIds() {
  return Object.keys(state.tasks).filter(function(id) { return !isLinkTask(state.tasks[id]); });
}

function recalcOne(task) {
  if (!task || isLinkTask(task) || isRoot(task.id)) {
    if (!task || isLinkTask(task)) return false;
  }

  if (task.manualDone) {
    if (task.status !== doneStatusId()) { task.status = doneStatusId(); task.updatedAt = now(); return true; }
    return false;
  }

  if (!Array.isArray(task.children) || task.children.length === 0) return false;

  var desired = plannedStatusId();
  if (task.manualStatus && isKnownStatus(task.manualStatus) && task.manualStatus !== doneStatusId()) {
    desired = task.manualStatus;
  } else if (task.manualInProgress) {
    desired = activeStatusId();
  }

  var hasActiveChild = task.children.some(function(childId) { return effectiveStatus(childId) !== plannedStatusId(); });
  if (hasActiveChild && desired === plannedStatusId()) desired = activeStatusId();

  if (task.status !== desired) {
    task.status = desired;
    task.updatedAt = now();
    return true;
  }
  return false;
}

function recalcAll(shouldPersist) {
  var changed = false;
  for (var pass = 0; pass < 50; pass += 1) {
    var changedThisPass = false;
    allRealTaskIds().forEach(function(id) {
      if (recalcOne(getTask(id))) changedThisPass = true;
    });
    changed = changed || changedThisPass;
    if (!changedThisPass) break;
  }
  if (shouldPersist !== false) persist();
  return changed;
}

/* ==================== Task Path ==================== */

function taskPath(id) {
  var path = [];
  var current = getTask(id);
  var guard = 0;
  while (current && guard < 200) {
    path.unshift(current.title || 'Без названия');
    if (!current.parentId) break;
    current = getTask(current.parentId);
    guard += 1;
  }
  return path.join(' / ');
}
