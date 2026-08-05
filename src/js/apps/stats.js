// =================================================================
//  Stats App — 成绩统计
// =================================================================
const StatsApp = {
    init() {
        Shared.loadData();
        this.render();
    },

    getRounds(entry) { return Shared.getRounds(entry); },
    getBestScore(entry) { return Shared.getBestScore(entry); },
    getBestScoreTime(entry) { return Shared.getBestScoreTime(entry); },
    getDisplayScore(entry) { return Shared.getDisplayScore(entry); },

    getMockTypes(mock) {
        const types = new Set();
        (mock.tasks || []).forEach((t) => {
            const taskDef = Shared.data.tasks.find((td) => td.id === t.taskId);
            if (taskDef) types.add(taskDef.type || 'basic');
        });
        if (types.size === 0) { types.add('basic'); types.add('challenge'); }
        return types;
    },

    _buildTypeStats(type) {
        const D = Shared.data;
        const map = {};
        D.students.forEach((s) => {
            map[s.id] = { id: s.id, name: s.name, scores: [], times: [], avg: 0, avgTime: 0, bestTime: 0, max: 0, min: 0, count: 0, latest: null, fullScoreRate: null };
        });
        const taskFilter = (type === 'challenge' && D.challengeTaskFilter && D.challengeTaskFilter.length > 0)
            ? D.challengeTaskFilter : null;
        D.trainings.forEach((t) => {
            t.mockCompetitions.forEach((m) => {
                const types = this.getMockTypes(m);
                if (!types.has(type)) return;
                Object.entries(m.scores).forEach(([sid, studentScores]) => {
                    if (!map[sid]) return;
                    let entries;
                    if (studentScores.score !== undefined || (typeof studentScores === 'object' && !studentScores.round1 && !studentScores.round2 && Object.keys(studentScores).length > 0 && Object.values(studentScores).some(v => v && v.round1))) {
                        let taskEntries = Object.entries(studentScores);
                        if (taskFilter) {
                            taskEntries = taskEntries.filter(([tid]) => taskFilter.includes(tid));
                        }
                        entries = taskEntries.map(([tid, entry]) => {
                            const taskDef = D.tasks.find(d => d.id === tid);
                            return { entry, maxScore: taskDef ? (taskDef.maxScore || null) : null };
                        });
                    } else {
                        entries = [{ entry: studentScores, maxScore: null }];
                    }
                    entries.forEach(({ entry, maxScore }) => {
                        const sv = this.getDisplayScore(entry);
                        const tv = this.getBestScoreTime(entry);
                        if (sv !== null) { map[sid].scores.push({ score: sv, maxScore }); map[sid].latest = sv; }
                        if (tv !== null) { map[sid].times.push(tv); }
                    });
                });
            });
        });
        Object.values(map).forEach((s) => {
            if (s.scores.length > 0) {
                const sc = s.scores.map(x => x.score);
                s.max = Math.max(...sc);
                s.min = Math.min(...sc);
                s.avg = sc.reduce((a, b) => a + b, 0) / sc.length;
                s.count = sc.length;
                const withMax = s.scores.filter(x => x.maxScore !== null);
                if (withMax.length > 0) {
                    s.fullScoreRate = withMax.reduce((a, b) => a + (b.score / b.maxScore), 0) / withMax.length * 100;
                }
            }
            if (s.times.length > 0) {
                s.bestTime = Math.min(...s.times);
                s.avgTime = s.times.reduce((a, b) => a + b, 0) / s.times.length;
            }
        });
        return Object.values(map).filter((s) => s.count > 0);
    },

    getStudentStats() {
        return {
            basic: this._buildTypeStats('basic'),
            challenge: this._buildTypeStats('challenge'),
        };
    },

    render() {
        try { this.renderStats(); } catch (e) { console.warn('renderStats error:', e); }
        if (window.updateHeaderStats) window.updateHeaderStats();
    },

    renderChallengeFilter() {
        const container = document.getElementById('challengeTaskFilter');
        if (!container) return;
        const D = Shared.data;
        const challengeTasks = D.tasks.filter(t => t.type === 'challenge');
        if (challengeTasks.length === 0) { container.innerHTML = ''; return; }
        const filter = D.challengeTaskFilter;
        const allChecked = !filter || filter.length === 0;
        const isChecked = (tid) => allChecked || filter.includes(tid);

        let html = '<span style="font-size:0.8rem;color:var(--gray-500);font-weight:600;margin-right:0.2rem;">📌 统计任务:</span>';
        challengeTasks.forEach(t => {
            html += `<label style="display:inline-flex;align-items:center;gap:0.2rem;font-size:0.8rem;cursor:pointer;padding:0.15rem 0.5rem;border-radius:10px;background:#fef3c7;border:1px solid #fde68a;transition:0.15s;">
                <input type="checkbox" class="challenge-task-cb" value="${t.id}" ${isChecked(t.id) ? 'checked' : ''} style="accent-color:#d97706;">
                ${Shared.escapeHtml(t.name)}
            </label>`;
        });
        container.innerHTML = html;

        container.querySelectorAll('.challenge-task-cb').forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = container.querySelectorAll('.challenge-task-cb:checked');
                const all = container.querySelectorAll('.challenge-task-cb');
                if (checked.length === all.length) {
                    D.challengeTaskFilter = [];
                } else {
                    D.challengeTaskFilter = Array.from(checked).map(c => c.value);
                }
                Shared.saveData();
                this.renderStats();
            });
        });
    },

    renderStats() {
        this.renderChallengeFilter();
        const allStats = this.getStudentStats();

        const renderRankingTable = (stats, containerId, emptyMsg) => {
            const container = document.getElementById(containerId);
            if (stats.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="icon">📊</div><p>${emptyMsg}</p></div>`;
                return;
            }
            const hasFullScore = stats.some(s => s.fullScoreRate !== null);
            const sorted = [...stats].sort((a, b) => b.avg - a.avg);
            const maxAvg = sorted.length > 0 ? sorted[0].avg : 1;
            let rows = '';
            sorted.forEach((s, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                const pct = maxAvg > 0 ? (s.avg / maxAvg) * 100 : 0;
                const fullScoreCell = hasFullScore
                    ? (s.fullScoreRate !== null
                        ? `<td style="text-align:center;"><span style="font-weight:600;color:${s.fullScoreRate === 100 ? '#10b981' : s.fullScoreRate >= 90 ? '#f59e0b' : s.fullScoreRate >= 80 ? '#f97316' : s.fullScoreRate >= 70 ? '#8b5cf6' : '#ef4444'};">${s.fullScoreRate.toFixed(1)}%</span></td>`
                        : '<td style="text-align:center;color:var(--gray-300);">-</td>')
                    : '';
                rows += `<tr>
                    <td style="text-align:center;font-size:1.1rem;">${medal || i + 1}</td>
                    <td><strong>${Shared.escapeHtml(s.name)}</strong></td>
                    <td>${s.count}</td>
                    <td><strong style="color:var(--primary);">${s.avg.toFixed(1)}</strong></td>
                    <td>${s.max}</td>
                    <td>${s.min}</td>
                    ${fullScoreCell}
                    <td>${s.bestTime ? s.bestTime.toFixed(1) + 's' : '-'}</td>
                    <td>${s.avgTime ? s.avgTime.toFixed(1) + 's' : '-'}</td>
                    <td><div class="score-bar"><div class="score-bar-fill" style="width:${pct}%;"></div></div></td>
                </tr>`;
            });
            const fullScoreHeader = hasFullScore ? '<th style="text-align:center;">满分率</th>' : '';
            container.innerHTML = `<table class="ranking-table">
                <thead><tr><th style="width:50px;">#</th><th>姓名</th><th>场次</th><th>平均分</th><th>最高</th><th>最低</th>${fullScoreHeader}<th>最佳用时</th><th>平均用时</th><th>对比</th></tr></thead>
                <tbody>${rows}</tbody></table>`;
        };

        renderRankingTable(allStats.basic, 'rankingBasic', '暂无基本功成绩数据');
        renderRankingTable(allStats.challenge, 'rankingChallenge', '暂无挑战类成绩数据');
    },
};

document.addEventListener('DOMContentLoaded', async () => {
    if (Shared.ready) await Shared.ready;
    StatsApp.init();
});
