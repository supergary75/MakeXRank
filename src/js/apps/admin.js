// =================================================================
//  Admin App — 教务管理 (班级管理 + 学员管理)
// =================================================================
const AdminApp = {
    _editStudentId: null,
    _pendingImport: null,

    init() {
        Shared.loadData();
        this.showSection();
        this.bindEvents();
        this.render();
        this._checkIDBStatus();
    },

    generateId() { return Shared.generateId(); },
    toast(msg, type) { Shared.toast(msg, type); },
    escapeHtml(str) { return Shared.escapeHtml(str); },

    showSection() {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        document.getElementById('section-classes').style.display = tab === 'students' ? 'none' : 'block';
        document.getElementById('section-students').style.display = tab === 'students' ? 'block' : 'none';
    },

    addGroup(name) {
        name = name.trim();
        if (!name) { this.toast('请输入班级名称', 'warning'); return false; }
        if (Shared.data.classes.some((c) => c.name === name)) { this.toast(`班级"${name}"已存在`, 'warning'); return false; }
        const id = this.generateId();
        Shared.data.classes.push({ id, name });
        Shared.saveData();
        this.render();
        this.toast(`已添加班级"${name}"`);
        return true;
    },

    removeGroup(id) {
        const cls = Shared.data.classes.find((c) => c.id === id);
        if (!cls) return;
        if (!confirm(`确定要删除班级"${cls.name}"吗？\n（该班级下的学员将变为不分组）`)) return;
        Shared.data.classes = Shared.data.classes.filter((c) => c.id !== id);
        Shared.data.enrollments.forEach(e => {
            if (e.classId === id && e.status === 'active') {
                e.leftAt = new Date().toISOString().slice(0, 10);
                e.status = 'inactive';
            }
        });
        Shared.saveData();
        this.render();
        this.toast(`已删除班级"${cls.name}"`);
    },

    addStudent(name) {
        name = name.trim();
        if (!name) { this.toast('请输入学员姓名', 'warning'); return false; }
        if (Shared.data.students.some((s) => s.name === name)) { this.toast(`学员"${name}"已存在`, 'warning'); return false; }
        Shared.data.students.push({ id: this.generateId(), name });
        Shared.saveData();
        this.render();
        this.toast(`已添加学员"${name}"`);
        return true;
    },

    openEditStudentModal(id) {
        const student = Shared.data.students.find((s) => s.id === id);
        if (!student) return;
        this._editStudentId = id;
        document.getElementById('editStudentNameInput').value = student.name;
        const select = document.getElementById('editStudentGroupSelect');
        const currentEnroll = Shared.getCurrentEnrollment(id);
        select.innerHTML = '<option value="">不分组</option>' + Shared.data.classes.map((c) =>
            `<option value="${c.id}" ${currentEnroll && currentEnroll.classId === c.id ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`
        ).join('');
        document.getElementById('editStudentModalTitle').textContent = `✏️ 编辑学员 - ${this.escapeHtml(student.name)}`;
        document.getElementById('editStudentModal').classList.add('open');
        setTimeout(() => document.getElementById('editStudentNameInput').focus(), 100);
    },

    closeEditStudentModal() {
        document.getElementById('editStudentModal').classList.remove('open');
        this._editStudentId = null;
    },

    confirmEditStudent() {
        const id = this._editStudentId;
        if (!id) return;
        const student = Shared.data.students.find((s) => s.id === id);
        if (!student) return;
        const newName = document.getElementById('editStudentNameInput').value.trim();
        if (!newName) { this.toast('姓名不能为空', 'warning'); return; }
        if (newName !== student.name && Shared.data.students.some((s) => s.name === newName)) {
            this.toast(`学员"${newName}"已存在`, 'warning');
            return;
        }
        student.name = newName;
        const newClassId = document.getElementById('editStudentGroupSelect').value;
        const currentEnroll = Shared.getCurrentEnrollment(id);
        if (newClassId) {
            if (!currentEnroll || currentEnroll.classId !== newClassId) {
                Shared.createEnrollment(id, newClassId);
            }
        } else {
            if (currentEnroll) {
                Shared.closeEnrollment(currentEnroll.id, 'inactive');
            }
        }
        Shared.saveData();
        this.closeEditStudentModal();
        this.render();
        this.toast(`已更新学员"${student.name}"`);
    },

    editStudent(id) { this.openEditStudentModal(id); },

    removeStudent(id) {
        const student = Shared.data.students.find((s) => s.id === id);
        if (!student) return;
        if (!confirm(`确定要移除学员"${student.name}"吗？`)) return;
        Shared.data.enrollments.forEach(e => {
            if (e.studentId === id && e.status === 'active') {
                e.leftAt = new Date().toISOString().slice(0, 10);
                e.status = 'inactive';
            }
        });
        Shared.data.students = Shared.data.students.filter((s) => s.id !== id);
        Shared.data.trainings.forEach((t) => {
            t.studentIds = t.studentIds.filter((sid) => sid !== id);
            t.mockCompetitions.forEach((m) => { delete m.scores[id]; });
        });
        Shared.saveData();
        this.render();
        this.toast(`已移除学员"${student.name}"`);
    },

    // ============ 数据备份 / 跨设备同步 ============
    // 导出 localStorage 全部键为 JSON 文件
    exportAllData() {
        try {
            const keys = {};
            let totalBytes = 0;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                keys[key] = value;
                totalBytes += (key.length + (value ? value.length : 0)) * 2; // UTF-16 近似字节
            }
            const payload = {
                app: 'insTools',
                type: 'localstorage-backup',
                formatVersion: 1,
                exportedAt: new Date().toISOString(),
                keyCount: Object.keys(keys).length,
                keys,
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `insTools_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.toast(`✅ 已导出 ${payload.keyCount} 个键，约 ${(totalBytes / 1024).toFixed(1)} KB`);
        } catch (e) {
            console.warn('exportAllData error:', e);
            this.toast('导出失败', 'warning');
        }
    },

    // 解析并预览导入文件
    async handleImportFile(file) {
        if (!file) return;
        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            if (!payload || typeof payload !== 'object' || !payload.keys || typeof payload.keys !== 'object') {
                this.toast('文件格式不正确：缺少 keys 字段', 'warning');
                return;
            }
            this._pendingImport = payload;
            const keyNames = Object.keys(payload.keys);
            const totalBytes = keyNames.reduce((s, k) => s + (k.length + (payload.keys[k] ? payload.keys[k].length : 0)) * 2, 0);
            const timeStr = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : '未知';
            let info = `📄 ${file.name}\n导出时间：${timeStr}\n键数量：${keyNames.length}　数据量：${(totalBytes / 1024).toFixed(1)} KB`;
            if (payload.keys.sts_storage_mode === 'idb') {
                info += '\n⚠️ 源设备处于 IndexedDB 模式，本次备份不含 STS_DB 数据；建议在源设备切回 localStorage 后重新导出';
            }
            document.getElementById('importPreviewInfo').textContent = info;
            document.getElementById('importKeyList').textContent = keyNames.join('\n');
            document.getElementById('importModal').classList.add('open');
        } catch (e) {
            console.warn('handleImportFile error:', e);
            this.toast('导入文件解析失败：不是有效的 JSON', 'warning');
        }
    },

    closeImportModal() {
        document.getElementById('importModal').classList.remove('open');
        this._pendingImport = null;
    },

    confirmImport() {
        const payload = this._pendingImport;
        if (!payload) return;
        const mode = document.querySelector('input[name="importMode"]:checked').value;
        try {
            if (mode === 'overwrite') localStorage.clear();
            Object.keys(payload.keys).forEach((k) => localStorage.setItem(k, payload.keys[k]));
            Shared.loadData();
            this.render();
            const modeLabel = mode === 'overwrite' ? '整体覆盖' : '合并写入';
            this.toast(`✅ 已导入 ${Object.keys(payload.keys).length} 个键（${modeLabel}）`);
            this.closeImportModal();
        } catch (e) {
            console.warn('confirmImport error:', e);
            this.toast('导入写入失败', 'warning');
        }
    },

    async _checkIDBStatus() {
        const status = document.getElementById('engineStatus');
        const dbOk = await Shared._initIDB();
        const engine = Shared._getEngine();
        const idbRadio = document.querySelector('input[value="idb"]');
        const lsRadio = document.querySelector('input[value="ls"]');

        if (dbOk) {
            status.textContent = '✅ STS_DB 就绪';
            idbRadio.disabled = false;
        } else {
            status.textContent = '❌ IndexedDB 不可用，仅 localStorage';
            return;
        }

        if (engine === 'idb') {
            idbRadio.checked = true;
            document.getElementById('switchToLSBtn').style.display = '';
            await Shared._overrideFromIDB();
            this.render();
            this.toast('🗄️ 数据源: IndexedDB (STS_DB)');
        } else {
            lsRadio.checked = true;
        }
    },

    bindEvents() {
        document.getElementById('addGroupBtn').addEventListener('click', () => {
            const input = document.getElementById('groupNameInput');
            this.addGroup(input.value);
            input.value = '';
            input.focus();
        });
        document.getElementById('groupNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('addGroupBtn').click();
        });
        document.getElementById('addStudentBtn').addEventListener('click', () => {
            const nameInput = document.getElementById('studentNameInput');
            this.addStudent(nameInput.value);
            nameInput.value = '';
            nameInput.focus();
        });
        document.getElementById('studentNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('addStudentBtn').click();
        });
        document.getElementById('editStudentModalCancel').addEventListener('click', () => this.closeEditStudentModal());
        document.getElementById('editStudentModalConfirm').addEventListener('click', () => this.confirmEditStudent());
        document.getElementById('editStudentNameInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.confirmEditStudent();
        });
        document.getElementById('editStudentModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeEditStudentModal();
        });

        document.getElementById('verifyIDBBtn').addEventListener('click', async () => {
            const log = document.getElementById('idbVerifyLog');
            log.style.display = 'block';
            log.textContent = '⏳ 验证中...\n';
            const result = await Shared._verifyIDB();
            log.textContent = result.steps.join('\n');
            if (result.pass) {
                log.textContent += '\n\n══════ ✅ 全部通过 — 可切换到 IndexedDB ══════';
                const idbRadio = document.querySelector('input[value="idb"]');
                idbRadio.disabled = false;
                Shared.toast('✅ 验证通过，可切换到 STS_DB');
            } else {
                log.textContent += '\n\n══════ ❌ 数据不一致 — 请勿切换 ══════';
            }
        });

        document.querySelectorAll('input[name="storageEngine"]').forEach(radio => {
            radio.addEventListener('change', async function () {
                if (this.value === 'idb') {
                    Shared._setEngine('idb');
                    Shared.loadData();
                    await Shared._overrideFromIDB();
                    document.getElementById('switchToLSBtn').style.display = '';
                    AdminApp.render();
                    Shared.toast('🗄️ 已切换到 IndexedDB (STS_DB)');
                } else {
                    Shared._setEngine('ls');
                    Shared.loadData();
                    document.getElementById('switchToLSBtn').style.display = 'none';
                    AdminApp.render();
                    Shared.toast('📦 已切换到 localStorage');
                }
            });
        });

        document.getElementById('switchToLSBtn').addEventListener('click', () => {
            document.querySelector('input[value="ls"]').click();
        });

        // === 数据备份 / 导入导出 ===
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportAllData());
        document.getElementById('importDataBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => {
            this.handleImportFile(e.target.files[0]);
            e.target.value = '';
        });
        document.getElementById('importModalCancel').addEventListener('click', () => this.closeImportModal());
        document.getElementById('importModalConfirm').addEventListener('click', () => this.confirmImport());
        document.getElementById('importModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeImportModal();
        });
    },

    render() {
        try { this.renderGroups(); } catch (e) { console.warn('renderGroups error:', e); }
        try { this.renderStudents(); } catch (e) { console.warn('renderStudents error:', e); }
        if (window.updateHeaderStats) window.updateHeaderStats();
    },

    renderGroups() {
        const container = document.getElementById('groupList');
        const allClasses = Shared.data.classes;
        if (allClasses.length === 0) {
            container.innerHTML = '<span style="font-size:0.85rem;color:var(--gray-400);">暂无班级，请添加</span>';
            return;
        }
        container.innerHTML = allClasses.map((c) =>
            `<span style="display:inline-flex;align-items:center;gap:0.3rem;padding:0.25rem 0.7rem;background:var(--primary-bg);color:var(--primary);border-radius:16px;font-size:0.85rem;">
                🏫 ${this.escapeHtml(c.name)}
                <span class="del-group" data-group-id="${c.id}" style="cursor:pointer;color:var(--gray-400);font-size:0.8rem;" title="删除班级">✕</span>
            </span>`
        ).join('');
        container.querySelectorAll('.del-group').forEach((el) => {
            el.addEventListener('click', () => this.removeGroup(el.dataset.groupId));
        });
    },

    renderStudents() {
        const container = document.getElementById('studentList');
        document.getElementById('studentCount').textContent = Shared.data.students.length;
        if (Shared.data.students.length === 0) {
            container.innerHTML = '<div class="empty-state"><div class="icon">👤</div><p>暂无学员，请在上方添加</p></div>';
            return;
        }
        const sorted = [...Shared.data.students].sort((a, b) => {
            const ga = Shared.getCurrentClassName(a.id);
            const gb = Shared.getCurrentClassName(b.id);
            if (ga && !gb) return -1;
            if (!ga && gb) return 1;
            if (ga !== gb) return ga.localeCompare(gb, 'zh');
            return a.name.localeCompare(b.name, 'zh');
        });
        let html = `<div style="overflow-x:auto;"><table class="score-table" style="font-size:0.85rem;">
            <thead><tr>
                <th style="width:40px;text-align:center;">#</th>
                <th style="text-align:left;">姓名</th>
                <th style="text-align:left;">班级</th>
                <th style="width:80px;text-align:center;">操作</th>
            </tr></thead><tbody>`;
        sorted.forEach((s, i) => {
            const gn = Shared.getCurrentClassName(s.id);
            const groupDisplay = gn
                ? `<span class="edit-student-group" data-student-id="${s.id}" title="点击修改班级" style="cursor:pointer;color:var(--gray-600);border-bottom:1px dashed var(--gray-300);">🏫 ${this.escapeHtml(gn)}</span>`
                : `<span class="edit-student-group" data-student-id="${s.id}" title="点击设置班级" style="cursor:pointer;color:var(--gray-400);border-bottom:1px dashed var(--gray-300);">—</span>`;
            html += `<tr>
                <td style="text-align:center;color:var(--gray-400);">${i + 1}</td>
                <td><strong>${this.escapeHtml(s.name)}</strong></td>
                <td>${groupDisplay}</td>
                <td style="text-align:center;white-space:nowrap;">
                    <button class="edit-student" data-student-id="${s.id}" title="编辑" style="background:none;border:none;cursor:pointer;color:var(--primary);font-size:0.8rem;padding:0.15rem 0.4rem;">✏️</button>
                    <button class="del" data-student-id="${s.id}" title="移除" style="background:none;border:none;cursor:pointer;color:var(--danger);font-size:0.8rem;padding:0.15rem 0.4rem;">🗑️</button>
                </td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
        container.querySelectorAll('.del').forEach((el) => {
            el.addEventListener('click', () => this.removeStudent(el.dataset.studentId));
        });
        container.querySelectorAll('.edit-student').forEach((el) => {
            el.addEventListener('click', () => this.editStudent(el.dataset.studentId));
        });
        container.querySelectorAll('.edit-student-group').forEach((el) => {
            el.addEventListener('click', () => this.editStudent(el.dataset.studentId));
        });
    },
};

document.addEventListener('DOMContentLoaded', async () => {
    if (Shared.ready) await Shared.ready;
    AdminApp.init();
});
