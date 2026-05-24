'use strict';

/* ==================== History / Navigation ==================== */

function updateBrowserHistory(mode) {
  if (!window.history || !state) return;
  var id = validBoardId(state.currentId);
  var url = taskHash(id);
  var payload = { currentId: id };
  if (mode === 'replace') {
    window.history.replaceState(payload, '', url);
  } else if (window.location.hash !== url) {
    window.history.pushState(payload, '', url);
  } else {
    window.history.replaceState(payload, '', url);
  }
}

function logicNavigateToTask(id, options) {
  options = options || {};
  state.currentId = validBoardId(id);
  persist();
  if (!options.fromPop) updateBrowserHistory(options.replace ? 'replace' : 'push');
}

function logicOpenTask(itemId) {
  var id = realId(itemId);
  var t = getTask(id);
  if (!t || isLinkTask(t)) return;
  logicNavigateToTask(id);
}

/* ==================== Column Mutations ==================== */

function nextCustomColumnId() {
  state.nextColumnId = Math.max(1, Number(state.nextColumnId || 1));
  var id;
  do {
    id = 'custom_' + state.nextColumnId;
    state.nextColumnId += 1;
  } while (columnById(id));
  return id;
}

function logicAddColumn(title, color) {
  var doneIndex = state.columns.findIndex(function(col) { return col.id === doneStatusId(); });
  if (doneIndex < 0) doneIndex = state.columns.length;
  state.columns.splice(doneIndex, 0, {
    id: nextCustomColumnId(),
    title: title,
    color: validateColor(color, '#b99cff'),
    locked: false
  });
  persist();
}

function logicEditColumn(statusId, title, color) {
  var col = columnById(statusId);
  if (!col) return;
  col.title = title;
  col.color = validateColor(color, col.color || '#7c9cff');
  persist();
}

function logicDeleteColumn(statusId) {
  var col = columnById(statusId);
  if (!col || col.locked) return;
  var fallback = activeStatusId();
  Object.values(state.tasks).forEach(function(t) {
    if (t && t.status === statusId) {
      t.status = fallback;
      if (t.manualStatus === statusId) t.manualStatus = fallback;
      t.updatedAt = now();
    }
  });
  state.columns = state.columns.filter(function(c) { return c.id !== statusId; });
  recalcAll(true);
}

/* ==================== Status Mutations ==================== */

function markDoneRecursive(id, visited) {
  visited = visited || {};
  var targetId = realId(id);
  if (visited[targetId]) return;
  visited[targetId] = true;
  var t = getTask(targetId);
  if (!t || isLinkTask(t)) return;
  t.status = doneStatusId();
  t.manualDone = true;
  t.manualInProgress = false;
  t.manualStatus = null;
  t.updatedAt = now();
  t.children.forEach(function(childId) { markDoneRecursive(childId, visited); });
}

function applyItemStatus(itemId, status) {
  var id = realId(itemId);
  var t = getTask(id);
  if (!t || isLinkTask(t) || isRoot(id)) return;
  status = isKnownStatus(status) ? status : plannedStatusId();
  if (status === doneStatusId()) {
    markDoneRecursive(id, {});
  } else {
    t.status = status;
    t.manualDone = false;
    t.manualInProgress = status !== plannedStatusId();
    t.manualStatus = status !== plannedStatusId() ? status : null;
    t.updatedAt = now();
  }
}

/* ==================== Task CRUD ==================== */

function logicCreateTask(title, description, parentId) {
  var id = uid();
  state.tasks[id] = {
    id: id,
    parentId: parentId,
    title: title,
    description: description || '',
    status: 'planned',
    manualDone: false,
    manualInProgress: false,
    manualStatus: null,
    children: [],
    createdAt: now(),
    updatedAt: now()
  };
  getTask(parentId).children.push(id);
  recalcAll(true);
  return state.tasks[id];
}

function logicCreateLinkTask(targetId, parentId) {
  if (!getTask(targetId) || isLinkTask(getTask(targetId))) throw new Error('Можно ссылаться только на обычную задачу.');
  if (targetId === state.rootId) throw new Error('На корневую доску ссылку создавать нельзя.');
  var id = uid();
  state.tasks[id] = {
    id: id,
    type: 'link',
    targetId: targetId,
    parentId: parentId,
    title: '',
    description: '',
    status: 'planned',
    manualDone: false,
    manualInProgress: false,
    manualStatus: null,
    children: [],
    createdAt: now(),
    updatedAt: now()
  };
  getTask(parentId).children.push(id);
  recalcAll(true);
  return state.tasks[id];
}

function logicDeleteTaskTree(itemId, visited) {
  visited = visited || {};
  var t = getTask(itemId);
  if (!t || visited[itemId] || isRoot(itemId)) return;
  visited[itemId] = true;
  if (isLinkTask(t)) {
    removeFromParent(itemId);
    delete state.tasks[itemId];
    return;
  }
  var children = t.children.slice();
  children.forEach(function(childId) { logicDeleteTaskTree(childId, visited); });
  Object.keys(state.tasks).forEach(function(id) {
    var other = state.tasks[id];
    if (isLinkTask(other) && other.targetId === itemId) {
      removeFromParent(id);
      delete state.tasks[id];
    }
  });
  removeFromParent(itemId);
  delete state.tasks[itemId];
  if (state.currentId === itemId) state.currentId = state.rootId;
}

function logicEditItem(itemId, title, description) {
  var id = realId(itemId);
  var t = getTask(id);
  if (!t || isRoot(id)) return;
  t.title = title;
  t.description = description;
  t.updatedAt = now();
  persist();
}

/* ==================== Task Moves ==================== */

function removeFromParent(itemId) {
  var t = getTask(itemId);
  if (!t || !t.parentId || !getTask(t.parentId)) return;
  var parent = getTask(t.parentId);
  parent.children = parent.children.filter(function(id) { return id !== itemId; });
  parent.updatedAt = now();
}

function insertIntoParent(itemId, parentId, index) {
  var item = getTask(itemId);
  var parent = getTask(parentId);
  if (!item || !parent || itemId === state.rootId) return false;
  removeFromParent(itemId);
  item.parentId = parentId;
  if (!Number.isFinite(index)) index = parent.children.length;
  index = Math.max(0, Math.min(index, parent.children.length));
  parent.children.splice(index, 0, itemId);
  item.updatedAt = now();
  parent.updatedAt = now();
  return true;
}

function attachToParent(itemId, parentId) {
  return insertIntoParent(itemId, parentId,
    getTask(parentId) ? getTask(parentId).children.length : 0);
}

function isAncestor(ancestorId, maybeChildId) {
  var current = getTask(maybeChildId);
  while (current && current.parentId) {
    if (current.parentId === ancestorId) return true;
    current = getTask(current.parentId);
  }
  return false;
}

function canMoveInside(itemId, targetContainerId) {
  if (!itemId || !targetContainerId || itemId === targetContainerId) return false;
  if (isRoot(itemId)) return false;
  var item = getTask(itemId);
  var target = getTask(targetContainerId);
  if (!item || !target || isLinkTask(target)) return false;
  if (!isLinkTask(item) && isAncestor(itemId, targetContainerId)) return false;
  return true;
}

function canMoveToContainer(itemId, targetContainerId) {
  return canMoveInside(itemId, targetContainerId);
}

function insertIntoContainerByStatus(itemId, targetContainerId, status) {
  var item = getTask(itemId);
  var target = getTask(targetContainerId);
  if (!item || !target || isRoot(itemId)) return false;
  removeFromParent(itemId);
  item.parentId = targetContainerId;
  var index = target.children.length;
  var lastSameStatusIndex = -1;
  target.children.forEach(function(childId, childIndex) {
    if (effectiveStatus(childId) === status) lastSameStatusIndex = childIndex;
  });
  if (lastSameStatusIndex >= 0) index = lastSameStatusIndex + 1;
  target.children.splice(index, 0, itemId);
  item.updatedAt = now();
  target.updatedAt = now();
  return true;
}

function logicMoveToContainer(itemId, targetContainerId) {
  if (!canMoveToContainer(itemId, targetContainerId)) return;
  var status = effectiveStatus(itemId);
  if (insertIntoContainerByStatus(itemId, targetContainerId, status)) {
    recalcAll(true);
  }
}

function logicMoveToColumn(itemId, status, referenceId, placement) {
  var item = getTask(itemId);
  var parent = getTask(state.currentId);
  if (!item || !parent || isRoot(itemId)) return;
  if (referenceId && referenceId === itemId) return;
  applyItemStatus(itemId, status);
  removeFromParent(itemId);
  item.parentId = state.currentId;
  var index = parent.children.length;
  if (referenceId && parent.children.indexOf(referenceId) >= 0) {
    var refIndex = parent.children.indexOf(referenceId);
    index = placement === 'after' ? refIndex + 1 : refIndex;
  } else {
    var lastSameStatusIndex = -1;
    parent.children.forEach(function(childId, childIndex) {
      if (effectiveStatus(childId) === status) lastSameStatusIndex = childIndex;
    });
    index = lastSameStatusIndex >= 0 ? lastSameStatusIndex + 1 : parent.children.length;
  }
  parent.children.splice(index, 0, itemId);
  item.updatedAt = now();
  parent.updatedAt = now();
  recalcAll(true);
}

function logicMoveInside(itemId, targetItemId) {
  var targetContainerId = realId(targetItemId);
  if (!canMoveInside(itemId, targetContainerId)) return;
  applyItemStatus(itemId, 'planned');
  attachToParent(itemId, targetContainerId);
  recalcAll(true);
}
