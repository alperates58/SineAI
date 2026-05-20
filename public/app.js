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
    function closeUpdateModal() { updateModal.classList.add('hidden'); }

    checkUpdateBtn.addEventListener('click', async () => {
        checkUpdateBtn.disabled = true;
        checkUpdateBtn.textContent = '🔄 Kontrol ediliyor...';
        try {
            const res  = await fetch('/api/check-update');
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            if (data.hasUpdate) {
                updateModalTitle.textContent = '⬆️ Güncelleme Mevcut!';
                updateModalMsg.textContent   = 'GitHub\'ta yeni bir sürüm bulundu.';
                updateModalCommits.innerHTML = `
                    <div>Mevcut: <code>${data.currentCommit}</code></div>
                    <div>Yeni: <code>${data.latestCommit}</code></div>
                    ${data.latestMessage ? `<div class="update-commit-msg">"${data.latestMessage}"</div>` : ''}
                `;
                updateModalCommits.classList.remove('hidden');
                doUpdateBtn.classList.remove('hidden');
                doUpdateBtn.disabled    = false;
                doUpdateBtn.textContent = '⬆️ Güncelle';
                updateModal.classList.remove('hidden');
                closeUpdateModalBtn.focus();
            } else {
                showToast('✅ Yeni güncelleme yok');
            }
        } catch (err) {
            showToast(`Kontrol başarısız: ${err.message}`);
        } finally {
            checkUpdateBtn.disabled    = false;
            checkUpdateBtn.textContent = '🔄 Güncellemeleri Kontrol Et';
        }
    });

    doUpdateBtn.addEventListener('click', async () => {
        doUpdateBtn.disabled    = true;
        doUpdateBtn.textContent = 'Güncelleniyor...';
        try {
            const res  = await fetch('/api/update', { method: 'POST' });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);
            updateModalTitle.textContent = '✅ Güncelleme Başarılı';
            updateModalMsg.textContent   = 'Sunucu yeniden başlatılıyor. Lütfen birkaç saniye bekleyin...';
            updateModalCommits.classList.add('hidden');
            doUpdateBtn.classList.add('hidden');
            setTimeout(() => location.reload(), 5000);
        } catch (err) {
            doUpdateBtn.disabled    = false;
            doUpdateBtn.textContent = '⬆️ Güncelle';
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
        } catch (err) {
            container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Yüklenemedi.</div>';
            console.error('Popular load error:', err);
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
            if (trailerBtn) trailerBtn.focus(); else closeModalBtn.focus();
        }, 50);
    }

    function closeModal() {
        detailModal.classList.add('hidden');
        modalBody.innerHTML = '';
        queryInput.focus();
    }

    closeModalBtn.addEventListener('click', closeModal);
    closeModalBtn.addEventListener('keydown', (e) => { if (e.key === 'Enter') closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) closeModal();
    });
});
