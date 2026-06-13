let currentTab = 'aliases';
let editingAliasId = null;
let editingGroupId = null;
let llmConfigured = false;
let deleteCallback = null;
let aliasNames = [];

document.addEventListener('DOMContentLoaded', function() {
    loadAliases();
    loadGroups();
    checkLLMConfig();
    
    const editor = document.getElementById('sql-editor');
    if (editor) {
        editor.addEventListener('input', handleEditorInput);
        editor.addEventListener('keydown', handleEditorKeyDown);
        editor.addEventListener('scroll', handleEditorScroll);
    }
    
    initResizer();
});

async function updateAliasNames() {
    const response = await fetch('/api/aliases');
    const result = await response.json();
    if (result.success) {
        aliasNames = result.data.map(a => a.alias_name);
    }
}

function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
    });
    document.getElementById(`tab-${tabName}`).style.display = 'block';
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
}

function showLLMConfig() {
    document.getElementById('llm-config-modal').style.display = 'flex';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function resolveSQL() {
    const sql = document.getElementById('sql-editor').value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    
    const response = await fetch('/api/sql/resolve', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: sql })
    });
    
    const result = await response.json();
    if (result.success) {
        document.getElementById('result-content').value = result.sql;
        document.getElementById('analysis-container').innerHTML = '';
    } else {
        showToast(result.error, 'error');
    }
}

async function optimizeSQL() {
    const sql = document.getElementById('sql-editor').value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    
    const modelId = getSelectedModelId();
    if (!modelId && llmConfigured) {
        showToast('请选择LLM模型', 'error');
        return;
    }
    
    const response = await fetch('/api/sql/optimize', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            sql: sql,
            model_id: modelId 
        })
    });
    
    const result = await response.json();
    if (result.success) {
        document.getElementById('result-content').value = result.optimized;
        document.getElementById('analysis-container').innerHTML = formatAnalysis(result.analysis);
    } else {
        showToast(result.error, 'error');
    }
}

function clearEditor() {
    document.getElementById('sql-editor').value = '';
    document.getElementById('result-content').value = '';
    document.getElementById('analysis-container').innerHTML = '';
}

function copyEditor() {
    const result = document.getElementById('result-content').value;
    if (!result) {
        showToast('没有可复制的内容', 'error');
        return;
    }
    
    navigator.clipboard.writeText(result).then(() => {
        showToast('复制成功', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

function formatAnalysis(analysis) {
    if (!analysis) return '';
    let html = '<div class="analysis"><h4>分析结果</h4>';
    if (analysis.tables) {
        html += `<div><strong>涉及表:</strong> ${analysis.tables.join(', ')}</div>`;
    }
    if (analysis.aliases) {
        html += `<div><strong>使用别名:</strong> ${analysis.aliases.join(', ')}</div>`;
    }
    if (analysis.suggestions) {
        html += '<div><strong>优化建议:</strong><ul>';
        analysis.suggestions.forEach(s => {
            html += `<li>${s}</li>`;
        });
        html += '</ul></div>';
    }
    html += '</div>';
    return html;
}

async function loadAliases() {
    const response = await fetch('/api/aliases');
    const result = await response.json();
    if (result.success) {
        renderAliases(result.data);
    }
}

function renderAliases(aliases) {
    const container = document.getElementById('alias-list');
    container.innerHTML = '';
    
    aliases.forEach(alias => {
        const div = document.createElement('div');
        div.className = 'alias-item';
        div.innerHTML = `
            <div class="alias-info">
                <span class="alias-name">${escapeHtml(alias.alias_name)}</span>
                <span class="alias-sql">${escapeHtml(alias.sql_text)}</span>
            </div>
            <div class="alias-actions">
                <button onclick="editAlias(${alias.id})">✏️</button>
                <button onclick="deleteAlias(${alias.id})">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function editAlias(id) {
    fetch(`/api/aliases/${id}`)
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                editingAliasId = id;
                document.getElementById('alias-name').value = result.data.alias_name;
                document.getElementById('alias-sql').value = result.data.sql_content;
                document.getElementById('alias-group').value = result.data.group_id || '';
                document.getElementById('add-alias-modal').style.display = 'flex';
            }
        });
}

function deleteAlias(id) {
    deleteCallback = () => {
        fetch(`/api/aliases/${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    loadAliases();
                    showToast('删除成功', 'success');
                } else {
                    showToast(result.error, 'error');
                }
            });
    };
    
    document.getElementById('delete-confirm-modal').style.display = 'flex';
    document.getElementById('delete-message').textContent = '确定要删除这个别名吗？';
}

function confirmDelete() {
    if (deleteCallback) {
        deleteCallback();
    }
    closeModal('delete-confirm-modal');
    deleteCallback = null;
}

function saveAlias() {
    const name = document.getElementById('alias-name').value.trim();
    const sql = document.getElementById('alias-sql').value.trim();
    const groupId = document.getElementById('alias-group').value;
    
    if (!name) {
        showToast('请输入别名名称', 'error');
        return;
    }
    if (!sql) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    
    const data = {
        alias_name: name,
        sql_content: sql,
        group_id: groupId ? parseInt(groupId) : null
    };
    
    const method = editingAliasId ? 'PUT' : 'POST';
    const url = editingAliasId ? `/api/aliases/${editingAliasId}` : '/api/aliases';
    
    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).then(res => res.json())
      .then(result => {
          if (result.success) {
              loadAliases();
              loadGroups();
              closeModal('add-alias-modal');
              showToast(editingAliasId ? '更新成功' : '添加成功', 'success');
              editingAliasId = null;
          } else {
              showToast(result.error, 'error');
          }
      });
}

function showAddAliasModal() {
    editingAliasId = null;
    document.getElementById('alias-name').value = '';
    document.getElementById('alias-sql').value = '';
    document.getElementById('alias-group').value = '';
    document.getElementById('add-alias-modal').style.display = 'flex';
}

async function loadGroups() {
    const response = await fetch('/api/aliases/groups');
    const result = await response.json();
    if (result.success) {
        renderGroups(result.data);
        updateGroupSelects(result.data);
    }
}

function renderGroups(groups) {
    const container = document.getElementById('group-list');
    container.innerHTML = '';
    
    groups.forEach(group => {
        const div = document.createElement('div');
        div.className = 'group-item';
        div.innerHTML = `
            <div class="group-info">
                <span class="group-name">${escapeHtml(group.group_name)}</span>
                <span class="group-count">${group.alias_count} 个别名</span>
            </div>
            <div class="group-actions">
                <button onclick="editGroup(${group.id})">✏️</button>
                <button onclick="deleteGroup(${group.id})">🗑️</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function updateGroupSelects(groups) {
    const selects = document.querySelectorAll('.group-select');
    selects.forEach(select => {
        select.innerHTML = '<option value="">无分组</option>';
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.group_name;
            select.appendChild(option);
        });
    });
}

function editGroup(id) {
    fetch(`/api/groups/${id}`)
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                editingGroupId = id;
                document.getElementById('group-name').value = result.data.group_name;
                document.getElementById('add-group-modal').style.display = 'flex';
            }
        });
}

function deleteGroup(id) {
    deleteCallback = () => {
        fetch(`/api/groups/${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    loadGroups();
                    loadAliases();
                    showToast('删除成功', 'success');
                } else {
                    showToast(result.error, 'error');
                }
            });
    };
    
    document.getElementById('delete-confirm-modal').style.display = 'flex';
    document.getElementById('delete-message').textContent = '确定要删除这个分组吗？';
}

function saveGroup() {
    const name = document.getElementById('group-name').value.trim();
    
    if (!name) {
        showToast('请输入分组名称', 'error');
        return;
    }
    
    const data = { group_name: name };
    const method = editingGroupId ? 'PUT' : 'POST';
    const url = editingGroupId ? `/api/groups/${editingGroupId}` : '/api/groups';
    
    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).then(res => res.json())
      .then(result => {
          if (result.success) {
              loadGroups();
              loadAliases();
              closeModal('group-modal');
              showToast(editingGroupId ? '更新成功' : '添加成功', 'success');
              editingGroupId = null;
          } else {
              showToast(result.error, 'error');
          }
      });
}

function showAddGroupModal() {
    editingGroupId = null;
    document.getElementById('group-name').value = '';
    document.getElementById('add-group-modal').style.display = 'flex';
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
    document.getElementById('analysis-container').innerHTML = '';
}

function handleEditorInput() {
    updateLineNumbers();
}

function handleEditorKeyDown(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        const editor = e.target;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
    }
    
    if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        resolveSQL();
    }
}

function handleEditorScroll() {
    const editor = document.getElementById('sql-editor');
    const lineNumbers = document.getElementById('line-numbers');
    if (editor && lineNumbers) {
        lineNumbers.scrollTop = editor.scrollTop;
    }
}

function updateLineNumbers() {
    const editor = document.getElementById('sql-editor');
    const lineNumbers = document.getElementById('line-numbers');
    if (!editor || !lineNumbers) return;
    
    const lines = editor.value.split('\n').length;
    let numbers = '';
    for (let i = 1; i <= lines; i++) {
        numbers += i + '\n';
    }
    lineNumbers.textContent = numbers;
}

function initResizer() {
    const resizer = document.getElementById('resizer');
    const editorContainer = document.querySelector('.editor-container');
    const resultContainer = document.querySelector('.result-area');
    
    if (!resizer || !editorContainer || !resultContainer) return;
    
    let isDragging = false;
    
    resizer.addEventListener('mousedown', (e) => {
        isDragging = true;
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    });
    
    function handleResize(e) {
        if (!isDragging) return;
        
        const containerRect = editorContainer.parentElement.getBoundingClientRect();
        const percentage = ((e.clientX - containerRect.left) / containerRect.width) * 100;
        
        if (percentage > 20 && percentage < 80) {
            editorContainer.style.width = percentage + '%';
            resultContainer.style.width = (100 - percentage) + '%';
        }
    }
    
    function stopResize() {
        isDragging = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
    }
}

function loadTableGroups() {
    fetch('/api/tables/groups')
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                renderTableGroups(result.data);
            }
        });
}

function renderTableGroups(groups) {
    const container = document.getElementById('tables-group-list');
    container.innerHTML = '';
    
    groups.forEach(group => {
        const div = document.createElement('div');
        div.className = 'table-group';
        div.innerHTML = `
            <div class="table-group-header" onclick="toggleTableGroup(${group.id})">
                <span>${escapeHtml(group.group_name)}</span>
                <span class="table-count">${group.tables.length}</span>
            </div>
            <div id="table-group-${group.id}" class="table-group-content">
                ${group.tables.map(t => `
                    <div class="table-item">
                        <span>${escapeHtml(t.table_name)}</span>
                        <button onclick="addToEditor('${t.table_name}')">+</button>
                        <button onclick="showTableInfo(${t.id})">👁️</button>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(div);
    });
}

function toggleTableGroup(groupId) {
    const content = document.getElementById(`table-group-${groupId}`);
    content.style.display = content.style.display === 'none' ? 'block' : 'none';
}

function addToEditor(tableName) {
    const editor = document.getElementById('sql-editor');
    if (editor) {
        editor.value += ' ' + tableName + ' ';
        editor.focus();
    }
}

function showTableInfo(tableId) {
    fetch(`/api/tables/${tableId}`)
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                const table = result.data;
                let html = `<h4>${escapeHtml(table.table_name)}</h4>`;
                html += `<p>数据库: ${escapeHtml(table.database_name)}</p>`;
                html += '<h5>字段列表:</h5><ul>';
                table.columns.forEach(col => {
                    html += `<li>${escapeHtml(col.column_name)} (${escapeHtml(col.data_type)})</li>`;
                });
                html += '</ul>';
                document.getElementById('table-info-content').innerHTML = html;
                document.getElementById('table-info-modal').style.display = 'flex';
            }
        });
}

function moveTableToGroup() {
    showToast('功能开发中', 'info');
}

function openMoveTableModal() {
    document.getElementById('move-table-modal').style.display = 'flex';
}

function formatSQL() {
    const editor = document.getElementById('sql-editor');
    if (!editor.value.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    showToast('格式化功能开发中', 'info');
}

function saveSQLAsAlias() {
    const sql = document.getElementById('sql-editor').value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    showAddAliasModal();
    document.getElementById('alias-sql').value = sql;
}

function llmOptimizeSQL() {
    const sql = document.getElementById('sql-editor').value;
    if (!sql.trim()) {
        showToast('请输入SQL语句', 'error');
        return;
    }
    showToast('大模型优化功能开发中', 'info');
}

function formatResultSQL() {
    const result = document.getElementById('result-content').value;
    if (!result.trim()) {
        showToast('没有可格式化的内容', 'error');
        return;
    }
    showToast('格式化功能开发中', 'info');
}

function llmOptimizeResultSQL() {
    const result = document.getElementById('result-content').value;
    if (!result.trim()) {
        showToast('没有可优化的内容', 'error');
        return;
    }
    showToast('大模型优化功能开发中', 'info');
}

function copyResult() {
    const result = document.getElementById('result-content').value;
    if (!result) {
        showToast('没有可复制的内容', 'error');
        return;
    }
    navigator.clipboard.writeText(result).then(() => {
        showToast('复制成功', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

function showAddTableGroupModal() {
    document.getElementById('add-table-group-modal').style.display = 'flex';
}

function clearSqlerContext() {
    document.getElementById('sqler-system-input').value = '';
    showToast('上下文已清空', 'success');
}

function generateSQLFromSidebar() {
    const context = document.getElementById('sqler-system-input').value;
    const prompt = document.getElementById('sqler-prompt').value;
    if (!prompt.trim()) {
        showToast('请输入SQL需求描述', 'error');
        return;
    }
    showToast('SQL生成功能开发中', 'info');
}

function removeAliasColumnRow(btn) {
    btn.parentElement.parentElement.remove();
}

function addAliasColumnRow() {
    const container = document.getElementById('alias-columns-list');
    const row = document.createElement('div');
    row.className = 'column-row';
    row.innerHTML = `
        <input type="text" placeholder="列名">
        <input type="text" placeholder="数据类型">
        <button class="mini-btn" onclick="removeAliasColumnRow(this)">-</button>
    `;
    container.appendChild(row);
}

function removeDependencyRow(btn) {
    btn.parentElement.parentElement.remove();
}

function addDependencyRow() {
    const container = document.getElementById('alias-dependencies-list');
    const row = document.createElement('div');
    row.className = 'dependency-row';
    row.innerHTML = `
        <input type="text" placeholder="依赖表名">
        <button class="mini-btn" onclick="removeDependencyRow(this)">-</button>
    `;
    container.appendChild(row);
}

function moveAlias() {
    showToast('移动功能开发中', 'info');
}

function testLLMConnection() {
    showToast('测试连接功能开发中', 'info');
}

function saveLLMConfig() {
    showToast('保存配置功能开发中', 'info');
}

function parseTableJson() {
    showToast('解析JSON功能开发中', 'info');
}

function removeColumnRow(btn) {
    btn.parentElement.parentElement.remove();
}

function addColumnRow() {
    const container = document.getElementById('columns-list');
    const row = document.createElement('div');
    row.className = 'column-row';
    row.innerHTML = `
        <input type="text" placeholder="列名">
        <input type="text" placeholder="数据类型">
        <input type="text" placeholder="是否主键">
        <button class="mini-btn" onclick="removeColumnRow(this)">-</button>
    `;
    container.appendChild(row);
}

function saveTable() {
    showToast('保存表功能开发中', 'info');
}

function saveTableGroup() {
    showToast('保存表分组功能开发中', 'info');
}