// AI Daily Pulse — Main App Logic (v3: 全局搜索升级)

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
    let rawContent = '';

    // 全局搜索索引缓存 { industry: [{dateKey, text, html}], spread: [...], builders: [...] }
    const searchCache = { industry: null, spread: null, builders: null };
    let isSearchMode = false; // 当前是否在搜索结果展示模式

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
        applyTheme(saved || 'dark');

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
    // 全局搜索（跨所有日期）
    // ═══════════════════════════════════════════════════════════
    let searchTimer = null;

    function initSearch() {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(doGlobalSearch, 300);
        });

        // ESC 清空搜索
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchInput.value = '';
                exitSearchMode();
            }
        });
    }

    /** 构建当前 Tab 的搜索缓存（拉取所有 md 文件的纯文本） */
    async function buildSearchCache(tab) {
        if (searchCache[tab]) return searchCache[tab];

        const dates = dataIndex[tab] || [];
        const prefixMap = { industry: 'digest_', spread: 'spread_digest_', builders: 'builders_' };
        const prefix = prefixMap[tab];

        // 显示加载提示
        searchCount.textContent = '正在加载索引...';
        searchCount.className = 'search-count';

        // 并发拉取所有文件（限制并发数避免过多请求）
        const results = [];
        const batchSize = 10;
        for (let i = 0; i < dates.length; i += batchSize) {
            const batch = dates.slice(i, i + batchSize);
            const promises = batch.map(async (dateKey) => {
                try {
                    const resp = await fetch(`data/${prefix}${dateKey}.md`);
                    if (!resp.ok) return null;
                    const md = await resp.text();
                    return { dateKey, text: md, html: marked.parse(md) };
                } catch(e) {
                    return null;
                }
            });
            const batchResults = await Promise.all(promises);
            batchResults.forEach(r => { if (r) results.push(r); });
        }

        searchCache[tab] = results;
        return results;
    }

    /** 全局搜索：在所有日报中搜索关键词 */
    async function doGlobalSearch() {
        const query = searchInput.value.trim();

        if (!query) {
            exitSearchMode();
            return;
        }

        // 进入搜索模式
        isSearchMode = true;

        // 获取缓存（首次会触发拉取）
        const cache = await buildSearchCache(currentTab);
        const regex = new RegExp(escapeRegex(query), 'gi');

        // 在每篇日报中搜索
        const matches = [];
        for (const item of cache) {
            const textMatches = item.text.match(regex);
            if (textMatches && textMatches.length > 0) {
                // 提取包含关键词的上下文片段（每篇最多3个）
                const snippets = extractSnippets(item.text, query, 3);
                matches.push({
                    dateKey: item.dateKey,
                    count: textMatches.length,
                    snippets: snippets
                });
            }
        }

        // 渲染搜索结果
        renderSearchResults(query, matches);
    }

    /** 从文本中提取包含关键词的上下文片段 */
    function extractSnippets(text, query, maxSnippets) {
        const lines = text.split('\n');
        const snippets = [];
        const lowerQuery = query.toLowerCase();

        for (const line of lines) {
            if (snippets.length >= maxSnippets) break;
            const trimmed = line.trim();
            // 跳过空行、标题标记行、纯链接行
            if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('---') || trimmed.startsWith('http')) continue;

            if (trimmed.toLowerCase().includes(lowerQuery)) {
                // 截取合适长度的片段
                let snippet = trimmed;
                if (snippet.length > 150) {
                    const idx = snippet.toLowerCase().indexOf(lowerQuery);
                    const start = Math.max(0, idx - 50);
                    const end = Math.min(snippet.length, idx + query.length + 100);
                    snippet = (start > 0 ? '...' : '') + snippet.slice(start, end) + (end < trimmed.length ? '...' : '');
                }
                // 去除 Markdown 标记
                snippet = snippet.replace(/[*_`~]/g, '');
                snippets.push(snippet);
            }
        }
        return snippets;
    }

    /** 渲染搜索结果列表 */
    function renderSearchResults(query, matches) {
        const container = document.getElementById(`${currentTab}-content`);
        const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');

        // 更新计数
        const totalMatches = matches.reduce((sum, m) => sum + m.count, 0);
        if (totalMatches > 0) {
            searchCount.textContent = `共 ${totalMatches} 处匹配（${matches.length} 篇日报）`;
            searchCount.className = 'search-count has-result';
        } else {
            searchCount.textContent = '无匹配结果';
            searchCount.className = 'search-count no-result';
        }

        // 渲染搜索结果到内容区
        if (matches.length === 0) {
            container.innerHTML = `
                <div class="loading-state">
                    <p style="font-size: 32px; margin-bottom: 12px;">🔍</p>
                    <p>未找到包含「${escapeHtml(query)}」的内容</p>
                    <p style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                        试试其他关键词，或切换到其他 Tab 搜索
                    </p>
                </div>`;
            return;
        }

        // 搜索结果列表
        const tabNameMap = { industry: '行业日报', spread: '传播日报', builders: 'Builders' };
        let html = `<div class="search-results-list">`;
        html += `<div class="search-results-header">「${escapeHtml(query)}」的搜索结果 — ${tabNameMap[currentTab]}</div>`;

        for (const match of matches) {
            const dateStr = formatDateLabel(match.dateKey);
            html += `<div class="search-result-item" data-date="${match.dateKey}">`;
            html += `<div class="search-result-date">${dateStr}<span class="search-result-badge">${match.count} 处</span></div>`;
            for (const snippet of match.snippets) {
                const highlighted = snippet.replace(regex, '<mark>$1</mark>');
                html += `<div class="search-result-snippet">${highlighted}</div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;

        container.innerHTML = html;

        // 点击搜索结果跳转到对应日期
        container.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const dateKey = item.dataset.date;
                currentDate = parseDate(dateKey);
                updateDateDisplay();
                exitSearchMode();
                searchInput.value = '';
                loadContent();
            });
        });
    }

    /** 退出搜索模式，恢复正常日报展示 */
    function exitSearchMode() {
        isSearchMode = false;
        searchCount.textContent = '';
        searchCount.className = 'search-count';
        // 重新加载当前日期内容
        loadContent();
    }

    function formatDateLabel(dateKey) {
        const y = parseInt(dateKey.substring(0, 4));
        const m = parseInt(dateKey.substring(4, 6));
        const d = parseInt(dateKey.substring(6, 8));
        const dt = new Date(y, m - 1, d);
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        return `${m}月${d}日 周${weekdays[dt.getDay()]}`;
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

        datePrev.addEventListener('click', () => navigateDate(-1));
        dateNext.addEventListener('click', () => navigateDate(1));
        datePrevBottom.addEventListener('click', () => navigateDate(-1));
        dateNextBottom.addEventListener('click', () => navigateDate(1));

        document.querySelector('.content-area').addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (link && !link.getAttribute('target')) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (document.activeElement === searchInput) return;
            if (e.key === 'ArrowLeft') navigateDate(-1);
            if (e.key === 'ArrowRight') navigateDate(1);
            if (e.key === '1') switchTab('industry');
            if (e.key === '2') switchTab('spread');
            if (e.key === '3') switchTab('builders');
            if (e.key === '/' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) {
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

        const dates = dataIndex[tab] || [];
        const currentStr = formatDateKey(currentDate);
        if (dates.length > 0 && !dates.includes(currentStr)) {
            currentDate = parseDate(dates[0]);
            updateDateDisplay();
        }

        // 切换 Tab 时清空搜索
        searchInput.value = '';
        exitSearchMode();
    }

    // === Date Navigation ===
    function navigateDate(delta) {
        // 搜索模式下不响应日期切换
        if (isSearchMode) return;

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
        loadContent();
    }

    function updateDateDisplay() {
        const y = currentDate.getFullYear();
        const m = currentDate.getMonth() + 1;
        const d = currentDate.getDate();
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const w = weekdays[currentDate.getDay()];
        const text = `${y}年${m}月${d}日 周${w}`;
        dateDisplay.textContent = text;
        dateDisplayBottom.textContent = text;
    }

    // === Content Loading ===
    async function loadContent() {
        if (isSearchMode) return; // 搜索模式下不加载日期内容

        const dateKey = formatDateKey(currentDate);
        const container = document.getElementById(`${currentTab}-content`);

        const prefixMap = { industry: 'digest_', spread: 'spread_digest_', builders: 'builders_' };
        const filename = `data/${prefixMap[currentTab]}${dateKey}.md`;

        try {
            const resp = await fetch(filename);
            if (!resp.ok) throw new Error('Not found');
            const md = await resp.text();
            const html = marked.parse(md);
            container.innerHTML = html;
            rawContent = html;
            makeLinksExternal(container);
        } catch(e) {
            container.innerHTML = `
                <div class="loading-state">
                    <p style="font-size: 32px; margin-bottom: 12px;">📭</p>
                    <p>${dateKey} 暂无数据</p>
                    <p style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                        试试切换日期 ← →
                    </p>
                </div>`;
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
