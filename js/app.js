// AI Daily Pulse — Main App Logic

(function() {
    'use strict';

    // === State ===
    let currentTab = 'industry';
    let currentDate = new Date();
    const availableDates = {}; // { industry: ['20260507', ...], spread: [...], builders: [...] }

    // === DOM refs ===
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const dateDisplay = document.getElementById('current-date');
    const datePrev = document.getElementById('date-prev');
    const dateNext = document.getElementById('date-next');
    const updateTimeEl = document.getElementById('update-time');

    // === Data index (generated during build) ===
    // This will be loaded from data/index.json
    let dataIndex = null;

    // === Init ===
    async function init() {
        try {
            const resp = await fetch('data/index.json');
            dataIndex = await resp.json();
            updateTimeEl.textContent = dataIndex.lastUpdated || '已就绪';
        } catch(e) {
            // Fallback: try to detect files directly
            updateTimeEl.textContent = '离线模式';
            dataIndex = { industry: [], spread: [], builders: [] };
        }
        
        // Set current date to latest available
        if (dataIndex.industry && dataIndex.industry.length > 0) {
            const latest = dataIndex.industry[0];
            currentDate = parseDate(latest);
        }
        
        updateDateDisplay();
        loadContent();
        bindEvents();
    }

    // === Event Binding ===
    function bindEvents() {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.tab);
            });
        });

        datePrev.addEventListener('click', () => navigateDate(-1));
        dateNext.addEventListener('click', () => navigateDate(1));

        // Keyboard nav
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') navigateDate(-1);
            if (e.key === 'ArrowRight') navigateDate(1);
            if (e.key === '1') switchTab('industry');
            if (e.key === '2') switchTab('spread');
            if (e.key === '3') switchTab('builders');
        });
    }

    // === Tab Switching ===
    function switchTab(tab) {
        currentTab = tab;
        tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
        tabContents.forEach(tc => tc.classList.toggle('active', tc.id === `tab-${tab}`));
        
        // Auto-jump to latest available date for this tab if current date has no data
        const dates = dataIndex[tab] || [];
        const currentStr = formatDateKey(currentDate);
        if (dates.length > 0 && !dates.includes(currentStr)) {
            currentDate = parseDate(dates[0]);
            updateDateDisplay();
        }
        
        loadContent();
    }

    // === Date Navigation ===
    function navigateDate(delta) {
        const dates = dataIndex[currentTab] || [];
        const currentStr = formatDateKey(currentDate);
        const currentIdx = dates.indexOf(currentStr);
        
        if (currentIdx === -1) {
            // Current date not in list, find nearest
            if (dates.length > 0) {
                currentDate = parseDate(dates[0]);
            }
        } else {
            const newIdx = currentIdx - delta; // dates are reverse-sorted (newest first)
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
        dateDisplay.textContent = `${y}年${m}月${d}日 周${w}`;
    }

    // === Content Loading ===
    async function loadContent() {
        const dateKey = formatDateKey(currentDate);
        const container = document.getElementById(`${currentTab}-content`);
        
        // Map tab to file prefix
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
            container.innerHTML = marked.parse(md);
        } catch(e) {
            container.innerHTML = `
                <div class="loading-state">
                    <p style="font-size: 32px; margin-bottom: 12px;">📭</p>
                    <p>${formatDateKey(currentDate)} 暂无数据</p>
                    <p style="margin-top: 8px; font-size: 12px; color: var(--text-muted);">
                        试试切换日期 ← →
                    </p>
                </div>
            `;
        }
    }

    // === Helpers ===
    function formatDateKey(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    function parseDate(str) {
        // str = "20260507"
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
