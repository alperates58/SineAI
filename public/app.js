document.addEventListener('DOMContentLoaded', () => {
    const form            = document.getElementById('recommendForm');
    const queryInput      = document.getElementById('query');
    const submitBtn       = document.getElementById('submitBtn');
    const errorBox        = document.getElementById('errorBox');
    const loadingEl       = document.getElementById('loading');
    const resultsGrid     = document.getElementById('resultsGrid');
    const voiceBtn        = document.getElementById('voiceBtn');
    const discoverSection = document.getElementById('discoverSection');
    const resultsSection  = document.getElementById('resultsSection');
    const backBtn         = document.getElementById('backToDiscoverBtn');

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

    // ── Genre definitions ────────────────────────────────
    const MOVIE_GENRES = [
        { id: 28,    name: 'Aksiyon',     icon: '💥', query: 'Aksiyon filmleri öner' },
        { id: 35,    name: 'Komedi',      icon: '😂', query: 'Komedi filmleri öner' },
        { id: 18,    name: 'Drama',       icon: '🎭', query: 'Drama filmleri öner' },
        { id: 27,    name: 'Korku',       icon: '😱', query: 'Korku filmleri öner' },
        { id: 878,   name: 'Bilim Kurgu', icon: '🚀', query: 'Bilim kurgu filmleri öner' },
        { id: 53,    name: 'Gerilim',     icon: '🔪', query: 'Gerilim filmleri öner' },
        { id: 10749, name: 'Romantik',    icon: '❤️', query: 'Romantik filmler öner' },
        { id: 16,    name: 'Animasyon',   icon: '🎨', query: 'Animasyon filmleri öner' },
        { id: 99,    name: 'Belgesel',    icon: '🎥', query: 'Belgesel filmler öner' },
        { id: 14,    name: 'Fantastik',   icon: '🧙', query: 'Fantastik filmler öner' },
        { id: 9648,  name: 'Gizem',       icon: '🔍', query: 'Gizem filmleri öner' },
        { id: 10752, name: 'Savaş',       icon: '⚔️', query: 'Savaş filmleri öner' },
    ];

    const TV_GENRES = [
        { id: 10759, name: 'Aksiyon & Macera', icon: '🌊', query: 'Aksiyon macera dizileri öner' },
        { id: 35,    name: 'Komedi',           icon: '😂', query: 'Komedi dizileri öner' },
        { id: 18,    name: 'Drama',            icon: '🎭', query: 'Drama dizileri öner' },
        { id: 9648,  name: 'Gizem',            icon: '🔍', query: 'Gizem dizileri öner' },
        { id: 80,    name: 'Suç',              icon: '🕵️', query: 'Suç dizileri öner' },
        { id: 10765, name: 'Bilim Kurgu',      icon: '🚀', query: 'Bilim kurgu dizileri öner' },
        { id: 10768, name: 'Savaş & Politika', icon: '⚔️', query: 'Savaş ve politika dizileri öner' },
        { id: 10762, name: 'Çocuklar',         icon: '🧒', query: 'Aile çocuklar için dizi öner' },
        { id: 99,    name: 'Belgesel',         icon: '📽️', query: 'Belgesel dizileri öner' },
        { id: 10766, name: 'Pembe Dizi',       icon: '💕', query: 'Pembe dizi romantik diziler öner' },
        { id: 10764, name: 'Reality',          icon: '📺', query: 'Reality show dizileri öner' },
        { id: 37,    name: 'Western',          icon: '🤠', query: 'Western dizi öner' },
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

    // ── See All buttons ──────────────────────────────────
    document.querySelectorAll('.see-all[data-query]').forEach(el => {
        el.tabIndex = 0;
        const run = () => { const q = el.dataset.query; if (q) { queryInput.value = q; submitSearch(q); } };
        el.addEventListener('click', run);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
    });

    // ── Back to discover ─────────────────────────────────
    backBtn.addEventListener('click', () => {
        resultsSection.classList.add('hidden');
        discoverSection.classList.remove('hidden');
        resultsGrid.innerHTML = '';
        queryInput.value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ── Build genre grids ────────────────────────────────
    function buildGenreGrid(containerId, genres) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        genres.forEach(g => {
            const chip = document.createElement('div');
            chip.className = 'genre-chip';
            chip.tabIndex  = 0;
            chip.innerHTML = `<div class="genre-chip-icon">${g.icon}</div><div class="genre-chip-name">${g.name}</div>`;
            const run = () => { queryInput.value = g.query; submitSearch(g.query); };
            chip.addEventListener('click', run);
            chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
            container.appendChild(chip);
        });
    }

    buildGenreGrid('movieGenreGrid', MOVIE_GENRES);
    buildGenreGrid('tvGenreGrid', TV_GENRES);

    // ── Load popular from API ────────────────────────────
    async function loadPopular(type, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        try {
            const res  = await fetch(`/api/popular?type=${type}`);
            const data = await res.json();
            if (!data.ok || !data.results || data.results.length === 0) {
                container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Yüklenemedi.</div>';
                return;
            }
            container.innerHTML = '';
            data.results.forEach(item => {
                const year     = item.release_date ? new Date(item.release_date).getFullYear() : '';
                const rating   = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                const typeStr  = type === 'tv' ? 'Dizi' : 'Film';
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
        resultsGrid.innerHTML = '';
        loadingEl.classList.remove('hidden');
        submitBtn.disabled = true;

        discoverSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });

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
        const fragment = document.createDocumentFragment();

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
        fragment.appendChild(titleEl);

        results.forEach(item => {
            const card      = document.createElement('div');
            card.className  = 'movie-card';
            card.tabIndex   = 0;
            const year      = item.release_date ? new Date(item.release_date).getFullYear() : 'Bilinmiyor';
            const typeStr   = item.type === 'tv' ? 'Dizi' : 'Film';
            const posterUrl = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : null;
            const rating    = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
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
            fragment.appendChild(card);
        });
        resultsGrid.appendChild(fragment);
    }

    // ── Modal ────────────────────────────────────────────
    function showModal(item, year, typeStr, rating, badgesHTML) {
        const posterUrl  = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : null;
        const posterHTML = posterUrl
            ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy">`
            : `<div class="no-poster">Afiş Bulunamadı</div>`;
        const genresHTML       = item.genres?.length > 0
            ? `<div class="genre-pills">${item.genres.map(g => `<span class="genre-pill">${g}</span>`).join('')}</div>`
            : '';
        const runtimeStr       = item.runtime
            ? `${item.runtime} dk`
            : (item.type === 'tv' ? 'Bölüm süresi bilgisi yok' : 'Süre bilgisi yok');
        const originalTitleHTML = (item.original_title && item.original_title !== item.title)
            ? `<div class="original-title">${item.original_title}</div>`
            : '';
        const directorHTML     = item.director
            ? `<div class="modal-director"><strong>${item.type === 'movie' ? 'Yönetmen' : 'Yaratıcı'}:</strong> ${item.director}</div>`
            : '';
        const trailerHTML      = item.trailer_url
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
                        <span>•</span><span>⭐ ${rating}</span><span>•</span><span>${runtimeStr}</span>
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
