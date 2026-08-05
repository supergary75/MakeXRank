// =================================================================
//  Shared Header & Sidebar Component
//  Injects navigation header + left sidebar into every page.
//  Place <script src="header.js"></script> after shared.js.
// =================================================================
(function () {
    // ---- Page mapping ----
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get('tab');
    const trainingIdParam = searchParams.get('id');

    // Skip header/sidebar injection on display page (has its own UI)
    if (path === 'display.html') return;

    let activeMenu = 'stats';
    switch (path) {
        case 'index.html':    activeMenu = 'stats';    break;
        case 'stats.html':    activeMenu = 'stats';    break;
        case 'training.html': activeMenu = 'training'; break;
        case 'tasks.html':    activeMenu = 'tasks';    break;
        case 'admin.html':
            activeMenu = tabParam === 'students' ? 'students' : 'classes';
            break;
    }

    let category;
    if (['stats', 'training', 'tasks', 'display'].includes(activeMenu)) {
        category = 'competition';
    } else {
        category = 'education';
    }

    const categoryTabs = [
        { key: 'competition', label: '🏆 赛事', href: 'index.html' },
        { key: 'education',   label: '📚 教务', href: 'admin.html' },
    ];

    const sectionTitles = {
        competition: '赛事管理',
        education:   '教务管理',
    };

    // ---- Build header HTML ----
    const headerHtml = `
<header>
    <div class="header-inner">
        <button class="sidebar-toggle" id="sidebarToggle" aria-label="切换菜单">☰</button>
        <span class="logo">🏆 MakeX Inspire</span>
        <div class="header-tabs">
            ${categoryTabs.map(t =>
                `<a href="${t.href}" class="header-tab${category === t.key ? ' active' : ''}">${t.label}</a>`
            ).join('')}
        </div>
        <div class="header-spacer"></div>
        <div class="header-stats">
            <span id="hdrCloudStatus" title="数据存储状态">☁ 本地</span>
            <span>👥 学员 <strong id="hdrStudents">0</strong></span>
            <span>📋 集训 <strong id="hdrTrainings">0</strong></span>
            <span>📝 记录 <strong id="hdrMocks">0</strong></span>
        </div>
    </div>
</header>`;

    // ---- Inject header immediately (replaces script tag) ----
    const temp = document.createElement('div');
    temp.innerHTML = headerHtml;
    const headerEl = temp.firstElementChild;

    const scripts = document.scripts;
    const currentScript = scripts[scripts.length - 1];
    currentScript.parentNode.insertBefore(headerEl, currentScript);
    currentScript.remove();

    // ---- Build layout after DOM is ready ----
    async function buildLayout() {
        if (window.Shared && Shared.ready) await Shared.ready;
        const container = document.querySelector('.container');
        if (!container) return;
        if (document.querySelector('.layout')) return;

        // Ensure data is loaded from localStorage before building sidebar
        if (window.Shared && typeof Shared.loadData === 'function') {
            Shared.loadData();
        }

        // Read training data for sub-menu
        const trainings = (window.Shared && Shared.data) ? (Shared.data.trainings || []) : [];

        // Check if training sub-menu should be expanded
        const savedState = localStorage.getItem('sidebar_training_expanded');
        const isTrainingPage = activeMenu === 'training';
        // Auto-expand if on training page OR previously expanded
        const shouldExpand = isTrainingPage || savedState === 'true';

        const trainingMenuItems = trainings.map(t =>
            `<a href="training.html?id=${t.id}" class="sidebar-subitem${trainingIdParam === t.id ? ' active' : ''}">
                <span class="sub-icon">📌</span>
                ${Shared ? Shared.escapeHtml(t.name) : t.name}
            </a>`
        ).join('');

        const sidebarCollapsed = localStorage.getItem('sidebar_collapsed') === 'true';
        const sidebarHtml = `
<aside class="sidebar${sidebarCollapsed ? ' collapsed' : ''}" id="sidebar">
    <div class="sidebar-menu">
        ${category === 'competition' ? buildCompetitionMenu(trainingMenuItems, shouldExpand) : buildEducationMenu()}
    </div>    <div class="sidebar-footer">
        <button class="sidebar-collapse-btn" id="sidebarCollapseBtn" title="${sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}">${sidebarCollapsed ? '▶' : '◀'}</button>
    </div>    <div class="sidebar-popover" id="sidebarPopover"></div>
</aside>
<div class="sidebar-overlay" id="sidebarOverlay"></div>`;

        function buildCompetitionMenu(subItems, expanded) {
            const isActive = activeMenu === 'training';
            const arrow = expanded ? '▼' : '▶';
            return `
                <a href="index.html" class="sidebar-item${activeMenu === 'stats' ? ' active' : ''}">
                    <span class="icon">📊</span>成绩统计
                </a>
                <div class="sidebar-item has-sub${isActive ? ' active' : ''}" id="sidebarTrainingToggle">
                    <span class="icon">📋</span>赛事
                    <span class="sub-arrow${expanded ? ' open' : ''}">${arrow}</span>
                </div>
                <div class="sidebar-submenu${expanded ? ' open' : ''}" id="sidebarTrainingSub">
                    <a href="training.html?action=new" class="sidebar-subitem sidebar-add-btn" id="sidebarAddTraining">➕ 新增</a>
                    ${subItems || '<div class="sidebar-subitem" style="cursor:default;color:var(--gray-300);">暂无集训</div>'}
                </div>
                <a href="tasks.html" class="sidebar-item${activeMenu === 'tasks' ? ' active' : ''}">
                    <span class="icon">🏅</span>任务管理
                </a>
                <a href="display.html" class="sidebar-item" target="_blank" style="margin-top:1.5rem;padding-top:0.75rem;border-top:1px solid var(--gray-100);">
                    <span class="icon">📺</span>成绩展示
                    <span style="font-size:0.65rem;color:var(--gray-400);margin-left:auto;">🪟</span>
                </a>`;
        }

        function buildEducationMenu() {
            return `
                <a href="admin.html" class="sidebar-item${activeMenu === 'classes' ? ' active' : ''}">
                    <span class="icon">🏫</span>班级管理
                </a>
                <a href="admin.html?tab=students" class="sidebar-item${activeMenu === 'students' ? ' active' : ''}">
                    <span class="icon">👤</span>学员管理
                </a>
                <div style="margin-top:1.5rem;padding-top:0.75rem;border-top:1px solid var(--gray-100);">
                    <a href="../tools/db-manager.html" class="sidebar-item" style="opacity:0.55;font-size:0.82rem;">
                        <span class="icon">🛠</span>DB Manager
                    </a>
                </div>`;
        }

        // ---- Inject sidebar + layout ----
        const layout = document.createElement('div');
        layout.className = 'layout';

        const sidebarWrapper = document.createElement('div');
        sidebarWrapper.innerHTML = sidebarHtml;
        const main = document.createElement('main');
        main.className = 'main-content';

        // Move all nodes after header (except scripts/styles) into main
        const bodyChildren = Array.from(document.body.children);
        const headerIdx = bodyChildren.indexOf(headerEl);
        bodyChildren.slice(headerIdx + 1).forEach(child => {
            if (child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
                main.appendChild(child);
            }
        });

        layout.appendChild(sidebarWrapper.firstElementChild);  // aside.sidebar
        layout.appendChild(sidebarWrapper.lastElementChild);   // div.sidebar-overlay
        layout.appendChild(main);
        document.body.appendChild(layout);

        // ---- Training sub-menu toggle ----
        const toggleEl = document.getElementById('sidebarTrainingToggle');
        const subEl = document.getElementById('sidebarTrainingSub');
        if (toggleEl && subEl) {
            toggleEl.addEventListener('click', function (e) {
                e.preventDefault();
                const isOpen = subEl.classList.toggle('open');
                this.querySelector('.sub-arrow').classList.toggle('open');
                this.querySelector('.sub-arrow').textContent = isOpen ? '▼' : '▶';
                localStorage.setItem('sidebar_training_expanded', isOpen);
            });
            // Don't navigate when clicking the toggle itself (only sub-items navigate)
        }

        const sidebarEl = document.getElementById('sidebar');

        // ---- Sidebar collapse/expand button ----
        const collapseBtn = document.getElementById('sidebarCollapseBtn');
        if (collapseBtn && sidebarEl) {
            collapseBtn.addEventListener('click', () => {
                const isCollapsed = sidebarEl.classList.toggle('collapsed');
                collapseBtn.textContent = isCollapsed ? '▶' : '◀';
                collapseBtn.title = isCollapsed ? '展开侧边栏' : '收起侧边栏';
                localStorage.setItem('sidebar_collapsed', isCollapsed);
            });
        }

        // ---- Sidebar popover (hover mode, collapsed only) ----
        const popover = document.getElementById('sidebarPopover');
        const trainingToggle = document.getElementById('sidebarTrainingToggle');
        let popoverTimer = null;
        if (sidebarEl && popover && trainingToggle) {
            const showPopover = () => {
                if (!sidebarEl.classList.contains('collapsed')) return;
                clearTimeout(popoverTimer);
                if (popover.classList.contains('open')) return;
                const trainings = (window.Shared && Shared.data) ? (Shared.data.trainings || []) : [];
                let items = '<a href="training.html?action=new" class="popover-item" style="font-weight:600;color:var(--primary);border:1px dashed var(--primary);margin-bottom:0.3rem;border-radius:6px;">➕ 新增</a>';
                if (trainings.length === 0) {
                    items += '<div class="popover-item" style="color:var(--gray-300);cursor:default;">暂无集训</div>';
                } else {
                    items += trainings.map(t => {
                        const isActive = trainingIdParam === t.id;
                        return `<a href="training.html?id=${t.id}" class="popover-item${isActive ? ' active' : ''}">📌 ${Shared.escapeHtml(t.name)}</a>`;
                    }).join('');
                }
                popover.innerHTML = items;
                const rect = sidebarEl.getBoundingClientRect();
                popover.style.left = (rect.right + 4) + 'px';
                popover.style.top = (rect.top + trainingToggle.offsetTop - sidebarEl.scrollTop) + 'px';
                popover.classList.add('open');
            };
            const hidePopover = () => {
                clearTimeout(popoverTimer);
                popoverTimer = setTimeout(() => {
                    popover.classList.remove('open');
                }, 200);
            };
            trainingToggle.addEventListener('mouseenter', showPopover);
            trainingToggle.addEventListener('mouseleave', hidePopover);
            popover.addEventListener('mouseenter', () => clearTimeout(popoverTimer));
            popover.addEventListener('mouseleave', hidePopover);
        }

        // ---- SPA navigation: pre-fetch & cache all pages ----
        const pageCache = {};
        const appPages = ['stats.html', 'training.html', 'tasks.html'];
        // Pre-fetch all pages after initial render (skip on file:// — CORS blocked)
        requestIdleCallback(() => {
            if (location.protocol === 'file:') return;
            appPages.forEach(async (page) => {
                try {
                    const resp = await fetch(page);
                    const html = await resp.text();
                    pageCache[page] = html;
                } catch (e) { /* ignore */ }
            });
            // Also pre-fetch training pages for sidebar items
            if (window.Shared && Shared.data) {
                Shared.data.trainings.forEach(t => {
                    const url = `training.html?id=${t.id}`;
                    fetch(url).then(r => r.text()).then(html => { pageCache[url] = html; }).catch(() => {});
                });
            }
        });

        async function navigateTo(href) {
            // Cross-category: full reload
            const isCompetition = href.includes('stats.html') || href.includes('training.html') || href.includes('tasks.html');
            const currentIsCompetition = category === 'competition';
            if ((isCompetition && !currentIsCompetition) || (!isCompetition && currentIsCompetition)) {
                window.location.href = href;
                return;
            }
            try {
                // Use cache or fetch
                let html = pageCache[href];
                if (!html) {
                    const resp = await fetch(href);
                    html = await resp.text();
                    pageCache[href] = html;
                }
                // Strip header/sidebar from the fetched HTML (we keep ours)
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                // Grab only what's after header.js script tag (the page-specific content)
                let newContent = doc.querySelector('.container');
                if (!newContent) {
                    // Fallback: try to find any content after container
                    const allScripts = doc.querySelectorAll('script');
                    for (const s of allScripts) {
                        if (s.textContent.includes('App.init') || s.textContent.includes('const App') || s.textContent.includes('StatsApp') || s.textContent.includes('TrainingApp') || s.textContent.includes('TasksApp')) {
                            const container = doc.querySelector('.container');
                            if (container) newContent = container;
                            break;
                        }
                    }
                }
                if (newContent) {
                    const main = document.querySelector('.main-content');
                    // Extract and re-execute scripts from the new content area
                    const scripts = newContent.querySelectorAll('script');
                    main.innerHTML = '';
                    main.appendChild(newContent.cloneNode(true));
                    scripts.forEach(oldScript => {
                        const script = document.createElement('script');
                        script.textContent = oldScript.textContent;
                        document.body.appendChild(script);
                    });
                    history.pushState({ page: href }, '', href);
                    if (window.updateHeaderStats) setTimeout(window.updateHeaderStats, 100);
                    // Pre-fetch adjacent pages after navigation
                    setTimeout(() => {
                        appPages.filter(p => p !== href.split('?')[0] && !pageCache[p]).forEach(p => {
                            fetch(p).then(r => r.text()).then(h => { pageCache[p] = h; }).catch(() => {});
                        });
                    }, 500);
                } else {
                    window.location.href = href;
                }
            } catch (err) {
                window.location.href = href;
            }
        }

        // Intercept all sidebar link clicks via delegation
        sidebarEl.addEventListener('click', function (e) {
            const link = e.target.closest('a[href]');
            if (!link) return;
            const href = link.getAttribute('href');
            if (!href || (!href.endsWith('.html') && !href.includes('.html?'))) return;
            if (href.startsWith('http') && !href.startsWith(window.location.origin)) return;
            e.preventDefault();
            document.querySelectorAll('.sidebar-item, .sidebar-subitem, .popover-item').forEach(el => el.classList.remove('active'));
            link.classList.add('active');
            if (popover) popover.classList.remove('open');
            navigateTo(href);
        });
        // Handle back/forward
        window.addEventListener('popstate', (e) => {
            if (e.state && e.state.page) navigateTo(e.state.page);
        });

        // ---- Sidebar toggle (mobile) ----
        const overlayEl = document.getElementById('sidebarOverlay');
        const toggleBtn = document.getElementById('sidebarToggle');

        if (toggleBtn && sidebarEl && overlayEl) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebarEl.classList.toggle('open');
                overlayEl.classList.toggle('open');
            });
            overlayEl.addEventListener('click', () => {
                sidebarEl.classList.remove('open');
                overlayEl.classList.remove('open');
            });
        }

        // ---- Update header stats ----
        if (window.Shared && Shared.data) {
            const updateStats = () => {
                const el1 = document.getElementById('hdrStudents');
                const el2 = document.getElementById('hdrTrainings');
                const el3 = document.getElementById('hdrMocks');
                if (el1) el1.textContent = Shared.data.students.length;
                if (el2) el2.textContent = Shared.data.trainings.length;
                let mc = 0;
                Shared.data.trainings.forEach((t) => (mc += t.mockCompetitions.length));
                if (el3) el3.textContent = mc;
            };
            setTimeout(updateStats, 50);
            window.updateHeaderStats = updateStats;
        }

        const cloudStatus = document.getElementById('hdrCloudStatus');
        const updateCloudStatus = (detail) => {
            if (!cloudStatus || !detail) return;
            const labels = {
                local: '☁ 本地',
                syncing: '↻ 同步中',
                supabase: '☁ 已同步',
                error: '⚠ 同步异常',
            };
            cloudStatus.textContent = labels[detail.mode] || labels.local;
            cloudStatus.title = detail.message || '数据存储状态';
        };
        if (Shared.cloudSync) updateCloudStatus(Shared.cloudSync.getStatus());
        window.addEventListener('inspire-cloud-status', (event) => updateCloudStatus(event.detail));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildLayout);
    } else {
        buildLayout();
    }
})();
