let currentTab = 'aliases';
let editingAliasId = null;
let editingGroupId = null;
let llmConfigured = false;
let deleteCallback = null;
let aliasNames = [];
let isProcessing = false;
let aliasFormModified = false;

document.addEventListener('DOMContentLoaded', function() {
    loadAliases();
    loadGroups();
    checkLLMConfig();
    
    const editor = document.getElementById('sql-editor');
    editor.addEventListener('input', handleEditorInput);
    editor.addEventListener('keydown', handleEditorKeyDown);
    editor.addEventListener('scroll', handleEditorScroll);
    
    // 别名 SQL 输入框自动解析列名和依赖表
    const aliasSqlInput = document.getElementById('alias-sql');
    if (aliasSqlInput) {
        aliasSqlInput.addEventListener('input', autoFillAliasColumns);
        aliasSqlInput.addEventListener('blur', parseAliasSQLOnBlur);
    }
    
    // 搜索框回车键触发搜索
    const aliasSearchInput = document.getElementById('alias-search-input');
    if (aliasSearchInput) {
        aliasSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchAliases();
            }
        });
    }
    
    const tableSearchInput = document.getElementById('table-search-input');
    if (tableSearchInput) {
        tableSearchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                searchTables();
            }
        });
    }
    
    // 监听列名和依赖表的手动修改 - 标记被修改的行
    document.addEventListener('input', function(e) {
        const target = e.target;
        if (target.classList.contains('column-name') || 
            target.classList.contains('column-type') || 
            target.classList.contains('column-comment')) {
            const row = target.closest('.column-row');
            if (row) {
                row.dataset.modified = 'true';
            }
        } else if (target.classList.contains('dependency-name') || 
                   target.classList.contains('dependency-desc')) {
            const row = target.closest('.dependency-row');
            if (row) {
                row.dataset.modified = 'true';
            }
        }
    });
    
    // 绑定按钮事件（使用 addEventListener 替代内联 onclick）
    bindButtonEvents();
    
    initResizer();
});

function bindButtonEvents() {
    const optimizeBtn = document.querySelector('button[onclick="optimizeSQL()"]');
    const resolveBtn = document.querySelector('button[onclick="resolveSQL()"]');
    const formatBtn = document.querySelector('button[onclick="formatSQL()"]');
    const saveAliasBtn = document.querySelector('button[onclick="saveSQLAsAlias()"]');
    
    // 结果区域的按钮
    const formatResultBtn = document.querySelector('button[onclick="formatResultSQL()"]');
    const clearBtn = document.querySelector('button[onclick="clearResult()"]');
    const copyBtn = document.querySelector('button[onclick="copyResult()"]');
    const llmOptimizeResultBtn = document.querySelector('button[onclick="llmOptimizeResultSQL()"]');
    
    if (optimizeBtn) {
        optimizeBtn.removeAttribute('onclick');
        optimizeBtn.addEventListener('click', optimizeSQL);
    }
    if (resolveBtn) {
        resolveBtn.removeAttribute('onclick');
        resolveBtn.addEventListener('click', resolveSQL);
    }
    if (formatBtn) {
        formatBtn.removeAttribute('onclick');
        formatBtn.addEventListener('click', formatSQL);
    }
    if (saveAliasBtn) {
        saveAliasBtn.removeAttribute('onclick');
        saveAliasBtn.addEventListener('click', saveSQLAsAlias);
    }
    
    // 绑定结果区域的按钮
    if (formatResultBtn) {
        formatResultBtn.removeAttribute('onclick');
        formatResultBtn.addEventListener('click', formatResultSQL);
    }
    if (clearBtn) {
        clearBtn.removeAttribute('onclick');
        clearBtn.addEventListener('click', clearResult);
    }
    if (copyBtn) {
        copyBtn.removeAttribute('onclick');
        copyBtn.addEventListener('click', copyResult);
    }
    if (llmOptimizeResultBtn) {
        llmOptimizeResultBtn.removeAttribute('onclick');
        llmOptimizeResultBtn.addEventListener('click', llmOptimizeResultSQL);
    }
}

async function updateAliasNames() {
    const response = await fetch('/api/aliases');
    const result = await response.json();
    if (result.success) {
        aliasNames = result.data.map(a => a.alias_name);
    }
}

function ensureAliasSuffix(sql) {
    return sql;
}

function highlightAliasesInEditor() {
    const editor = document.getElementById('sql-editor');
    const indicator = document.getElementById('alias-indicator');
    const text = editor.value;
    
    if (!text || !aliasNames.length) {
        indicator.textContent = '未识别到别名（别名需以_结尾）';
        indicator.style.color = 'gray';
        return;
    }
    
    const foundAliases = [];
    for (const alias of aliasNames) {
        const pattern = new RegExp(`\\b${alias}_\\b`, 'gi');
        if (pattern.test(text)) {
            foundAliases.push(alias + '_');
        }
    }
    
    if (foundAliases.length > 0) {
        indicator.textContent = `识别到别名: ${foundAliases.join(', ')}`;
        indicator.style.color = 'red';
    } else {
        indicator.textContent = '未识别到别名（别名需以_结尾）';
        indicator.style.color = 'gray';
    }
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    const editorContainer = document.querySelector('.editor-container');
    const resultArea = document.querySelector('.result-area');
    const editorArea = document.querySelector('.editor-area');
    
    let startY = 0;
    let startHeight = 0;
    
    resizer.addEventListener('dragstart', (e) => {
        startY = e.clientY;
        startHeight = editorContainer.offsetHeight;
        resizer.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });
    
    resizer.addEventListener('dragend', () => {
        resizer.classList.remove('dragging');
    });
    
    resizer.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    
    resizer.addEventListener('drop', (e) => {
        e.preventDefault();
        const deltaY = startY - e.clientY;
        const newEditorHeight = startHeight + deltaY;
        const minHeight = 150;
        const maxHeight = editorArea.offsetHeight - 150;
        
        if (newEditorHeight >= minHeight && newEditorHeight <= maxHeight) {
            editorContainer.style.height = newEditorHeight + 'px';
            resultArea.style.height = 'calc(100% - ' + newEditorHeight + 'px - 6px)';
        }
    });
}

function updateResultLineNumbers(text) {
    const lineNumbers = document.getElementById('result-line-numbers');
    const lines = text.split('\n').length;
    let numbers = '';
    for (let i = 1; i <= lines; i++) {
        numbers += i + '\n';
    }
    lineNumbers.textContent = numbers;
}

const resultContent = document.getElementById('result-content');
const resultLineNumbers = document.getElementById('result-line-numbers');
resultContent.addEventListener('scroll', () => {
    resultLineNumbers.scrollTop = resultContent.scrollTop;
});

resultContent.addEventListener('input', () => {
    const hasContent = resultContent.value.trim().length > 0;
    document.getElementById('format-result-btn').disabled = !hasContent;
    document.getElementById('llm-optimize-result-btn').disabled = !hasContent || !llmConfigured;
});

async function copyResult() {
    const resultContent = document.getElementById('result-content').value;
    if (!resultContent.trim()) {
        showToast('没有可复制的内容', 'error');
        return;
    }
    
    try {
        await navigator.clipboard.writeText(resultContent);
        const copyBtn = document.getElementById('copy-btn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ 已复制';
        copyBtn.style.background = '#4caf50';
        copyBtn.style.color = 'white';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '';
            copyBtn.style.color = '';
        }, 2000);
    } catch (err) {
        showToast('复制失败', 'error');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = sidebar.querySelector('.sidebar-toggle');
    sidebar.classList.toggle('collapsed');
    
    if (sidebar.classList.contains('collapsed')) {
        toggleBtn.textContent = '▶';
        toggleBtn.title = '展开菜单';
    } else {
        toggleBtn.textContent = '◀';
        toggleBtn.title = '收起菜单';
    }
}

function clearResult() {
    document.getElementById('result-content').value = '';
    document.getElementById('result-line-numbers').textContent = '';
    document.getElementById('analysis-container').innerHTML = '';
    document.getElementById('copy-btn').disabled = true;
}

function updateLineNumbers() {
    const editor = document.getElementById('sql-editor');
    const lineNumbers = document.getElementById('line-numbers');
    const lines = editor.value.split('\n').length;
    let numbers = '';
    for (let i = 1; i <= lines; i++) {
        numbers += i + '\n';
    }
    lineNumbers.textContent = numbers;
}

function handleEditorInput() {
    updateLineNumbers();
    
    const editor = document.getElementById('sql-editor');
    const cursorPos = editor.selectionStart;
    
    if (cursorPos > 0) {
        const lastChar = editor.value.charAt(cursorPos - 1);
        if (lastChar === '\n') {
            hideCompletions();
            return;
        }
    }
    
    triggerCompletion();
}

function handleEditorScroll() {
    const editor = document.getElementById('sql-editor');
    const lineNumbers = document.getElementById('line-numbers');
    lineNumbers.scrollTop = editor.scrollTop;
}

let completionTimeout = null;
let completionIndex = 0;

async function triggerCompletion() {
    if (completionTimeout) {
        clearTimeout(completionTimeout);
    }
    
    completionTimeout = setTimeout(async () => {
        const editor = document.getElementById('sql-editor');
        const cursorPos = editor.selectionStart;
        const sql = editor.value;
        
        const response = await fetch('/api/sql/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, cursor_position: cursorPos })
        });
        
        const result = await response.json();
        if (result.success && result.completions.length > 0) {
            showCompletions(result.completions, cursorPos);
        } else {
            hideCompletions();
        }
    }, 200);
}

function showCompletions(completions, cursorPos) {
    const editor = document.getElementById('sql-editor');
    const container = document.getElementById('completion-container');
    
    const rect = editor.getBoundingClientRect();
    const textBeforeCursor = editor.value.substring(0, cursorPos);
    const linesBefore = textBeforeCursor.split('\n');
    const currentLineNum = linesBefore.length;
    const currentColText = linesBefore[linesBefore.length - 1];
    
    const charWidth = 8.6;
    const lineHeight = 21;
    const paddingTop = 16;
    const paddingLeft = 65;
    
    const textWidth = currentColText.length * charWidth;
    
    const x = rect.left + paddingLeft + textWidth + 8;
    const y = rect.top + paddingTop + (currentLineNum - 1) * lineHeight + 5;
    
    let html = '<div class="completion-list">';
    completions.forEach((item, index) => {
        const displayText = item.display || item.value || item.text;
        const typeLabel = getTypeLabel(item.type);
        html += `
            <div class="completion-item ${index === 0 ? 'selected' : ''}" 
                 data-text="${escapeHtml(item.value || item.text)}">
                <span class="completion-text" title="${escapeHtml(displayText)}">${escapeHtml(displayText)}</span>
                <span class="completion-type">${typeLabel}</span>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
    container.style.position = 'fixed';
    container.style.left = x + 'px';
    container.style.top = y + 'px';
    container.style.zIndex = '1000';
    container.style.width = 'auto';
    
    const listRect = container.querySelector('.completion-list').getBoundingClientRect();
    if (listRect.right > window.innerWidth) {
        container.style.left = (window.innerWidth - listRect.width - 20) + 'px';
    }
    if (listRect.bottom > window.innerHeight) {
        container.style.top = (y - listRect.height - lineHeight - 10) + 'px';
    }
    
    completionIndex = 0;
}

function getTypeLabel(type) {
    const labels = {
        'keyword': '关键字',
        'function': '函数',
        'alias': '别名',
        'table': '表'
    };
    return labels[type] || type;
}

function hideCompletions() {
    const container = document.getElementById('completion-container');
    container.innerHTML = '';
}

function handleEditorKeyDown(e) {
    const container = document.getElementById('completion-container');
    const list = container.querySelector('.completion-list');
    
    if (!list) return;
    
    const items = list.querySelectorAll('.completion-item');
    if (items.length === 0) return;
    
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            items[completionIndex]?.classList.remove('selected');
            completionIndex = (completionIndex + 1) % items.length;
            items[completionIndex]?.classList.add('selected');
            break;
        case 'ArrowUp':
            e.preventDefault();
            items[completionIndex]?.classList.remove('selected');
            completionIndex = (completionIndex - 1 + items.length) % items.length;
            items[completionIndex]?.classList.add('selected');
            break;
        case 'Tab':
        case 'Enter':
            e.preventDefault();
            const selected = list.querySelector('.completion-item.selected') || items[0];
            if (selected) {
                insertCompletion(selected.dataset.text);
            }
            break;
        case 'Escape':
            hideCompletions();
            break;
    }
}

function insertCompletion(text) {
    const editor = document.getElementById('sql-editor');
    const cursorPos = editor.selectionStart;
    const textBeforeCursor = editor.value.substring(0, cursorPos);
    
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const lastParenIndex = textBeforeCursor.lastIndexOf('(');
    const lastBracketIndex = textBeforeCursor.lastIndexOf('[');
    const lastEqualIndex = textBeforeCursor.lastIndexOf('=');
    const lastCommaIndex = textBeforeCursor.lastIndexOf(',');
    const lastDotIndex = textBeforeCursor.lastIndexOf('.');
    const lastColonIndex = textBeforeCursor.lastIndexOf(':');
    const lastSemicolonIndex = textBeforeCursor.lastIndexOf(';');
    const lastGreaterIndex = textBeforeCursor.lastIndexOf('>');
    const lastLessIndex = textBeforeCursor.lastIndexOf('<');
    const lastPlusIndex = textBeforeCursor.lastIndexOf('+');
    const lastMinusIndex = textBeforeCursor.lastIndexOf('-');
    const lastStarIndex = textBeforeCursor.lastIndexOf('*');
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/');
    const lastPercentIndex = textBeforeCursor.lastIndexOf('%');
    const lastAmpersandIndex = textBeforeCursor.lastIndexOf('&');
    const lastPipeIndex = textBeforeCursor.lastIndexOf('|');
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    const lastHashIndex = textBeforeCursor.lastIndexOf('#');
    const lastDollarIndex = textBeforeCursor.lastIndexOf('$');
    const lastBacktickIndex = textBeforeCursor.lastIndexOf('`');
    const lastSingleQuoteIndex = textBeforeCursor.lastIndexOf("'");
    const lastDoubleQuoteIndex = textBeforeCursor.lastIndexOf('"');
    const lastBackslashIndex = textBeforeCursor.lastIndexOf('\\');
    const lastUnderscoreIndex = textBeforeCursor.lastIndexOf('_');
    const lastTildeIndex = textBeforeCursor.lastIndexOf('~');
    const lastCaretIndex = textBeforeCursor.lastIndexOf('^');
    const lastQuestionIndex = textBeforeCursor.lastIndexOf('?');
    const lastExclamationIndex = textBeforeCursor.lastIndexOf('!');
    const lastNewLineIndex = textBeforeCursor.lastIndexOf('\n');
    const lastCarriageReturnIndex = textBeforeCursor.lastIndexOf('\r');
    const lastTabIndex = textBeforeCursor.lastIndexOf('\t');
    const lastVerticalTabIndex = textBeforeCursor.lastIndexOf('\v');
    const lastFormFeedIndex = textBeforeCursor.lastIndexOf('\f');
    
    const lastIndex = Math.max(
        lastSpaceIndex, lastParenIndex, lastBracketIndex, lastEqualIndex,
        lastCommaIndex, lastDotIndex, lastColonIndex, lastSemicolonIndex,
        lastGreaterIndex, lastLessIndex, lastPlusIndex, lastMinusIndex,
        lastStarIndex, lastSlashIndex, lastPercentIndex, lastAmpersandIndex,
        lastPipeIndex, lastAtIndex, lastHashIndex, lastDollarIndex,
        lastBacktickIndex, lastSingleQuoteIndex, lastDoubleQuoteIndex,
        lastBackslashIndex, lastUnderscoreIndex, lastTildeIndex, lastCaretIndex,
        lastQuestionIndex, lastExclamationIndex, lastNewLineIndex,
        lastCarriageReturnIndex, lastTabIndex, lastVerticalTabIndex,
        lastFormFeedIndex
    );
    
    const newText = editor.value.substring(0, lastIndex + 1) + text + editor.value.substring(cursorPos);
    editor.value = newText;
    editor.selectionStart = editor.selectionEnd = lastIndex + 1 + text.length;
    editor.focus();
    hideCompletions();
}

async function loadAliases() {
    const response = await fetch('/api/aliases');
    const result = await response.json();
    if (result.success) {
        renderAliasList(result.data);
        aliasNames = result.data.map(a => a.alias_name);
    }
}

async function loadGroups() {
    const response = await fetch('/api/aliases/groups');
    const result = await response.json();
    if (result.success) {
        renderGroupList(result.data);
        populateGroupSelects(result.data);
    }
}

function populateGroupSelects(groups) {
    const aliasGroupSelect = document.getElementById('alias-group');
    const moveGroupSelect = document.getElementById('move-group-select');
    
    aliasGroupSelect.innerHTML = '<option value="">无分组</option>';
    moveGroupSelect.innerHTML = '<option value="">无分组</option>';
    
    groups.forEach(group => {
        const option1 = document.createElement('option');
        option1.value = group.id;
        option1.textContent = group.group_name;
        aliasGroupSelect.appendChild(option1);
        
        const option2 = document.createElement('option');
        option2.value = group.id;
        option2.textContent = group.group_name;
        moveGroupSelect.appendChild(option2);
    });
}

function renderGroupList(groups) {
    const list = document.getElementById('group-list');
    list.innerHTML = '';
    
    groups.forEach(group => {
        const item = document.createElement('li');
        item.className = 'group-item';
        item.dataset.id = group.id;
        item.innerHTML = `
            <span class="group-name">${escapeHtml(group.group_name)}</span>
            <div class="group-info">
                <span class="group-count">${group.alias_count}</span>
                <div class="group-actions">
                    <button class="group-action-btn" onclick="event.stopPropagation(); editGroup(${group.id}, '${escapeHtml(group.group_name)}', '${escapeHtml(group.description || '')}')" title="编辑">✏️</button>
                    <button class="group-action-btn" onclick="event.stopPropagation(); confirmDeleteGroup(${group.id}, '${escapeHtml(group.group_name)}', ${group.alias_count})" title="删除">🗑️</button>
                </div>
            </div>
        `;
        item.addEventListener('click', () => toggleGroupCollapse(group.id));
        list.appendChild(item);
        
        const aliasesList = document.createElement('ul');
        aliasesList.className = 'group-aliases';
        aliasesList.id = `group-${group.id}-aliases`;
        aliasesList.style.display = 'none';
        list.appendChild(aliasesList);
    });
}

function toggleGroupCollapse(groupId) {
    const aliasesList = document.getElementById(`group-${groupId}-aliases`);
    if (aliasesList) {
        if (aliasesList.style.display === 'none') {
            aliasesList.style.display = 'block';
            loadGroupAliases(groupId);
        } else {
            aliasesList.style.display = 'none';
        }
    }
}

async function loadGroupAliases(groupId) {
    const response = await fetch(`/api/aliases/groups/${groupId}/aliases`);
    const result = await response.json();
    if (result.success) {
        const aliasesList = document.getElementById(`group-${groupId}-aliases`);
        aliasesList.innerHTML = '';
        result.data.forEach(alias => {
            const item = document.createElement('li');
            item.className = 'group-alias-item';
            item.dataset.id = alias.id;
            item.innerHTML = `
                <span class="alias-name-text">${escapeHtml(alias.alias_name)}</span>
                <div class="item-actions">
                    <button class="item-action-btn" onclick="event.stopPropagation(); viewAlias(${alias.id})">👁️</button>
                    <button class="item-action-btn" onclick="event.stopPropagation(); editAliasById(${alias.id})">✏️</button>
                    <button class="item-action-btn" onclick="event.stopPropagation(); showMoveAliasModal(${alias.id})">📋</button>
                    <button class="item-action-btn" onclick="event.stopPropagation(); confirmDeleteAlias(${alias.id}, '${escapeHtml(alias.alias_name)}')">🗑️</button>
                </div>
            `;
            item.addEventListener('click', () => insertAliasName(alias.alias_name));
            aliasesList.appendChild(item);
        });
    }
}

function renderAliasList(aliases) {
    const list = document.getElementById('alias-list');
    list.innerHTML = '';
    
    const ungroupedAliases = aliases.filter(a => !a.group_id);
    
    ungroupedAliases.forEach(alias => {
        const item = document.createElement('li');
        item.className = 'item-item';
        item.dataset.id = alias.id;
        item.innerHTML = `
            <div class="item-name">${escapeHtml(alias.alias_name)}</div>
            ${alias.description ? `<div class="item-desc">${escapeHtml(alias.description)}</div>` : ''}
            <div class="item-dialect">${alias.dialect}</div>
            <div class="item-actions">
                <button class="item-action-btn" onclick="event.stopPropagation(); viewAlias(${alias.id})">👀</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); editAliasById(${alias.id})">✏️</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); showMoveAliasModal(${alias.id})">📋</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); confirmDeleteAlias(${alias.id}, '${escapeHtml(alias.alias_name)}')">🗑️</button>
            </div>
        `;
        item.addEventListener('click', () => insertAliasName(alias.alias_name));
        list.appendChild(item);
    });
}

async function loadTables() {
    const response = await fetch('/api/tables');
    const result = await response.json();
    if (result.success) {
        renderTableList(result.data);
    }
}

function renderTableList(tables) {
    const list = document.getElementById('tables-list');
    list.innerHTML = '';
    
    const ungroupedTables = tables.filter(t => !t.group_id);
    
    ungroupedTables.forEach(table => {
        const item = document.createElement('li');
        item.className = 'item-item';
        item.dataset.id = table.id;
        item.innerHTML = `
            <div class="item-name">${escapeHtml(table.table_name)}</div>
            ${table.description ? `<div class="item-desc">${escapeHtml(table.description)}</div>` : ''}
            <div class="item-dialect">${table.dialect}</div>
            <div class="item-actions">
                <button class="item-action-btn" onclick="event.stopPropagation(); viewTable(${table.id})">👀</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); editTableById(${table.id})">✏️</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); showMoveTableModal(${table.id})">📦</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); confirmDeleteTable(${table.id}, '${escapeHtml(table.table_name)}')">🗑️</button>
            </div>
        `;
        item.addEventListener('click', () => handleTableClick(table));
        list.appendChild(item);
    });
}

async function loadTableGroups() {
    const response = await fetch('/api/tables/groups');
    const result = await response.json();
    if (result.success) {
        renderTableGroupList(result.data);
    }
}

function renderTableGroupList(groups) {
    const list = document.getElementById('tables-group-list');
    list.innerHTML = '';
    
    groups.forEach(group => {
        const item = document.createElement('li');
        item.className = 'group-item';
        item.dataset.id = group.id;
        item.innerHTML = `
            <span class="group-name">${escapeHtml(group.group_name)}</span>
            <div class="group-info">
                <span class="group-count">${group.table_count || 0}</span>
                <div class="group-actions">
                    <button class="group-action-btn" onclick="event.stopPropagation(); editTableGroup(${group.id}, '${escapeHtml(group.group_name)}', '${escapeHtml(group.description || '')}')" title="编辑">✏️</button>
                    <button class="group-action-btn" onclick="event.stopPropagation(); confirmDeleteTableGroup(${group.id}, '${escapeHtml(group.group_name)}', ${group.table_count || 0})" title="删除">🗑️</button>
                </div>
            </div>
        `;
        item.addEventListener('click', () => toggleTableGroupCollapse(group.id));
        list.appendChild(item);
        
        const tablesList = document.createElement('ul');
        tablesList.className = 'group-tables';
        tablesList.id = `table-group-${group.id}-tables`;
        tablesList.style.display = 'none';
        list.appendChild(tablesList);
    });
}

function toggleTableGroupCollapse(groupId) {
    const tablesList = document.getElementById(`table-group-${groupId}-tables`);
    if (tablesList) {
        if (tablesList.style.display === 'none') {
            tablesList.style.display = 'block';
            loadTableGroupTables(groupId);
        } else {
            tablesList.style.display = 'none';
        }
    }
}

async function loadTableGroupTables(groupId) {
    const tablesList = document.getElementById(`table-group-${groupId}-tables`);
    if (!tablesList) return;
    
    const response = await fetch('/api/tables');
    const result = await response.json();
    if (result.success) {
        const groupTables = result.data.filter(t => t.group_id === groupId);
        tablesList.innerHTML = '';
        
        groupTables.forEach(table => {
            const item = document.createElement('li');
            item.className = 'group-table-item';
            item.dataset.id = table.id;
            item.innerHTML = `
                <span class="alias-name-text">${escapeHtml(table.table_name)}</span>
                <div class="item-actions">
                    <button class="item-action-btn" onclick="event.stopPropagation(); viewTable(${table.id})">👁️</button>
                    <button class="item-action-btn" onclick="event.stopPropagation(); editTableById(${table.id})">✏️</button>
                    <button class="item-action-btn" onclick="event.stopPropagation(); showMoveTableModal(${table.id})">📋</button>
                    <button class="item-action-btn" onclick="event.stopPropagation(); confirmDeleteTable(${table.id}, '${escapeHtml(table.table_name)}')">🗑️</button>
                </div>
            `;
            item.addEventListener('click', () => insertTableName(table.table_name, table.schema_name));
            tablesList.appendChild(item);
        });
    }
}

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    
    const addAliasBtn = document.getElementById('add-alias-btn');
    const generateSqlerBtn = document.getElementById('generate-sqler-btn');
    const sqlerPrompt = document.getElementById('sqler-prompt');
    const llmModelSelect = document.getElementById('llm-model-select-sidebar');
    
    if (tab === 'aliases') {
        document.getElementById('tab-aliases').style.display = 'block';
        loadAliases();
        loadGroups();
        addAliasBtn.innerHTML = '+ 添加别名';
        addAliasBtn.onclick = showAddAliasModal;
        addAliasBtn.style.display = 'block';
        generateSqlerBtn.style.display = 'none';
        sqlerPrompt.style.display = 'none';
        llmModelSelect.style.display = 'none';
    } else if (tab === 'tables') {
        document.getElementById('tab-tables').style.display = 'block';
        loadTables();
        loadTableGroups();
        addAliasBtn.innerHTML = '+ 添加表';
        addAliasBtn.onclick = showAddTableModal;
        addAliasBtn.style.display = 'block';
        generateSqlerBtn.style.display = 'none';
        sqlerPrompt.style.display = 'none';
        llmModelSelect.style.display = 'none';
    } else if (tab === 'sqler') {
        document.getElementById('tab-sqler').style.display = 'flex';
        document.getElementById('tab-sqler').style.flexDirection = 'column';
        addAliasBtn.style.display = 'none';
        generateSqlerBtn.style.display = 'block';
        sqlerPrompt.style.display = 'block';
        llmModelSelect.style.display = 'none';
        updateSqlerSystemContext();
    }
}

function insertAliasName(name) {
    const editor = document.getElementById('sql-editor');
    const cursorPos = editor.selectionStart;
    const text = editor.value;
    editor.value = text.substring(0, cursorPos) + name + text.substring(cursorPos);
    editor.focus();
}

async function viewAlias(aliasId) {
    const response = await fetch(`/api/aliases/${aliasId}`);
    const result = await response.json();
    if (result.success) {
        const alias = result.data;
        document.getElementById('view-alias-name').textContent = alias.alias_name;
        document.getElementById('view-alias-desc').textContent = alias.description || '无';
        document.getElementById('view-alias-group').textContent = alias.group_id ? '已分组' : '无分组';
        document.getElementById('view-alias-dialect').textContent = alias.dialect;
        document.getElementById('view-alias-created').textContent = alias.created_at || '未知';
        document.getElementById('view-alias-sql').textContent = alias.sql_content;
        
        let columns = alias.columns || [];
        let dependencies = alias.table_dependencies || [];
        
        if (!columns.length || !dependencies.length) {
            const parseResponse = await fetch('/api/aliases/parse-sql', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql_content: alias.sql_content })
            });
            
            const parseResult = await parseResponse.json();
            if (parseResult.success) {
                if (!columns.length && parseResult.columns) {
                    columns = parseResult.columns;
                }
                if (!dependencies.length && parseResult.table_dependencies) {
                    dependencies = parseResult.table_dependencies;
                }
            }
        }
        
        if (columns.length > 0) {
            let html = '<table class="columns-table"><thead><tr><th>列名</th><th>类型</th><th>注释</th></tr></thead><tbody>';
            columns.forEach(col => {
                html += `<tr><td>${escapeHtml(col.name)}</td><td>${escapeHtml(col.type || '')}</td><td>${escapeHtml(col.comment || col.alias || '')}</td></tr>`;
            });
            html += '</tbody></table>';
            document.getElementById('view-alias-columns').innerHTML = html;
        } else {
            document.getElementById('view-alias-columns').innerHTML = '<span style="color: #999;">暂无列信息</span>';
        }
        
        if (dependencies.length > 0) {
            document.getElementById('view-alias-dependencies').innerHTML = '<span>' + dependencies.map(d => escapeHtml(d)).join(', ') + '</span>';
        } else {
            document.getElementById('view-alias-dependencies').innerHTML = '<span style="color: #999;">暂无依赖表</span>';
        }
        
        document.getElementById('view-alias-modal').style.display = 'flex';
    }
}

async function editAliasById(aliasId) {
    const response = await fetch(`/api/aliases/${aliasId}`);
    const result = await response.json();
    if (result.success) {
        editAlias(result.data);
    }
}

async function editAlias(alias) {
    editingAliasId = alias.id;
    aliasFormModified = false;
    document.getElementById('modal-title').textContent = '编辑别名';
    document.getElementById('alias-id').value = alias.id;
    document.getElementById('alias-name').value = alias.alias_name;
    document.getElementById('alias-desc').value = alias.description || '';
    document.getElementById('alias-group').value = alias.group_id || '';
    document.getElementById('alias-dialect').value = alias.dialect;
    document.getElementById('alias-sql').value = alias.sql_content;
    
    const sql = alias.sql_content;
    let columns = alias.columns || [];
    let dependencies = alias.table_dependencies || [];
    
    if (!columns.length || !dependencies.length) {
        const response = await fetch('/api/aliases/parse-sql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql_content: sql })
        });
        
        const result = await response.json();
        if (result.success) {
            if (!columns.length) {
                columns = result.columns;
            }
            if (!dependencies.length) {
                dependencies = result.table_dependencies;
            }
        }
    }
    
    populateAliasColumns(columns);
    populateAliasDependencies(dependencies);
    
    document.getElementById('add-alias-modal').style.display = 'flex';
}

async function showAddAliasModal() {
    editingAliasId = null;
    aliasFormModified = false;
    document.getElementById('modal-title').textContent = '添加别名';
    document.getElementById('alias-id').value = '';
    document.getElementById('alias-name').value = '';
    document.getElementById('alias-desc').value = '';
    document.getElementById('alias-group').value = '';
    document.getElementById('alias-dialect').value = 'mysql';
    document.getElementById('alias-sql').value = '';
    
    populateAliasColumns([]);
    populateAliasDependencies([]);
    
    document.getElementById('add-alias-modal').style.display = 'flex';
}

function showAddGroupModal() {
    editingGroupId = null;
    document.getElementById('group-modal-title').textContent = '添加分组';
    document.getElementById('group-id').value = '';
    document.getElementById('group-name').value = '';
    document.getElementById('group-desc').value = '';
    document.getElementById('add-group-modal').style.display = 'flex';
}

function editGroup(groupId, groupName, description) {
    editingGroupId = groupId;
    document.getElementById('group-modal-title').textContent = '编辑分组';
    document.getElementById('group-id').value = groupId;
    document.getElementById('group-name').value = groupName;
    document.getElementById('group-desc').value = description;
    document.getElementById('add-group-modal').style.display = 'flex';
}

function showMoveAliasModal(aliasId) {
    document.getElementById('move-alias-id').value = aliasId;
    document.getElementById('move-alias-modal').style.display = 'flex';
}

async function moveAlias() {
    const aliasId = document.getElementById('move-alias-id').value;
    const groupId = document.getElementById('move-group-select').value;
    
    const response = await fetch(`/api/aliases/${aliasId}/group`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId ? parseInt(groupId) : null })
    });
    
    const result = await response.json();
    if (result.success) {
        showToast('移动成功', 'success');
        closeModal('move-alias-modal');
        loadAliases();
        loadGroups();
    } else {
        showToast(result.error, 'error');
    }
}

function showAddTableModal() {
    document.getElementById('table-modal-title').textContent = '添加表';
    document.getElementById('table-id').value = '';
    document.getElementById('table-name').value = '';
    document.getElementById('table-schema').value = '';
    document.getElementById('table-primary-key').value = '';
    document.getElementById('table-partition').value = '';
    document.getElementById('table-desc').value = '';
    document.getElementById('table-dialect').value = 'mysql';
    
    const columnsList = document.getElementById('columns-list');
    columnsList.innerHTML = '';
    
    document.getElementById('add-table-modal').style.display = 'flex';
}

function addColumnRow() {
    const columnsList = document.getElementById('columns-list');
    const row = document.createElement('div');
    row.className = 'column-row';
    row.innerHTML = `
        <input type="text" class="column-name" placeholder="列名">
        <select class="column-type">
            <option value="BIGINT">BIGINT</option>
            <option value="INT">INT</option>
            <option value="VARCHAR">VARCHAR</option>
            <option value="STRING">STRING</option>
            <option value="DECIMAL">DECIMAL</option>
            <option value="DATETIME">DATETIME</option>
            <option value="DATE">DATE</option>
            <option value="TIMESTAMP">TIMESTAMP</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="FLOAT">FLOAT</option>
            <option value="DOUBLE">DOUBLE</option>
        </select>
        <input type="text" class="column-comment" placeholder="注释">
        <button class="mini-btn" onclick="removeColumnRow(this)">-</button>
    `;
    columnsList.appendChild(row);
}

function removeColumnRow(btn) {
    const row = btn.parentElement;
    const columnsList = document.getElementById('columns-list');
    columnsList.removeChild(row);
}

function parseTableJson() {
    const jsonInput = document.getElementById('table-json-input').value;
    if (!jsonInput.trim()) {
        showToast('请输入JSON内容', 'error');
        return;
    }
    
    try {
        const data = JSON.parse(jsonInput);
        
        if (data.name) {
            document.getElementById('table-name').value = data.name;
        }
        if (data.label) {
            document.getElementById('table-desc').value = data.label;
        }
        if (data.descr) {
            document.getElementById('table-desc').value = data.descr;
        }
        if (data.tabSchema) {
            document.getElementById('table-schema').value = data.tabSchema;
        }
        if (data.cycleType === 'day') {
            document.getElementById('table-partition').value = 'dt';
        }
        
        const columnsList = document.getElementById('columns-list');
        let html = '';
        
        if (data.fields && Array.isArray(data.fields)) {
            data.fields.forEach(field => {
                const name = field.name || '';
                const type = field.dataType ? mapDataType(field.dataType) : 'STRING';
                const comment = field.label || field.descr || '';
                
                if (name) {
                    html += `
                        <div class="column-row">
                            <input type="text" class="column-name" placeholder="列名" value="${escapeHtml(name)}">
                            <select class="column-type">
                                <option value="STRING" ${type === 'STRING' ? 'selected' : ''}>STRING</option>
                                <option value="BIGINT" ${type === 'BIGINT' ? 'selected' : ''}>BIGINT</option>
                                <option value="INT" ${type === 'INT' ? 'selected' : ''}>INT</option>
                                <option value="VARCHAR" ${type === 'VARCHAR' ? 'selected' : ''}>VARCHAR</option>
                                <option value="DECIMAL" ${type === 'DECIMAL' ? 'selected' : ''}>DECIMAL</option>
                                <option value="DATETIME" ${type === 'DATETIME' ? 'selected' : ''}>DATETIME</option>
                                <option value="DATE" ${type === 'DATE' ? 'selected' : ''}>DATE</option>
                                <option value="TIMESTAMP" ${type === 'TIMESTAMP' ? 'selected' : ''}>TIMESTAMP</option>
                                <option value="BOOLEAN" ${type === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
                                <option value="FLOAT" ${type === 'FLOAT' ? 'selected' : ''}>FLOAT</option>
                                <option value="DOUBLE" ${type === 'DOUBLE' ? 'selected' : ''}>DOUBLE</option>
                            </select>
                            <input type="text" class="column-comment" placeholder="注释" value="${escapeHtml(comment)}">
                            <button class="mini-btn" onclick="removeColumnRow(this)">-</button>
                        </div>
                    `;
                }
            });
        }
        
        if (!html) {
            html = `
                <div class="column-row">
                    <input type="text" class="column-name" placeholder="列名" value="id">
                    <select class="column-type">
                        <option value="BIGINT" selected>BIGINT</option>
                        <option value="INT">INT</option>
                        <option value="VARCHAR">VARCHAR</option>
                        <option value="STRING">STRING</option>
                        <option value="DECIMAL">DECIMAL</option>
                        <option value="DATETIME">DATETIME</option>
                        <option value="DATE">DATE</option>
                        <option value="TIMESTAMP">TIMESTAMP</option>
                        <option value="BOOLEAN">BOOLEAN</option>
                        <option value="FLOAT">FLOAT</option>
                        <option value="DOUBLE">DOUBLE</option>
                    </select>
                    <input type="text" class="column-comment" placeholder="注释">
                    <button class="mini-btn" onclick="removeColumnRow(this)">-</button>
                </div>
            `;
        }
        
        columnsList.innerHTML = html;
        
        showToast('JSON解析成功', 'success');
        
    } catch (e) {
        showToast('JSON解析失败: ' + e.message, 'error');
    }
}

function mapDataType(dataType) {
    const typeMap = {
        'bigint': 'BIGINT',
        'int': 'INT',
        'integer': 'INT',
        'varchar': 'VARCHAR',
        'string': 'STRING',
        'decimal': 'DECIMAL',
        'double': 'DOUBLE',
        'float': 'FLOAT',
        'datetime': 'DATETIME',
        'date': 'DATE',
        'timestamp': 'TIMESTAMP',
        'boolean': 'BOOLEAN',
        'bool': 'BOOLEAN'
    };
    return typeMap[dataType.toLowerCase()] || 'STRING';
}

function getColumnsFromForm() {
    const rows = document.querySelectorAll('.column-row');
    const columns = [];
    rows.forEach(row => {
        const name = row.querySelector('.column-name').value.trim();
        const type = row.querySelector('.column-type').value;
        const comment = row.querySelector('.column-comment').value.trim();
        if (name) {
            columns.push({ name, type, comment });
        }
    });
    return columns;
}

async function saveTable() {
    const id = document.getElementById('table-id').value;
    const name = document.getElementById('table-name').value;
    const schema = document.getElementById('table-schema').value;
    const primaryKey = document.getElementById('table-primary-key').value;
    const partition = document.getElementById('table-partition').value;
    const desc = document.getElementById('table-desc').value;
    const dialect = document.getElementById('table-dialect').value;
    const columns = getColumnsFromForm();
    
    if (!name) {
        showToast('表名不能为空', 'error');
        return;
    }
    
    if (primaryKey && !/^[a-zA-Z_][a-zA-Z0-9_,\s]*$/.test(primaryKey)) {
        showToast('主键格式不正确，只能包含字母、数字、下划线和逗号', 'error');
        return;
    }
    
    let response;
    const groupId = document.getElementById('table-group-id').value;
    const data = { 
        table_name: name, 
        schema_name: schema || null, 
        columns,
        description: desc, 
        dialect,
        primary_key: primaryKey || null,
        partition_info: partition || null,
        group_id: groupId ? parseInt(groupId) : null
    };
    
    if (id) {
        response = await fetch(`/api/tables/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (result.success) {
            showToast('更新成功', 'success');
            closeModal('add-table-modal');
            loadTables();
            loadTableGroups();
        } else {
            showToast(result.error, 'error');
        }
    } else {
        response = await fetch('/api/tables', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (result.success) {
            showToast('添加成功', 'success');
            closeModal('add-table-modal');
            loadTables();
            loadTableGroups();
        } else {
            showToast(result.error, 'error');
        }
    }
}

async function viewTable(tableId) {
    const response = await fetch(`/api/tables/${tableId}`);
    const result = await response.json();
    if (result.success) {
        const table = result.data;
        document.getElementById('view-table-name').textContent = table.table_name;
        document.getElementById('view-table-schema').textContent = table.schema_name || '无';
        document.getElementById('view-table-group').textContent = table.group_name || '无分组';
        document.getElementById('view-table-primary-key').textContent = table.primary_key || '无';
        document.getElementById('view-table-partition').textContent = table.partition_info || '无';
        document.getElementById('view-table-desc').textContent = table.description || '无';
        document.getElementById('view-table-dialect').textContent = table.dialect;
        
        const columns = table.columns || [];
        if (columns.length > 0) {
            let html = '<table class="columns-table"><thead><tr><th>列名</th><th>类型</th><th>注释</th></tr></thead><tbody>';
            columns.forEach(col => {
                html += `<tr><td>${escapeHtml(col.name)}</td><td>${escapeHtml(col.type)}</td><td>${escapeHtml(col.comment || '')}</td></tr>`;
            });
            html += '</tbody></table>';
            document.getElementById('view-table-columns').innerHTML = html;
        } else {
            document.getElementById('view-table-columns').innerHTML = '<span style="color: #999;">暂无列信息</span>';
        }
        
        document.getElementById('view-table-modal').style.display = 'flex';
    }
}

async function editTableById(tableId) {
    const response = await fetch(`/api/tables/${tableId}`);
    const result = await response.json();
    if (result.success) {
        const table = result.data;
        document.getElementById('table-modal-title').textContent = '编辑表';
        document.getElementById('table-id').value = table.id;
        document.getElementById('table-group-id').value = table.group_id || '';
        document.getElementById('table-name').value = table.table_name;
        document.getElementById('table-schema').value = table.schema_name || '';
        document.getElementById('table-primary-key').value = table.primary_key || '';
        document.getElementById('table-partition').value = table.partition_info || '';
        document.getElementById('table-desc').value = table.description || '';
        document.getElementById('table-dialect').value = table.dialect;
        
        const columnsList = document.getElementById('columns-list');
        const columns = table.columns || [];
        if (columns.length > 0) {
            let html = '';
            columns.forEach(col => {
                html += `
                    <div class="column-row">
                        <input type="text" class="column-name" placeholder="列名" value="${escapeHtml(col.name)}">
                        <select class="column-type">
                            <option value="BIGINT" ${col.type === 'BIGINT' ? 'selected' : ''}>BIGINT</option>
                            <option value="INT" ${col.type === 'INT' ? 'selected' : ''}>INT</option>
                            <option value="VARCHAR" ${col.type === 'VARCHAR' ? 'selected' : ''}>VARCHAR</option>
                            <option value="STRING" ${col.type === 'STRING' ? 'selected' : ''}>STRING</option>
                            <option value="DECIMAL" ${col.type === 'DECIMAL' ? 'selected' : ''}>DECIMAL</option>
                            <option value="DATETIME" ${col.type === 'DATETIME' ? 'selected' : ''}>DATETIME</option>
                            <option value="DATE" ${col.type === 'DATE' ? 'selected' : ''}>DATE</option>
                            <option value="TIMESTAMP" ${col.type === 'TIMESTAMP' ? 'selected' : ''}>TIMESTAMP</option>
                            <option value="BOOLEAN" ${col.type === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
                            <option value="FLOAT" ${col.type === 'FLOAT' ? 'selected' : ''}>FLOAT</option>
                            <option value="DOUBLE" ${col.type === 'DOUBLE' ? 'selected' : ''}>DOUBLE</option>
                        </select>
                        <input type="text" class="column-comment" placeholder="注释" value="${escapeHtml(col.comment || '')}">
                        <button class="mini-btn" onclick="removeColumnRow(this)">-</button>
                    </div>
                `;
            });
            columnsList.innerHTML = html;
        }
        
        document.getElementById('add-table-modal').style.display = 'flex';
    }
}

function confirmDeleteTable(tableId, tableName) {
    deleteCallback = async () => {
        const response = await fetch(`/api/tables/${tableId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('删除成功', 'success');
            loadTables();
            loadTableGroups();
        } else {
            showToast(result.error, 'error');
        }
    };
    document.getElementById('delete-message').textContent = `确定要删除表 "${tableName}" 吗？`;
    document.getElementById('delete-confirm-modal').style.display = 'flex';
}

function showAddTableGroupModal() {
    document.getElementById('table-group-modal-title').textContent = '添加表分组';
    document.getElementById('table-group-id').value = '';
    document.getElementById('table-group-name').value = '';
    document.getElementById('table-group-desc').value = '';
    document.getElementById('add-table-group-modal').style.display = 'flex';
}

async function saveTableGroup() {
    const id = document.getElementById('table-group-id').value;
    const name = document.getElementById('table-group-name').value;
    const desc = document.getElementById('table-group-desc').value;
    
    if (!name) {
        showToast('分组名称不能为空', 'error');
        return;
    }
    
    let response;
    if (id) {
        response = await fetch(`/api/tables/groups/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_name: name, description: desc })
        });
    } else {
        response = await fetch('/api/tables/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_name: name, description: desc })
        });
    }
    
    const result = await response.json();
    if (result.success) {
        showToast(id ? '更新成功' : '添加成功', 'success');
        closeModal('add-table-group-modal');
        loadTables();
        loadTableGroups();
    } else {
        showToast(result.error, 'error');
    }
}

function editTableGroup(groupId, groupName, description) {
    document.getElementById('table-group-modal-title').textContent = '编辑表分组';
    document.getElementById('table-group-id').value = groupId;
    document.getElementById('table-group-name').value = groupName;
    document.getElementById('table-group-desc').value = description;
    document.getElementById('add-table-group-modal').style.display = 'flex';
}

function confirmDeleteTableGroup(groupId, groupName, tableCount) {
    deleteCallback = async () => {
        const response = await fetch(`/api/tables/groups/${groupId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('删除成功', 'success');
            loadTables();
            loadTableGroups();
        } else {
            showToast(result.error, 'error');
        }
    };
    if (tableCount > 0) {
        document.getElementById('delete-message').textContent = `确定要删除分组 "${groupName}" 吗？该分组下有 ${tableCount} 个表，删除分组将同时删除所有表，此操作不可恢复。`;
    } else {
        document.getElementById('delete-message').textContent = `确定要删除分组 "${groupName}" 吗？`;
    }
    document.getElementById('delete-confirm-modal').style.display = 'flex';
}

async function showMoveTableModal(tableId) {
    document.getElementById('move-table-id').value = tableId;
    
    const response = await fetch('/api/tables/groups');
    const result = await response.json();
    
    const select = document.getElementById('move-table-group-select');
    select.innerHTML = '<option value="">无分组</option>';
    
    if (result.success && result.data) {
        result.data.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.group_name;
            select.appendChild(option);
        });
    }
    
    document.getElementById('move-table-modal').style.display = 'flex';
}

async function moveTableToGroup() {
    const tableId = document.getElementById('move-table-id').value;
    const groupId = document.getElementById('move-table-group-select').value;
    
    const response = await fetch(`/api/tables/${tableId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId ? parseInt(groupId) : null })
    });
    
    const result = await response.json();
    if (result.success) {
        showToast('移动成功', 'success');
        closeModal('move-table-modal');
        loadTables();
        loadTableGroups();
        
        if (groupId) {
            const tablesList = document.getElementById(`table-group-${groupId}-tables`);
            if (tablesList) {
                loadTableGroupTables(groupId);
            }
        }
    } else {
        showToast(result.error, 'error');
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function addAliasColumnRow() {
    const list = document.getElementById('alias-columns-list');
    const row = document.createElement('div');
    row.className = 'column-row';
    row.innerHTML = `
        <input type="text" class="column-name" placeholder="列名">
        <select class="column-type">
            <option value="STRING">STRING</option>
            <option value="BIGINT">BIGINT</option>
            <option value="INT">INT</option>
            <option value="VARCHAR">VARCHAR</option>
            <option value="DECIMAL">DECIMAL</option>
            <option value="DATETIME">DATETIME</option>
            <option value="DATE">DATE</option>
            <option value="TIMESTAMP">TIMESTAMP</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="FLOAT">FLOAT</option>
            <option value="DOUBLE">DOUBLE</option>
        </select>
        <input type="text" class="column-comment" placeholder="字段备注">
        <button class="mini-btn" onclick="removeAliasColumnRow(this)">-</button>
    `;
    list.appendChild(row);
}

function removeAliasColumnRow(btn) {
    const row = btn.parentElement;
    const list = document.getElementById('alias-columns-list');
    if (list.children.length > 1) {
        list.removeChild(row);
    }
}

function addDependencyRow() {
    const list = document.getElementById('alias-dependencies-list');
    const row = document.createElement('div');
    row.className = 'dependency-row';
    row.innerHTML = `
        <input type="text" class="dependency-name" placeholder="表名">
        <input type="text" class="dependency-desc" placeholder="表描述">
        <button class="mini-btn" onclick="removeDependencyRow(this)">-</button>
    `;
    list.appendChild(row);
}

function removeDependencyRow(btn) {
    const row = btn.parentElement;
    const list = document.getElementById('alias-dependencies-list');
    if (list.children.length > 1) {
        list.removeChild(row);
    }
}

function extractColumnsFromSQL(sql) {
    const columns = [];
    if (!sql || !sql.trim()) return columns;
    
    // 匹配 SELECT 和 FROM 之间的内容
    const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
    if (!selectMatch) return columns;
    
    const selectContent = selectMatch[1].trim();
    const columnStrings = selectContent.split(',');
    
    columnStrings.forEach(col => {
        col = col.trim();
        if (!col) return;
        
        // 处理 AS 别名
        const asMatch = col.match(/\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i);
        let colName = col;
        
        if (asMatch) {
            colName = asMatch[1];
        } else {
            // 提取列名（去掉表名前缀和函数）
            const nameMatch = col.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
            if (nameMatch) {
                colName = nameMatch[1];
            }
        }
        
        // 忽略 * 号
        if (colName === '*') return;
        
        // 推断类型
        let colType = 'STRING';
        const upperCol = col.toUpperCase();
        if (upperCol.includes('COUNT') || upperCol.includes('SUM') || upperCol.includes('MAX') || upperCol.includes('MIN')) {
            colType = 'INT';
        } else if (upperCol.includes('AVG')) {
            colType = 'DECIMAL';
        } else if (upperCol.includes('DATE') || upperCol.includes('TIME')) {
            colType = 'DATETIME';
        } else if (upperCol.includes('BOOL')) {
            colType = 'BOOLEAN';
        }
        
        columns.push({ name: colName, type: colType, comment: '' });
    });
    
    return columns;
}

function autoFillAliasColumns() {
    const sql = document.getElementById('alias-sql').value;
    const columnsList = document.getElementById('alias-columns-list');
    
    // 检查是否已有手动添加的列
    const existingColumns = getAliasColumnsFromForm();
    if (existingColumns.length > 0) {
        return; // 已有手动填写的列，不覆盖
    }
    
    // 从 SQL 中提取列名
    const columns = extractColumnsFromSQL(sql);
    
    if (columns.length > 0) {
        columnsList.innerHTML = '';
        columns.forEach(col => {
            const row = document.createElement('div');
            row.className = 'column-row';
            row.innerHTML = `
                <input type="text" class="column-name" placeholder="列名" value="${escapeHtml(col.name)}">
                <select class="column-type">
                    <option value="INT" ${col.type === 'INT' ? 'selected' : ''}>INT</option>
                    <option value="BIGINT" ${col.type === 'BIGINT' ? 'selected' : ''}>BIGINT</option>
                    <option value="VARCHAR" ${col.type === 'VARCHAR' ? 'selected' : ''}>VARCHAR</option>
                    <option value="STRING" ${col.type === 'STRING' ? 'selected' : ''}>STRING</option>
                    <option value="DECIMAL" ${col.type === 'DECIMAL' ? 'selected' : ''}>DECIMAL</option>
                    <option value="DATETIME" ${col.type === 'DATETIME' ? 'selected' : ''}>DATETIME</option>
                    <option value="DATE" ${col.type === 'DATE' ? 'selected' : ''}>DATE</option>
                    <option value="BOOLEAN" ${col.type === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
                    <option value="DOUBLE" ${col.type === 'DOUBLE' ? 'selected' : ''}>DOUBLE</option>
                </select>
                <input type="text" class="column-comment" placeholder="注释" value="${escapeHtml(col.comment)}">
                <button class="remove-btn" onclick="removeColumnRow(this)">×</button>
            `;
            columnsList.appendChild(row);
        });
    }
}

function getAliasColumnsFromForm() {
    const rows = document.querySelectorAll('#alias-columns-list .column-row');
    const columns = [];
    rows.forEach(row => {
        const name = row.querySelector('.column-name').value.trim();
        const type = row.querySelector('.column-type').value;
        const comment = row.querySelector('.column-comment').value.trim();
        if (name) {
            columns.push({ name, type, comment });
        }
    });
    return columns;
}

function getAliasDependenciesFromForm() {
    const rows = document.querySelectorAll('#alias-dependencies-list .dependency-row');
    const dependencies = [];
    rows.forEach(row => {
        const name = row.querySelector('.dependency-name').value.trim();
        const desc = row.querySelector('.dependency-desc').value.trim();
        if (name) {
            dependencies.push({ name, description: desc });
        }
    });
    return dependencies;
}

async function saveAlias() {
    const id = document.getElementById('alias-id').value;
    let name = document.getElementById('alias-name').value;
    const desc = document.getElementById('alias-desc').value;
    const groupId = document.getElementById('alias-group').value;
    const dialect = document.getElementById('alias-dialect').value;
    const sql = document.getElementById('alias-sql').value;
    const formColumns = getAliasColumnsFromForm();
    const dependencies = getAliasDependenciesFromForm();
    
    if (!name || !sql) {
        showToast('别名和SQL内容不能为空', 'error');
        return;
    }
    
    // 从 SQL 中提取列名
    const extractedColumns = extractColumnsFromSQL(sql);
    
    // 编辑模式：如果从SQL中提取到列名，使用提取的列名（覆盖原来的）
    // 新增模式：如果表单列为空，使用提取的列名
    let columns = [];
    if (id && extractedColumns.length > 0) {
        // 编辑时，优先使用从SQL解析的列名
        columns = extractedColumns;
    } else if (formColumns.length > 0) {
        // 使用表单中手动填写的列
        columns = formColumns;
    } else if (extractedColumns.length > 0) {
        // 使用从SQL提取的列
        columns = extractedColumns;
    }
    
    if (!name.endsWith('_')) {
        name = name + '_';
    }
    
    let response;
    const data = { 
        alias_name: name, 
        sql_content: sql, 
        description: desc, 
        dialect,
        group_id: groupId ? parseInt(groupId) : null,
        columns,
        table_dependencies: dependencies
    };
    
    if (id) {
        response = await fetch(`/api/aliases/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        response = await fetch('/api/aliases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }
    
    const result = await response.json();
    if (result.success) {
        showToast(id ? '更新成功' : '添加成功', 'success');
        closeModal('add-alias-modal');
        loadAliases();
        loadGroups();
    } else {
        showToast(result.error, 'error');
    }
}

async function saveGroup() {
    const id = document.getElementById('group-id').value;
    const name = document.getElementById('group-name').value;
    const desc = document.getElementById('group-desc').value;
    
    if (!name) {
        showToast('分组名称不能为空', 'error');
        return;
    }
    
    let response;
    if (id) {
        response = await fetch(`/api/aliases/groups/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_name: name, description: desc })
        });
    } else {
        response = await fetch('/api/aliases/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_name: name, description: desc })
        });
    }
    
    const result = await response.json();
    if (result.success) {
        showToast(id ? '更新成功' : '添加成功', 'success');
        closeModal('add-group-modal');
        loadGroups();
    } else {
        showToast(result.error, 'error');
    }
}

function confirmDeleteAlias(aliasId, aliasName) {
    deleteCallback = async () => {
        const response = await fetch(`/api/aliases/${aliasId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast('删除成功', 'success');
            loadAliases();
            loadGroups();
        } else {
            showToast(result.error, 'error');
        }
    };
    document.getElementById('delete-message').textContent = `确定要删除别名 "${aliasName}" 吗？`;
    document.getElementById('delete-confirm-modal').style.display = 'flex';
}

function confirmDeleteGroup(groupId, groupName, aliasCount) {
    deleteCallback = async () => {
        const response = await fetch(`/api/aliases/groups/${groupId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            showToast(`删除成功，已删除 ${result.deleted_alias_count} 个别名`, 'success');
            loadAliases();
            loadGroups();
        } else {
            showToast(result.error, 'error');
        }
    };
    if (aliasCount > 0) {
        document.getElementById('delete-message').textContent = `确定要删除分组 "${groupName}" 吗？该分组下有 ${aliasCount} 个别名，删除分组将同时删除所有别名，此操作不可恢复。`;
    } else {
        document.getElementById('delete-message').textContent = `确定要删除分组 "${groupName}" 吗？`;
    }
    document.getElementById('delete-confirm-modal').style.display = 'flex';
}

function confirmDelete() {
    if (deleteCallback) {
        deleteCallback();
        deleteCallback = null;
    }
    closeModal('delete-confirm-modal');
}

function handleTableClick(table) {
    insertTableName(table.table_name, table.schema_name);
}

function insertTableName(name, schemaName) {
    const editor = document.getElementById('sql-editor');
    const cursorPos = editor.selectionStart;
    const text = editor.value;
    
    let tableName = name;
    if (schemaName) {
        tableName = `${schemaName}.${name}`;
    }
    
    editor.value = text.substring(0, cursorPos) + tableName + text.substring(cursorPos);
    editor.focus();
}

async function optimizeSQL() {
    if (isProcessing) {
        showToast('请等待上一次操作完成', 'warning');
        return;
    }
    
    const editor = document.getElementById('sql-editor');
    if (!editor) {
        showToast('编辑器未找到', 'error');
        return;
    }
    
    let sql = editor.value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    
    sql = ensureAliasSuffix(sql);
    
    isProcessing = true;
    
    try {
        console.log('优化SQL请求:', sql);
        
        const resolveResponse = await fetch('/api/sql/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql })
        });
        
        const resolveResult = await resolveResponse.json();
        console.log('还原结果:', resolveResult);
        
        if (!resolveResult.success) {
            showToast(resolveResult.error, 'error');
            return;
        }
        
        const optimizeResponse = await fetch('/api/sql/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: resolveResult.sql })
        });
        
        const optimizeResult = await optimizeResponse.json();
        console.log('优化结果:', optimizeResult);
        
        if (optimizeResult.success) {
            const formatResponse = await fetch('/api/sql/format', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: optimizeResult.optimized, style: 'standard' })
            });
            
            const formatResult = await formatResponse.json();
            const formattedSql = formatResult.success ? formatResult.sql : optimizeResult.optimized;
            
            const resultContent = document.getElementById('result-content');
            resultContent.value = formattedSql;
            updateResultLineNumbers(formattedSql);
            document.getElementById('copy-btn').disabled = false;
            document.getElementById('format-result-btn').disabled = false;
            document.getElementById('llm-optimize-result-btn').disabled = !llmConfigured;
            showAnalysis(optimizeResult.analysis);
        } else {
            showToast(optimizeResult.error, 'error');
        }
    } catch (error) {
        console.error('优化SQL失败:', error);
        showToast('优化SQL失败: ' + error.message, 'error');
    } finally {
        isProcessing = false;
    }
}

async function resolveSQL() {
    if (isProcessing) {
        showToast('请等待上一次操作完成', 'warning');
        return;
    }
    
    const editor = document.getElementById('sql-editor');
    if (!editor) {
        showToast('编辑器未找到', 'error');
        return;
    }
    
    let sql = editor.value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    
    sql = ensureAliasSuffix(sql);
    
    isProcessing = true;
    
    try {
        console.log('还原SQL请求:', sql);
        
        const response = await fetch('/api/sql/resolve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql })
        });
        
        const result = await response.json();
        console.log('还原结果:', result);
        
        if (result.success) {
            const resultContent = document.getElementById('result-content');
            resultContent.value = result.sql;
            updateResultLineNumbers(result.sql);
            document.getElementById('copy-btn').disabled = false;
            document.getElementById('format-result-btn').disabled = false;
            document.getElementById('llm-optimize-result-btn').disabled = !llmConfigured;
            document.getElementById('analysis-container').innerHTML = '';
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        console.error('还原SQL失败:', error);
        showToast('还原SQL失败: ' + error.message, 'error');
    } finally {
        isProcessing = false;
    }
}

async function saveSQLAsAlias() {
    const sql = document.getElementById('sql-editor').value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    
    editingAliasId = null;
    aliasFormModified = false;
    document.getElementById('modal-title').textContent = '保存为别名';
    document.getElementById('alias-id').value = '';
    document.getElementById('alias-name').value = '';
    document.getElementById('alias-desc').value = '';
    document.getElementById('alias-group').value = '';
    document.getElementById('alias-dialect').value = 'mysql';
    document.getElementById('alias-sql').value = sql;
    
    const response = await fetch('/api/aliases/parse-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql_content: sql })
    });
    
    const result = await response.json();
    if (result.success) {
        populateAliasColumns(result.columns);
        populateAliasDependencies(result.table_dependencies);
    }
    
    document.getElementById('add-alias-modal').style.display = 'flex';
}

function populateAliasColumns(columns) {
    const columnsList = document.getElementById('alias-columns-list');
    if (!columns || columns.length === 0) {
        columnsList.innerHTML = `
            <div class="column-row">
                <input type="text" class="column-name" placeholder="列名">
                <select class="column-type">
                    <option value="STRING">STRING</option>
                    <option value="BIGINT">BIGINT</option>
                    <option value="INT">INT</option>
                    <option value="VARCHAR">VARCHAR</option>
                    <option value="DECIMAL">DECIMAL</option>
                    <option value="DATETIME">DATETIME</option>
                    <option value="DATE">DATE</option>
                    <option value="TIMESTAMP">TIMESTAMP</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                    <option value="FLOAT">FLOAT</option>
                    <option value="DOUBLE">DOUBLE</option>
                </select>
                <input type="text" class="column-comment" placeholder="字段备注">
                <button class="mini-btn" onclick="removeAliasColumnRow(this)">-</button>
            </div>
        `;
        return;
    }
    
    let html = '';
    for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        html += `
            <div class="column-row">
                <input type="text" class="column-name" value="${escapeHtml(col.name || '')}">
                <select class="column-type">
                    <option value="STRING" ${(col.type || '').toUpperCase() === 'STRING' ? 'selected' : ''}>STRING</option>
                    <option value="BIGINT" ${(col.type || '').toUpperCase() === 'BIGINT' ? 'selected' : ''}>BIGINT</option>
                    <option value="INT" ${(col.type || '').toUpperCase() === 'INT' ? 'selected' : ''}>INT</option>
                    <option value="VARCHAR" ${(col.type || '').toUpperCase() === 'VARCHAR' ? 'selected' : ''}>VARCHAR</option>
                    <option value="DECIMAL" ${(col.type || '').toUpperCase() === 'DECIMAL' ? 'selected' : ''}>DECIMAL</option>
                    <option value="DATETIME" ${(col.type || '').toUpperCase() === 'DATETIME' ? 'selected' : ''}>DATETIME</option>
                    <option value="DATE" ${(col.type || '').toUpperCase() === 'DATE' ? 'selected' : ''}>DATE</option>
                    <option value="TIMESTAMP" ${(col.type || '').toUpperCase() === 'TIMESTAMP' ? 'selected' : ''}>TIMESTAMP</option>
                    <option value="BOOLEAN" ${(col.type || '').toUpperCase() === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
                    <option value="FLOAT" ${(col.type || '').toUpperCase() === 'FLOAT' ? 'selected' : ''}>FLOAT</option>
                    <option value="DOUBLE" ${(col.type || '').toUpperCase() === 'DOUBLE' ? 'selected' : ''}>DOUBLE</option>
                </select>
                <input type="text" class="column-comment" value="${escapeHtml(col.comment || col.alias || '')}" placeholder="字段备注">
                <button class="mini-btn" onclick="removeAliasColumnRow(this)">-</button>
            </div>
        `;
    }
    columnsList.innerHTML = html;
}

function populateAliasDependencies(dependencies) {
    const dependenciesList = document.getElementById('alias-dependencies-list');
    if (!dependencies || dependencies.length === 0) {
        dependenciesList.innerHTML = `
            <div class="dependency-row">
                <input type="text" class="dependency-name" placeholder="表名">
                <input type="text" class="dependency-desc" placeholder="表描述">
                <button class="mini-btn" onclick="removeDependencyRow(this)">-</button>
            </div>
        `;
        return;
    }
    
    let html = '';
    for (let i = 0; i < dependencies.length; i++) {
        html += `
            <div class="dependency-row">
                <input type="text" class="dependency-name" value="${escapeHtml(dependencies[i])}">
                <input type="text" class="dependency-desc" placeholder="表描述">
                <button class="mini-btn" onclick="removeDependencyRow(this)">-</button>
            </div>
        `;
    }
    dependenciesList.innerHTML = html;
}

function mergeAliasColumns(newColumns) {
    const columnsList = document.getElementById('alias-columns-list');
    const existingRows = columnsList.querySelectorAll('.column-row');
    
    const modifiedRows = {};
    const existingNames = [];
    
    existingRows.forEach(row => {
        const nameInput = row.querySelector('.column-name');
        const typeSelect = row.querySelector('.column-type');
        const commentInput = row.querySelector('.column-comment');
        
        if (row.dataset.modified === 'true') {
            modifiedRows[nameInput.value.trim()] = {
                name: nameInput.value.trim(),
                type: typeSelect.value,
                comment: commentInput.value.trim()
            };
        } else if (nameInput.value.trim()) {
            existingNames.push(nameInput.value.trim());
        }
    });
    
    const newNames = newColumns.map(col => col.name);
    
    let html = '';
    
    newColumns.forEach(col => {
        if (modifiedRows[col.name]) {
            const modified = modifiedRows[col.name];
            html += `
                <div class="column-row" data-modified="true">
                    <input type="text" class="column-name" value="${escapeHtml(modified.name)}">
                    <select class="column-type">
                        <option value="STRING" ${modified.type === 'STRING' ? 'selected' : ''}>STRING</option>
                        <option value="BIGINT" ${modified.type === 'BIGINT' ? 'selected' : ''}>BIGINT</option>
                        <option value="INT" ${modified.type === 'INT' ? 'selected' : ''}>INT</option>
                        <option value="VARCHAR" ${modified.type === 'VARCHAR' ? 'selected' : ''}>VARCHAR</option>
                        <option value="DECIMAL" ${modified.type === 'DECIMAL' ? 'selected' : ''}>DECIMAL</option>
                        <option value="DATETIME" ${modified.type === 'DATETIME' ? 'selected' : ''}>DATETIME</option>
                        <option value="DATE" ${modified.type === 'DATE' ? 'selected' : ''}>DATE</option>
                        <option value="TIMESTAMP" ${modified.type === 'TIMESTAMP' ? 'selected' : ''}>TIMESTAMP</option>
                        <option value="BOOLEAN" ${modified.type === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
                        <option value="FLOAT" ${modified.type === 'FLOAT' ? 'selected' : ''}>FLOAT</option>
                        <option value="DOUBLE" ${modified.type === 'DOUBLE' ? 'selected' : ''}>DOUBLE</option>
                    </select>
                    <input type="text" class="column-comment" value="${escapeHtml(modified.comment)}" placeholder="字段备注">
                    <button class="mini-btn" onclick="removeAliasColumnRow(this)">-</button>
                </div>
            `;
        } else {
            html += `
                <div class="column-row">
                    <input type="text" class="column-name" value="${escapeHtml(col.name || '')}">
                    <select class="column-type">
                        <option value="STRING" ${(col.type || '').toUpperCase() === 'STRING' ? 'selected' : ''}>STRING</option>
                        <option value="BIGINT" ${(col.type || '').toUpperCase() === 'BIGINT' ? 'selected' : ''}>BIGINT</option>
                        <option value="INT" ${(col.type || '').toUpperCase() === 'INT' ? 'selected' : ''}>INT</option>
                        <option value="VARCHAR" ${(col.type || '').toUpperCase() === 'VARCHAR' ? 'selected' : ''}>VARCHAR</option>
                        <option value="DECIMAL" ${(col.type || '').toUpperCase() === 'DECIMAL' ? 'selected' : ''}>DECIMAL</option>
                        <option value="DATETIME" ${(col.type || '').toUpperCase() === 'DATETIME' ? 'selected' : ''}>DATETIME</option>
                        <option value="DATE" ${(col.type || '').toUpperCase() === 'DATE' ? 'selected' : ''}>DATE</option>
                        <option value="TIMESTAMP" ${(col.type || '').toUpperCase() === 'TIMESTAMP' ? 'selected' : ''}>TIMESTAMP</option>
                        <option value="BOOLEAN" ${(col.type || '').toUpperCase() === 'BOOLEAN' ? 'selected' : ''}>BOOLEAN</option>
                        <option value="FLOAT" ${(col.type || '').toUpperCase() === 'FLOAT' ? 'selected' : ''}>FLOAT</option>
                        <option value="DOUBLE" ${(col.type || '').toUpperCase() === 'DOUBLE' ? 'selected' : ''}>DOUBLE</option>
                    </select>
                    <input type="text" class="column-comment" value="${escapeHtml(col.comment || col.alias || '')}" placeholder="字段备注">
                    <button class="mini-btn" onclick="removeAliasColumnRow(this)">-</button>
                </div>
            `;
        }
    });
    
    if (html === '') {
        html = `
            <div class="column-row">
                <input type="text" class="column-name" placeholder="列名">
                <select class="column-type">
                    <option value="STRING">STRING</option>
                    <option value="BIGINT">BIGINT</option>
                    <option value="INT">INT</option>
                    <option value="VARCHAR">VARCHAR</option>
                    <option value="DECIMAL">DECIMAL</option>
                    <option value="DATETIME">DATETIME</option>
                    <option value="DATE">DATE</option>
                    <option value="TIMESTAMP">TIMESTAMP</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                    <option value="FLOAT">FLOAT</option>
                    <option value="DOUBLE">DOUBLE</option>
                </select>
                <input type="text" class="column-comment" placeholder="字段备注">
                <button class="mini-btn" onclick="removeAliasColumnRow(this)">-</button>
            </div>
        `;
    }
    
    columnsList.innerHTML = html;
}

function mergeAliasDependencies(newDependencies) {
    const dependenciesList = document.getElementById('alias-dependencies-list');
    const existingRows = dependenciesList.querySelectorAll('.dependency-row');
    
    const modifiedRows = {};
    
    existingRows.forEach(row => {
        const nameInput = row.querySelector('.dependency-name');
        const descInput = row.querySelector('.dependency-desc');
        
        if (row.dataset.modified === 'true') {
            modifiedRows[nameInput.value.trim()] = {
                name: nameInput.value.trim(),
                description: descInput.value.trim()
            };
        }
    });
    
    let html = '';
    
    newDependencies.forEach(dep => {
        if (modifiedRows[dep]) {
            const modified = modifiedRows[dep];
            html += `
                <div class="dependency-row" data-modified="true">
                    <input type="text" class="dependency-name" value="${escapeHtml(modified.name)}">
                    <input type="text" class="dependency-desc" value="${escapeHtml(modified.description)}" placeholder="表描述">
                    <button class="mini-btn" onclick="removeDependencyRow(this)">-</button>
                </div>
            `;
        } else {
            html += `
                <div class="dependency-row">
                    <input type="text" class="dependency-name" value="${escapeHtml(dep)}">
                    <input type="text" class="dependency-desc" placeholder="表描述">
                    <button class="mini-btn" onclick="removeDependencyRow(this)">-</button>
                </div>
            `;
        }
    });
    
    if (html === '') {
        html = `
            <div class="dependency-row">
                <input type="text" class="dependency-name" placeholder="表名">
                <input type="text" class="dependency-desc" placeholder="表描述">
                <button class="mini-btn" onclick="removeDependencyRow(this)">-</button>
            </div>
        `;
    }
    
    dependenciesList.innerHTML = html;
}

async function parseAliasSQLOnBlur() {
    const sql = document.getElementById('alias-sql').value;
    if (!sql.trim()) {
        return;
    }
    
    const response = await fetch('/api/aliases/parse-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql_content: sql })
    });
    
    const result = await response.json();
    if (result.success) {
        mergeAliasColumns(result.columns);
        mergeAliasDependencies(result.table_dependencies);
    }
}

async function formatSQL() {
    const sql = document.getElementById('sql-editor').value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    
    const response = await fetch('/api/sql/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, style: 'standard' })
    });
    
    const result = await response.json();
    if (result.success) {
        document.getElementById('sql-editor').value = result.sql;
        highlightAliasesInEditor();
    } else {
        showToast(result.error, 'error');
    }
}

async function formatResultSQL() {
    const sql = document.getElementById('result-content').value;
    if (!sql.trim()) {
        showToast('请先生成结果', 'error');
        return;
    }
    
    const response = await fetch('/api/sql/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql, style: 'standard' })
    });
    
    const result = await response.json();
    if (result.success) {
        document.getElementById('result-content').value = result.sql;
        updateResultLineNumbers(result.sql);
    } else {
        showToast(result.error, 'error');
    }
}

function clearEditor() {
    document.getElementById('sql-editor').value = '';
    updateLineNumbers();
    highlightAliasesInEditor();
}

function copyEditor() {
    const sql = document.getElementById('sql-editor').value;
    if (!sql.trim()) {
        showToast('编辑器中没有内容', 'error');
        return;
    }
    navigator.clipboard.writeText(sql).then(() => {
        showToast('已复制到剪贴板', 'success');
    }).catch(err => {
        showToast('复制失败', 'error');
    });
}

function setButtonLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (btn) {
        if (loading) {
            btn.disabled = true;
            btn.style.backgroundColor = '#ffc107';
            btn.style.color = '#333';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.disabled = llmConfigured ? false : true;
            btn.style.backgroundColor = '';
            btn.style.color = '';
            btn.style.cursor = 'pointer';
        }
    }
}

async function generateSQLFromSidebar() {
    if (!llmConfigured) {
        showToast('请先在设置中配置大模型', 'error');
        return;
    }
    
    const prompt = document.getElementById('sqler-prompt').value;
    if (!prompt.trim()) {
        showToast('请输入提示词', 'error');
        return;
    }
    
    setButtonLoading('generate-sqler-btn', true);
    
    const configId = getSelectedModelId();
    
    const systemContext = document.getElementById('sqler-system-input').value;
    const fullPrompt = systemContext ? `${systemContext}\n\n用户需求：${prompt}` : prompt;
    
    showToast('正在生成SQL...', 'info');
    
    try {
        const response = await fetch('/api/llm/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: fullPrompt, config_id: configId })
        });
        
        const result = await response.json();
        if (result.success) {
            document.getElementById('sql-editor').value = result.sql;
            updateResultLineNumbers(result.sql);
            document.getElementById('copy-btn').disabled = false;
            document.getElementById('format-result-btn').disabled = false;
            document.getElementById('llm-optimize-result-btn').disabled = !llmConfigured;
            document.getElementById('analysis-container').innerHTML = '';
            showToast('SQL生成成功', 'success');
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        showToast('请求失败', 'error');
    } finally {
        setButtonLoading('generate-sqler-btn', false);
        document.getElementById('sqler-prompt').value = '';
    }
}

function clearSqlerContext() {
    document.getElementById('sqler-system-input').value = '';
    showToast('上下文已清空', 'success');
}

async function updateSqlerSystemContext() {
    let context = '';
    
    try {
        const aliasResponse = await fetch('/api/aliases');
        const aliasResult = await aliasResponse.json();
        
        if (aliasResult.success && aliasResult.data && aliasResult.data.length > 0) {
            context += '【可用别名】\n';
            aliasResult.data.forEach(alias => {
                const name = alias.alias_name || '';
                const desc = alias.description || '';
                const columns = alias.columns || [];
                if (name) {
                    context += `- ${name}`;
                    if (desc) context += ` (${desc})`;
                    if (columns.length > 0) {
                        context += `\n  可用列: ${columns.map(c => c.name).join(', ')}`;
                    }
                    context += '\n';
                }
            });
            context += '\n';
        }
        
        const tablesResponse = await fetch('/api/tables');
        const tablesResult = await tablesResponse.json();
        
        if (tablesResult.success && tablesResult.data && tablesResult.data.length > 0) {
            context += '【基础表】\n';
            tablesResult.data.forEach(table => {
                const name = table.table_name || '';
                const schema = table.schema_name || '';
                const pk = table.primary_key || '';
                const columns = table.columns || [];
                if (name) {
                    context += `- ${schema ? schema + '.' : ''}${name}`;
                    if (pk) context += ` (主键: ${pk})`;
                    if (columns.length > 0) {
                        context += `\n  列: ${columns.map(c => `${c.name}(${c.type})`).join(', ')}`;
                    }
                    context += '\n';
                }
            });
            context += '\n';
        }
        
        context += '【使用规则】\n';
        context += '- 别名名称以下划线结尾（如 user_kd_jcwg_rel_）\n';
        context += '- 使用别名时自动识别并展开为完整SQL\n';
        context += '- 列名必须存在于对应的表或别名中\n';
        context += '- 日期格式使用 YYYYMMDD，如 20260610\n';
    } catch (e) {
        console.error('获取上下文信息失败:', e);
    }
    
    const systemInput = document.getElementById('sqler-system-input');
    if (systemInput) {
        systemInput.value = context.trim() || '暂无上下文信息（别名、表结构等）';
    }
}

async function generateSQL() {
    const prompt = document.getElementById('llm-prompt')?.value;
    if (!prompt) {
        showToast('请切换到SQLer标签页输入提示词', 'error');
        return;
    }
    
    const configId = getSelectedModelId();
    const response = await fetch('/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, config_id: configId })
    });
    
    const result = await response.json();
    if (result.success) {
        document.getElementById('sql-editor').value = result.sql;
        document.getElementById('result-content').value = result.sql;
        updateResultLineNumbers(result.sql);
        document.getElementById('copy-btn').disabled = false;
        document.getElementById('analysis-container').innerHTML = '';
    } else {
        showToast(result.error, 'error');
    }
}

async function llmOptimizeSQL() {
    let sql = document.getElementById('sql-editor').value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    
    setButtonLoading('llm-optimize-btn', true);
    
    sql = ensureAliasSuffix(sql);
    
    const configId = getSelectedModelId();
    
    try {
        const response = await fetch('/api/llm/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, config_id: configId })
        });
        
        const result = await response.json();
        if (result.success) {
            document.getElementById('sql-editor').value = result.result;
            highlightAliasesInEditor();
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        showToast('请求失败', 'error');
    } finally {
        setButtonLoading('llm-optimize-btn', false);
    }
}

async function llmOptimizeResultSQL() {
    const sql = document.getElementById('result-content').value;
    if (!sql.trim()) {
        showToast('请先生成结果', 'error');
        return;
    }
    
    setButtonLoading('llm-optimize-result-btn', true);
    
    const configId = getSelectedModelId();
    
    try {
        const response = await fetch('/api/llm/optimize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, config_id: configId })
        });
        
        const result = await response.json();
        if (result.success) {
            document.getElementById('result-content').value = result.result;
            updateResultLineNumbers(result.result);
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        showToast('请求失败', 'error');
    } finally {
        setButtonLoading('llm-optimize-result-btn', false);
    }
}

function showAnalysis(analysis) {
    const container = document.getElementById('analysis-container');
    container.innerHTML = '';
    
    if (analysis.warnings && analysis.warnings.length > 0) {
        container.innerHTML += `
            <div class="analysis-section">
                <h4>⚠️ 性能警告</h4>
                <ul>${analysis.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
            </div>
        `;
    }
    
    if (analysis.suggestions && analysis.suggestions.length > 0) {
        container.innerHTML += `
            <div class="suggestion-section">
                <h4>💡 优化建议</h4>
                <ul>${analysis.suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
        `;
    }
}

function showLLMConfig() {
    loadLLMConfigs();
    document.getElementById('llm-config-id').value = '';
    document.getElementById('llm-config-name').value = '';
    document.getElementById('llm-api-key').value = '';
    document.getElementById('llm-model-name').value = 'gpt-4';
    document.getElementById('llm-api-url').value = 'https://api.openai.com/v1';
    document.getElementById('llm-max-tokens').value = 4096;
    document.getElementById('llm-config-modal').style.display = 'flex';
}

async function loadLLMConfigs() {
    const response = await fetch('/api/llm/configs');
    const result = await response.json();
    if (result.success) {
        renderLLMConfigList(result.data);
        updateModelSelect(result.data);
    }
}

function renderLLMConfigList(configs) {
    const list = document.getElementById('llm-config-list');
    list.innerHTML = '';
    
    if (configs.length === 0) {
        list.innerHTML = '<p style="color: #999; text-align: center; padding: 1rem;">暂无配置</p>';
        return;
    }
    
    configs.forEach(config => {
        const item = document.createElement('div');
        item.className = 'llm-config-item';
        item.innerHTML = `
            <div class="llm-config-info">
                <div class="llm-config-name">${escapeHtml(config.config_name)}${config.is_default ? ' <span style="color: #667eea;">(默认)</span>' : ''}</div>
                <div class="llm-config-details">${escapeHtml(config.model_name)} | ${escapeHtml(config.api_base_url)}</div>
            </div>
            <div class="llm-config-actions">
                <button class="llm-config-btn" onclick="editLLMConfig(${config.id})" title="编辑">✏️</button>
                ${!config.is_default ? `<button class="llm-config-btn" onclick="setDefaultLLMConfig(${config.id})" title="设为默认">⭐</button>` : ''}
                <button class="llm-config-btn" onclick="deleteLLMConfig(${config.id}, '${escapeHtml(config.config_name)}')" title="删除">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

async function editLLMConfig(configId) {
    const response = await fetch(`/api/llm/config/${configId}`);
    const result = await response.json();
    if (result.success && result.data) {
        document.getElementById('llm-config-id').value = result.data.id;
        document.getElementById('llm-config-name').value = result.data.config_name || '';
        document.getElementById('llm-api-key').value = '';
        document.getElementById('llm-model-name').value = result.data.model_name || 'gpt-4';
        document.getElementById('llm-api-url').value = result.data.api_base_url || 'https://api.openai.com/v1';
        document.getElementById('llm-max-tokens').value = result.data.max_tokens || 4096;
    }
}

async function setDefaultLLMConfig(configId) {
    const response = await fetch(`/api/llm/config/${configId}/default`, { method: 'PUT' });
    const result = await response.json();
    if (result.success) {
        showToast('已设为默认', 'success');
        loadLLMConfigs();
    } else {
        showToast(result.error, 'error');
    }
}

async function deleteLLMConfig(configId, configName) {
    if (!confirm(`确定要删除配置 "${configName}" 吗？`)) {
        return;
    }
    const response = await fetch(`/api/llm/config/${configId}`, { method: 'DELETE' });
    const result = await response.json();
    if (result.success) {
        showToast('删除成功', 'success');
        loadLLMConfigs();
        checkLLMConfig();
    } else {
        showToast(result.error, 'error');
    }
}

async function saveLLMConfig() {
    const configId = document.getElementById('llm-config-id').value;
    const configName = document.getElementById('llm-config-name').value;
    const apiKey = document.getElementById('llm-api-key').value;
    const modelName = document.getElementById('llm-model-name').value;
    const apiUrl = document.getElementById('llm-api-url').value;
    const maxTokens = parseInt(document.getElementById('llm-max-tokens').value);
    
    if (!configName) {
        showToast('配置名称不能为空', 'error');
        return;
    }
    
    const data = { 
        config_name: configName, 
        api_key: apiKey, 
        model_name: modelName, 
        api_base_url: apiUrl, 
        max_tokens: maxTokens,
        is_default: false
    };
    
    if (configId) {
        data.id = parseInt(configId);
    }
    
    const response = await fetch('/api/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    const result = await response.json();
    if (result.success) {
        showToast('配置保存成功', 'success');
        loadLLMConfigs();
        checkLLMConfig();
        document.getElementById('llm-config-id').value = '';
        document.getElementById('llm-config-name').value = '';
        document.getElementById('llm-api-key').value = '';
        document.getElementById('llm-model-name').value = 'gpt-4';
        document.getElementById('llm-api-url').value = 'https://api.openai.com/v1';
        document.getElementById('llm-max-tokens').value = 4096;
    } else {
        showToast(result.error, 'error');
    }
}

// ========== 搜索功能 ==========

// 搜索别名
async function searchAliases() {
    const query = document.getElementById('alias-search-input').value.trim();
    if (!query) {
        showToast('请输入搜索关键词', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/aliases/search?q=${encodeURIComponent(query)}`);
        const result = await response.json();
        
        if (result.success) {
            displayAliasSearchResults(result.results, query);
            document.getElementById('alias-clear-btn').style.display = 'block';
            document.getElementById('alias-search-info').style.display = 'flex';
            document.getElementById('alias-search-count').textContent = 
                `找到 ${result.count} 个结果`;
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        showToast('搜索失败: ' + error.message, 'error');
    }
}

// 显示别名搜索结果
function displayAliasSearchResults(results, query) {
    const groupList = document.getElementById('group-list');
    const aliasList = document.getElementById('alias-list');
    
    // 清空分组列表
    groupList.innerHTML = '';
    
    // 显示搜索结果
    aliasList.innerHTML = '';
    
    if (results.length === 0) {
        aliasList.innerHTML = '<li class="no-results">未找到匹配的别名</li>';
        return;
    }
    
    results.forEach(alias => {
        const item = document.createElement('li');
        item.className = 'item';
        item.dataset.id = alias.id;
        
        // 高亮匹配的关键词
        const highlightedName = highlightMatch(alias.name, query);
        const highlightedDesc = alias.description ? 
            highlightMatch(alias.description, query) : '';
        
        item.innerHTML = `
            <div class="item-content" onclick="viewAlias(${alias.id})">
                <span class="item-name">${highlightedName}</span>
                <span class="item-desc">${highlightedDesc}</span>
            </div>
            <div class="item-actions">
                <button class="item-action-btn" onclick="event.stopPropagation(); viewAlias(${alias.id})">👁️</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); editAliasById(${alias.id})">✏️</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); showMoveAliasModal(${alias.id})">📋</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); confirmDeleteAlias(${alias.id}, '${escapeHtml(alias.name)}')">🗑️</button>
            </div>
        `;
        
        aliasList.appendChild(item);
    });
}

// 高亮匹配文本
function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeRegex(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapedText.replace(regex, '<span class="search-highlight">$1</span>');
}

// 转义正则表达式特殊字符
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 清除别名搜索
function clearAliasSearch() {
    document.getElementById('alias-search-input').value = '';
    document.getElementById('alias-clear-btn').style.display = 'none';
    document.getElementById('alias-search-info').style.display = 'none';
    loadAliases();
    loadGroups();
}

// 搜索基础表
async function searchTables() {
    const query = document.getElementById('table-search-input').value.trim();
    if (!query) {
        showToast('请输入搜索关键词', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/tables/search?q=${encodeURIComponent(query)}`);
        const result = await response.json();
        
        if (result.success) {
            displayTableSearchResults(result.results, query);
            document.getElementById('table-clear-btn').style.display = 'block';
            document.getElementById('table-search-info').style.display = 'flex';
            document.getElementById('table-search-count').textContent = 
                `找到 ${result.count} 个结果`;
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        showToast('搜索失败: ' + error.message, 'error');
    }
}

// 显示表搜索结果
function displayTableSearchResults(results, query) {
    const groupList = document.getElementById('tables-group-list');
    const tableList = document.getElementById('tables-list');
    
    // 清空分组列表
    groupList.innerHTML = '';
    
    // 显示搜索结果
    tableList.innerHTML = '';
    
    if (results.length === 0) {
        tableList.innerHTML = '<li class="no-results">未找到匹配的表</li>';
        return;
    }
    
    results.forEach(table => {
        const item = document.createElement('li');
        item.className = 'item';
        item.dataset.id = table.id;
        
        // 高亮匹配的关键词
        const highlightedName = highlightMatch(table.name, query);
        const highlightedDesc = table.description ? 
            highlightMatch(table.description, query) : '';
        
        item.innerHTML = `
            <div class="item-content" onclick="viewTable(${table.id})">
                <span class="item-name">${highlightedName}</span>
                <span class="item-desc">${highlightedDesc}</span>
            </div>
            <div class="item-actions">
                <button class="item-action-btn" onclick="event.stopPropagation(); viewTable(${table.id})">👁️</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); editTableById(${table.id})">✏️</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); showMoveTableModal(${table.id})">📋</button>
                <button class="item-action-btn" onclick="event.stopPropagation(); confirmDeleteTable(${table.id}, '${escapeHtml(table.name)}')">🗑️</button>
            </div>
        `;
        
        tableList.appendChild(item);
    });
}

// 清除表搜索
function clearTableSearch() {
    document.getElementById('table-search-input').value = '';
    document.getElementById('table-clear-btn').style.display = 'none';
    document.getElementById('table-search-info').style.display = 'none';
    loadTables();
    loadTableGroups();
}

async function testLLMConnection() {
    const response = await fetch('/api/llm/test', { method: 'POST' });
    const result = await response.json();
    if (result.success) {
        showToast('连接成功', 'success');
    } else {
        showToast(result.error, 'error');
    }
}

async function checkLLMConfig() {
    const response = await fetch('/api/llm/configs');
    const result = await response.json();
    if (result.success && result.data && result.data.length > 0) {
        llmConfigured = true;
        updateLLMButtons();
        updateModelSelect(result.data);
    } else {
        llmConfigured = false;
        updateLLMButtons();
    }
}

function updateModelSelect(configs) {
    const select = document.getElementById('llm-model-select');
    const sidebarSelect = document.getElementById('llm-model-select-sidebar');
    
    if (select) select.innerHTML = '';
    if (sidebarSelect) sidebarSelect.innerHTML = '';
    
    if (configs.length === 0) {
        if (select) select.style.display = 'none';
        if (sidebarSelect) sidebarSelect.style.display = 'none';
        llmConfigured = false;
        updateLLMButtons();
        return;
    }
    
    let hasSelected = false;
    configs.forEach(config => {
        const option = document.createElement('option');
        option.value = config.id;
        option.textContent = config.config_name + (config.is_default ? ' (默认)' : '');
        if (config.is_default) {
            option.selected = true;
            hasSelected = true;
        }
        
        if (select) select.appendChild(option.cloneNode(true));
        if (sidebarSelect) sidebarSelect.appendChild(option);
    });
    
    if (select) select.style.display = 'inline-block';
    
    llmConfigured = hasSelected;
    updateLLMButtons();
}

function updateLLMButtons() {
    const generateBtn = document.getElementById('generate-btn');
    const llmOptimizeBtn = document.getElementById('llm-optimize-btn');
    const llmOptimizeResultBtn = document.getElementById('llm-optimize-result-btn');
    
    if (generateBtn) generateBtn.disabled = !llmConfigured;
    if (llmOptimizeBtn) llmOptimizeBtn.disabled = !llmConfigured;
    if (llmOptimizeResultBtn) llmOptimizeResultBtn.disabled = !llmConfigured;
}

function getSelectedModelId() {
    const select = document.getElementById('llm-model-select');
    const sidebarSelect = document.getElementById('llm-model-select-sidebar');
    
    if (sidebarSelect && sidebarSelect.style.display !== 'none' && sidebarSelect.value) {
        return parseInt(sidebarSelect.value);
    }
    
    if (select && select.style.display !== 'none' && select.value) {
        return parseInt(select.value);
    }
    
    return null;
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}