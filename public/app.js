document.addEventListener('DOMContentLoaded', () => {
    const form            = document.getElementById('recommendForm');
    const queryInput      = document.getElementById('query');
    const submitBtn       = document.getElementById('submitBtn');
    const errorBox        = document.getElementById('errorBox');
    const loadingEl       = document.getElementById('loading');
    const loadingText     = document.getElementById('loadingText');
    const resultsGrid     = document.getElementById('resultsGrid');
    const voiceBtn        = document.getElementById('voiceBtn');
    const discoverSection = document.getElementById('discoverSection');
    const resultsSection  = document.getElementById('resultsSection');
    const backBtn         = document.getElementById('backToDiscoverBtn');
    const scrollSentinel  = document.getElementById('scrollSentinel');

    const detailModal   = document.getElementById('detailModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalBody     = document.getElementById('modalBody');

    let isListening = false;
    let recognition = null;

    // Update elements
    const checkUpdateBtn      = document.getElementById('checkUpdateBtn');
    const updateModal         = document.getElementById('updateModal');
    const updateModalTitle    = document.getElementById('updateModalTitle');
    const updateModalMsg      = document.getElementById('updateModalMsg');
    const updateModalCommits  = document.getElementById('updateModalCommits');
    const doUpdateBtn         = document.getElementById('doUpdateBtn');
    const closeUpdateModalBtn = document.getElementById('closeUpdateModalBtn');
    const toast               = document.getElementById('toast');

    let toastTimer = null;
    const AI_BATCH_SIZE = 10;
    const FOCUS_PREFETCH_THRESHOLD = 4;

    // ── Page state for infinite scroll ───────────────────
    let pageState = {
        mode: 'ai',       // 'ai' | 'genre' | 'popular'
        page: 1,
        genreId: null,
        mediaType: null,
        label: '',
        aiItems: [],      // full AI results array
        shownCount: 0,
        hasMore: false,
        isLoading: false,
    };

    let modalReturnFocus = null;
    let updateReturnFocus = null;

    const TVNav = (() => {
        const focusSelector = [
            'textarea#query',
            'button:not([disabled])',
            'a[href]',
            '.movie-card',
            '.genre-chip',
            '.pill',
            '.see-all',
            '[tabindex="0"]:not([disabled])'
        ].join(',');

        let enabled = false;
        let lastFocused = null;
        let refreshTimer = null;

        function isVisible(el) {
            if (!(el instanceof HTMLElement)) return false;
            if (el.closest('.hidden')) return false;
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        }

        function activeScope() {
            if (!detailModal.classList.contains('hidden')) return detailModal;
            if (!updateModal.classList.contains('hidden')) return updateModal;
            if (!resultsSection.classList.contains('hidden')) return resultsSection;
            return document;
        }

        function uniqueVisible(items) {
            return Array.from(new Set(items)).filter(isVisible);
        }

        function focusables(scope = activeScope()) {
            return uniqueVisible(Array.from(scope.querySelectorAll(focusSelector)));
        }

        function rowFrom(items, anchor = null) {
            const visible = uniqueVisible(items);
            if (!visible.length) return null;
            return { items: visible, anchor: anchor || visible[0] };
        }

        function pushRow(rows, items, anchor = null) {
            const row = rowFrom(items, anchor);
            if (row) rows.push(row);
        }

        function pushVisualRows(rows, items) {
            const visible = uniqueVisible(items);
            const grouped = [];

            visible.forEach(el => {
                const top = Math.round(el.getBoundingClientRect().top / 28) * 28;
                let row = grouped.find(r => Math.abs(r.top - top) <= 28);
                if (!row) {
                    row = { top, items: [] };
                    grouped.push(row);
                }
                row.items.push(el);
            });

            grouped
                .sort((a, b) => a.top - b.top)
                .forEach(row => {
                    row.items.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
                    pushRow(rows, row.items);
                });
        }

        function buildRows() {
            const scope = activeScope();
            const rows = [];

            if (scope === detailModal || scope === updateModal) {
                pushVisualRows(rows, focusables(scope));
                return rows;
            }

            if (scope === resultsSection) {
                pushRow(rows, [backBtn]);
                pushVisualRows(rows, Array.from(resultsGrid.querySelectorAll('.movie-card')));
                return rows;
            }

            pushRow(rows, [checkUpdateBtn]);
            pushRow(rows, [queryInput]);
            pushVisualRows(rows, document.querySelectorAll('.search-actions button'));
            pushVisualRows(rows, document.querySelectorAll('#moodPills .pill'));

            document.querySelectorAll('#discoverSection .row-section').forEach(section => {
                const cardsRow = section.querySelector('.cards-row');
                const cards = cardsRow ? Array.from(cardsRow.querySelectorAll('.movie-card')) : [];
                const seeAll = section.querySelector('.see-all');
                if (cards.length) pushRow(rows, seeAll ? [...cards, seeAll] : cards, cardsRow);

                const genreGrid = section.querySelector('.genre-grid');
                if (genreGrid) pushVisualRows(rows, genreGrid.querySelectorAll('.genre-chip'));
            });

            return rows;
        }

        function currentPosition(rows) {
            const active = document.activeElement;
            for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
                const itemIndex = rows[rowIndex].items.indexOf(active);
                if (itemIndex !== -1) return { rowIndex, itemIndex, el: active };
            }

            if (lastFocused && isVisible(lastFocused)) {
                for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
                    const itemIndex = rows[rowIndex].items.indexOf(lastFocused);
                    if (itemIndex !== -1) return { rowIndex, itemIndex, el: lastFocused };
                }
            }

            return rows.length ? { rowIndex: 0, itemIndex: 0, el: rows[0].items[0] } : null;
        }

        function markActiveRow(target) {
            document.querySelectorAll('.tv-row-active').forEach(el => el.classList.remove('tv-row-active'));
            const rowEl = target?.closest('.cards-row, .genre-grid, .results-grid, .mood-pills, .search-actions');
            if (rowEl) rowEl.classList.add('tv-row-active');
        }

        function focusElement(target) {
            if (!enabled) return false;
            if (!target || !isVisible(target)) return false;
            lastFocused = target;
            document.body.classList.add('tv-nav-ready', 'tv-focus-active');
            target.focus({ preventScroll: true });
            markActiveRow(target);

            const rail = target.closest('.cards-row');
            if (rail) {
                target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
            return true;
        }

        function nearestInRow(row, referenceEl) {
            if (!row?.items?.length) return null;
            if (!referenceEl) return row.items[0];

            const refRect = referenceEl.getBoundingClientRect();
            const refCenter = refRect.left + refRect.width / 2;
            return row.items.reduce((best, item) => {
                const rect = item.getBoundingClientRect();
                const center = rect.left + rect.width / 2;
                const distance = Math.abs(center - refCenter);
                return !best || distance < best.distance ? { item, distance } : best;
            }, null)?.item || row.items[0];
        }

        function shouldLetInputEdit(direction) {
            const active = document.activeElement;
            if (!active?.matches?.('textarea, input, [contenteditable="true"]')) return false;
            return direction === 'left' || direction === 'right';
        }

        function handle(direction) {
            if (!enabled) return false;
            if (!['up', 'down', 'left', 'right'].includes(direction)) return false;
            if (shouldLetInputEdit(direction)) return false;

            const rows = buildRows();
            const position = currentPosition(rows);
            if (!position) return false;

            let target = null;
            if (direction === 'left' || direction === 'right') {
                const row = rows[position.rowIndex];
                const nextIndex = position.itemIndex + (direction === 'right' ? 1 : -1);
                target = row.items[nextIndex] || null;
            } else {
                const nextRowIndex = position.rowIndex + (direction === 'down' ? 1 : -1);
                target = nearestInRow(rows[nextRowIndex], position.el);
            }

            return target ? focusElement(target) : true;
        }

        function refresh(shouldFocus = false) {
            if (!enabled) return;
            document.body.classList.add('tv-nav-ready');
            window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(() => {
                const items = focusables();
                if (!items.length) return;
                if (shouldFocus && !items.includes(document.activeElement)) {
                    focusElement(lastFocused && items.includes(lastFocused) ? lastFocused : items[0]);
                } else if (items.includes(document.activeElement)) {
                    markActiveRow(document.activeElement);
                }
            }, 40);
        }

        function defaultStartElement() {
            return document.querySelector('#moodPills .pill')
                || document.querySelector('.cards-row .movie-card')
                || queryInput;
        }

        document.addEventListener('focusin', (event) => {
            if (event.target instanceof HTMLElement && isVisible(event.target)) {
                lastFocused = event.target;
                markActiveRow(event.target);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (!enabled) return;
            const directionByKey = {
                ArrowUp: 'up',
                ArrowDown: 'down',
                ArrowLeft: 'left',
                ArrowRight: 'right'
            };
            const direction = directionByKey[event.key];
            if (!direction) return;
            if (handle(direction)) {
                event.preventDefault();
                event.stopPropagation();
            }
        }, true);

        function enable(shouldFocus = true) {
            enabled = true;
            refresh(false);
            if (shouldFocus) {
                window.setTimeout(() => focusElement(defaultStartElement()), 90);
            }
        }

        function handleBack() {
            if (!detailModal.classList.contains('hidden')) {
                closeModal();
                return true;
            }
            if (!updateModal.classList.contains('hidden')) {
                closeUpdateModal();
                return true;
            }
            if (!resultsSection.classList.contains('hidden')) {
                backBtn.click();
                return true;
            }
            return false;
        }

        return {
            enable,
            handleNativeKey: (direction) => {
                enabled = true;
                return handle(direction);
            },
            handleBack,
            refresh,
            focusElement,
            focusFirst: () => enable(true)
        };
    })();

    window.SineAITV = TVNav;

    // ── Genre definitions ────────────────────────────────
    const MOVIE_GENRES = [
        { id: 28,    name: 'Aksiyon',     icon: '💥' },
        { id: 35,    name: 'Komedi',      icon: '😂' },
        { id: 18,    name: 'Drama',       icon: '🎭' },
        { id: 27,    name: 'Korku',       icon: '😱' },
        { id: 878,   name: 'Bilim Kurgu', icon: '🚀' },
        { id: 53,    name: 'Gerilim',     icon: '🔪' },
        { id: 10749, name: 'Romantik',    icon: '❤️' },
        { id: 16,    name: 'Animasyon',   icon: '🎨' },
        { id: 99,    name: 'Belgesel',    icon: '🎥' },
        { id: 14,    name: 'Fantastik',   icon: '🧙' },
        { id: 9648,  name: 'Gizem',       icon: '🔍' },
        { id: 10752, name: 'Savaş',       icon: '⚔️' },
    ];

    const TV_GENRES = [
        { id: 10759, name: 'Aksiyon & Macera', icon: '🌊' },
        { id: 35,    name: 'Komedi',           icon: '😂' },
        { id: 18,    name: 'Drama',            icon: '🎭' },
        { id: 9648,  name: 'Gizem',            icon: '🔍' },
        { id: 80,    name: 'Suç',              icon: '🕵️' },
        { id: 10765, name: 'Bilim Kurgu',      icon: '🚀' },
        { id: 10768, name: 'Savaş & Politika', icon: '⚔️' },
        { id: 10762, name: 'Çocuklar',         icon: '🧒' },
        { id: 99,    name: 'Belgesel',         icon: '📽️' },
        { id: 10766, name: 'Pembe Dizi',       icon: '💕' },
        { id: 10764, name: 'Reality',          icon: '📺' },
        { id: 37,    name: 'Western',          icon: '🤠' },
    ];

    // ── Toast ────────────────────────────────────────────
    function showToast(message, duration = 3000) {
        if (toastTimer) clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.remove('hidden');
        toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
    }

    // ── Update modal ─────────────────────────────────────
    function closeUpdateModal() {
        updateModal.classList.add('hidden');
        if (updateReturnFocus) TVNav.focusElement(updateReturnFocus);
    }

    checkUpdateBtn.addEventListener('click', async () => {
        updateReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        checkUpdateBtn.disabled = true;
        checkUpdateBtn.textContent = '🔄 Kontrol ediliyor...';
        try {
            const res  = await fetch('/api/check-update');
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            if (data.hasUpdate) {
                updateModalTitle.textContent = '⬆️ Güncelleme Mevcut!';
                updateModalMsg.textContent   = 'GitHub\'da yeni sürüm var. Coolify üzerinden Redeploy yapın.';
                updateModalCommits.innerHTML = `
                    <div>Mevcut: <code>${data.currentCommit}</code></div>
                    <div>Yeni: <code>${data.latestCommit}</code></div>
                    ${data.latestMessage ? `<div class="update-commit-msg">"${data.latestMessage}"</div>` : ''}
                `;
                updateModalCommits.classList.remove('hidden');
                doUpdateBtn.classList.add('hidden');
                updateModal.classList.remove('hidden');
                TVNav.focusElement(closeUpdateModalBtn) || closeUpdateModalBtn.focus();
            } else {
                showToast('Uygulama güncel görünüyor.');
            }
        } catch (err) {
            showToast(`Kontrol başarısız: ${err.message}`);
        } finally {
            checkUpdateBtn.disabled    = false;
            checkUpdateBtn.textContent = '🔄 Güncellemeyi Kontrol Et';
        }
    });

    doUpdateBtn.addEventListener('click', async () => {
        doUpdateBtn.disabled    = true;
        doUpdateBtn.textContent = 'Güncelleniyor...';
        try {
            const res  = await fetch('/api/update', { method: 'POST' });
            const data = await res.json();
            if (data.manual) {
                updateModalTitle.textContent = 'ℹ️ Manuel Güncelleme Gerekli';
                updateModalMsg.textContent   = data.message;
                updateModalCommits.classList.add('hidden');
                doUpdateBtn.classList.add('hidden');
                return;
            }
            if (!data.ok) throw new Error(data.error || data.message);
        } catch (err) {
            doUpdateBtn.disabled    = false;
            doUpdateBtn.textContent = 'Yeniden Dene';
            showToast(`Güncelleme başarısız: ${err.message}`);
        }
    });

    closeUpdateModalBtn.addEventListener('click', closeUpdateModal);
    closeUpdateModalBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter') closeUpdateModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !updateModal.classList.contains('hidden')) closeUpdateModal();
    });

    // ── Mood pills ───────────────────────────────────────
    document.querySelectorAll('#moodPills .pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const q = btn.dataset.query;
            if (q) { queryInput.value = q; submitSearch(q); }
        });
    });

    // ── See All buttons (direct popular, no AI) ──────────
    document.querySelectorAll('.see-all[data-type]').forEach(el => {
        el.tabIndex = 0;
        const run = () => {
            const type  = el.dataset.type;
            const label = type === 'tv' ? 'Popüler Diziler' : 'Popüler Filmler';
            submitPopular(type, label);
        };
        el.addEventListener('click', run);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    });

    // ── Back to discover ─────────────────────────────────
    backBtn.addEventListener('click', () => {
        resultsSection.classList.add('hidden');
        discoverSection.classList.remove('hidden');
        resultsGrid.innerHTML = '';
        scrollSentinel.classList.add('hidden');
        queryInput.value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        TVNav.refresh(true);
    });

    // ── Build genre grids (direct TMDB, no AI) ───────────
    function buildGenreGrid(containerId, genres, mediaType) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        genres.forEach(g => {
            const chip = document.createElement('div');
            chip.className = 'genre-chip';
            chip.tabIndex  = 0;
            chip.innerHTML = `<div class="genre-chip-icon">${g.icon}</div><div class="genre-chip-name">${g.name}</div>`;
            const run = () => submitGenre(mediaType, g.id, g.name);
            chip.addEventListener('click', run);
            chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
            container.appendChild(chip);
        });
        TVNav.refresh();
    }

    buildGenreGrid('movieGenreGrid', MOVIE_GENRES, 'movie');
    buildGenreGrid('tvGenreGrid', TV_GENRES, 'tv');

    // ── Load popular compact row ─────────────────────────
    async function loadPopular(type, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        try {
            const res  = await fetch(`/api/popular?type=${type}&page=1`);
            const data = await res.json();
            if (!data.ok || !data.results || data.results.length === 0) {
                container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Yüklenemedi.</div>';
                return;
            }
            container.innerHTML = '';
            data.results.forEach(item => {
                const year      = item.release_date ? new Date(item.release_date).getFullYear() : '';
                const rating    = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                const typeStr   = type === 'tv' ? 'Dizi' : 'Film';
                const posterUrl = item.poster ? `https://image.tmdb.org/t/p/w342${item.poster}` : null;
                const posterHTML = posterUrl
                    ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy">`
                    : `<div class="no-poster">Afiş Yok</div>`;

                let badgesHTML = '';
                if (item.providers && item.providers.length > 0) {
                    const ps = item.providers.slice(0, 2);
                    badgesHTML = `<div class="provider-badges">
                        ${ps.map(p => `<div class="badge"><img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${p.provider_name}">${p.provider_name}</div>`).join('')}
                    </div>`;
                } else {
                    badgesHTML = `<div class="provider-badges"><div class="badge">Platform yok</div></div>`;
                }

                const card = document.createElement('div');
                card.className = 'movie-card';
                card.tabIndex  = 0;
                card.innerHTML = `
                    <div class="poster-container">
                        ${posterHTML}
                        <div class="card-type-badge">${typeStr}</div>
                        <div class="card-score-badge">⭐ ${rating}</div>
                    </div>
                    <div class="card-content">
                        <h3 class="card-title">${item.title}</h3>
                        <div class="card-meta"><span>${year}</span></div>
                        <p class="card-desc">${item.overview || 'Açıklama yok.'}</p>
                        ${badgesHTML}
                    </div>
                `;
                const openModal = () => showModal(item, year, typeStr, rating, badgesHTML);
                card.addEventListener('click', openModal);
                card.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); openModal(); } });
                container.appendChild(card);
            });
            TVNav.refresh();
        } catch (err) {
            container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Yüklenemedi.</div>';
            console.error('Popular load error:', err);
            TVNav.refresh();
        }
    }

    loadPopular('movie', 'popularMoviesRow');
    loadPopular('tv',    'popularTvRow');

    // ── Infinite scroll setup ────────────────────────────
    let scrollObserver = null;

    function setupInfiniteScroll() {
        if (scrollObserver) scrollObserver.disconnect();
        scrollObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !pageState.isLoading && pageState.hasMore) {
                loadMoreResults();
            }
        }, { rootMargin: '300px' });
        scrollObserver.observe(scrollSentinel);
    }

    function updateSentinel() {
        if (pageState.hasMore) {
            scrollSentinel.classList.remove('hidden');
        } else {
            scrollSentinel.classList.add('hidden');
        }
    }

    function maybeLoadMoreFromFocus(cardEl) {
        if (!cardEl || pageState.isLoading || !pageState.hasMore) return;

        const cards = resultsGrid.querySelectorAll('.movie-card');
        const cardIndex = Array.prototype.indexOf.call(cards, cardEl);
        if (cardIndex === -1) return;

        const remainingCards = cards.length - cardIndex - 1;
        if (remainingCards <= FOCUS_PREFETCH_THRESHOLD) {
            loadMoreResults();
        }
    }

    // ── Load more results ────────────────────────────────
    async function loadMoreResults() {
        if (pageState.isLoading || !pageState.hasMore) return;
        pageState.isLoading = true;

        try {
            if (pageState.mode === 'ai') {
                const nextItems = pageState.aiItems.slice(pageState.shownCount, pageState.shownCount + AI_BATCH_SIZE);
                if (nextItems.length > 0) {
                    renderCards(nextItems);
                    pageState.shownCount += nextItems.length;
                }
                pageState.hasMore = pageState.shownCount < pageState.aiItems.length;
            } else if (pageState.mode === 'genre') {
                const nextPage = pageState.page + 1;
                const res = await fetch(`/api/genre?type=${pageState.mediaType}&genre_id=${pageState.genreId}&page=${nextPage}`);
                const data = await res.json();
                if (data.ok && data.results?.length > 0) {
                    renderCards(data.results);
                    pageState.page = nextPage;
                    pageState.hasMore = data.hasNextPage || false;
                } else {
                    pageState.hasMore = false;
                }
            } else if (pageState.mode === 'popular') {
                const nextPage = pageState.page + 1;
                const res = await fetch(`/api/popular?type=${pageState.mediaType}&page=${nextPage}`);
                const data = await res.json();
                if (data.ok && data.results?.length > 0) {
                    renderCards(data.results);
                    pageState.page = nextPage;
                    pageState.hasMore = data.hasNextPage || false;
                } else {
                    pageState.hasMore = false;
                }
            }
        } catch (err) {
            console.error('Load more error:', err);
        } finally {
            pageState.isLoading = false;
            updateSentinel();
        }
    }

    // ── Show results section ─────────────────────────────
    function showResultsSection() {
        discoverSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        resultsGrid.innerHTML = '';
        scrollSentinel.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        TVNav.refresh(true);
    }

    // ── Render a batch of cards (appends) ────────────────
    function renderCards(items) {
        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const year    = item.release_date ? new Date(item.release_date).getFullYear() : 'Bilinmiyor';
            const typeStr = item.type === 'tv' ? 'Dizi' : 'Film';
            const rating  = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
            const posterUrl  = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : null;
            const posterHTML = posterUrl
                ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy">`
                : `<div class="no-poster">Afiş Bulunamadı</div>`;

            let badgesHTML = '';
            if (item.providers && item.providers.length > 0) {
                const ps = item.providers.slice(0, 3);
                badgesHTML = `<div class="provider-badges">
                    ${ps.map(p => `<div class="badge"><img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${p.provider_name}">${p.provider_name}</div>`).join('')}
                    ${item.providers.length > 3 ? `<span class="badge">+${item.providers.length - 3}</span>` : ''}
                </div>`;
            } else {
                badgesHTML = `<div class="provider-badges"><div class="badge">Platform bilgisi yok</div></div>`;
            }

            const card = document.createElement('div');
            card.className = 'movie-card';
            card.tabIndex  = 0;
            card.innerHTML = `
                <div class="poster-container">
                    ${posterHTML}
                    <div class="card-type-badge">${typeStr}</div>
                    <div class="card-score-badge">⭐ ${rating}</div>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${item.title}</h3>
                    <div class="card-meta"><span>${year}</span></div>
                    ${item.reason ? `<div class="card-reason">${item.reason}</div>` : ''}
                    <p class="card-desc">${item.overview || 'Açıklama bulunmuyor.'}</p>
                    ${badgesHTML}
                </div>
            `;
            const openModal = () => showModal(item, year, typeStr, rating, badgesHTML);
            card.addEventListener('click', openModal);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); openModal(); } });
            card.addEventListener('focus', () => maybeLoadMoreFromFocus(card));
            fragment.appendChild(card);
        });
        resultsGrid.appendChild(fragment);
        updateSentinel();
        TVNav.refresh();
    }

    // ── Submit: Genre (direct TMDB, no AI) ───────────────
    async function submitGenre(mediaType, genreId, genreName) {
        errorBox.classList.add('hidden');
        showResultsSection();
        loadingText.textContent = 'Yükleniyor...';
        loadingEl.classList.remove('hidden');

        pageState = { mode: 'genre', page: 1, genreId, mediaType, label: genreName, aiItems: [], shownCount: 0, hasMore: false, isLoading: false };

        try {
            const res  = await fetch(`/api/genre?type=${mediaType}&genre_id=${genreId}&page=1`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);

            const titleEl = document.createElement('h2');
            titleEl.textContent = `${genreName} ${mediaType === 'tv' ? 'Dizileri' : 'Filmleri'}`;
            resultsGrid.appendChild(titleEl);

            pageState.hasMore = data.hasNextPage || false;
            renderCards(data.results || []);
            setupInfiniteScroll();
        } catch (err) {
            showError(`Bir hata oluştu: ${err.message}`);
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    // ── Submit: Popular full view (direct TMDB, no AI) ───
    async function submitPopular(mediaType, label) {
        errorBox.classList.add('hidden');
        showResultsSection();
        loadingText.textContent = 'Yükleniyor...';
        loadingEl.classList.remove('hidden');

        pageState = { mode: 'popular', page: 1, genreId: null, mediaType, label, aiItems: [], shownCount: 0, hasMore: false, isLoading: false };

        try {
            const res  = await fetch(`/api/popular?type=${mediaType}&page=1`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);

            const titleEl = document.createElement('h2');
            titleEl.textContent = label;
            resultsGrid.appendChild(titleEl);

            pageState.hasMore = data.hasNextPage || false;
            renderCards(data.results || []);
            setupInfiniteScroll();
        } catch (err) {
            showError(`Bir hata oluştu: ${err.message}`);
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    // ── Speech ───────────────────────────────────────────
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang            = 'tr-TR';
        recognition.continuous      = false;
        recognition.interimResults  = false;
        recognition.onstart  = () => { isListening = true;  voiceBtn.classList.add('listening');    voiceBtn.textContent = 'Dinleniyor...'; };
        recognition.onresult = (e) => { queryInput.value = e.results[0][0].transcript; };
        recognition.onerror  = (e) => { showError(`Ses algılanamadı (${e.error}).`); };
        recognition.onend    = () => { isListening = false; voiceBtn.classList.remove('listening'); voiceBtn.textContent = '🎤 Ses'; };
    } else {
        voiceBtn.style.display = 'none';
    }

    voiceBtn.addEventListener('click', () => {
        if (!recognition) { showError('Sesli arama desteklenmiyor.'); return; }
        if (isListening) recognition.stop();
        else { errorBox.classList.add('hidden'); recognition.start(); }
    });

    // ── Form submit ──────────────────────────────────────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = queryInput.value.trim();
        if (q) await submitSearch(q);
    });

    async function submitSearch(query) {
        errorBox.classList.add('hidden');
        showResultsSection();
        loadingText.textContent = 'AI analiz ediyor ve TMDB\'de aranıyor...';
        loadingEl.classList.remove('hidden');
        submitBtn.disabled = true;

        pageState = { mode: 'ai', page: 1, genreId: null, mediaType: null, label: query, aiItems: [], shownCount: 0, hasMore: false, isLoading: false };

        try {
            const response = await fetch('/api/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || 'Sunucu ile iletişim kurulamadı.');
            if (data.warnings && data.warnings.length > 0) console.warn('API Warnings:', data.warnings);
            renderResults(data.results, data.reference, data.normalized);
        } catch (error) {
            console.error('API Error:', error);
            showError(`Bir hata oluştu: ${error.message}. Lütfen tekrar deneyin.`);
        } finally {
            loadingEl.classList.add('hidden');
            submitBtn.disabled = false;
        }
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.classList.remove('hidden');
    }

    function renderResults(results, reference, normalized) {
        if (!results || results.length === 0) {
            resultsGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:48px 20px;">Aradığınız kriterlere uygun sonuç bulunamadı.</div>';
            return;
        }

        const titleEl = document.createElement('h2');
        if (normalized.intent === 'similar_to_title' && reference) {
            titleEl.textContent = `${reference.title} benzeri öneriler`;
        } else if (normalized.intent === 'person_search' && normalized.actors?.length > 0) {
            titleEl.textContent = `"${normalized.actors[0]}" yer aldığı yapımlar`;
        } else if (normalized.intent === 'person_search' && normalized.directors?.length > 0) {
            titleEl.textContent = `"${normalized.directors[0]}" yönettiği yapımlar`;
        } else if (normalized.watch_provider) {
            titleEl.textContent = `${normalized.watch_provider} platformundaki öneriler`;
        } else {
            titleEl.textContent = 'Sizin için önerilenler';
        }
        resultsGrid.appendChild(titleEl);

        // Show first 10, keep rest for scroll-load
        const firstBatch = results.slice(0, AI_BATCH_SIZE);
        pageState.aiItems    = results;
        pageState.shownCount = firstBatch.length;
        pageState.hasMore    = results.length > firstBatch.length;

        renderCards(firstBatch);
        setupInfiniteScroll();
    }

    // ── Modal ────────────────────────────────────────────
    function showModal(item, year, typeStr, rating, badgesHTML) {
        modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const posterUrl  = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : null;
        const posterHTML = posterUrl
            ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy">`
            : `<div class="no-poster">Afiş Bulunamadı</div>`;

        const genresHTML = item.genres?.length > 0
            ? `<div class="genre-pills">${item.genres.map(g => `<span class="genre-pill">${g}</span>`).join('')}</div>`
            : '';

        let runtimeStr = '';
        if (item.number_of_seasons) {
            runtimeStr = `${item.number_of_seasons} Sezon`;
        } else if (item.runtime) {
            runtimeStr = `${item.runtime} dk`;
        }

        const originalTitleHTML = (item.original_title && item.original_title !== item.title)
            ? `<div class="original-title">${item.original_title}</div>`
            : '';
        const directorHTML = item.director
            ? `<div class="modal-director"><strong>${item.type === 'movie' ? 'Yönetmen' : 'Yaratıcı'}:</strong> ${item.director}</div>`
            : '';
        const trailerHTML = item.trailer_url
            ? `<a href="${item.trailer_url}" target="_blank" rel="noopener noreferrer" class="trailer-btn" tabindex="0">📺 Fragmanı Aç (YouTube)</a>`
            : '';

        modalBody.innerHTML = `
            <div class="modal-layout">
                <div class="modal-poster">${posterHTML}</div>
                <div class="modal-info">
                    <h2>${item.title}</h2>
                    ${originalTitleHTML}
                    <div class="meta">
                        <span>${year}</span><span>•</span><span>${typeStr}</span>
                        <span>•</span><span>⭐ ${rating}</span>
                        ${runtimeStr ? `<span>•</span><span>${runtimeStr}</span>` : ''}
                    </div>
                    ${genresHTML}
                    ${directorHTML}
                    ${item.reason ? `<div class="card-reason modal-reason">${item.reason}</div>` : ''}
                    <div class="overview">${item.overview || 'Bu yapım için detaylı bir açıklama bulunmuyor.'}</div>
                    <div class="providers">
                        <h3>İzlenebilecek Platformlar (TR)</h3>
                        <div style="margin-top:10px;">${badgesHTML}</div>
                    </div>
                    ${trailerHTML}
                </div>
            </div>
        `;
        detailModal.classList.remove('hidden');
        setTimeout(() => {
            const trailerBtn = modalBody.querySelector('.trailer-btn');
            const target = trailerBtn || closeModalBtn;
            TVNav.focusElement(target) || target.focus();
        }, 50);
    }

    function closeModal() {
        detailModal.classList.add('hidden');
        modalBody.innerHTML = '';
        if (!TVNav.focusElement(modalReturnFocus)) {
            queryInput.focus();
        }
    }

    closeModalBtn.addEventListener('click', closeModal);
    closeModalBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter') closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) closeModal();
    });
});
