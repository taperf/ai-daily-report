// AI Daily Pulse — Main App Logic (v2: 主题切换 + 底部日期 + 回到顶部 + 搜索)

(function() {
    'use strict';

    // Configure marked: all links open in new tab
    const renderer = new marked.Renderer();
    renderer.link = function(href, title, text) {
        if (typeof href === 'object') {
            const token = href;
            return `<a href="${token.href}" target="_blank" rel="noopener noreferrer"${token.title ? ' title="' + token.title + '"' : ''}>${token.text || token.href}</a>`;
        }
        return `<a href="${href}" target="_blank" rel="noopener noreferrer"${title ? ' title="' + title + '"' : ''}>${text}</a>`;
    };
    marked.setOptions({ renderer: renderer });

    // === State ===
    let currentTab = 'industry';
    let currentDate = new Date();
    let rawContent = ''; // 原始 HTML（搜索前保存，用于恢复）

    // === DOM refs ===
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const dateDisplay = document.getElementById('current-date');
    const dateDisplayBottom = document.getElementById('current-date-bottom');
    const datePrev = document.getElementById('date-prev');
    const dateNext = document.getElementById('date-next');
    const datePrevBottom = document.getElementById('date-prev-bottom');
    const dateNextBottom = document.getElementById('date-next-bottom');
    const updateTimeEl = document.getElementById('update-time');
    const backToTopBtn = document.getElementById('back-to-top');
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const searchInput = document.getElementById('search-input');
    const searchCount = document.getElementById('search-count');

    // === Data index ===
    let dataIndex = null;

    // === Init ===
    async function init() {
        initTheme();
        initBackToTop();
        initSearch();

        try {
            const resp = await fetch('data/index.json');
            dataIndex = await resp.json();
            updateTimeEl.textContent = dataIndex.lastUpdated || '已就绪';
        } catch(e) {
            updateTimeEl.textContent = '离线模式';
            dataIndex = { industry: [], spread: [], builders: [] };
        }

        // Set current date to latest available
        if (dataIndex.industry && dataIndex.industry.length > 0) {
            currentDate = parseDate(dataIndex.industry[0]);
        }

        updateDateDisplay();
        loadContent();
        bindEvents();
    }

    // ═══════════════════════════════════════════════════════════
    // 主题切换
    // ═══════════════════════════════════════════════════════════
    function initTheme() {
        const saved = localStorage.getItem('ai-pulse-theme');
        if (saved) {
            applyTheme(saved);
        } else {
            applyTheme('dark'); // 默认深色
        }

        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            localStorage.setItem('ai-pulse-theme', next);
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }

    // ═══════════════════════════════════════════════════════════
    // 回到顶部
    // ═══════════════════════════════════════════════════════════
    function initBackToTop() {
        window.addEventListener('scroll', () => {
            backToTopBtn.classList.toggle('visible', window.scrollY > 300);
        }, { passive: true });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 搜索功能
    // ═══════════════════════════════════════════════════════════
    let searchTimer = null;

    function initSearch() {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(doSearch, 300);
        });
    }

    function doSearch() {
        const query = searchInput.value.trim();
        const container = document.getElementById(`${currentTab}-content`);

        if (!query) {
            // 清空搜索 → 恢复原始内容
            if (rawContent) {
                container.innerHTML = rawContent;
                makeLinksExternal(container);
            }
            searchCount.textContent = '';
            searchCount.className = 'search-count';
            return;
        }

        // 从原始内容中搜索
        if (!rawContent) return;
        const div = document.createElement('div');
        div.innerHTML = rawContent;

        // 遍历文本节点进行高亮
        let count = 0;
        const regex = new RegExp(escapeRegex(query), 'gi');

        function walkNodes(node) {
            if (node.nodeType === 3) { // Text node
                const text = node.textContent;
                if (regex.test(text)) {
                    regex.lastIndex = 0; // reset
                    const matches = text.match(regex);
                    count += matches ? matches.length : 0;
                    const span = document.createElement('span');
                    span.innerHTML = text.replace(regex, '<mark>$&</mark>');
                    node.parentNode.replaceChild(span, node);
                }
            } else if (node.nodeType === 1 && node.tagName !== 'MARK' && node.tagName !== 'SCRIPT') {
                // 对子节点做浅拷贝遍历，因为替换会改变 childNodes
                Array.from(node.childNodes).forEach(walkNodes);
            }
        }

        walkNodes(div);
        container.innerHTML = div.innerHTML;
        makeLinksExternal(container);

        // 更新计数
        if (count > 0) {
            searchCount.textContent = `找到 ${count} 处匹配`;
            searchCount.className = 'search-count has-result';
        } else {
            searchCount.textContent = '无匹配结果';
            searchCount.className = 'search-count no-result';
        }
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ═══════════════════════════════════════════════════════════
    // Event Binding
    // ═══════════════════════════════════════════════════════════
    function bindEvents() {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // 顶部日期按钮
        datePrev.addEventListener('click', () => navigateDate(-1));
        dateNext.addEventListener('click', () => navigateDate(1));

        // 底部日期按钮（与顶部完全联动）
        datePrevBottom.addEventListener('click', () => navigateDate(-1));
        dateNextBottom.addEventListener('click', () => navigateDate(1));

        // Force all links in content area to open in new tab
        document.querySelector('.content-area').addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (link && !link.getAttribute('target')) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            }
        });

        // Keyboard nav
        document.addEventListener('keydown', (e) => {
            // 搜索框获焦时不触发快捷键
            if (document.activeElement === searchInput) return;
            if (e.key === 'ArrowLeft') navigateDate(-1);
            if (e.key === 'ArrowRight') navigateDate(1);
            if (e.key === '1') switchTab('industry');
            if (e.key === '2') switchTab('spread');
            if (e.key === '3') switchTab('builders');
            if (e.key === '/' || e.key === 'f' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    // === Tab Switching ===
    function switchTab(tab) {
        currentTab = tab;
        tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
        tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tab}`));

        // Auto-jump to latest available date for this tab
        const dates = dataIndex[tab] || [];
        const currentStr = formatDateKey(currentDate);
        if (dates.length > 0 && !dates.includes(currentStr)) {
            currentDate = parseDate(dates[0]);
            updateDateDisplay();
        }

        // 切换 Tab 时清空搜索
        searchInput.value = '';
        searchCount.textContent = '';
        searchCount.className = 'search-count';
        rawContent = '';

        loadContent();
    }

    // === Date Navigation ===
    function navigateDate(delta) {
        const dates = dataIndex[currentTab] || [];
        const currentStr = formatDateKey(currentDate);
        const currentIdx = dates.indexOf(currentStr);

        if (currentIdx === -1) {
            if (dates.length > 0) {
                currentDate = parseDate(dates[0]);
            }
        } else {
            const newIdx = currentIdx - delta;
            if (newIdx >= 0 && newIdx < dates.length) {
                currentDate = parseDate(dates[newIdx]);
            }
        }

        updateDateDisplay();
        // 日期切换时清空搜索
        searchInput.value = '';
        searchCount.textContent = '';
        searchCount.className = 'search-count';
        rawContent = '';
        loadContent();
    }

    function updateDateDisplay() {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth() + 1;
        const d = currentDate.getDate();
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const w = weekdays[currentDate.getDay()];
        const text = `${y}年${m}月${d}日 周${w}`;
        // 同步更新顶部和底部
        dateDisplay.textContent = text;
        dateDisplayBottom.textContent = text;
    }

    // === Content Loading ===
    async function loadContent() {
        const dateKey = formatDateKey(currentDate);
        const container = document.getElementById(`${currentTab}-content`);

        const prefixMap = {
            industry: 'digest_',
            spread: 'spread_digest_',
            builders: 'builders_'
        };

        const filename = `data/${prefixMap[currentTab]}${dateKey}.md`;

        try {
            const resp = await fetch(filename);
            if (!resp.ok) throw new Error('Not found');
            const md = await resp.text();
            const html = marked.parse(md);
            container.innerHTML = html;
            rawContent = html; // 保存原始内容用于搜索恢复
            makeLinksExternal(container);
        } catch(e) {
            container.innerHTML = `
                <div class="loading-state">
                    <p style="font-size: 32px; margin-bottom: 12px;">📭</p>
                    <p>${dateKey} 暂无数据</p>
                    <p style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                        试试切换日期 ← →
                    </p>
                </div>
            `;
            rawContent = '';
        }
    }

    // === Helpers ===
    function makeLinksExternal(container) {
        container.querySelectorAll('a[href]').forEach(a => {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        });
    }

    function formatDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    function parseDate(str) {
        const y = parseInt(str.substring(0, 4));
        const m = parseInt(str.substring(4, 6)) - 1;
        const d = parseInt(str.substring(6, 8));
        return new Date(y, m, d);
    }

    // === Boot ===
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
