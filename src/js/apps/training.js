
    // =================================================================
    const TrainingApp = {
        data: null,
        selectedTrainingId: null,
        _editingTrainingId: null,
        _mockTrainingId: null,
        _editingMockId: null,
        _scoreEntryTrainingId: null,
        _scoreEntryMockId: null,
        _detailStudentId: null,
        _scheduleRoundId: null,

        init() {
            Shared.loadData();
            this.data = Shared.data;
            // Migrate legacy practice records: fill missing round numbers
            let changed = false;
            this.data.trainings.forEach(t => {
                if (!t.practiceRecords) return;
                // Group by (date + studentId + taskId), assign round by array order
                const groups = {};
                t.practiceRecords.forEach(r => {
                    if (r.round) return; // already has round
                    const key = r.date + '|' + r.studentId + '|' + r.taskId;
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(r);
                });
                Object.values(groups).forEach(group => {
                    group.forEach((r, i) => { r.round = i + 1; changed = true; });
                });
            });
            if (changed) Shared.saveData();

            // Sync selectedTrainingId with currentTrainingId
            this.selectedTrainingId = this.data.currentTrainingId || null;
            // Check URL param ?id= for sidebar sub-menu navigation
            const params = new URLSearchParams(window.location.search);
            const idParam = params.get('id');
            if (idParam && this.data.trainings.some(t => t.id === idParam)) {
                this.selectedTrainingId = idParam;
            }
            this.bindEvents();
            this.render();
            // Auto-open training modal if ?action=new
            if (params.get('action') === 'new') {
                setTimeout(() => this.openTrainingModal(), 400);
            }
        },

        generateId() { return Shared.generateId(); },
        toast(msg, type) { Shared.toast(msg, type); },
        escapeHtml(str) { return Shared.escapeHtml(str); },
        getRounds(entry) { return Shared.getRounds(entry); },
        getBestScore(entry) { return Shared.getBestScore(entry); },
        getBestScoreTime(entry) { return Shared.getBestScoreTime(entry); },
        getDisplayScore(entry) { return Shared.getDisplayScore(entry); },

        saveData() { Shared.saveData(); },

        // ============ Training Operations ============
        createTraining(name, date, studentIds, tasks) {
            const training = {
                id: this.generateId(),
                name: name.trim() || `闆嗚 ${this.data.trainings.length + 1}`,
                date: date || new Date().toISOString().slice(0, 10),
                studentIds: [...studentIds],
                tasks: tasks || [],
                mockCompetitions: [],
            };
            this.data.trainings.push(training);
            this.saveData();
            this.render();
            this.toast(`宸插垱寤洪泦璁?${training.name}"`);
            return training;
        },

        removeTraining(id) {
            const t = this.data.trainings.find((t) => t.id === id);
            if (!t) return;
            if (!confirm(`确定要删除集训“${t.name}”吗？\n其中的所有模拟赛数据也将被删除。`)) return;
            this.data.trainings = this.data.trainings.filter((t) => t.id !== id);
            if (this.selectedTrainingId === id) {
                this.selectedTrainingId = null;
                this.data.currentTrainingId = null;
            }
            this.saveData();
            this.render();
            this.toast(`宸插垹闄ら泦璁?${t.name}"`);
        },

        setCurrentTraining(id) {
            this.data.currentTrainingId = id;
            this.selectedTrainingId = id;
            this.saveData();
            this.render();
            const t = this.data.trainings.find((tr) => tr.id === id);
            if (t) this.toast(`宸插皢"${t.name}"璁句负褰撳墠闆嗚`);
        },

        toggleTraining(id) {
            this.selectedTrainingId = this.selectedTrainingId === id ? null : id;
            this.render();
        },

        // ============ Mock Competition Operations ============
        addMockCompetition(trainingId, name, date, competitionType, roundType, scores, tasks, group, participantCount) {
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return null;
            const typeLabel = competitionType === 'official' ? '正赛' : '模拟赛';
            const mock = {
                id: this.generateId(),
                name: name.trim() || `${typeLabel} ${training.mockCompetitions.length + 1}`,
                date: date || new Date().toISOString().slice(0, 10),
                competitionType: competitionType || 'mock',
                type: roundType || 'single',
                tasks: tasks || [],
                scores: { ...scores },
                rankings: {},
                comments: {},
                group: group || 'senior',
                participantCount: participantCount || null,
            };
            training.mockCompetitions.push(mock);
            this.saveData();
            this.render();
            this.toast(`宸叉坊鍔?{typeLabel}"${mock.name}"`);
            return mock;
        },

        updateScoreField(trainingId, mockId, studentId, taskId, field, value, round) {
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            const mock = training.mockCompetitions.find((m) => m.id === mockId);
            if (!mock) return;
            if (!mock.scores[studentId]) mock.scores[studentId] = {};
            if (!mock.scores[studentId][taskId]) mock.scores[studentId][taskId] = {};
            const rKey = 'round' + round;
            if (!mock.scores[studentId][taskId][rKey]) mock.scores[studentId][taskId][rKey] = {};
            const target = mock.scores[studentId][taskId][rKey];
            const raw = parseFloat(value);
            const val = field === 'score' ? Math.round(raw) : Math.round(raw * 1000) / 1000;
            if (isNaN(val) || val < 0) {
                delete target[field];
                if (target.score === undefined && target.time === undefined) {
                    delete mock.scores[studentId][taskId][rKey];
                }
                if (Object.keys(mock.scores[studentId][taskId]).length === 0) {
                    delete mock.scores[studentId][taskId];
                }
            } else {
                target[field] = val;
            }
            // Auto-calculate rankings after score change
            this._autoCalcRankings(mock, training);
            this.saveData();
            this.renderStats();
            this._refreshSchedule();
        },

        _refreshSchedule() {
            const el = document.getElementById('scoreEntrySchedule');
            if (!el) return;
            const trainingId = this._scoreEntryTrainingId;
            const mockId = this._scoreEntryMockId;
            if (!trainingId || !mockId) return;
            // Force re-read from data to ensure fresh reference
            const training = this.data.trainings.find(t => t.id === trainingId);
            if (!training) return;
            const mock = training.mockCompetitions.find(m => m.id === mockId);
            if (!mock) return;
            // Build schedule HTML directly using training page's own getRounds
            const studentIds = training.studentIds || [];
            if (studentIds.length === 0) { el.innerHTML = ''; return; }
            const orderList = Schedule.loadOrder(training.id, studentIds);
            if (!this._scheduleRoundId) {
                const saved = Schedule.loadRoundId(training.id);
                this._scheduleRoundId = saved || (mock.tasks && mock.tasks.length > 0 ? mock.tasks[0].taskId + '_R1' : null);
            }
            el.innerHTML = '<div style="width:175px;flex-shrink:0;background:#f8fafc;border-radius:8px;border:1px solid var(--gray-200);padding:0.65rem;font-size:0.82rem;max-height:calc(88vh - 120px);overflow-y:auto;">' +
                Schedule.renderTrainingPanel(mock, training, orderList, this._scheduleRoundId,
                    () => { this._scheduleShuffle(); },
                    () => { this._scheduleReset(); },
                    (e) => { this._scheduleRoundId = e.target.value || null; Schedule.saveOrder(this._scoreEntryTrainingId, null, this._scheduleRoundId); this._refreshSchedule(); },
                    (s) => this.escapeHtml(s)) + '</div>';
            this._bindScheduleEvents(training);
        },

        // ============ Auto Ranking Calculation ============
        // 瑙勫垯锛?
        //   姣忔潯璁板綍涓紝姣忎釜浠诲姟鍙栨渶浣虫垚缁╋紙寰楀垎鏈€楂橈紝寰楀垎鐩稿悓鏃剁敤鏃舵渶鐭級
        //   鎵€鏈変换鍔℃渶浣虫垚缁╀箣鍜屼负鏈€缁堟垚缁?
        //   鎸夋渶缁堝緱鍒嗛檷搴忋€佹渶缁堢敤鏃跺崌搴忔帓鍚?
        _autoCalcRankings(mock, training) {
            const students = this.data.students.filter(s => training.studentIds.includes(s.id));
            const taskItems = (mock.tasks && mock.tasks.length > 0) ? mock.tasks : [{ taskId: null, rounds: 1 }];
            const rankings = Analysis.calcRankings(mock.scores, taskItems, students, this.getRounds.bind(this));
            mock.rankings = rankings;
        },

        updateRanking(trainingId, mockId, studentId, value) {
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            const mock = training.mockCompetitions.find((m) => m.id === mockId);
            if (!mock) return;
            if (!mock.rankings) mock.rankings = {};
            const raw = parseInt(value);
            if (isNaN(raw) || raw < 1) {
                delete mock.rankings[studentId];
            } else {
                mock.rankings[studentId] = raw;
            }
            this.saveData();
            this.renderStats();
        },

        saveComment(trainingId, mockId, studentId, text) {
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            const mock = training.mockCompetitions.find((m) => m.id === mockId);
            if (!mock) return;
            if (!mock.comments) mock.comments = {};
            const trimmed = text.trim();
            if (trimmed) {
                mock.comments[studentId] = trimmed;
            } else {
                delete mock.comments[studentId];
            }
            this.saveData();
            this.toast('评语已保存');
        },

        removeMockCompetition(trainingId, mockId) {
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            const mock = training.mockCompetitions.find((m) => m.id === mockId);
            if (!mock) return;
            if (!confirm(`纭畾瑕佸垹闄ゆā鎷熻禌"${mock.name}"鍚楋紵`)) return;
            training.mockCompetitions = training.mockCompetitions.filter((m) => m.id !== mockId);
            this.saveData();
            this.render();
            this.toast(`宸插垹闄ゆā鎷熻禌"${mock.name}"`);
        },

        // ============ CSV Export ============
        exportCSV(trainingId) {
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            const students = this.data.students.filter((s) => training.studentIds.includes(s.id));
            if (students.length === 0) { this.toast('该集训暂无学员', 'warning'); return; }
            if (training.mockCompetitions.length === 0) { this.toast('该集训暂无记录', 'warning'); return; }

            const BOM = '\uFEFF';
            const escape = (v) => {
                const s = String(v ?? '');
                return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const taskIds = new Set();
            training.mockCompetitions.forEach((mock) => {
                (mock.tasks || []).forEach((t) => { if (t.taskId) taskIds.add(t.taskId); });
            });
            if (taskIds.size === 0) taskIds.add('__default__');

            const taskNames = {};
            taskIds.forEach((tid) => {
                const td = this.data.tasks.find((d) => d.id === tid);
                taskNames[tid] = td ? td.name : (tid === '__default__' ? '榛樿浠诲姟' : tid);
            });

            const rows = [];
            const header = ['学员', '记录', '日期', '类型', '任务', '轮次', '用时(秒)', '得分', '排名'];
            rows.push(header.map(escape).join(','));

            training.mockCompetitions.forEach((mock) => {
                const typeLabel = (mock.competitionType || 'mock') === 'official' ? '正赛' : '模拟赛';
                students.forEach((s) => {
                    const rank = mock.rankings && mock.rankings[s.id] ? mock.rankings[s.id] : '';
                    taskIds.forEach((tid) => {
                        const entry = mock.scores[s.id] && mock.scores[s.id][tid] ? mock.scores[s.id][tid] : null;
                        const rounds = this.getRounds(entry);
                        if (rounds.length === 0) {
                            const row = [s.name, mock.name, mock.date, typeLabel, taskNames[tid], '鍗曡疆', '', '', rank];
                            rows.push(row.map(escape).join(','));
                        } else {
                            rounds.forEach((r, ri) => {
                                const roundLabel = rounds.length > 1 ? `第${ri + 1}轮` : '单轮';
                                const sc = r.score !== undefined && r.score !== null ? r.score : '';
                                const tm = r.time !== undefined && r.time !== null ? r.time.toFixed(3) : '';
                                const row = [s.name, mock.name, mock.date, typeLabel, taskNames[tid], roundLabel, tm, sc, rank];
                                rows.push(row.map(escape).join(','));
                            });
                        }
                    });
                });
            });

            const csv = BOM + rows.join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `鎴愮哗瀵煎嚭_${training.name}_${training.date}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.toast(`宸插鍑?${training.name}"鎴愮哗鏁版嵁`);
        },

        // ============ Backup ============
        exportBackup() {
            const json = JSON.stringify(Shared.data, null, 2);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().slice(0, 10);
            a.download = `makex_backup_${date}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.toast('全部数据已备份');
        },

        importBackup() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        if (!data.students || !data.tasks || !data.trainings) {
                            this.toast('无效的备份文件', 'error');
                            return;
                        }
                        if (!confirm(`确定恢复备份吗？当前数据将被覆盖。\n备份包含 ${data.students.length} 名学员、${data.trainings.length} 个赛事。`)) return;
                        Shared.data = data;
                        Shared.saveData();
                        this.data = Shared.data;
                        this.render();
                        this.toast('数据已恢复');
                    } catch (err) {
                        this.toast('鉂?鏂囦欢瑙ｆ瀽澶辫触', 'error');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        },

        getTaskLabels(mock) {
            let items = [];
            if (mock.tasks && Array.isArray(mock.tasks)) items = mock.tasks;
            else if (Array.isArray(mock)) items = mock.map((id) => ({ taskId: id, rounds: 1 }));
            else if (mock.taskIds && Array.isArray(mock.taskIds)) items = mock.taskIds.map((id) => ({ taskId: id, rounds: 1 }));
            else if (mock.taskId) items = [{ taskId: mock.taskId, rounds: 1 }];
            if (items.length === 0) return '';
            return items.map((item) => {
                const t = this.data.tasks.find((t) => t.id === item.taskId);
                if (!t) return null;
                const r = typeof item.rounds === 'number' ? item.rounds : Array.isArray(item.rounds) ? item.rounds.length : 1;
                const rs = r > 1 ? `x${r}` : '';
                return `<span style="font-size:0.75rem;background:var(--gray-100);color:var(--gray-600);padding:0.1rem 0.5rem;border-radius:10px;margin-left:0.3rem;">${this.escapeHtml(t.name)}${rs}</span>`;
            }).filter(Boolean).join('');
        },

        // ============ Events Binding ============
        bindEvents() {
            document.getElementById('trainingModalCancel').addEventListener('click', () => this.closeTrainingModal());
            document.getElementById('trainingModalConfirm').addEventListener('click', () => this.confirmTrainingModal());
            document.getElementById('mockModalCancel').addEventListener('click', () => this.closeMockModal());
            document.getElementById('mockModalConfirm').addEventListener('click', () => this.confirmMockModal());
            document.getElementById('importPracticeCancel').addEventListener('click', () => this.closeImportPractice());
            document.getElementById('importPracticeConfirm').addEventListener('click', () => this.confirmImportPractice());
            document.getElementById('trainingModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.stopPropagation(); });
            document.getElementById('mockModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.stopPropagation(); });
            document.getElementById('scoreEntryModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.stopPropagation(); });
            document.getElementById('importPracticeModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.stopPropagation(); });
            document.getElementById('editPracticeCancel').addEventListener('click', () => this.closeEditPractice());
            document.getElementById('editPracticeConfirm').addEventListener('click', () => this.confirmEditPractice());
            document.getElementById('editPracticeDelete').addEventListener('click', () => this.deleteEditPractice());
            document.getElementById('editPracticeModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.stopPropagation(); });
        },

        // ============ Import Practice ============
        openImportPractice() {
            if (!this.selectedTrainingId) { this.toast('请先选择一个集训', 'warning'); return; }
            document.getElementById('importPracticeCsv').value = '';
            document.getElementById('importPracticeResult').textContent = '';
            document.getElementById('importPracticeModal').classList.add('open');
        },

        closeImportPractice() {
            document.getElementById('importPracticeModal').classList.remove('open');
        },

        confirmImportPractice() {
            const text = document.getElementById('importPracticeCsv').value.trim();
            if (!text) { this.toast('请粘贴数据', 'warning'); return; }
            const lines = text.split('\n').filter(l => l.trim());
            const training = this.data.trainings.find(t => t.id === this.selectedTrainingId);
            if (!training) return;
            if (!training.practiceRecords) training.practiceRecords = [];

            let success = 0, errors = [];
            // Track round numbers per (date + student + task)
            const roundCounts = {};
            lines.forEach((line, i) => {
                const parts = line.split(',').map(s => s.trim());
                if (parts.length < 3) { errors.push(`绗?{i+1}琛? 瀛楁涓嶈冻`); return; }
                const [studentName, taskName, scoreStr, timeStr, dateStr] = parts;
                const student = this.data.students.find(s => s.name === studentName);
                if (!student) { errors.push(`绗?{i+1}琛? 鎵句笉鍒板鍛?${studentName}"`); return; }
                const task = this.data.tasks.find(t => t.name === taskName);
                if (!task) { errors.push(`绗?{i+1}琛? 鎵句笉鍒颁换鍔?${taskName}"`); return; }
                const score = parseFloat(scoreStr);
                if (isNaN(score)) { errors.push(`绗?{i+1}琛? 鏃犳晥寰楀垎"${scoreStr}"`); return; }
                const time = timeStr ? parseFloat(timeStr) : null;
                if (timeStr && isNaN(time)) { errors.push(`绗?{i+1}琛? 鏃犳晥鐢ㄦ椂"${timeStr}"`); return; }
                const date = dateStr || new Date().toISOString().slice(0, 10);
                // Auto-assign round number within same (date, student, task)
                const key = date + '|' + student.id + '|' + task.id;
                if (!roundCounts[key]) roundCounts[key] = 0;
                roundCounts[key]++;
                // Also check existing records for this key to continue numbering
                const existingMax = Math.max(0, ...training.practiceRecords.filter(r => r.date === date && r.studentId === student.id && r.taskId === task.id).map(r => r.round || 0));
                const round = Math.max(roundCounts[key], existingMax + 1);
                training.practiceRecords.push({
                    id: this.generateId(),
                    studentId: student.id,
                    taskId: task.id,
                    date,
                    round,
                    score: Math.round(score),
                    time: time !== null ? Math.round(time * 1000) / 1000 : null,
                });
                success++;
            });
            this.saveData();
            this.render();
            const resultEl = document.getElementById('importPracticeResult');
            if (errors.length > 0) {
                resultEl.innerHTML = `<span style="color:var(--success);">鉁?鎴愬姛瀵煎叆 ${success} 鏉?/span><br><span style="color:var(--danger);">鈿狅笍 ${errors.length} 鏉￠敊璇細</span><br><span style="font-size:0.78rem;color:var(--gray-500);">${errors.join('<br>')}</span>`;
                this.toast(`瀵煎叆瀹屾垚锛?{success} 鎴愬姛锛?{errors.length} 澶辫触`, errors.length > 0 ? 'warning' : 'success');
            } else {
                resultEl.innerHTML = `<span style="color:var(--success);">鉁?鎴愬姛瀵煎叆 ${success} 鏉?/span>`;
                this.toast(`成功导入 ${success} 条练习记录`);
                setTimeout(() => this.closeImportPractice(), 1200);
            }
        },

        // ============ Practice Stats Helpers ============
        _linearRegression(data) {
            return Analysis.linearRegression(data);
        },

        _detectOutliers(scores) {
            return Analysis.detectOutliers(scores);
        },

        _sCurveStage(scores) {
            return Analysis.sCurveStage(scores);
        },

        _stabilityRating(variance, avg) {
            return Analysis.stabilityRating(variance, avg);
        },

        _calcPracticeStats(studentId, training, taskId) {
            let records = training.practiceRecords.filter(r => !studentId || r.studentId === studentId);
            if (taskId) records = records.filter(r => r.taskId === taskId);
            if (records.length === 0) return null;
            return Analysis.calcPracticeStats(records, this.data.tasks);
        },

        _renderPracticeStats(studentId) {
            const area = document.getElementById('practiceStatsArea');
            if (!area) return;
            const training = this.data.trainings.find(t => t.id === this.selectedTrainingId);
            if (!training || !training.practiceRecords) { area.innerHTML = ''; return; }

            const stats = this._calcPracticeStats(studentId, training);
            const global = this._calcPracticeStats(null, training);
            if (!stats) { area.innerHTML = ''; return; }

            const s = studentId ? this.data.students.find(st => st.id === studentId) : null;
            let html = '';

            // Stage banner
            const bgColor = (stats.stage.stage || '').includes('进步') || (stats.stage.stage || '').includes('稳定') ? '#f0fdf4' : (stats.stage.stage || '').includes('减退') ? '#fefce8' : '#f1f5f9';
            html += `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.45rem 0.75rem;margin-bottom:0.5rem;background:${bgColor};border-radius:var(--radius-sm);font-size:0.85rem;">`;
            html += `<span style="font-weight:700;">${stats.stage.stage}</span>`;
            html += `<span style="color:var(--gray-500);">${stats.stage.desc}</span>`;
            if (stats.outlierCount > 0) html += `<span style="margin-left:auto;color:var(--danger);font-size:0.8rem;">鈿狅笍 鍚?${stats.outlierCount} 娆″け璇?(${stats.outlierRate.toFixed(1)}%)</span>`;
            html += '</div>';

            // Stats grid
            html += '<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.6rem;font-size:0.8rem;">';

            const tag = (label, value, color) =>
                `<span style="display:inline-flex;align-items:center;gap:0.25rem;padding:0.2rem 0.55rem;background:#fff;border-radius:6px;border:1px solid var(--gray-200);">
                    <span style="color:var(--gray-400);font-size:0.75rem;">${label}</span>
                    <strong style="color:${color || 'var(--gray-800)'};">${value}</strong>
                </span>`;

            if (s) html += tag('瀛﹀憳', this.escapeHtml(s.name), 'var(--primary)');
            html += tag('最近10次平均', stats.avgScore.toFixed(1), 'var(--primary)');
            if (stats.avgTime !== null) html += tag('骞冲潎鐢ㄦ椂', stats.avgTime.toFixed(2) + 's', 'var(--accent)');
            html += tag('稳定性', stats.stabilityLabel, stats.stabilityColor);
            html += tag('最高', stats.maxScore, '#10b981');
            html += tag('最低', stats.minScore, '#ef4444');
            html += tag('最佳连续', stats.bestStreak + '次', 'var(--primary)');
            if (stats.fullRate !== null) html += tag('满分率', stats.fullRate.toFixed(1) + '%', stats.fullRate >= 80 ? '#10b981' : '#f59e0b');
            html += tag('棰勬湡鍖洪棿', `${stats.expectedLow.toFixed(0)}-${stats.expectedHigh.toFixed(0)}`, 'var(--primary)');
            html += tag('标准差', `σ=${stats.overallStd.toFixed(1)}`, 'var(--gray-600)');
            html += tag('记录', stats.total + '条');

            // Global comparison
            if (global && global.total > 0 && (!studentId || global.total !== stats.total)) {
                html += '<span style="color:var(--gray-200);padding:0 0.1rem;">|</span>';
                html += tag('馃寪鍏ㄤ綋骞冲潎', global.avgScore.toFixed(1), 'var(--primary)');
                html += tag('鍏ㄤ綋鍖洪棿', `${global.expectedLow.toFixed(0)}-${global.expectedHigh.toFixed(0)}`, 'var(--gray-600)');
            }

            html += '</div>';
            area.innerHTML = html;

            // Filter table rows
            document.querySelectorAll('.pr-row').forEach(row => {
                row.style.display = (!studentId || row.dataset.student === studentId) ? '' : 'none';
            });
        },

        // ============ Edit Practice Record ============
        openEditPractice(prId) {
            const training = this.data.trainings.find(t => t.id === this.selectedTrainingId);
            if (!training || !training.practiceRecords) return;
            const record = training.practiceRecords.find(r => r.id === prId);
            if (!record) return;
            this._editingPracticeId = prId;
            document.getElementById('editPracticeRecordId').value = prId;
            document.getElementById('editPracticeDate').value = record.date;
            const taskSelect = document.getElementById('editPracticeTask');
            taskSelect.innerHTML = this.data.tasks.map(t =>
                `<option value="${t.id}" ${t.id === record.taskId ? 'selected' : ''}>${this.escapeHtml(t.name)}</option>`
            ).join('');
            document.getElementById('editPracticeRound').value = record.round || 1;
            document.getElementById('editPracticeScore').value = record.score;
            document.getElementById('editPracticeTime').value = record.time != null ? record.time : '';
            document.getElementById('editPracticeModal').classList.add('open');
        },

        closeEditPractice() {
            document.getElementById('editPracticeModal').classList.remove('open');
            this._editingPracticeId = null;
        },

        confirmEditPractice() {
            const id = document.getElementById('editPracticeRecordId').value;
            const training = this.data.trainings.find(t => t.id === this.selectedTrainingId);
            if (!training || !training.practiceRecords) return;
            const record = training.practiceRecords.find(r => r.id === id);
            if (!record) return;

            const date = document.getElementById('editPracticeDate').value;
            const taskId = document.getElementById('editPracticeTask').value;
            const round = parseInt(document.getElementById('editPracticeRound').value) || 1;
            const score = parseInt(document.getElementById('editPracticeScore').value);
            const timeStr = document.getElementById('editPracticeTime').value.trim();
            const time = timeStr ? parseFloat(timeStr) : null;

            if (!date) { this.toast('璇烽€夋嫨鏃ユ湡', 'warning'); return; }
            if (isNaN(score)) { this.toast('请输入有效得分', 'warning'); return; }

            record.date = date;
            record.taskId = taskId;
            record.round = round;
            record.score = score;
            record.time = time;
            Shared.saveData();
            this.closeEditPractice();
            // Re-open student detail to refresh
            if (this._detailStudentId) this.openStudentDetail(this._detailStudentId);
            this.toast('已更新练习记录');
        },

        deleteEditPractice() {
            const id = document.getElementById('editPracticeRecordId').value;
            const training = this.data.trainings.find(t => t.id === this.selectedTrainingId);
            if (!training || !training.practiceRecords) return;
            if (!confirm('确定要删除这条练习记录吗？')) return;
            training.practiceRecords = training.practiceRecords.filter(r => r.id !== id);
            Shared.saveData();
            this.closeEditPractice();
            if (this._detailStudentId) this.openStudentDetail(this._detailStudentId);
            this.toast('已删除练习记录');
        },

        // ============ Training Modal ============
        openTrainingModal(trainingId) {
            if (this.data.students.length === 0) { this.toast('璇峰厛娣诲姞瀛﹀憳', 'warning'); return; }
            this._editingTrainingId = trainingId || null;
            const training = trainingId ? this.data.trainings.find((t) => t.id === trainingId) : null;
            this._trainingModalData = training ? [...training.studentIds] : [];

            // Populate group filter dropdown
            const filterSelect = document.getElementById('trainingStudentGroupFilter');
            const allClasses = this.data.classes;
            filterSelect.innerHTML = '<option value="">馃彨 鍏ㄩ儴鐝骇</option>'
                + allClasses.map(c =>
                    `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`
                ).join('')
                + '<option value="__none__">馃摥 鏈垎缁?/option>';
            filterSelect.value = '';

            document.getElementById('trainingNameInput').value = training ? training.name : '';
            document.getElementById('trainingDateInput').value = training ? training.date : new Date().toISOString().slice(0, 10);
            document.getElementById('trainingModalTitle').textContent = trainingId ? '鉁忥笍 缂栬緫闆嗚' : '馃搵 鏂板缓闆嗚';
            document.getElementById('trainingModalConfirm').textContent = trainingId ? '纭淇敼' : '纭鍒涘缓';

            // Render task selection
            this._populateTrainingTaskRounds(training);

            // Render dual list
            this._renderStudentDualList();

            // Filter change event
            filterSelect.onchange = () => this._renderStudentDualList();

            document.getElementById('trainingModal').classList.add('open');
            setTimeout(() => document.getElementById('trainingNameInput').focus(), 100);
        },

        _renderStudentDualList() {
            const selectedIds = this._trainingModalData || [];
            const filterGroupId = document.getElementById('trainingStudentGroupFilter').value;

            // Left: selected students
            const selectedList = document.getElementById('selectedStudentList');
            const selectedStudents = selectedIds.map(id => this.data.students.find(s => s.id === id)).filter(Boolean);
            if (selectedStudents.length === 0) {
                selectedList.innerHTML = '<div class="student-picker-empty">灏氭湭娣诲姞瀛﹀憳<br>鐐瑰嚮鍙充晶瀛﹀憳娣诲姞</div>';
            } else {
                selectedList.innerHTML = selectedStudents.map(s => {
                    const gn = Shared.getCurrentClassName(s.id);
                    return `<div class="student-picker-item" data-id="${s.id}">
                        <span class="picker-item-name">${this.escapeHtml(s.name)}</span>
                        ${gn ? `<span class="picker-item-group">${this.escapeHtml(gn)}</span>` : ''}
                        <span class="picker-item-action" title="绉婚櫎">鉁?/span>
                    </div>`;
                }).join('');
                selectedList.querySelectorAll('.student-picker-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const id = el.dataset.id;
                        this._trainingModalData = this._trainingModalData.filter(sid => sid !== id);
                        this._renderStudentDualList();
                    });
                });
            }
            document.getElementById('selectedCount').textContent = selectedStudents.length + ' 人';

            // Right: all students (filtered), selected ones highlighted
            const allList = document.getElementById('allStudentList');
            let filtered = [...this.data.students];
            if (filterGroupId === '__none__') {
                filtered = filtered.filter(s => !Shared.getCurrentClassId(s.id));
            } else if (filterGroupId) {
                filtered = filtered.filter(s => Shared.getCurrentClassId(s.id) === filterGroupId);
            }
            const sorted = filtered.sort((a, b) => {
                const ga = Shared.getCurrentClassName(a.id), gb = Shared.getCurrentClassName(b.id);
                if (ga && !gb) return -1;
                if (!ga && gb) return 1;
                if (ga !== gb) return ga.localeCompare(gb, 'zh');
                return a.name.localeCompare(b.name, 'zh');
            });
            if (sorted.length === 0) {
                allList.innerHTML = '<div class="student-picker-empty">璇ョ彮绾ф殏鏃犲鍛?/div>';
            } else {
                allList.innerHTML = sorted.map(s => {
                    const isSelected = selectedIds.includes(s.id);
                    const gn = Shared.getCurrentClassName(s.id);
                    return `<div class="student-picker-item${isSelected ? ' is-selected' : ''}" data-id="${s.id}">
                        <span class="picker-item-name">${this.escapeHtml(s.name)}</span>
                        ${gn ? `<span class="picker-item-group">${this.escapeHtml(gn)}</span>` : ''}
                        <span class="picker-item-action" title="${isSelected ? '移除' : '添加'}">${isSelected ? '−' : '+'}</span>
                    </div>`;
                }).join('');
                allList.querySelectorAll('.student-picker-item').forEach(el => {
                    el.addEventListener('click', () => {
                        const id = el.dataset.id;
                        if (selectedIds.includes(id)) {
                            this._trainingModalData = this._trainingModalData.filter(sid => sid !== id);
                        } else {
                            this._trainingModalData.push(id);
                        }
                        this._renderStudentDualList();
                    });
                });
            }
        },

        _populateTrainingTaskRounds(training) {
            const container = document.getElementById('trainingTaskRounds');
            if (this.data.tasks.length === 0) {
                container.innerHTML = '<span style="font-size:0.85rem;color:var(--gray-400);">鏆傛棤浠诲姟锛岃鍏堟坊鍔?/span>';
                return;
            }
            const existingTasks = training ? (training.tasks || []) : [];
            const getExisting = (taskId) => existingTasks.find((t) => t.taskId === taskId);
            const basic = this.data.tasks.filter((t) => (t.type || 'basic') === 'basic');
            const challenge = this.data.tasks.filter((t) => t.type === 'challenge');

            const renderTaskRow = (t) => {
                const existing = getExisting(t.id);
                const checked = existing ? 'checked' : '';
                const rounds = existing ? existing.rounds : 1;
                return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;padding:0.3rem 0.6rem;background:var(--gray-50);border-radius:6px;flex-wrap:wrap;">
                    <input type="checkbox" class="training-task-cb" value="${t.id}" style="flex-shrink:0;" ${checked}>
                    <span style="flex:1;font-size:0.9rem;">
                        <span style="font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:8px;font-weight:600;margin-right:0.3rem;${(t.type || 'basic') === 'basic' ? 'background:#dbeafe;color:#1d4ed8;' : 'background:#fef3c7;color:#92400e;'}">${(t.type || 'basic') === 'basic' ? '基本功' : '挑战类'}</span>
                        ${this.escapeHtml(t.name)}
                    </span>
                    <select class="training-round-select" ${checked ? '' : 'disabled'} style="padding:0.2rem 0.4rem;border:1px solid var(--gray-300);border-radius:4px;font-size:0.8rem;">
                        <option value="1" ${rounds === 1 ? 'selected' : ''}>1杞?/option>
                        <option value="2" ${rounds === 2 ? 'selected' : ''}>2杞?/option>
                        <option value="3" ${rounds === 3 ? 'selected' : ''}>3杞?/option>
                        <option value="4" ${rounds === 4 ? 'selected' : ''}>4杞?/option>
                    </select>
                </div>`;
            };

            let html = '<div style="font-size:0.8rem;color:var(--gray-500);margin-bottom:0.4rem;">鍕鹃€変换鍔★紝骞堕€夋嫨璇ヤ换鍔¤鎵撳嚑杞?/div>';
            if (basic.length > 0) {
                html += `<div style="font-size:0.8rem;font-weight:700;color:var(--gray-600);padding:0.2rem 0.4rem;margin-bottom:0.2rem;">馃挭 鍩烘湰鍔?/div>`;
                html += basic.map(renderTaskRow).join('');
            }
            if (challenge.length > 0) {
                html += `<div style="font-size:0.8rem;font-weight:700;color:var(--gray-600);padding:0.2rem 0.4rem;margin-bottom:0.2rem;margin-top:0.3rem;">馃敟 鎸戞垬绫?/div>`;
                html += challenge.map(renderTaskRow).join('');
            }
            container.innerHTML = html;
            container.querySelectorAll('.training-task-cb').forEach((cb) => {
                cb.addEventListener('change', function () {
                    const row = this.closest('div');
                    const sel = row.querySelector('.training-round-select');
                    if (sel) sel.disabled = !this.checked;
                });
            });
        },

        closeTrainingModal() {
            document.getElementById('trainingModal').classList.remove('open');
            this._editingTrainingId = null;
        },

        confirmTrainingModal() {
            const name = document.getElementById('trainingNameInput').value.trim() || `闆嗚 ${this.data.trainings.length + 1}`;
            const date = document.getElementById('trainingDateInput').value || new Date().toISOString().slice(0, 10);
            const studentIds = this._trainingModalData || [];
            if (studentIds.length === 0) { this.toast('请至少选择一名学员', 'warning'); return; }

            // Read selected tasks
            const tasks = [];
            document.querySelectorAll('#trainingTaskRounds .training-task-cb:checked').forEach((cb) => {
                const row = cb.closest('div');
                const sel = row.querySelector('.training-round-select');
                const rounds = sel ? parseInt(sel.value) : 1;
                tasks.push({ taskId: cb.value, rounds });
            });

            if (this._editingTrainingId) {
                const training = this.data.trainings.find((t) => t.id === this._editingTrainingId);
                if (training) {
                    training.name = name; training.date = date; training.studentIds = studentIds; training.tasks = tasks;
                    this.saveData(); this.render(); this.toast(`宸叉洿鏂伴泦璁?${name}"`);
                }
            } else {
                this.createTraining(name, date, studentIds, tasks);
            }
            this.closeTrainingModal();
        },

        // ============ Mock Modal ============
        openMockModal(trainingId, mockId) {
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            this._mockTrainingId = trainingId;
            this._editingMockId = mockId || null;
            const mock = mockId ? training.mockCompetitions.find((m) => m.id === mockId) : null;

            document.getElementById('mockNameInput').value = mock ? mock.name : '';
            document.getElementById('mockDateInput').value = mock ? mock.date : new Date().toISOString().slice(0, 10);
            document.getElementById('mockGroupSelect').value = mock ? (mock.group || 'senior') : 'senior';
            document.getElementById('mockParticipantCount').value = mock ? (mock.participantCount || '') : '';
            const hasOfficial = training.mockCompetitions.some(m => (m.competitionType || 'mock') === 'official');
            const typeSelect = document.getElementById('competitionTypeSelect');
            if (hasOfficial && !mockId) {
                typeSelect.value = 'official';
                typeSelect.disabled = true;
            } else {
                typeSelect.value = mock ? (mock.competitionType || 'mock') : 'mock';
                typeSelect.disabled = false;
            }
            this.populateTaskRounds(mock);
            document.querySelector('#mockModal h3').textContent = mockId ? '鉁忥笍 淇敼璁板綍' : '馃摑 鏂板璁板綍';
            document.getElementById('mockModalConfirm').textContent = mockId ? '纭淇敼' : '纭娣诲姞';
            document.getElementById('mockModal').classList.add('open');
            setTimeout(() => document.getElementById('mockNameInput').focus(), 100);
        },

        populateTaskRounds(mock) {
            const container = document.getElementById('mockTaskRounds');
            // Only show tasks that belong to this training
            const training = this.data.trainings.find((t) => t.id === this._mockTrainingId);
            const trainingTaskIds = training ? (training.tasks || []).map((t) => t.taskId) : [];
            const availableTasks = this.data.tasks.filter((t) => trainingTaskIds.includes(t.id));
            if (availableTasks.length === 0) {
                container.innerHTML = '<span style="font-size:0.85rem;color:var(--gray-400);">璇ラ泦璁殏鏈叧鑱斾换鍔★紝璇峰厛鍦ㄩ泦璁缃腑娣诲姞</span>';
                return;
            }
            const existingTasks = mock ? (mock.tasks || []) : [];
            const getExisting = (taskId) => existingTasks.find((t) => t.taskId === taskId);
            const basic = availableTasks.filter((t) => (t.type || 'basic') === 'basic');
            const challenge = availableTasks.filter((t) => t.type === 'challenge');

            const renderTaskRow = (t) => {
                const existing = getExisting(t.id);
                const checked = existing ? 'checked' : '';
                const rounds = existing ? existing.rounds : 1;
                return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.35rem;padding:0.3rem 0.6rem;background:var(--gray-50);border-radius:6px;flex-wrap:wrap;">
                    <input type="checkbox" class="task-cb" value="${t.id}" style="flex-shrink:0;" ${checked}>
                    <span style="flex:1;font-size:0.9rem;">
                        <span style="font-size:0.7rem;padding:0.1rem 0.4rem;border-radius:8px;font-weight:600;margin-right:0.3rem;${(t.type || 'basic') === 'basic' ? 'background:#dbeafe;color:#1d4ed8;' : 'background:#fef3c7;color:#92400e;'}">${(t.type || 'basic') === 'basic' ? '基本功' : '挑战类'}</span>
                        ${this.escapeHtml(t.name)}
                    </span>
                    <select class="round-select" ${checked ? '' : 'disabled'} style="padding:0.2rem 0.4rem;border:1px solid var(--gray-300);border-radius:4px;font-size:0.8rem;">
                        <option value="1" ${rounds === 1 ? 'selected' : ''}>1杞?/option>
                        <option value="2" ${rounds === 2 ? 'selected' : ''}>2杞?/option>
                        <option value="3" ${rounds === 3 ? 'selected' : ''}>3杞?/option>
                        <option value="4" ${rounds === 4 ? 'selected' : ''}>4杞?/option>
                    </select>
                </div>`;
            };

            let html = '<div style="font-size:0.8rem;color:var(--gray-500);margin-bottom:0.4rem;">鍕鹃€変换鍔★紝骞堕€夋嫨璇ヤ换鍔¤鎵撳嚑杞?/div>';
            if (basic.length > 0) {
                html += `<div style="font-size:0.8rem;font-weight:700;color:var(--gray-600);padding:0.2rem 0.4rem;margin-bottom:0.2rem;">馃挭 鍩烘湰鍔?/div>`;
                html += basic.map(renderTaskRow).join('');
            }
            if (challenge.length > 0) {
                html += `<div style="font-size:0.8rem;font-weight:700;color:var(--gray-600);padding:0.2rem 0.4rem;margin-bottom:0.2rem;margin-top:0.3rem;">馃敟 鎸戞垬绫?/div>`;
                html += challenge.map(renderTaskRow).join('');
            }
            container.innerHTML = html;
            container.querySelectorAll('.task-cb').forEach((cb) => {
                cb.addEventListener('change', function () {
                    const row = this.closest('div');
                    const sel = row.querySelector('.round-select');
                    if (sel) sel.disabled = !this.checked;
                });
            });
        },

        closeMockModal() {
            document.getElementById('mockModal').classList.remove('open');
            this._mockTrainingId = null;
            this._editingMockId = null;
        },

        confirmMockModal() {
            const trainingId = this._mockTrainingId;
            if (!trainingId) return;
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            const competitionType = document.getElementById('competitionTypeSelect').value;
            const hasOfficial = training.mockCompetitions.some(m => (m.competitionType || 'mock') === 'official');
            if (!this._editingMockId && competitionType === 'mock' && hasOfficial) {
                this.toast('已有正赛记录，不能再新增模拟赛', 'warning');
                return;
            }
            let name = document.getElementById('mockNameInput').value.trim();
            if (!name) {
                name = competitionType === 'official' ? '正赛' : '第' + (training.mockCompetitions.length + 1) + '轮';
            }
            const date = document.getElementById('mockDateInput').value || new Date().toISOString().slice(0, 10);
            const group = document.getElementById('mockGroupSelect').value;
            const pCountRaw = document.getElementById('mockParticipantCount').value.trim();
            const participantCount = pCountRaw ? parseInt(pCountRaw) : null;
            const tasks = [];
            document.querySelectorAll('#mockTaskRounds .task-cb:checked').forEach((cb) => {
                const row = cb.closest('div');
                const sel = row.querySelector('.round-select');
                const rounds = sel ? parseInt(sel.value) : 1;
                tasks.push({ taskId: cb.value, rounds });
            });

            if (this._editingMockId) {
                const mock = training.mockCompetitions.find((m) => m.id === this._editingMockId);
                if (mock) {
                    mock.name = name; mock.date = date; mock.competitionType = competitionType;
                    mock.group = group; mock.participantCount = participantCount;
                    const oldTasks = [...(mock.tasks || [])];
                    mock.tasks = tasks;
                    Object.keys(mock.scores).forEach((sid) => {
                        Object.keys(mock.scores[sid]).forEach((tid) => {
                            const stillExists = tasks.some((t) => t.taskId === tid);
                            if (!stillExists) delete mock.scores[sid][tid];
                        });
                    });
                    this.saveData(); this.render(); this.toast(`宸叉洿鏂拌褰?${name}"`);
                }
            } else {
                this.addMockCompetition(trainingId, name, date, competitionType, 'single', {}, tasks, group, participantCount);
            }
            this.closeMockModal();
        },

        // ============ Score Entry Modal ============
        openScoreEntry(trainingId, mockId) {
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            const mock = training.mockCompetitions.find((m) => m.id === mockId);
            if (!mock) return;
            this._scoreEntryTrainingId = trainingId;
            this._scoreEntryMockId = mockId;
            // Ensure rankings are computed before display
            this._autoCalcRankings(mock, training);
            this.renderScoreEntry();
            document.getElementById('scoreEntryModal').classList.add('open');
        },

        closeScoreEntry() {
            document.getElementById('scoreEntryModal').classList.remove('open');
            this._scoreEntryTrainingId = null;
            this._scoreEntryMockId = null;
        },

        renderScoreEntry() {
            const container = document.getElementById('scoreEntryContent');
            const trainingId = this._scoreEntryTrainingId;
            const mockId = this._scoreEntryMockId;
            if (!trainingId || !mockId) return;
            const training = this.data.trainings.find((t) => t.id === trainingId);
            if (!training) return;
            const mock = training.mockCompetitions.find((m) => m.id === mockId);
            if (!mock) return;
            const students = this.data.students.filter((s) => training.studentIds.includes(s.id));
            const isDouble = mock.type === 'double';

            let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
                <div>
                    <h3 style="font-size:1.15rem;margin:0;">${this.escapeHtml(mock.name)}</h3>
                    <div style="font-size:0.85rem;color:var(--gray-500);">${mock.date} 路 ${training.name}
                        <span style="font-size:0.7rem;background:${(mock.competitionType || 'mock') === 'official' ? '#fef3c7;color:#92400e' : '#dbeafe;color:#1d4ed8'};padding:0.1rem 0.5rem;border-radius:10px;margin-left:0.3rem;">${(mock.competitionType || 'mock') === 'official' ? '正赛' : '模拟赛'}</span>
                        <span style="font-size:0.7rem;background:${(mock.group || 'senior') === 'senior' ? '#e0e7ff;color:#4338ca' : '#fce7f3;color:#9d174d'};padding:0.1rem 0.5rem;border-radius:10px;margin-left:0.3rem;">${(mock.group || 'senior') === 'senior' ? '小高组' : '小低组'}</span>
                        ${mock.participantCount ? `<span style="font-size:0.7rem;background:#f3e8ff;color:#6b21a8;padding:0.1rem 0.5rem;border-radius:10px;margin-left:0.3rem;">馃懃 ${mock.participantCount}浜?/span>` : ''}
                        ${this.getTaskLabels(mock)}
                        <span style="font-size:0.75rem;background:${isDouble ? 'var(--accent)' : 'var(--gray-200)'};color:${isDouble ? '#fff' : 'var(--gray-600)'};padding:0.1rem 0.5rem;border-radius:10px;margin-left:0.3rem;">${isDouble ? '鍙岃疆' : '鍗曡疆'}</span>
                    </div>
                </div>
                <div style="display:flex;gap:0.3rem;flex-wrap:wrap;align-items:center;">
                    <label style="font-size:0.8rem;display:flex;align-items:center;gap:0.25rem;color:var(--gray-600);">
                        鍚屾椂鍦烘暟 <input type="number" id="concurrentLanes" value="${mock.concurrentLanes || 1}" min="1" max="20" style="width:45px;padding:0.2rem 0.3rem;">
                    </label>
                    <button class="btn btn-outline btn-xs" id="editMockFromScoreBtn">鉁忥笍 鏀硅瀹?/button>
                    <button class="btn btn-danger btn-xs" id="deleteMockFromScoreBtn">馃棏锔?鍒犻櫎</button>
                    <button class="btn btn-outline btn-xs" id="closeScoreEntryBtn">鉁?鍏抽棴</button>
                </div>
            </div>
            <div style="display:flex;gap:0.75rem;align-items:flex-start;">`;

            if (students.length === 0) {
                html += '<div style="padding:2rem;text-align:center;color:var(--gray-400);">璇ラ泦璁殏鏃犲鍛?/div>';
                container.innerHTML = html;
                document.getElementById('closeScoreEntryBtn').addEventListener('click', () => this.closeScoreEntry());
                return;
            }

            const taskItems = (mock.tasks && mock.tasks.length > 0) ? mock.tasks : [{ taskId: null, rounds: 1 }];
            const columns = [];
            taskItems.forEach((ti) => {
                const taskDef = ti.taskId ? this.data.tasks.find((d) => d.id === ti.taskId) : null;
                const taskName = taskDef ? taskDef.name : '榛樿浠诲姟';
                const taskId = ti.taskId || '__default__';
                const rounds = ti.rounds || 1;
                for (let r = 1; r <= rounds; r++) {
                    columns.push({ taskId, taskName, round: r, totalRounds: rounds });
                }
            });

            let th = '<tr><th style="width:36px;">#</th><th>瀛﹀憳</th>';
            let taskGroupRow = '<tr><th></th><th></th>';
            for (let i = 0; i < columns.length;) {
                const col = columns[i];
                let count = 0;
                while (i + count < columns.length && columns[i + count].taskId === col.taskId) count++;
                const colspan = count * 2;
                taskGroupRow += `<th colspan="${colspan}" style="text-align:center;font-size:0.8rem;font-weight:700;color:var(--gray-600);">${this.escapeHtml(col.taskName)}</th>`;
                i += count;
            }
            taskGroupRow += '</tr>';

            const isOfficial = (mock.competitionType || 'mock') === 'official';

            th += columns.map((c) => {
                const label = c.totalRounds > 1 ? `第${c.round}轮` : '';
                var labelHtml = label ? label + '<br>' : '';
                return '<th style="text-align:center;font-size:0.75rem;white-space:nowrap;" colspan="2">' + labelHtml + '<span style="font-weight:400;">寰楀垎 / 鐢ㄦ椂</span></th>';
            }).join('');
            if (isOfficial) {
                th += '<th style="text-align:center;font-size:0.75rem;min-width:36px;">馃弲<br><span style="font-weight:400;">鍐呴儴</span></th>';
                th += '<th style="text-align:center;font-size:0.75rem;min-width:44px;">馃弳<br><span style="font-weight:400;">鐪熷疄</span></th>';
            } else {
                th += '<th style="text-align:center;font-size:0.8rem;min-width:48px;">馃弲<br><span style="font-weight:400;font-size:0.7rem;">鎺掑悕</span></th>';
            }
            th += '</tr>';

            let rows = '';
            students.forEach((s) => {
                const rank = mock.rankings && mock.rankings[s.id] ? mock.rankings[s.id] : '';
                const rankLabel = rank === 1 ? '鍐犲啗' : rank === 2 ? '浜氬啗' : rank === 3 ? '瀛ｅ啗' : (rank || '-');
                const rankColor = rank === 1 ? '#d4a017' : rank === 2 ? '#a8a8a8' : rank === 3 ? '#cd7f32' : (rank ? 'var(--accent)' : 'var(--gray-300)');
                rows += `<tr>
                    <td style="text-align:center;">${students.indexOf(s) + 1}</td>
                    <td><strong>${this.escapeHtml(s.name)}</strong></td>`;
                columns.forEach((c) => {
                    const cellKey = s.id + '_' + c.taskId + '_' + c.round;
                    const taskEntry = mock.scores[s.id] && mock.scores[s.id][c.taskId] ? mock.scores[s.id][c.taskId] : null;
                    const rounds = this.getRounds(taskEntry);
                    const roundEntry = rounds[c.round - 1] || {};
                    const isCellWithdrawn = roundEntry.withdrawn;
                    if (isCellWithdrawn) {
                        rows += `<td colspan="2" style="text-align:center;padding:0.15rem 0.1rem;">
                            <span style="color:var(--gray-400);font-size:0.78rem;font-style:italic;">寮冩潈</span>
                            <span class="cell-withdraw-toggle" data-cell-key="${cellKey}" style="cursor:pointer;font-size:0.6rem;margin-left:0.2rem;padding:0.05rem 0.3rem;border-radius:3px;background:var(--primary-bg);color:var(--primary);">鉁?/span>
                        </td>`;
                        return;
                    }
                    const sv = roundEntry.score;
                    const tv = roundEntry.time;
                    const hasValue = sv !== undefined && sv !== null;
                    rows += `<td colspan="2" style="padding:0.15rem 0.1rem;white-space:nowrap;text-align:center;">
                        <span class="cell-withdraw-toggle" data-cell-key="${cellKey}" title="鏍囪寮冩潈" style="cursor:pointer;font-size:0.78rem;padding:0.08rem 0.4rem;border-radius:4px;background:var(--gray-100);color:var(--gray-400);margin-right:0.25rem;">寮?/span>
                        <input type="number" class="score-input" value="${sv ?? ''}"
                        data-training-id="${trainingId}" data-mock-id="${mockId}" data-student-id="${s.id}" data-task-id="${c.taskId}" data-field="score" data-round="${c.round}"
                        min="0" max="999" step="1" style="width:52px;${hasValue ? '' : 'color:var(--gray-300);'}">
                        <input type="number" class="time-input" value="${tv != null ? tv.toFixed(3) : ''}"
                        data-training-id="${trainingId}" data-mock-id="${mockId}" data-student-id="${s.id}" data-task-id="${c.taskId}" data-field="time" data-round="${c.round}"
                        min="0" max="9999" step="0.001" placeholder="绉? style="width:72px;">
                    </td>`;
                });
                rows += `<td style="text-align:center;padding:0.15rem 0.1rem;font-size:0.95rem;font-weight:700;color:${rankColor};">${rankLabel}</td>`;
                if (isOfficial) {
                    const offRank = mock.officialRankings && mock.officialRankings[s.id] || '';
                    rows += `<td style="text-align:center;padding:0.15rem 0.1rem;"><input type="number" class="official-rank-input" data-student-id="${s.id}" value="${offRank}" min="1" max="999" style="width:36px;padding:0.1rem;border:1px solid var(--gray-300);border-radius:3px;font-size:0.8rem;text-align:center;" placeholder="-"></td>`;
                }
                rows += '</tr>';
            });

            html += `<div style="flex:1;min-width:0;overflow-x:auto;"><table class="score-table" style="font-size:0.85rem;">
                <thead>${taskGroupRow}${th}</thead>
                <tbody>${rows}</tbody>
            </table></div>`;
            html += `<div id="scoreEntrySchedule">` + this._renderScheduleContent(mock, training) + `</div>`;
            html += `</div>`; // close the flex wrapper
            container.innerHTML = html;

            // Bind schedule panel events
            this._bindScheduleEvents();

            // Bind concurrent lanes change
            document.getElementById('concurrentLanes').addEventListener('change', (e) => {
                mock.concurrentLanes = Math.max(1, parseInt(e.target.value) || 1);
                this.saveData();
                this._refreshSchedule();
            });

            document.getElementById('closeScoreEntryBtn').addEventListener('click', () => this.closeScoreEntry());
            const editMockBtn = document.getElementById('editMockFromScoreBtn');
            if (editMockBtn) {
                editMockBtn.addEventListener('click', () => {
                    const tid = this._scoreEntryTrainingId;
                    const mid = this._scoreEntryMockId;
                    this.closeScoreEntry();
                    this.openMockModal(tid, mid);
                });
            }
            const deleteMockBtn = document.getElementById('deleteMockFromScoreBtn');
            if (deleteMockBtn) {
                deleteMockBtn.addEventListener('click', () => {
                    const tid = this._scoreEntryTrainingId;
                    const mid = this._scoreEntryMockId;
                    this.closeScoreEntry();
                    this.removeMockCompetition(tid, mid);
                });
            }
            container.querySelectorAll('.score-input, .time-input').forEach((inp) => {
                const save = () => {
                    this.updateScoreField(inp.dataset.trainingId, inp.dataset.mockId, inp.dataset.studentId, inp.dataset.taskId, inp.dataset.field, inp.value, inp.dataset.round);
                };
                inp.addEventListener('change', save);
                inp.addEventListener('blur', save);
            });
            container.querySelectorAll('.official-rank-input').forEach((inp) => {
                const save = () => {
                    const mid = this._scoreEntryMockId;
                    const mock = this.data.trainings.find(t => t.id === this._scoreEntryTrainingId)?.mockCompetitions.find(m => m.id === mid);
                    if (!mock) return;
                    if (!mock.officialRankings) mock.officialRankings = {};
                    const raw = parseInt(inp.value);
                    if (isNaN(raw) || raw < 1) {
                        delete mock.officialRankings[inp.dataset.studentId];
                    } else {
                        mock.officialRankings[inp.dataset.studentId] = raw;
                    }
                    this.saveData();
                };
                inp.addEventListener('change', save);
                inp.addEventListener('blur', save);
            });
            container.querySelectorAll('.cell-withdraw-toggle').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const cellKey = el.dataset.cellKey; // format: studentId_taskId_round
                    const parts = cellKey.split('_');
                    const sid = parts[0];
                    const taskId = parts[1];
                    const round = parseInt(parts[2]);
                    const tid = this._scoreEntryTrainingId;
                    const mid = this._scoreEntryMockId;
                    const training = this.data.trainings.find(t => t.id === tid);
                    if (!training) return;
                    const mock = training.mockCompetitions.find(m => m.id === mid);
                    if (!mock) return;
                    // Toggle withdrawn on this cell
                    if (!mock.scores[sid]) mock.scores[sid] = {};
                    if (!mock.scores[sid][taskId]) mock.scores[sid][taskId] = {};
                    const rKey = 'round' + round;
                    if (!mock.scores[sid][taskId][rKey]) mock.scores[sid][taskId][rKey] = {};
                    const entry = mock.scores[sid][taskId][rKey];
                    if (entry.withdrawn) {
                        // Restore: remove withdrawn flag
                        delete entry.withdrawn;
                    } else {
                        // Withdraw: set flag, clear score/time
                        entry.withdrawn = true;
                        delete entry.score;
                        delete entry.time;
                    }
                    this._autoCalcRankings(mock, training);
                    this.saveData();
                    this.renderScoreEntry();
                });
            });
        },

        // ============ 璧涚▼闈㈡澘锛堟垚缁╁綍鍏ュ脊绐楀唴锛?============
        _renderScheduleContent(mock, training) {
            const studentIds = training.studentIds || [];
            if (studentIds.length === 0) return '';
            const orderList = Schedule.loadOrder(training.id, studentIds);
            if (!this._scheduleRoundId) {
                const saved = Schedule.loadRoundId(training.id);
                this._scheduleRoundId = saved || (mock && mock.tasks && mock.tasks.length > 0 ? mock.tasks[0].taskId + '_R1' : null);
            }
            return '<div style="width:175px;flex-shrink:0;background:#f8fafc;border-radius:8px;border:1px solid var(--gray-200);padding:0.65rem;font-size:0.82rem;max-height:calc(88vh - 120px);overflow-y:auto;">' +
                Schedule.renderTrainingPanel(mock, training, orderList, this._scheduleRoundId,
                    () => { this._scheduleShuffle(); },
                    () => { this._scheduleReset(); },
                    (e) => { this._scheduleRoundId = e.target.value || null; Schedule.saveOrder(this._scoreEntryTrainingId, null, this._scheduleRoundId); this._refreshSchedule(); },
                    (s) => this.escapeHtml(s)) + '</div>';
        },

        _bindScheduleEvents(training) {
            const btnS = document.getElementById('btnSchShuffle');
            const btnR = document.getElementById('btnSchReset');
            const sel = document.getElementById('scheduleRoundSelect');
            if (btnS) btnS.addEventListener('click', () => { this._scheduleShuffle(); });
            if (btnR) btnR.addEventListener('click', () => { this._scheduleReset(); });
            if (sel) sel.addEventListener('change', (e) => {
                this._scheduleRoundId = e.target.value || null;
                Schedule.saveOrder(this._scoreEntryTrainingId, null, this._scheduleRoundId);
                this._refreshSchedule();
            });
        },

        _scheduleShuffle() {
            const trainingId = this._scoreEntryTrainingId;
            if (!trainingId) return;
            const training = this.data.trainings.find(t => t.id === trainingId);
            if (!training) return;
            let list = Schedule.loadOrder(trainingId, training.studentIds || []);
            list = Schedule.shuffle(list);
            Schedule.saveOrder(trainingId, list, this._scheduleRoundId);
            this._refreshSchedule();
        },

        _scheduleReset() {
            const trainingId = this._scoreEntryTrainingId;
            if (!trainingId) return;
            const training = this.data.trainings.find(t => t.id === trainingId);
            if (!training) return;
            Schedule.saveOrder(trainingId, [...(training.studentIds || [])], this._scheduleRoundId);
            this._refreshSchedule();
        },

        // ============ Student Detail Modal ============
        openStudentDetail(studentId) {
            const student = this.data.students.find((s) => s.id === studentId);
            if (!student) return;
            this._detailStudentId = studentId;
            this.renderStudentDetail();
            document.getElementById('studentDetailModal').classList.add('open');
        },

        closeStudentDetail() {
            document.getElementById('studentDetailModal').classList.remove('open');
            this._detailStudentId = null;
        },

        renderStudentDetail() {
            const container = document.getElementById('studentDetailContent');
            const studentId = this._detailStudentId;
            const student = this.data.students.find((s) => s.id === studentId);
            if (!student) { container.innerHTML = ''; return; }

            const training = this.data.trainings.find((t) => t.id === this.selectedTrainingId);
            if (!training) { container.innerHTML = ''; return; }

            const taskMap = {};
            training.mockCompetitions.forEach((mock) => {
                (mock.tasks || []).forEach((t) => {
                    if (t.taskId && !taskMap[t.taskId]) {
                        const td = this.data.tasks.find((d) => d.id === t.taskId);
                        if (td) taskMap[t.taskId] = td.name;
                    }
                });
            });
            const hasLegacy = training.mockCompetitions.some((m) => !m.tasks || m.tasks.length === 0);
            if (hasLegacy) taskMap['__default__'] = '榛樿浠诲姟';
            const taskIds = Object.keys(taskMap);

            const records = [...training.mockCompetitions].reverse();
            const chartRecords = training.mockCompetitions;
            if (records.length === 0) {
                let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.5rem;">
                    <h3 style="font-size:1.15rem;margin:0;">馃搳 ${this.escapeHtml(student.name)} 鎴愮哗璇︽儏</h3>
                    <button class="btn btn-outline" id="closeStudentDetailBtn">鉁?鍏抽棴</button>
                </div>`;
                html += '<div style="padding:2rem;text-align:center;color:var(--gray-400);">鏆傛棤璁板綍</div>';
                container.innerHTML = html;
                document.getElementById('closeStudentDetailBtn').addEventListener('click', () => this.closeStudentDetail());
                return;
            }

            let grandTotalScore = 0, grandTotalTime = 0, hasGrandTotal = false;
            taskIds.forEach((tid) => {
                let bestScore = null, bestTime = null;
                training.mockCompetitions.forEach((mock) => {
                    if (mock.withdrawn && mock.withdrawn[studentId]) return;
                    const entry = mock.scores[studentId] && mock.scores[studentId][tid] ? mock.scores[studentId][tid] : null;
                    if (!entry) return;
                    const rounds = this.getRounds(entry);
                    rounds.forEach((r) => {
                        const sc = r.score, tm = r.time;
                        if (sc !== undefined && sc !== null) {
                            if (bestScore === null || sc > bestScore || (sc === bestScore && (tm !== null && tm !== undefined) && (bestTime === null || tm < bestTime))) {
                                bestScore = sc; bestTime = tm ?? null;
                            }
                        }
                    });
                });
                if (bestScore !== null) {
                    grandTotalScore += bestScore;
                    if (bestTime !== null) grandTotalTime += bestTime;
                    hasGrandTotal = true;
                }
            });

            let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:0.75rem;">
                <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
                    <h3 style="font-size:1.15rem;margin:0;">馃搳 ${this.escapeHtml(student.name)} 鎴愮哗璇︽儏</h3>`;
            if (hasGrandTotal) {
                html += `<span style="display:inline-flex;align-items:center;gap:0.4rem;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:0.3rem 0.8rem;border-radius:var(--radius-sm);font-size:0.85rem;font-weight:600;box-shadow:0 2px 6px rgba(245,158,11,0.25);">
                    馃弳 缁煎悎鏈€浣?${grandTotalTime.toFixed(3)}s / ${grandTotalScore}鍒?/span>`;
            }
            html += `</div>
                <button class="btn btn-outline" id="closeStudentDetailBtn">鉁?鍏抽棴</button>
            </div>`;

            // Section header + view toggle (like practice section)
            const studentViewKey = 'student_detail_view_' + studentId;
            const currentView = localStorage.getItem(studentViewKey) || 'table';
            html += '<div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--gray-200);">';
            html += '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;">';
            html += '<span style="font-size:0.85rem;font-weight:600;color:var(--gray-600);">馃摑 妯℃嫙璧?姝ｈ禌璁板綍</span>';
            html += `<div style="margin-left:auto;display:flex;gap:0.25rem;border-bottom:1px solid var(--gray-200);">`;
            html += `<button class="detail-view-btn" data-view="table" style="padding:0.2rem 0.7rem;font-size:0.8rem;font-weight:600;background:none;border:none;border-bottom:2px solid ${currentView === 'table' ? 'var(--primary)' : 'transparent'};color:${currentView === 'table' ? 'var(--primary)' : 'var(--gray-500)'};cursor:pointer;margin-bottom:-1px;">馃搵 鏁版嵁</button>`;
            html += `<button class="detail-view-btn" data-view="chart" style="padding:0.2rem 0.7rem;font-size:0.8rem;font-weight:600;background:none;border:none;border-bottom:2px solid ${currentView === 'chart' ? 'var(--primary)' : 'transparent'};color:${currentView === 'chart' ? 'var(--primary)' : 'var(--gray-500)'};cursor:pointer;margin-bottom:-1px;">馃搱 瓒嬪娍</button>`;
            html += '</div></div>';

            html += `<div id="detailTableView" style="display:${currentView === 'table' ? 'block' : 'none'};">`;
            html += '<div style="overflow-x:auto;overflow-y:visible;margin-bottom:1rem;"><table class="score-table" style="font-size:0.82rem;">';
            html += '<thead><tr><th>璁板綍</th><th>杞</th>';
            taskIds.forEach((tid) => {
                html += `<th style="text-align:center;" colspan="2">${this.escapeHtml(taskMap[tid])}</th>`;
            });
            html += '</tr><tr><th></th><th></th>';
            taskIds.forEach(() => {
                html += '<th style="text-align:center;font-size:0.7rem;font-weight:400;">鐢ㄦ椂</th><th style="text-align:center;font-size:0.7rem;font-weight:400;">寰楀垎</th>';
            });
            html += '</tr></thead><tbody>';

            (() => {
                let bestPerTask = {};
                taskIds.forEach((tid) => {
                    let bestScore = null, bestTime = null;
                    training.mockCompetitions.forEach((mock) => {
                        if (mock.withdrawn && mock.withdrawn[studentId]) return;
                        const entry = mock.scores[studentId] && mock.scores[studentId][tid] ? mock.scores[studentId][tid] : null;
                        if (!entry) return;
                        const rounds = this.getRounds(entry);
                        rounds.forEach((r) => {
                            const sc = r.score, tm = r.time;
                            if (sc !== undefined && sc !== null) {
                                if (bestScore === null || sc > bestScore || (sc === bestScore && (tm !== null && tm !== undefined) && (bestTime === null || tm < bestTime))) {
                                    bestScore = sc; bestTime = tm ?? null;
                                }
                            }
                        });
                    });
                    bestPerTask[tid] = { bestScore, bestTime };
                    if (bestScore !== null) { hasGrandTotal = true; }
                });

                if (hasGrandTotal) {
                    html += '<tr style="background:var(--primary-bg);font-weight:600;">';
                    html += '<td style="vertical-align:middle;font-weight:700;color:var(--primary);font-size:0.85rem;">馃弳 鏈€浣?/td><td></td>';
                    taskIds.forEach((tid) => {
                        const { bestScore, bestTime } = bestPerTask[tid];
                        if (bestScore !== null) {
                            const timeStr = bestTime !== null ? bestTime.toFixed(3) + 's' : '-';
                            html += `<td style="text-align:center;padding:0.4rem 0.3rem;"><strong style="color:var(--primary);font-size:0.85rem;">${timeStr}</strong></td>`;
                            html += `<td style="text-align:center;padding:0.4rem 0.3rem;"><strong style="color:var(--primary);font-size:0.85rem;">${bestScore}</strong></td>`;
                        } else {
                            html += '<td style="text-align:center;color:var(--gray-300);">-</td><td style="text-align:center;color:var(--gray-300);">-</td>';
                        }
                    });
                    html += '</tr>';
                    html += '<tr><td colspan="' + (2 + taskIds.length * 2) + '" style="border-bottom:3px solid var(--primary);padding:0;"></td></tr>';
                }
            })();

            records.forEach((mock, mi) => {
                let maxRounds = 1;
                taskIds.forEach((tid) => {
                    const entry = mock.scores[studentId] && mock.scores[studentId][tid] ? mock.scores[studentId][tid] : null;
                    const rounds = this.getRounds(entry);
                    if (rounds.length > maxRounds) maxRounds = rounds.length;
                });
                for (let ri = 0; ri < maxRounds; ri++) {
                    html += '<tr>';
                    if (ri === 0) {
                        const allWithdrawn = (mock.tasks || []).every(ti => {
                            const entry = mock.scores[studentId] && mock.scores[studentId][ti.taskId] ? mock.scores[studentId][ti.taskId] : null;
                            if (!entry) return true;
                            const rds = this.getRounds(entry);
                            return rds.every(rd => rd.withdrawn);
                        });
                        const wdLabel = allWithdrawn ? ' <span style="font-size:0.7rem;color:var(--danger);font-style:italic;">(寮冩潈)</span>' : '';
                        html += `<td rowspan="${maxRounds}" style="font-weight:500;vertical-align:middle;">${this.escapeHtml(mock.name)}${wdLabel}<br><small style="color:var(--gray-400);">${mock.date}</small></td>`;
                    }
                    const roundLabel = maxRounds > 1 ? `第${ri + 1}轮` : '单轮';
                    html += `<td style="text-align:center;color:var(--gray-500);font-size:0.78rem;">${roundLabel}</td>`;
                    taskIds.forEach((tid) => {
                        const entry = mock.scores[studentId] && mock.scores[studentId][tid] ? mock.scores[studentId][tid] : null;
                        const rounds = this.getRounds(entry);
                        const roundEntry = rounds[ri] || {};
                        const sc = roundEntry.score, tm = roundEntry.time;
                        if (sc !== undefined && sc !== null) {
                            html += `<td style="text-align:center;">${tm !== null && tm !== undefined ? tm.toFixed(3) + 's' : '-'}</td><td style="text-align:center;"><strong>${sc}</strong></td>`;
                        } else {
                            html += '<td style="text-align:center;color:var(--gray-300);">-</td><td style="text-align:center;color:var(--gray-300);">-</td>';
                        }
                    });
                    html += '</tr>';
                }
            });
            html += '</tbody></table></div></div>'; // close table view

            // Chart view
            html += `<div id="detailChartView" style="display:${currentView === 'chart' ? 'block' : 'none'};">`;

            // Build chart data
            const chartData = Analysis.buildMockChartSeries(chartRecords, taskIds, studentId, this.getRounds.bind(this));

            // Build chart
            const colors = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];
            const chartTasks = taskIds.filter((tid) => chartData[tid].length > 0);

            if (chartTasks.length > 0) {
                const { allLabels, maxScore, maxTime, totalPoints } = Analysis.computeChartBounds(chartData);

                // Chart metric checkboxes (showScore, showTime)
                const showScore = localStorage.getItem('chart_showScore_' + studentId) !== 'false';
                const showTime = localStorage.getItem('chart_showTime_' + studentId) !== 'false';

                // Chart controls
                const zoomKey = 'chart_zoom_' + studentId;
                const needZoom = totalPoints > 10;
                let visiblePoints = parseInt(localStorage.getItem(zoomKey)) || totalPoints;
                if (visiblePoints < 10) visiblePoints = 10;
                if (visiblePoints > totalPoints) visiblePoints = totalPoints;
                const basePx = 780; // approximate chart container width
                const pxPerPoint = Math.round(basePx / visiblePoints);

                let chartHtml = `<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--gray-200);">
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.5rem;justify-content:flex-end;">`;
                if (needZoom) {
                    chartHtml += `<span style="font-size:0.75rem;color:var(--gray-400);">鍚屾鏁版嵁閲?</span>
                        <input type="range" class="chart-zoom-slider" min="10" max="${totalPoints}" value="${visiblePoints}" style="width:80px;accent-color:var(--primary);cursor:pointer;" title="鍚屾椂鏄剧ず鐨勮疆娆℃暟: ${visiblePoints}">
                        <span class="chart-zoom-val" style="font-size:0.7rem;color:var(--gray-500);min-width:2.5em;">${visiblePoints}杞?/span>
                        <span style="color:var(--gray-300);margin:0 0.2rem;">|</span>`;
                }
                chartHtml += `<label style="display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;font-size:0.8rem;">
                            <input type="checkbox" class="chart-metric-cb" data-metric="score" ${showScore ? 'checked' : ''} style="accent-color:var(--primary);">
                            <span style="color:var(--primary);font-weight:600;">馃搳 寰楀垎</span>
                        </label>
                        <label style="display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;font-size:0.8rem;">
                            <input type="checkbox" class="chart-metric-cb" data-metric="time" ${showTime ? 'checked' : ''} style="accent-color:#d97706;">
                            <span style="color:#d97706;font-weight:600;">鈴?鐢ㄦ椂</span>
                        </label>`;
                chartTasks.forEach((tid, idx) => {
                    chartHtml += `<label style="display:inline-flex;align-items:center;gap:0.2rem;font-size:0.8rem;cursor:pointer;">
                        <input type="checkbox" class="chart-task-toggle" data-task-id="${tid}" checked style="accent-color:${colors[idx % colors.length]};">
                        <span style="color:${colors[idx % colors.length]};font-weight:600;">${this.escapeHtml(taskMap[tid])}</span>
                    </label>`;
                });
                chartHtml += '</div>';

                const svgW = Math.max(totalPoints * pxPerPoint, 300);
                const svgH = 280;
                const pad = { top: 20, right: 44, bottom: 50, left: 44 };
                const plotW = svgW - pad.left - pad.right;
                const plotH = svgH - pad.top - pad.bottom;

                chartHtml += `<div class="chart-svg-wrap" style="overflow-x:auto;max-width:100%;">
                    <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none" data-total-points="${totalPoints}" style="display:block;font-size:11px;font-family:inherit;">`;

                // Left Y-axis (score)
                if (showScore) {
                    const ySteps = 5;
                    for (let i = 0; i <= ySteps; i++) {
                        const y = pad.top + plotH - (plotH / ySteps) * i;
                        const val = (maxScore / ySteps) * i;
                        chartHtml += `<line x1="${pad.left}" y1="${y}" x2="${pad.left + plotW}" y2="${y}" stroke="var(--gray-100)" stroke-width="1"/>`;
                        chartHtml += `<text x="${pad.left - 6}" y="${y + 4}" text-anchor="end" fill="var(--primary)" font-size="10">${val.toFixed(0)}</text>`;
                    }
                }

                // Right Y-axis (time)
                if (showTime) {
                    const ySteps = 5;
                    for (let i = 0; i <= ySteps; i++) {
                        const y = pad.top + plotH - (plotH / ySteps) * i;
                        const val = (maxTime / ySteps) * i;
                        chartHtml += `<text x="${pad.left + plotW + 6}" y="${y + 4}" text-anchor="start" fill="#d97706" font-size="10">${val.toFixed(1)}</text>`;
                    }
                }

                // X-axis labels 鈥?record name
                allLabels.forEach((label, i) => {
                    const x = pad.left + (plotW / Math.max(totalPoints - 1, 1)) * i;
                    const posLabel = chartTasks.reduce((acc, tid) => {
                        const pt = chartData[tid].find(p => p.label === label);
                        return pt && pt.fullLabel ? pt.fullLabel : acc;
                    }, '');
                    const shortLabel = posLabel.length > 6 ? posLabel.slice(0, 5) + '…' : posLabel;
                    chartHtml += `<text x="${x}" y="${pad.top + plotH + 16}" text-anchor="middle" fill="var(--gray-500)" font-size="10" font-weight="600">${this.escapeHtml(shortLabel)}<title>${posLabel ? this.escapeHtml(posLabel) : '#' + (i + 1)}</title></text>`;
                });

                // Draw score lines (left axis)
                if (showScore) {
                    chartTasks.forEach((tid, idx) => {
                        const points = chartData[tid];
                        if (points.length < 1) return;
                        const color = colors[idx % colors.length];
                        const xPositions = points.map((d) => pad.left + (plotW / Math.max(totalPoints - 1, 1)) * allLabels.indexOf(d.label));
                        const yPositions = points.map((d) => pad.top + plotH - (d.score / maxScore) * plotH);
                        if (points.length >= 2) {
                            let pathD = '';
                            xPositions.forEach((x, i) => { pathD += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yPositions[i].toFixed(1); });
                            chartHtml += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" class="chart-line" data-task-id="${tid}" data-metric="score"/>`;
                        }
                        xPositions.forEach((x, i) => {
                            chartHtml += `<circle cx="${x.toFixed(1)}" cy="${yPositions[i].toFixed(1)}" r="4" fill="${color}" stroke="#fff" stroke-width="1.5" class="chart-dot" data-task-id="${tid}" data-metric="score"/>`;
                            chartHtml += `<title>${this.escapeHtml(taskMap[tid])}绗?{points[i].attempt}鍦? ${points[i].score}鍒?/title>`;
                        });
                    });
                }

                // Draw time lines (right axis)
                if (showTime) {
                    chartTasks.forEach((tid, idx) => {
                        const points = chartData[tid];
                        if (points.length < 1) return;
                        const color = colors[idx % colors.length];
                        const xPositions = points.map((d) => pad.left + (plotW / Math.max(totalPoints - 1, 1)) * allLabels.indexOf(d.label));
                        const yPositions = points.map((d) => pad.top + plotH - ((d.time || 0) / maxTime) * plotH);
                        if (points.length >= 2) {
                            let pathD = '';
                            xPositions.forEach((x, i) => { pathD += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yPositions[i].toFixed(1); });
                            chartHtml += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="6,3" stroke-linejoin="round" class="chart-line" data-task-id="${tid}" data-metric="time"/>`;
                        }
                        xPositions.forEach((x, i) => {
                            chartHtml += `<circle cx="${x.toFixed(1)}" cy="${yPositions[i].toFixed(1)}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5" class="chart-dot" data-task-id="${tid}" data-metric="time"/>`;
                            chartHtml += `<title>${this.escapeHtml(taskMap[tid])}绗?{points[i].attempt}鍦? ${points[i].time ? points[i].time.toFixed(3) + 's' : '-'}</title>`;
                        });
                    });
                }

                chartHtml += '</svg></div></div>';
                html += chartHtml;
            }
            html += '</div>'; // close chart view
            // Practice records for this student
            if (training.practiceRecords) {
                const myRecords = training.practiceRecords.filter(r => r.studentId === studentId);
                if (myRecords.length > 0) {
                    // Task filter for practice stats
                    const practiceTaskFilter = localStorage.getItem('practice_task_filter_' + studentId) || '';
                    const uniqueTasks = [...new Set(myRecords.map(r => r.taskId))];
                    const taskFilterHtml = uniqueTasks.length > 1 ? `<select id="practiceTaskFilter" style="margin-left:0.5rem;padding:0.15rem 0.4rem;border:1px solid var(--gray-300);border-radius:4px;font-size:0.78rem;">
                        <option value="">鍏ㄩ儴浠诲姟</option>${uniqueTasks.map(tid => {
                            const tk = this.data.tasks.find(ts => ts.id === tid);
                            return `<option value="${tid}" ${practiceTaskFilter === tid ? 'selected' : ''}>${tk ? this.escapeHtml(tk.name) : '?'}</option>`;
                        }).join('')}</select>` : '';
                    const stats = this._calcPracticeStats(studentId, training, practiceTaskFilter || null);
                    html += '<div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--gray-200);">';
                    html += '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.4rem;">';
                    html += '<span style="font-size:0.85rem;font-weight:600;color:var(--gray-600);">馃摑 鑷富缁冧範</span>';
                    html += taskFilterHtml;
                    // Practice view toggle
                    const pvKey = 'practice_view_' + studentId;
                    const pv = localStorage.getItem(pvKey) || 'table';
                    html += `<div style="margin-left:auto;display:flex;gap:0.25rem;border-bottom:1px solid var(--gray-200);">`;
                    html += `<button class="practice-view-btn" data-view="table" style="padding:0.2rem 0.7rem;font-size:0.8rem;font-weight:600;background:none;border:none;border-bottom:2px solid ${pv === 'table' ? 'var(--primary)' : 'transparent'};color:${pv === 'table' ? 'var(--primary)' : 'var(--gray-500)'};cursor:pointer;margin-bottom:-1px;">馃搵 鏁版嵁</button>`;
                    html += `<button class="practice-view-btn" data-view="chart" style="padding:0.2rem 0.7rem;font-size:0.8rem;font-weight:600;background:none;border:none;border-bottom:2px solid ${pv === 'chart' ? 'var(--primary)' : 'transparent'};color:${pv === 'chart' ? 'var(--primary)' : 'var(--gray-500)'};cursor:pointer;margin-bottom:-1px;">馃搱 瓒嬪娍</button>`;
                    html += '</div></div>';

                    // Stats banner (shown in both views)
                    if (stats) {
                        const bg2 = (stats.stage.stage || '').includes('进步') || (stats.stage.stage || '').includes('稳定') ? '#f0fdf4' : (stats.stage.stage || '').includes('减退') ? '#fefce8' : '#f1f5f9';
                        html += `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.65rem;margin-bottom:0.5rem;background:${bg2};border-radius:var(--radius-sm);font-size:0.82rem;">`;
                        html += `<span style="font-weight:700;">${stats.stage.stage}</span>`;
                        html += `<span style="color:var(--gray-500);">${stats.stage.desc}</span>`;
                        if (stats.outlierCount > 0) html += `<span style="margin-left:auto;color:var(--danger);font-size:0.78rem;">鈿狅笍 ${stats.outlierCount}娆″け璇?/span>`;
                        html += '</div>';

                        html += '<div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-bottom:0.5rem;font-size:0.78rem;">';
                        const t = (label, value, color) =>
                            `<span style="display:inline-flex;align-items:center;gap:0.2rem;padding:0.15rem 0.5rem;background:#fff;border-radius:5px;border:1px solid var(--gray-200);">
                                <span style="color:var(--gray-400);">${label}</span>
                                <strong style="color:${color || 'var(--gray-800)'};">${value}</strong>
                            </span>`;
                        html += t('最近10次平均', stats.avgScore.toFixed(1), 'var(--primary)');
                        if (stats.avgTime !== null) html += t('骞冲潎鐢ㄦ椂', stats.avgTime.toFixed(2) + 's', 'var(--accent)');
                        html += t('绋冲畾', stats.stabilityLabel, stats.stabilityColor);
                        html += t('最高', stats.maxScore, '#10b981');
                        html += t('最低', stats.minScore, '#ef4444');
                        html += t('满分率', stats.fullRate !== null ? stats.fullRate.toFixed(1) + '%' : '—', stats.fullRate >= 80 ? '#10b981' : '#f59e0b');
                        html += t('棰勬湡鍖洪棿', `${stats.expectedLow.toFixed(0)}-${stats.expectedHigh.toFixed(0)}`, 'var(--primary)');
                        html += t('鏃堕棿娉㈠姩', `蟽t=${stats.timeBasedVar.toFixed(1)}`, 'var(--gray-600)');
                        html += t('记录', stats.total + '条');
                        html += '</div>';
                    }

                    // Table view
                    html += `<div id="practiceTableView" style="display:${pv === 'table' ? 'block' : 'none'};">`;
                    html += '<div style="overflow-x:auto;max-height:260px;overflow-y:auto;"><table class="score-table" style="font-size:0.8rem;">';
                    html += '<thead><tr><th>鏃ユ湡</th><th>浠诲姟</th><th style="text-align:center;">#</th><th style="text-align:center;">寰楀垎</th><th style="text-align:center;">鐢ㄦ椂</th><th style="width:36px;"></th></tr></thead><tbody>';
                    const sorted = [...myRecords].sort((a, b) => b.date.localeCompare(a.date) || (b.round || 1) - (a.round || 1));
                    sorted.forEach(pr => {
                        const tk = this.data.tasks.find(ts => ts.id === pr.taskId);
                        html += `<tr><td>${pr.date}</td><td>${tk ? this.escapeHtml(tk.name) : '?'}</td><td style="text-align:center;color:var(--gray-500);font-size:0.76rem;">${pr.round || '-'}</td><td style="text-align:center;"><strong style="color:var(--primary);">${pr.score}</strong></td><td style="text-align:center;color:var(--gray-500);">${pr.time != null ? pr.time.toFixed(2) + 's' : '-'}</td><td style="text-align:center;"><button class="edit-pr-btn" data-pr-id="${pr.id}" title="缂栬緫" style="background:none;border:none;cursor:pointer;font-size:0.78rem;padding:0;color:var(--gray-400);">鉁忥笍</button></td></tr>`;
                    });
                    html += '</tbody></table></div></div>';

                    // Chart view
                    const pShowScore = localStorage.getItem('pchart_showScore_' + studentId) !== 'false';
                    const pShowTime = localStorage.getItem('pchart_showTime_' + studentId) !== 'false';
                    html += `<div id="practiceChartView" style="display:${pv === 'chart' ? 'block' : 'none'};">`;
                    // Build practice chart
                    const pColors = ['#2563eb', '#059669', '#d97706', '#dc2626'];
                    const { labels: pLabels, data: pData, taskIds: pTaskIds, maxScore: pMaxScore, maxTime: pMaxTime } =
                        Analysis.buildPracticeChartSeries(myRecords);

                    const pZoomKey = 'pchart_zoom_' + studentId;
                    const pNeedZoom = pLabels.length > 10;
                    let pVisible = parseInt(localStorage.getItem(pZoomKey)) || pLabels.length;
                    if (pVisible < 10) pVisible = 10;
                    if (pVisible > pLabels.length) pVisible = pLabels.length;
                    const pBasePx = 780;
                    const pPxPer = Math.round(pBasePx / pVisible);

                    html += '<div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.3rem;justify-content:flex-end;">';
                    if (pNeedZoom) {
                        html += `<span style="font-size:0.7rem;color:var(--gray-400);">鍚屾鏁版嵁閲?</span>
                            <input type="range" class="pchart-zoom-slider" min="10" max="${pLabels.length}" value="${pVisible}" style="width:70px;accent-color:var(--primary);cursor:pointer;" title="鍚屾椂鏄剧ず鐨勮疆娆℃暟: ${pVisible}">
                            <span class="pchart-zoom-val" style="font-size:0.7rem;color:var(--gray-500);">${pVisible}杞?/span>
                            <span style="color:var(--gray-300);">|</span>`;
                    }
                    html += `<label style="display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;font-size:0.8rem;">
                        <input type="checkbox" class="pchart-metric-cb" data-metric="score" ${pShowScore ? 'checked' : ''} style="accent-color:var(--primary);">
                        <span style="color:var(--primary);font-weight:600;">馃搳 寰楀垎</span>
                    </label>`;
                    html += `<label style="display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;font-size:0.8rem;">
                        <input type="checkbox" class="pchart-metric-cb" data-metric="time" ${pShowTime ? 'checked' : ''} style="accent-color:#d97706;">
                        <span style="color:#d97706;font-weight:600;">鈴?鐢ㄦ椂</span>
                    </label>`;
                    html += '</div>';

                    const pSvgW = Math.max(pLabels.length * pPxPer, 600);
                    const pSvgH = 220;
                    const pPad = { top: 16, right: 36, bottom: 36, left: 36 };
                    const pPlotW = pSvgW - pPad.left - pPad.right;
                    const pPlotH = pSvgH - pPad.top - pPad.bottom;

                    html += `<div style="overflow-x:auto;max-width:100%;"><svg width="${pSvgW}" height="${pSvgH}" style="display:block;min-width:${Math.min(pSvgW, 600)}px;font-size:10px;font-family:inherit;">`;
                    if (pShowScore) {
                        for (let i = 0; i <= 4; i++) {
                            const y = pPad.top + pPlotH - (pPlotH / 4) * i;
                            const val = (pMaxScore / 4) * i;
                            html += `<line x1="${pPad.left}" y1="${y}" x2="${pPad.left + pPlotW}" y2="${y}" stroke="var(--gray-100)" stroke-width="1"/>`;
                            html += `<text x="${pPad.left - 4}" y="${y + 3}" text-anchor="end" fill="var(--primary)" font-size="9">${val.toFixed(0)}</text>`;
                        }
                    }
                    if (pShowTime) {
                        for (let i = 0; i <= 4; i++) {
                            const y = pPad.top + pPlotH - (pPlotH / 4) * i;
                            const val = (pMaxTime / 4) * i;
                            html += `<text x="${pPad.left + pPlotW + 4}" y="${y + 3}" text-anchor="start" fill="#d97706" font-size="9">${val.toFixed(1)}</text>`;
                        }
                    }
                    pLabels.forEach((label, i) => {
                        const x = pPad.left + (pPlotW / Math.max(pLabels.length - 1, 1)) * i;
                        html += `<text x="${x}" y="${pPad.top + pPlotH + 14}" text-anchor="middle" fill="var(--gray-500)" transform="rotate(-15,${x},${pPad.top + pPlotH + 14})" font-size="9">${this.escapeHtml(label)}</text>`;
                    });

                    pTaskIds.forEach((tid, idx) => {
                        const points = pData[tid] || [];
                        if (points.length < 1) return;
                        const color = pColors[idx % pColors.length];
                        const xP = points.map(d => pPad.left + (pPlotW / Math.max(pLabels.length - 1, 1)) * pLabels.indexOf(d.label));
                        if (pShowScore) {
                            const yP = points.map(d => pPad.top + pPlotH - (d.score / pMaxScore) * pPlotH);
                            if (points.length >= 2) {
                                let d = ''; xP.forEach((x, i) => { d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yP[i].toFixed(1); });
                                html += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
                            }
                            xP.forEach((x, i) => {
                                html += `<circle cx="${x.toFixed(1)}" cy="${yP[i].toFixed(1)}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
                                html += `<title>${points[i].score}鍒?/title>`;
                            });
                        }
                        if (pShowTime) {
                            const yP = points.map(d => pPad.top + pPlotH - ((d.time || 0) / pMaxTime) * pPlotH);
                            if (points.length >= 2) {
                                let d = ''; xP.forEach((x, i) => { d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + yP[i].toFixed(1); });
                                html += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4,3" stroke-linejoin="round"/>`;
                            }
                            xP.forEach((x, i) => {
                                html += `<circle cx="${x.toFixed(1)}" cy="${yP[i].toFixed(1)}" r="3" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
                                html += `<title>${points[i].time ? points[i].time.toFixed(2) + 's' : '-'}</title>`;
                            });
                        }
                    });
                    html += '</svg></div></div>'; // close svg and chart view
                    html += '</div>'; // close practice section
                }
            }

            container.innerHTML = html;

            document.getElementById('closeStudentDetailBtn').addEventListener('click', () => this.closeStudentDetail());
            container.querySelectorAll('.detail-view-btn').forEach((btn) => {
                btn.addEventListener('click', function () {
                    const view = this.dataset.view;
                    localStorage.setItem(studentViewKey, view);
                    document.querySelectorAll('.detail-view-btn').forEach(b => {
                        b.style.borderBottomColor = b.dataset.view === view ? 'var(--primary)' : 'transparent';
                        b.style.color = b.dataset.view === view ? 'var(--primary)' : 'var(--gray-500)';
                    });
                    const tv = document.getElementById('detailTableView');
                    const cv = document.getElementById('detailChartView');
                    if (tv) tv.style.display = view === 'table' ? 'block' : 'none';
                    if (cv) cv.style.display = view === 'chart' ? 'block' : 'none';
                });
            });
            container.querySelectorAll('.chart-metric-cb').forEach((cb) => {
                cb.addEventListener('change', function () {
                    const metric = this.dataset.metric;
                    localStorage.setItem('chart_show' + metric.charAt(0).toUpperCase() + metric.slice(1) + '_' + studentId, this.checked);
                    const app = window.TrainingApp || TrainingApp;
                    app.openStudentDetail(studentId);
                });
            });
            container.querySelectorAll('.chart-zoom-slider').forEach((slider) => {
                slider.addEventListener('input', function () {
                    const valSpan = container.querySelector('.chart-zoom-val');
                    if (valSpan) valSpan.textContent = this.value + '轮';
                    // Real-time zoom via viewBox: change SVG width only
                    const svg = container.querySelector('.chart-svg-wrap svg');
                    if (!svg) return;
                    const totalPts = parseInt(svg.dataset.totalPoints) || 1;
                    const newW = Math.max(Math.round(totalPts * 780 / parseInt(this.value)), 300);
                    svg.setAttribute('width', newW);
                });
                slider.addEventListener('change', function () {
                    localStorage.setItem('chart_zoom_' + studentId, this.value);
                });
            });
            container.querySelectorAll('.practice-view-btn').forEach((btn) => {
                btn.addEventListener('click', function () {
                    const view = this.dataset.view;
                    localStorage.setItem('practice_view_' + studentId, view);
                    document.querySelectorAll('.practice-view-btn').forEach(b => {
                        b.style.borderBottomColor = b.dataset.view === view ? 'var(--primary)' : 'transparent';
                        b.style.color = b.dataset.view === view ? 'var(--primary)' : 'var(--gray-500)';
                    });
                    const tv = document.getElementById('practiceTableView');
                    const cv = document.getElementById('practiceChartView');
                    if (tv) tv.style.display = view === 'table' ? 'block' : 'none';
                    if (cv) cv.style.display = view === 'chart' ? 'block' : 'none';
                });
            });
            container.querySelectorAll('.edit-pr-btn').forEach((btn) => {
                btn.addEventListener('click', function () {
                    const app = window.TrainingApp || TrainingApp;
                    app.openEditPractice(this.dataset.prId);
                });
            });
            const practiceFilter = document.getElementById('practiceTaskFilter');
            if (practiceFilter) {
                practiceFilter.addEventListener('change', function () {
                    localStorage.setItem('practice_task_filter_' + studentId, this.value);
                    const app = window.TrainingApp || TrainingApp;
                    app.openStudentDetail(studentId);
                });
            }
            container.querySelectorAll('.pchart-metric-cb').forEach((cb) => {
                cb.addEventListener('change', function () {
                    const metric = this.dataset.metric;
                    localStorage.setItem('pchart_show' + metric.charAt(0).toUpperCase() + metric.slice(1) + '_' + studentId, this.checked);
                    const app = window.TrainingApp || TrainingApp;
                    app.openStudentDetail(studentId);
                });
            });
            container.querySelectorAll('.pchart-zoom-slider').forEach((slider) => {
                slider.addEventListener('change', function () {
                    const zoomKey = 'pchart_zoom_' + studentId;
                    localStorage.setItem(zoomKey, this.value);
                    const app = window.TrainingApp || TrainingApp;
                    app.openStudentDetail(studentId);
                });
                slider.addEventListener('input', function () {
                    const valSpan = container.querySelector('.pchart-zoom-val');
                    if (valSpan) valSpan.textContent = this.value + '轮';
                });
            });
            container.querySelectorAll('.chart-task-toggle').forEach((cb) => {
                cb.addEventListener('change', function () {
                    const tid = this.dataset.taskId;
                    const visible = this.checked;
                    container.querySelectorAll(`.chart-line[data-task-id="${tid}"], .chart-dot[data-task-id="${tid}"]`).forEach(el => {
                        el.style.display = visible ? '' : 'none';
                    });
                });
            });
        },

        // ============ Render ============
        render() {
            try { this.renderTrainingList(); } catch (e) { console.warn('render error:', e); }
            if (window.updateHeaderStats) window.updateHeaderStats();
        },

        renderStats() {
            // Called after score update - only re-renders the score table if open
            if (document.getElementById('scoreEntryModal').classList.contains('open')) {
                this.renderScoreEntry();
            }
        },

        renderTrainingList() {
            const container = document.getElementById('trainingList');
            const D = this.data;

            if (D.trainings.length === 0) {
                container.innerHTML = `
                    <div class="card-header">
                        <span class="card-title">馃搵 璧涗簨</span>
                        <button class="btn btn-primary" id="addTrainingBtn">鉃?鏂板缓闆嗚</button>
                    </div>
                    <div class="empty-state"><div class="icon">馃搵</div><p>鏆傛棤闆嗚锛岀偣鍑讳笂鏂规寜閽垱寤?/p></div>`;
                document.getElementById('addTrainingBtn').addEventListener('click', () => this.openTrainingModal());
                return;
            }

            let html = '';

            // No training selected 鈥?prompt to pick one from sidebar
            if (!this.selectedTrainingId) {
                html = `
                    <div class="card-header">
                        <span class="card-title">馃搵 璧涗簨</span>
                        <button class="btn btn-primary" id="addTrainingBtn">鉃?鏂板缓闆嗚</button>
                    </div>
                    <div class="empty-state"><div class="icon">馃搵</div><p>璇峰湪宸︿晶鑿滃崟閫夋嫨涓€涓禌浜?/p></div>`;
                container.innerHTML = html;
                document.getElementById('addTrainingBtn').addEventListener('click', () => this.openTrainingModal());
                return;
            }

            // Detail for selected training
            if (this.selectedTrainingId) {
                const t = D.trainings.find((tr) => tr.id === this.selectedTrainingId);
                if (t) {
                    const students = D.students.filter((s) => t.studentIds.includes(s.id));
                    html += `<div class="training-detail">
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:0.75rem;">
                            <div>
                                <strong style="font-size:1.05rem;">${this.escapeHtml(t.name)}</strong>
                                <span style="font-size:0.85rem;color:var(--gray-500);margin-left:0.5rem;">${t.date}</span>
                                ${D.currentTrainingId === t.id ? '<span style="font-size:0.75rem;background:var(--accent);color:#fff;padding:0.1rem 0.6rem;border-radius:10px;margin-left:0.3rem;">褰撳墠</span>' : ''}
                            </div>
                            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                                <button class="btn btn-outline btn-sm" id="editTrainingBtn">鉁忥笍 缂栬緫瀛﹀憳</button>
                                ${D.currentTrainingId !== t.id ? `<button class="btn btn-outline btn-sm" id="setCurrentBtn">猸?璁句负褰撳墠</button>` : ''}
                                <button class="btn btn-primary btn-sm" id="addMockBtn">馃摑 鏂板璁板綍</button>
                                <button class="btn btn-outline btn-sm" id="importPracticeBtn">馃摜 瀵煎叆缁冧範</button>
                                <button class="btn btn-accent btn-sm" id="exportCSVBtn">馃摜 瀵煎嚭CSV</button>
                                <button class="btn btn-outline btn-sm" id="exportBackupBtn">馃捑 澶囦唤鏁版嵁</button>
                            </div>
                        </div>`;

                    // Participants
                    // Collect all unique task names across practice records
                    const allTaskNames = [];
                    const taskNameSet = new Set();
                    (t.practiceRecords || []).forEach(r => {
                        const task = Shared.data.tasks.find(ts => ts.id === r.taskId);
                        const tName = task ? task.name : '鏈煡';
                        if (!taskNameSet.has(tName)) { taskNameSet.add(tName); allTaskNames.push(tName); }
                    });
                    const taskLegend = allTaskNames.length > 0 ? ` [${allTaskNames.map(n => this.escapeHtml(n)).join('/')}]` : '';
                    html += `<div style="font-size:0.85rem;font-weight:600;color:var(--gray-600);margin-bottom:0.3rem;">馃懃 鍙備笌瀛﹀憳 (${students.length})${taskLegend}</div>`;
                    if (students.length > 0) {
                        html += '<div class="training-students">';
                        students.forEach((s) => {
                            const gn = Shared.getCurrentClassName(s.id);
                            const myPRs = (t.practiceRecords || []).filter(r => r.studentId === s.id);
                            const counts = allTaskNames.map(tName => {
                                const task = Shared.data.tasks.find(ts => ts.name === tName);
                                return myPRs.filter(r => r.taskId === (task ? task.id : null)).length;
                            });
                            const label = gn ? `${this.escapeHtml(s.name)} <span style="font-size:0.7rem;color:var(--gray-400);">(${this.escapeHtml(gn)})</span>` : this.escapeHtml(s.name);
                            html += `<span class="badge" style="cursor:pointer;" data-student-id="${s.id}">${label}`;
                            html += ` <sup style="font-size:0.7rem;color:var(--gray-400);font-weight:500;">[${counts.join(', ')}]</sup>`;
                            html += `</span>`;
                        });
                        html += '</div>';
                    } else {
                        html += '<div style="font-size:0.85rem;color:var(--gray-400);margin-bottom:0.5rem;">鏆傛棤瀛﹀憳</div>';
                    }

                    // === Best Score Overview (across all mocks) ===
                    if (t.mockCompetitions.length > 0 && students.length > 0) {
                        const allTaskIds = new Set();
                        t.mockCompetitions.forEach(m => (m.tasks || []).forEach(ti => allTaskIds.add(ti.taskId)));
                        const taskIdList = Array.from(allTaskIds);

                        // Compute best per-task per-student across all mocks
                        const studentBest = {};
                        students.forEach(s => { studentBest[s.id] = { tasks: {}, totalScore: 0, totalTime: 0 }; });
                        taskIdList.forEach(tid => {
                            students.forEach(s => {
                                let bestSc = null, bestTm = null;
                                t.mockCompetitions.forEach(m => {
                                    const entry = m.scores[s.id] && m.scores[s.id][tid] ? m.scores[s.id][tid] : null;
                                    if (!entry) return;
                                    this.getRounds(entry).forEach(r => {
                                        if (r.withdrawn) return;
                                        if (r.score === undefined || r.score === null) return;
                                        if (bestSc === null || r.score > bestSc || (r.score === bestSc && (r.time !== null && r.time !== undefined) && (bestTm === null || r.time < bestTm))) {
                                            bestSc = r.score;
                                            bestTm = r.time ?? null;
                                        }
                                    });
                                });
                                studentBest[s.id].tasks[tid] = { score: bestSc, time: bestTm };
                                if (bestSc !== null) {
                                    studentBest[s.id].totalScore += bestSc;
                                    if (bestTm !== null) studentBest[s.id].totalTime += bestTm;
                                }
                            });
                        });

                        // Rank by totalScore desc, totalTime asc
                        const ranked = students.map(s => ({
                            id: s.id, name: s.name,
                            totalScore: studentBest[s.id].totalScore,
                            totalTime: studentBest[s.id].totalTime
                        })).sort((a, b) => {
                            if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
                            return a.totalTime - b.totalTime;
                        });
                        const rankings = {};
                        ranked.forEach((r, i) => { rankings[r.id] = i + 1; });

                        const getTaskName = (tid) => {
                            if (tid === '__default__') return '榛樿浠诲姟';
                            const td = this.data.tasks.find(d => d.id === tid);
                            return td ? td.name : '?';
                        };
                        const hasBestTasks = taskIdList.length > 0;

                        // Build competitions table
                        html += '<div style="display:flex;align-items:center;gap:0.75rem;margin-top:0.75rem;margin-bottom:0.5rem;flex-wrap:wrap;">';
                        html += '<span style="font-size:0.85rem;font-weight:600;color:var(--gray-600);">馃摑 妯℃嫙璧?姝ｈ禌璁板綍</span>';
                        html += '</div>';

                        // Build table
                        const sortedMocks = [...t.mockCompetitions].reverse();
                        const hasTasks = taskIdList.length > 0;

                            // Determine max rounds per mock+task
                            const roundCounts = {};
                            sortedMocks.forEach(m => {
                                (m.tasks && m.tasks.length > 0 ? m.tasks : [{ taskId: null, rounds: 1 }]).forEach(ti => {
                                    const key = m.id + '|' + (ti.taskId || '__default__');
                                    roundCounts[key] = ti.rounds || 1;
                                });
                            });

                            // Header
                            html += '<table class="score-table" style="font-size:0.82rem;">';
                            html += '<thead><tr><th style="min-width:80px;">璁板綍</th>';
                            if (hasTasks) html += '<th style="min-width:70px;">浠诲姟</th>';
                            html += '<th style="width:44px;">杞</th>';
                            students.forEach(s => {
                                html += `<th style="text-align:center;min-width:80px;">${this.escapeHtml(s.name)}</th>`;
                            });
                            html += '</tr></thead><tbody>';

                        // === Best Score Overview (top section) ===
                        if (taskIdList.length > 0) {
                            const overviewRows = taskIdList.length + 2; // tasks + 缁煎悎鏈€浣?+ 缁煎悎鎺掑悕
                            html += `<tr style="background:#f8fafc;">`;
                            html += `<td rowspan="${overviewRows}" style="vertical-align:middle;text-align:center;font-weight:700;color:var(--primary);font-size:0.85rem;">馃弳 鏈€浣虫垚缁?/td>`;
                            html += `<td style="font-size:0.82rem;">${this.escapeHtml(getTaskName(taskIdList[0]))}</td>`;
                            html += '<td></td>';
                            students.forEach(s => {
                                const best = studentBest[s.id].tasks[taskIdList[0]];
                                if (best && best.score !== null) {
                                    const timeStr = best.time !== null ? best.time.toFixed(2) + 's' : '-';
                                    html += `<td style="text-align:center;padding:0.2rem 0.4rem;">
                                        <span style="font-weight:600;color:var(--primary);">${best.score}</span>
                                        <span style="font-size:0.7rem;color:var(--gray-400);"> ${timeStr}</span>
                                    </td>`;
                                } else {
                                    html += `<td style="text-align:center;color:var(--gray-300);font-size:0.78rem;">-</td>`;
                                }
                            });
                            html += '</tr>';
                            for (let ti = 1; ti < taskIdList.length; ti++) {
                                const tid = taskIdList[ti];
                                html += '<tr>';
                                html += `<td style="font-size:0.82rem;">${this.escapeHtml(getTaskName(tid))}</td>`;
                                html += '<td></td>';
                                students.forEach(s => {
                                    const best = studentBest[s.id].tasks[tid];
                                    if (best && best.score !== null) {
                                        const timeStr = best.time !== null ? best.time.toFixed(2) + 's' : '-';
                                        html += `<td style="text-align:center;padding:0.2rem 0.4rem;">
                                            <span style="font-weight:600;color:var(--primary);">${best.score}</span>
                                            <span style="font-size:0.7rem;color:var(--gray-400);"> ${timeStr}</span>
                                        </td>`;
                                    } else {
                                        html += `<td style="text-align:center;color:var(--gray-300);font-size:0.78rem;">-</td>`;
                                    }
                                });
                                html += '</tr>';
                            }
                            // Total row
                            html += '<tr style="background:var(--primary-bg);font-weight:600;">';
                            html += '<td style="font-size:0.82rem;color:var(--primary);">缁煎悎鏈€浣?/td><td></td>';
                            students.forEach(s => {
                                const tot = studentBest[s.id];
                                html += `<td style="text-align:center;padding:0.2rem 0.4rem;">
                                    <span style="color:var(--primary);font-weight:700;">${tot.totalScore}</span>
                                    <span style="font-size:0.7rem;color:var(--gray-400);"> ${tot.totalTime.toFixed(2)}s</span>
                                </td>`;
                            });
                            html += '</tr>';
                            // Rank row
                            html += '<tr style="background:var(--primary-bg);">';
                            html += '<td style="font-size:0.82rem;font-weight:600;color:var(--accent);">缁煎悎鎺掑悕</td><td></td>';
                            students.forEach(s => {
                                const rk = rankings[s.id] || '-';
                                const rkLabel = rk === 1 ? '鍐犲啗' : rk === 2 ? '浜氬啗' : rk === 3 ? '瀛ｅ啗' : (rk !== '-' ? rk : '');
                                const rkColor = rk === 1 ? '#d4a017' : rk === 2 ? '#a8a8a8' : rk === 3 ? '#cd7f32' : (rk !== '-' ? 'var(--accent)' : 'var(--gray-300)');
                                html += `<td style="text-align:center;padding:0.2rem 0.4rem;font-size:0.9rem;font-weight:700;color:${rkColor};">${rkLabel || '-'}</td>`;
                            });
                            html += '</tr>';
                            // Separator
                            html += '<tr><td colspan="' + (3 + students.length) + '" style="border-bottom:3px solid var(--gray-300);padding:0;"></td></tr>';
                        }

                        sortedMocks.forEach((m) => {
                            const typeLabel = (m.competitionType || 'mock') === 'official' ? '正赛' : '模拟赛';
                            const typeBg = (m.competitionType || 'mock') === 'official' ? '#fef3c7;color:#92400e' : '#dbeafe;color:#1d4ed8';

                            // Tasks this mock covers
                            const mockTasks = (m.tasks && m.tasks.length > 0) ? m.tasks : [{ taskId: null, rounds: 1 }];
                            let firstRow = true;

                            mockTasks.forEach((ti) => {
                                const tid = ti.taskId || '__default__';
                                const taskDef = ti.taskId ? this.data.tasks.find(d => d.id === ti.taskId) : null;
                                const taskName = taskDef ? taskDef.name : '—';
                                const rounds = ti.rounds || 1;

                                for (let r = 1; r <= rounds; r++) {
                                    html += '<tr>';
                                    if (firstRow && r === 1) {
                                        const totalRounds = mockTasks.reduce((sum, ti) => sum + (ti.rounds || 1), 0);
                                        const rowspan = totalRounds + 2; // +2 for 鏈€浣?and 鎺掑悕 rows
                                        html += `<td rowspan="${rowspan}" style="vertical-align:middle;">
                                            <div style="display:flex;align-items:center;gap:0.3rem;">
                                                <strong>${this.escapeHtml(m.name)}</strong>
                                                <button class="mock-score-btn" data-training-id="${t.id}" data-mock-id="${m.id}" title="褰曞叆鎴愮哗" style="background:none;border:none;cursor:pointer;font-size:0.85rem;padding:0;color:var(--gray-400);transition:color 0.15s;">鉁忥笍</button>
                                            </div>
                                            <small style="color:var(--gray-500);">${m.date}</small><br>
                                            <span style="font-size:0.7rem;background:${typeBg};padding:0.1rem 0.4rem;border-radius:8px;">${typeLabel}</span>
                                            <span style="font-size:0.7rem;background:${(m.group || 'senior') === 'senior' ? '#e0e7ff;color:#4338ca' : '#fce7f3;color:#9d174d'};padding:0.1rem 0.4rem;border-radius:8px;margin-left:0.2rem;">${(m.group || 'senior') === 'senior' ? '小高组' : '小低组'}</span>
                                            ${m.participantCount ? `<span style="font-size:0.7rem;background:#f3e8ff;color:#6b21a8;padding:0.1rem 0.4rem;border-radius:8px;margin-left:0.2rem;">${m.participantCount}浜?/span>` : ''}
                                        </td>`;
                                        firstRow = false;
                                    }
                                    if (hasTasks) {
                                        if (r === 1) {
                                            const rspan = rounds;
                                            html += `<td rowspan="${rspan}" style="vertical-align:middle;font-size:0.85rem;">${this.escapeHtml(taskName)}</td>`;
                                        }
                                    }
                                    html += `<td style="text-align:center;color:var(--gray-500);font-size:0.78rem;">${rounds > 1 ? r : ''}</td>`;

                                    students.forEach((s) => {
                                        const entry = m.scores[s.id] && m.scores[s.id][tid] ? m.scores[s.id][tid] : null;
                                        const rounds_data = this.getRounds(entry);
                                        const roundEntry = rounds_data[r - 1] || {};
                                        const isCellWithdrawn = roundEntry.withdrawn;
                                        if (isCellWithdrawn) {
                                            html += `<td style="text-align:center;padding:0.25rem 0.4rem;color:var(--gray-400);font-size:0.78rem;font-style:italic;">寮冩潈</td>`;
                                            return;
                                        }
                                        const sc = roundEntry.score;
                                        const tm = roundEntry.time;
                                        if (sc !== undefined && sc !== null) {
                                            const timeStr = tm !== null && tm !== undefined ? tm.toFixed(2) + 's' : '-';
                                            html += `<td style="text-align:center;padding:0.25rem 0.4rem;">
                                                <span style="font-weight:600;color:var(--primary);">${sc}</span>
                                                <span style="font-size:0.7rem;color:var(--gray-400);"> ${timeStr}</span>
                                            </td>`;
                                        } else {
                                            html += `<td style="text-align:center;color:var(--gray-300);font-size:0.78rem;">-</td>`;
                                        }
                                    });

                                    html += '</tr>';
                                }
                            });

                            // === Summary row: 鏈€浣?===
                            const totalRounds = mockTasks.reduce((sum, ti) => sum + (ti.rounds || 1), 0);
                            html += '<tr style="background:var(--primary-bg);font-weight:600;">';
                            if (hasTasks) {
                                html += `<td rowspan="2" style="vertical-align:middle;text-align:center;font-size:0.82rem;color:var(--primary);font-weight:700;">缁熻</td>`;
                            }
                            html += `<td style="text-align:center;font-size:0.8rem;color:var(--primary);font-weight:700;">鏈€浣?/td>`;
                            students.forEach((s) => {
                                const isWithdrawn = mockTasks.every(ti => {
                                    const tid2 = ti.taskId || '__default__';
                                    const entry = m.scores[s.id] && m.scores[s.id][tid2] ? m.scores[s.id][tid2] : null;
                                    if (!entry) return true;
                                    const rds = this.getRounds(entry);
                                    return rds.every(rd => rd.withdrawn);
                                });
                                if (isWithdrawn) {
                                    html += `<td style="text-align:center;padding:0.25rem 0.4rem;color:var(--gray-400);font-size:0.78rem;font-style:italic;">寮冩潈</td>`;
                                    return;
                                }
                                // Calculate best total for this student in this mock
                                let totalScore = 0, totalTime = 0;
                                mockTasks.forEach(ti => {
                                    const tid2 = ti.taskId || '__default__';
                                    const entry = m.scores[s.id] && m.scores[s.id][tid2] ? m.scores[s.id][tid2] : null;
                                    if (!entry) return;
                                    const rds = this.getRounds(entry);
                                    let bestSc = null, bestTm = null;
                                    rds.forEach(rd => {
                                        if (rd.withdrawn) {
                                            if (bestSc === null || 0 > bestSc) {
                                                bestSc = 0;
                                                bestTm = 150;
                                            }
                                            return;
                                        }
                                        if (rd.score === undefined || rd.score === null) return;
                                        if (bestSc === null || rd.score > bestSc || (rd.score === bestSc && (rd.time !== null && rd.time !== undefined) && (bestTm === null || rd.time < bestTm))) {
                                            bestSc = rd.score;
                                            bestTm = rd.time ?? null;
                                        }
                                    });
                                    if (bestSc !== null) {
                                        totalScore += bestSc;
                                        if (bestTm !== null) totalTime += bestTm;
                                    }
                                });
                                html += `<td style="text-align:center;padding:0.25rem 0.4rem;">
                                    <span style="color:var(--primary);font-weight:700;">${totalScore}</span>
                                    <span style="font-size:0.7rem;color:var(--gray-400);"> ${totalTime.toFixed(2)}s</span>
                                </td>`;
                            });
                            html += '</tr>';

                            // === Summary row: 鎺掑悕 ===
                            const isOfficial = (m.competitionType || 'mock') === 'official';
                            html += '<tr style="background:var(--primary-bg);border-bottom:3px solid var(--gray-300);">';
                            html += `<td style="text-align:center;font-size:0.82rem;font-weight:600;color:var(--accent);">${isOfficial ? '鍐呴儴鎺掑悕' : '鎺掑悕'}</td>`;
                            students.forEach((s) => {
                                const rk = m.rankings && m.rankings[s.id] ? m.rankings[s.id] : '-';
                                const rkLabel = rk === 1 ? '鍐犲啗' : rk === 2 ? '浜氬啗' : rk === 3 ? '瀛ｅ啗' : (rk !== '-' ? rk : '');
                                const rkColor = rk === 1 ? '#d4a017' : rk === 2 ? '#a8a8a8' : rk === 3 ? '#cd7f32' : (rk !== '-' ? 'var(--accent)' : 'var(--gray-300)');
                                const allWithdrawn = mockTasks.every(ti => {
                                    const tid2 = ti.taskId || '__default__';
                                    const entry = m.scores[s.id] && m.scores[s.id][tid2] ? m.scores[s.id][tid2] : null;
                                    if (!entry) return true;
                                    const rds = this.getRounds(entry);
                                    return rds.every(rd => rd.withdrawn);
                                });
                                if (allWithdrawn) {
                                    html += `<td style="text-align:center;padding:0.25rem 0.4rem;color:var(--gray-400);font-size:0.9rem;font-weight:600;">鈥?/td>`;
                                } else if (rkLabel) {
                                    html += `<td style="text-align:center;padding:0.25rem 0.4rem;font-size:0.9rem;font-weight:700;color:${rkColor};">${rkLabel}</td>`;
                                } else {
                                    html += `<td style="text-align:center;padding:0.25rem 0.4rem;color:var(--gray-300);font-size:0.9rem;">-</td>`;
                                }
                            });
                            html += '</tr>';

                            // Official ranking row for 姝ｈ禌
                            if (isOfficial) {
                                html += '<tr style="background:#fefce8;border-bottom:3px solid var(--gray-300);">';
                                html += `<td style="text-align:center;font-size:0.82rem;font-weight:600;color:#92400e;">鐪熷疄鎺掑悕</td>`;
                                students.forEach((s) => {
                                    const offRk = m.officialRankings && m.officialRankings[s.id] || '';
                                    const offLabel = offRk === 1 ? '鍐犲啗' : offRk === 2 ? '浜氬啗' : offRk === 3 ? '瀛ｅ啗' : (offRk || '-');
                                    const offColor = offRk === 1 ? '#d4a017' : offRk === 2 ? '#a8a8a8' : offRk === 3 ? '#cd7f32' : (offRk ? 'var(--accent)' : 'var(--gray-300)');
                                    html += `<td style="text-align:center;padding:0.25rem 0.4rem;font-size:0.9rem;font-weight:700;color:${offColor};">${offLabel}</td>`;
                                });
                                html += '</tr>';
                            }
                        });

                        html += '</tbody></table>';

                    } // end best-overview/mock-table if

                    html += '</div>'; // training-detail
                }
            }

            container.innerHTML = html;

            // Bind events
            const addBtn = document.getElementById('addTrainingBtn');
            if (addBtn) addBtn.addEventListener('click', () => this.openTrainingModal());
            if (this.selectedTrainingId) {
                const editBtn = document.getElementById('editTrainingBtn');
                if (editBtn) editBtn.addEventListener('click', () => this.openTrainingModal(this.selectedTrainingId));
                const setCurrentBtn = document.getElementById('setCurrentBtn');
                if (setCurrentBtn) setCurrentBtn.addEventListener('click', () => this.setCurrentTraining(this.selectedTrainingId));
                const addMockBtn = document.getElementById('addMockBtn');
                if (addMockBtn) addMockBtn.addEventListener('click', () => this.openMockModal(this.selectedTrainingId, null));
                const importBtn = document.getElementById('importPracticeBtn');
                if (importBtn) importBtn.addEventListener('click', () => this.openImportPractice());
                const backupBtn = document.getElementById('exportBackupBtn');
                if (backupBtn) backupBtn.addEventListener('click', () => this.exportBackup());
                const exportBtn = document.getElementById('exportCSVBtn');
                if (exportBtn) exportBtn.addEventListener('click', () => this.exportCSV(this.selectedTrainingId));
            }

            container.querySelectorAll('.badge[data-student-id]').forEach((el) => {
                el.addEventListener('click', () => this.openStudentDetail(el.dataset.studentId));
            });
            container.querySelectorAll('.mock-score-btn').forEach((el) => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openScoreEntry(el.dataset.trainingId, el.dataset.mockId);
                });
            });

        },
    };

    window.TrainingApp = TrainingApp;
    document.addEventListener('DOMContentLoaded', async () => {
        if (Shared.ready) await Shared.ready;
        TrainingApp.init();
    });
  
