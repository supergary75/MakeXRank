// =================================================================
//  Tasks App — 任务管理
// =================================================================
const TasksApp = {
    _editingTaskId: null,

    init() {
        Shared.loadData();
        this.bindEvents();
        this.render();
    },

    generateId() { return Shared.generateId(); },
    toast(msg, type) { Shared.toast(msg, type); },
    escapeHtml(str) { return Shared.escapeHtml(str); },

    addTask(name, type) {
        name = name.trim();
        if (!name) { this.toast('请输入任务名称', 'warning'); return; }
        if (Shared.data.tasks.some((t) => t.name === name)) { this.toast(`任务"${name}"已存在`, 'warning'); return; }
        const maxScoreInput = document.getElementById('taskMaxScoreInput');
        const maxScore = maxScoreInput ? parseInt(maxScoreInput.value) : null;
        Shared.data.tasks.push({
            id: this.generateId(),
            name,
            type: type || 'basic',
            maxScore: (!isNaN(maxScore) && maxScore > 0) ? maxScore : null,
        });
        Shared.saveData();
        this.render();
        const typeLabel = type === 'challenge' ? '挑战类' : '基本功';
        this.toast(`已添加${typeLabel}任务"${name}"`);
    },

    removeTask(id) {
        const task = Shared.data.tasks.find((t) => t.id === id);
        if (!task) return;
        const inUse = Shared.data.trainings.some((tr) =>
            tr.mockCompetitions.some((m) =>
                (m.tasks || []).some((x) => x.taskId === id) ||
                (m.taskIds || []).includes(id) || m.taskId === id
            )
        );
        if (inUse) {
            this.toast(`任务"${task.name}"已被模拟赛引用，无法删除`, 'error');
            return;
        }
        if (!confirm(`确定要删除任务"${task.name}"吗？`)) return;
        Shared.data.tasks = Shared.data.tasks.filter((t) => t.id !== id);
        Shared.saveData();
        this.render();
        this.toast(`已删除任务"${task.name}"`);
    },

    openEditModal(id) {
        const task = Shared.data.tasks.find((t) => t.id === id);
        if (!task) return;
        this._editingTaskId = id;
        document.getElementById('editTaskNameInput').value = task.name;
        document.getElementById('editTaskTypeSelect').value = task.type || 'basic';
        const msInput = document.getElementById('editTaskMaxScoreInput');
        if (msInput) msInput.value = task.maxScore || '';
        document.getElementById('editTaskModal').classList.add('open');
        setTimeout(() => document.getElementById('editTaskNameInput').focus(), 100);
    },

    closeEditModal() {
        document.getElementById('editTaskModal').classList.remove('open');
        this._editingTaskId = null;
    },

    confirmEditModal() {
        const id = this._editingTaskId;
        if (!id) return;
        const task = Shared.data.tasks.find((t) => t.id === id);
        if (!task) return;
        const name = document.getElementById('editTaskNameInput').value.trim();
        if (!name) { this.toast('请输入任务名称', 'warning'); return; }
        const type = document.getElementById('editTaskTypeSelect').value;
        if (Shared.data.tasks.some((t) => t.name === name && t.id !== id)) {
            this.toast(`任务"${name}"已存在`, 'warning');
            return;
        }
        task.name = name;
        task.type = type;
        const msInput = document.getElementById('editTaskMaxScoreInput');
        const maxScore = msInput ? parseInt(msInput.value) : null;
        task.maxScore = (!isNaN(maxScore) && maxScore > 0) ? maxScore : null;
        Shared.saveData();
        this.render();
        this.closeEditModal();
        this.toast(`已更新任务"${name}"`);
    },

    bindEvents() {
        document.getElementById('addTaskBtn').addEventListener('click', () => {
            const input = document.getElementById('taskNameInput');
            const typeSelect = document.getElementById('taskTypeSelect');
            this.addTask(input.value, typeSelect.value);
            input.value = '';
            const msInput = document.getElementById('taskMaxScoreInput');
            if (msInput) msInput.value = '';
            input.focus();
        });
        document.getElementById('taskNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('addTaskBtn').click();
        });
        document.getElementById('taskMaxScoreInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('addTaskBtn').click();
        });
        document.getElementById('editTaskCancel').addEventListener('click', () => this.closeEditModal());
        document.getElementById('editTaskConfirm').addEventListener('click', () => this.confirmEditModal());
        document.getElementById('editTaskModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeEditModal();
        });
        document.getElementById('editTaskNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.confirmEditModal();
        });
    },

    render() {
        const container = document.getElementById('taskList');
        document.getElementById('taskCount').textContent = Shared.data.tasks.length;

        if (Shared.data.tasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="icon">🏅</div><p>暂无任务，请在上方添加</p></div>';
            return;
        }

        const basic = Shared.data.tasks.filter((t) => (t.type || 'basic') === 'basic');
        const challenge = Shared.data.tasks.filter((t) => t.type === 'challenge');

        let html = '';

        const renderGroup = (tasks, label, icon, typeClass) => {
            if (tasks.length === 0) return '';
            return `<div class="task-group">
                <div class="task-group-header">${icon} ${label} <span class="task-group-count">${tasks.length}个</span></div>
                ${tasks.map((t) => {
                    const inUse = Shared.data.trainings.some((tr) =>
                        tr.mockCompetitions.some((m) =>
                            (m.tasks || []).some((x) => x.taskId === t.id) ||
                            (m.taskIds || []).includes(t.id) || m.taskId === t.id
                        )
                    );
                    const delBtn = inUse
                        ? '<span class="task-locked">🔒</span>'
                        : `<button class="btn btn-danger btn-xs del-task-btn" data-task-id="${t.id}">✕</button>`;
                    const maxScoreLabel = t.maxScore ? `<span style="font-size:0.7rem;color:var(--gray-400);margin-left:0.3rem;">满分${t.maxScore}</span>` : '';
                    return `<div class="task-item">
                        <div class="task-name"><span class="type-badge ${typeClass}">${label}</span> ${this.escapeHtml(t.name)}${maxScoreLabel}</div>
                        <div style="display:flex;gap:0.3rem;align-items:center;">
                            <button class="btn btn-outline btn-xs edit-task-btn" data-task-id="${t.id}">✏️</button>
                            ${delBtn}
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
        };

        html += renderGroup(basic, '基本功', '💪', 'type-basic');
        html += renderGroup(challenge, '挑战类', '🔥', 'type-challenge');

        container.innerHTML = html;

        container.querySelectorAll('.del-task-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.removeTask(btn.dataset.taskId));
        });
        container.querySelectorAll('.edit-task-btn').forEach((btn) => {
            btn.addEventListener('click', () => this.openEditModal(btn.dataset.taskId));
        });

        if (window.updateHeaderStats) window.updateHeaderStats();
    },
};

document.addEventListener('DOMContentLoaded', async () => {
    if (Shared.ready) await Shared.ready;
    TasksApp.init();
});
