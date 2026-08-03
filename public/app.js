document.addEventListener('DOMContentLoaded', () => {
    // ── DOM References ──────────────────────────────────
    const form            = document.getElementById('recommendForm');
    const queryInput      = document.getElementById('query');
    const submitBtn       = document.getElementById('submitBtn');
    const voiceBtn        = document.getElementById('voiceBtn');
    const randomPickBtn   = document.getElementById('randomPickBtn');
    const errorBox        = document.getElementById('errorBox');
    const loadingEl       = document.getElementById('loading');
    const loadingText     = document.getElementById('loadingText');
    const resultsGrid     = document.getElementById('resultsGrid');
    const discoverSection = document.getElementById('discoverSection');
    const resultsSection  = document.getElementById('resultsSection');
    const profileSection  = document.getElementById('profileSection');
    const backBtn         = document.getElementById('backToDiscoverBtn');
    const profileBackBtn  = document.getElementById('profileBackBtn');
    const goToDiscoverBtn = document.getElementById('goToDiscoverBtn');
    const scrollSentinel  = document.getElementById('scrollSentinel');
    const resultsHeading  = document.getElementById('resultsHeading');
    const quickFilterBar  = document.getElementById('quickFilterBar');

    // Sort & Pagination References
    const sortSelect           = document.getElementById('sortSelect');
    const pageInfoBadge        = document.getElementById('pageInfoBadge');
    const paginationBar        = document.getElementById('paginationBar');
    const prevPageBtn          = document.getElementById('prevPageBtn');
    const nextPageBtn          = document.getElementById('nextPageBtn');
    const pageNumbersContainer = document.getElementById('pageNumbersContainer');

    // Modals
    const detailModal          = document.getElementById('detailModal');
    const closeModalBtn        = document.getElementById('closeModalBtn');
    const modalBody            = document.getElementById('modalBody');

    const trailerModal         = document.getElementById('trailerModal');
    const closeTrailerModalBtn = document.getElementById('closeTrailerModalBtn');
    const trailerTitle         = document.getElementById('trailerTitle');
    const trailerIframe        = document.getElementById('trailerIframe');

    const authModal            = document.getElementById('authModal');
    const closeAuthModalBtn    = document.getElementById('closeAuthModalBtn');
    const userAuthBtn          = document.getElementById('userAuthBtn');
    const userProfileBtn       = document.getElementById('userProfileBtn');
    const navUsername          = document.getElementById('navUsername');
    const navFavBadge          = document.getElementById('navFavBadge');

    const tabLogin             = document.getElementById('tabLogin');
    const tabRegister          = document.getElementById('tabRegister');
    const loginForm            = document.getElementById('loginForm');
    const registerForm         = document.getElementById('registerForm');
    const loginError           = document.getElementById('loginError');
    const regError             = document.getElementById('regError');

    const profileUsername      = document.getElementById('profileUsername');
    const logoutBtn            = document.getElementById('logoutBtn');
    const favProgressBar       = document.getElementById('favProgressBar');
    const favProgressText      = document.getElementById('favProgressText');
    const profileRecommendBtn  = document.getElementById('profileRecommendBtn');
    const profileFavCount      = document.getElementById('profileFavCount');
    const profileSuperCount    = document.getElementById('profileSuperCount');
    const profileFavGrid       = document.getElementById('profileFavGrid');

    const toast                = document.getElementById('toast');
    let toastTimer = null;
    const AI_BATCH_SIZE = 10;

    // Genre Constants
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
        { id: 10752, name: 'Savaş',       icon: '⚔️' }
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
        { id: 37,    name: 'Western',          icon: '🤠' }
    ];

    // App & User State
    let currentUser = null;
    let userFavorites = [];
    let userReactions = {};
    let currentRawResults = [];
    let activeFilter = 'all';

    let pageState = {
        mode: 'ai', // 'ai' | 'genre' | 'popular'
        page: 1,
        totalPages: 1,
        genreId: null,
        mediaType: null,
        label: '',
        sortBy: 'popularity_desc',
        shownCount: 0,
        hasMore: false,
        isLoading: false,
    };

    // ── Auth & Local Storage Init ──────────────────────
    function initUser() {
        const savedReactions = localStorage.getItem('sineai_reactions');
        if (savedReactions) {
            try { userReactions = JSON.parse(savedReactions); } catch (e) {}
        }

        const saved = localStorage.getItem('sineai_user');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                currentUser = parsed.username;
                userFavorites = parsed.favorites || [];
                updateAuthUI();
                syncFavoritesWithServer();
            } catch (e) {}
        } else {
            const guestFavs = localStorage.getItem('sineai_guest_favs');
            if (guestFavs) {
                try { userFavorites = JSON.parse(guestFavs); } catch (e) {}
            }
            updateAuthUI();
        }

        // Init discover page components
        buildGenreGrid('movieGenreGrid', MOVIE_GENRES, 'movie');
        buildGenreGrid('tvGenreGrid', TV_GENRES, 'tv');
        loadPopular('movie', 'popularMoviesRow');
        loadPopular('tv', 'popularTvRow');
    }

    function saveUserSession(user) {
        currentUser = user.username;
        userFavorites = user.favorites || [];
        localStorage.setItem('sineai_user', JSON.stringify({ username: user.username, favorites: userFavorites }));
        updateAuthUI();
    }

    function updateAuthUI() {
        if (currentUser) {
            userAuthBtn.classList.add('hidden');
            userProfileBtn.classList.remove('hidden');
            navUsername.textContent = currentUser;
        } else {
            userAuthBtn.classList.remove('hidden');
            userProfileBtn.classList.add('hidden');
        }
        navFavBadge.textContent = `${userFavorites.length}/10`;
        updateProfilePageUI();
    }

    async function syncFavoritesWithServer() {
        if (!currentUser) return;
        try {
            const res = await fetch(`/api/user/profile?username=${encodeURIComponent(currentUser)}`);
            const data = await res.json();
            if (data.ok) {
                userFavorites = data.favorites || [];
                localStorage.setItem('sineai_user', JSON.stringify({ username: currentUser, favorites: userFavorites }));
                updateAuthUI();
            }
        } catch (e) {}
    }

    function getItemKey(item) {
        return `${item.type}_${item.id}`;
    }

    function getReaction(item) {
        const key = getItemKey(item);
        if (userReactions[key]) return userReactions[key];
        if (isFavorited(item)) return 'like';
        return null;
    }

    function setReaction(item, reactionType) {
        const key = getItemKey(item);
        const currentRec = userReactions[key];

        if (currentRec === reactionType && reactionType !== 'fav') {
            delete userReactions[key];
            removeFromFavorites(item);
            showToast('Tepkiniz sıfırlandı ⚪');
        } else if (reactionType === 'fav') {
            if (isFavorited(item)) {
                delete userReactions[key];
                removeFromFavorites(item);
                showToast('🤍 Favorilerden çıkarıldı');
            } else {
                userReactions[key] = 'like';
                addToFavorites(item);
                showToast('❤️ Favorilerime eklendi!');
            }
        } else {
            userReactions[key] = reactionType;

            if (reactionType === 'super') {
                addToFavorites({ ...item, super: true });
                showToast('💖 Çok Beğendim! Profiline eklendi.');
            } else if (reactionType === 'like') {
                addToFavorites(item);
                showToast('👍 Beğendim! Favorilerine eklendi.');
            } else if (reactionType === 'dislike') {
                removeFromFavorites(item);
                showToast('👎 Beğenmedim. Benzer yapımlar azaltılacak.');
            }
        }

        localStorage.setItem('sineai_reactions', JSON.stringify(userReactions));
        updateAuthUI();
    }

    function isFavorited(item) {
        return userFavorites.some(f => f.id === item.id && f.type === item.type);
    }

    function addToFavorites(item) {
        const index = userFavorites.findIndex(f => f.id === item.id && f.type === item.type);
        if (index === -1) {
            userFavorites.push(item);
            syncFavChange(item, 'add');
        } else {
            userFavorites[index] = item;
            syncFavChange(item, 'add');
        }
    }

    function removeFromFavorites(item) {
        const index = userFavorites.findIndex(f => f.id === item.id && f.type === item.type);
        if (index !== -1) {
            userFavorites.splice(index, 1);
            syncFavChange(item, 'remove');
        }
    }

    function syncFavChange(item, action) {
        if (currentUser) {
            localStorage.setItem('sineai_user', JSON.stringify({ username: currentUser, favorites: userFavorites }));
            fetch('/api/user/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: currentUser, item, action })
            }).catch(() => {});
        } else {
            localStorage.setItem('sineai_guest_favs', JSON.stringify(userFavorites));
        }
    }

    function toggleFavorite(item, cardFavBtn = null) {
        setReaction(item, 'fav');
        if (cardFavBtn) {
            if (isFavorited(item)) cardFavBtn.classList.add('active');
            else cardFavBtn.classList.remove('active');
        }
    }

    // ── Full Page Profile UI Handler ───────────────────
    function updateProfilePageUI() {
        if (!profileSection || profileSection.classList.contains('hidden')) return;
        profileUsername.textContent = currentUser ? currentUser : 'Misafir Kullanıcı';
        profileFavCount.textContent = userFavorites.length;

        const superCount = userFavorites.filter(f => f.super).length;
        if (profileSuperCount) profileSuperCount.textContent = superCount;

        const count = userFavorites.length;
        const progressPct = Math.min(100, (count / 10) * 100);
        favProgressBar.style.width = `${progressPct}%`;

        if (count >= 10) {
            favProgressText.textContent = `🎉 Tebrikler! ${count} favori eklediniz. Kişiselleştirilmiş AI öneriniz hazır!`;
            profileRecommendBtn.disabled = false;
        } else {
            favProgressText.textContent = `${count} / 10 Favori Eklediniz (Kişisel AI önerisi için ${10 - count} tane daha gerekli)`;
            profileRecommendBtn.disabled = true;
        }

        if (userFavorites.length === 0) {
            profileFavGrid.innerHTML = `<p class="no-favs-msg">Henüz favori eklemediniz. Film ve dizi kartlarındaki kalp butonuna veya detay ekranındaki 'Favorilerime Ekle' butonuna tıklayarak koleksiyonunuzu oluşturun!</p>`;
        } else {
            renderCardsInContainer(userFavorites, profileFavGrid);
        }
    }

    function showProfilePage() {
        discoverSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        profileSection.classList.remove('hidden');
        updateProfilePageUI();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function showDiscoverPage() {
        profileSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        discoverSection.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    userProfileBtn.addEventListener('click', showProfilePage);
    if (profileBackBtn) profileBackBtn.addEventListener('click', showDiscoverPage);
    if (goToDiscoverBtn) goToDiscoverBtn.addEventListener('click', showDiscoverPage);

    // ── Toast Notification ─────────────────────────────
    function showToast(message) {
        if (toastTimer) clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.remove('hidden');
        toastTimer = setTimeout(() => { toast.classList.add('hidden'); }, 3000);
    }

    // ── Discover Section Loading (Popular & Genres) ─────
    async function loadPopular(type, containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        try {
            const res = await fetch(`/api/popular?type=${type}&page=1`);
            const data = await res.json();
            if (!data.ok || !data.results || data.results.length === 0) {
                container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Yüklenemedi.</div>';
                return;
            }
            container.innerHTML = '';
            data.results.forEach(item => {
                const year = item.release_date ? new Date(item.release_date).getFullYear() : '';
                const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                const typeStr = type === 'tv' ? 'Dizi' : 'Film';
                const posterUrl = item.poster ? `https://image.tmdb.org/t/p/w342${item.poster}` : null;
                const posterHTML = posterUrl
                    ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy">`
                    : `<div class="no-poster">Afiş Yok</div>`;

                let badgesHTML = '';
                if (item.providers && item.providers.length > 0) {
                    const ps = item.providers.slice(0, 2);
                    badgesHTML = `<div class="provider-badges">${ps.map(p => `<div class="badge"><img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${p.provider_name}">${p.provider_name}</div>`).join('')}</div>`;
                }

                const favActive = isFavorited(item) ? 'active' : '';

                const card = document.createElement('div');
                card.className = 'movie-card';
                card.tabIndex = 0;
                card.innerHTML = `
                    <div class="poster-container">
                        ${posterHTML}
                        <button class="fav-btn ${favActive}" title="Favorilere Ekle/Çıkar" tabindex="0">❤️</button>
                        <div class="card-badges-row">
                            <div class="card-type-badge">${typeStr}</div>
                            <div class="card-score-badge">⭐ ${rating}</div>
                        </div>
                    </div>
                    <div class="card-content">
                        <h3 class="card-title">${item.title}</h3>
                        <div class="card-meta"><span>${year}</span></div>
                        ${badgesHTML}
                    </div>
                `;

                const favBtn = card.querySelector('.fav-btn');
                favBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleFavorite(item, favBtn);
                });

                card.addEventListener('click', () => showModal(item, year, typeStr, rating, badgesHTML));
                card.addEventListener('keydown', (e) => { if (e.key === 'Enter') showModal(item, year, typeStr, rating, badgesHTML); });
                container.appendChild(card);
            });
        } catch (err) {
            container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Yüklenemedi.</div>';
            console.error('Popular load error:', err);
        }
    }

    function buildGenreGrid(containerId, genres, mediaType) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        genres.forEach(g => {
            const chip = document.createElement('div');
            chip.className = 'genre-chip';
            chip.tabIndex = 0;
            chip.innerHTML = `<div class="genre-chip-icon">${g.icon}</div><div class="genre-chip-name">${g.name}</div>`;
            const run = () => submitGenre(mediaType, g.id, g.name, 1);
            chip.addEventListener('click', run);
            chip.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
            container.appendChild(chip);
        });
    }

    // Map client sort key to TMDB sort_by
    function getTmdbSortParam(sortKey) {
        switch (sortKey) {
            case 'vote_desc': return 'vote_average.desc';
            case 'vote_asc': return 'vote_average.asc';
            case 'year_desc': return 'primary_release_date.desc';
            case 'year_asc': return 'primary_release_date.asc';
            case 'title_asc': return 'title.asc';
            default: return 'popularity.desc';
        }
    }

    async function submitGenre(mediaType, genreId, genreName, targetPage = 1) {
        errorBox.classList.add('hidden');
        showResultsSection();
        resultsHeading.textContent = `${genreName} ${mediaType === 'tv' ? 'Dizileri' : 'Filmleri'}`;
        loadingText.textContent = `${genreName} yapımları yükleniyor (Sayfa ${targetPage})...`;
        loadingEl.classList.remove('hidden');

        pageState = {
            mode: 'genre',
            page: targetPage,
            totalPages: 1,
            genreId,
            mediaType,
            label: genreName,
            sortBy: sortSelect ? sortSelect.value : 'popularity_desc',
            shownCount: 0,
            hasMore: false,
            isLoading: true
        };

        const tmdbSort = getTmdbSortParam(pageState.sortBy);

        try {
            const res = await fetch(`/api/genre?type=${mediaType}&genre_id=${genreId}&page=${targetPage}&sort_by=${tmdbSort}`);
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);

            currentRawResults = data.results || [];
            pageState.totalPages = data.totalPages || 20;
            pageState.hasMore = data.hasNextPage || false;
            pageState.isLoading = false;

            applyClientSortingAndRender();
            renderPaginationUI();
        } catch (err) {
            showError(`Bir hata oluştu: ${err.message}`);
        } finally {
            loadingEl.classList.add('hidden');
            pageState.isLoading = false;
        }
    }

    // ── Sorting Logic ──────────────────────────────────
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            pageState.sortBy = sortSelect.value;
            if (pageState.mode === 'genre') {
                submitGenre(pageState.mediaType, pageState.genreId, pageState.label, pageState.page);
            } else {
                applyClientSortingAndRender();
            }
        });
    }

    function applyClientSortingAndRender() {
        if (!currentRawResults) return;
        let items = [...currentRawResults];

        const s = pageState.sortBy;
        if (s === 'vote_desc') {
            items.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
        } else if (s === 'vote_asc') {
            items.sort((a, b) => (a.vote_average || 0) - (b.vote_average || 0));
        } else if (s === 'year_desc') {
            items.sort((a, b) => (new Date(b.release_date || 0)) - (new Date(a.release_date || 0)));
        } else if (s === 'year_asc') {
            items.sort((a, b) => (new Date(a.release_date || 0)) - (new Date(b.release_date || 0)));
        } else if (s === 'title_asc') {
            items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        }

        renderCards(items);
    }

    // ── Pagination UI Handler ──────────────────────────
    function renderPaginationUI() {
        if (pageState.mode !== 'genre' || pageState.totalPages <= 1) {
            paginationBar.classList.add('hidden');
            pageInfoBadge.classList.add('hidden');
            return;
        }

        paginationBar.classList.remove('hidden');
        pageInfoBadge.classList.remove('hidden');
        pageInfoBadge.textContent = `Sayfa ${pageState.page} / ${pageState.totalPages}`;

        // Prev/Next buttons state
        prevPageBtn.disabled = pageState.page <= 1;
        nextPageBtn.disabled = pageState.page >= pageState.totalPages;

        // Render page number buttons
        pageNumbersContainer.innerHTML = '';
        const currentP = pageState.page;
        const totalP = pageState.totalPages;

        let startP = Math.max(1, currentP - 2);
        let endP = Math.min(totalP, startP + 4);
        if (endP - startP < 4) startP = Math.max(1, endP - 4);

        for (let i = startP; i <= endP; i++) {
            const numBtn = document.createElement('button');
            numBtn.className = `page-num-btn ${i === currentP ? 'active' : ''}`;
            numBtn.textContent = i;
            numBtn.tabIndex = 0;
            numBtn.addEventListener('click', () => {
                submitGenre(pageState.mediaType, pageState.genreId, pageState.label, i);
                window.scrollTo({ top: resultsSection.offsetTop - 40, behavior: 'smooth' });
            });
            pageNumbersContainer.appendChild(numBtn);
        }
    }

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (pageState.page > 1) {
                submitGenre(pageState.mediaType, pageState.genreId, pageState.label, pageState.page - 1);
                window.scrollTo({ top: resultsSection.offsetTop - 40, behavior: 'smooth' });
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if (pageState.page < pageState.totalPages) {
                submitGenre(pageState.mediaType, pageState.genreId, pageState.label, pageState.page + 1);
                window.scrollTo({ top: resultsSection.offsetTop - 40, behavior: 'smooth' });
            }
        });
    }

    // ── Infinite Scroll Handler ─────────────────────────
    function setupInfiniteScroll() {
        scrollSentinel.classList.remove('hidden');
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && pageState.hasMore && !pageState.isLoading && pageState.mode === 'ai') {
                loadNextBatch();
            }
        }, { rootMargin: '300px' });
        observer.observe(scrollSentinel);
    }

    function loadNextBatch() {
        if (pageState.mode === 'ai' || pageState.mode === 'profile') {
            const nextBatch = currentRawResults.slice(pageState.shownCount, pageState.shownCount + AI_BATCH_SIZE);
            if (nextBatch.length > 0) {
                renderCards(nextBatch, true);
                pageState.shownCount += nextBatch.length;
                pageState.hasMore = currentRawResults.length > pageState.shownCount;
            } else {
                pageState.hasMore = false;
            }
            updateSentinel();
        }
    }

    function updateSentinel() {
        if (!pageState.hasMore || pageState.mode === 'genre') scrollSentinel.classList.add('hidden');
        else scrollSentinel.classList.remove('hidden');
    }

    function showResultsSection() {
        discoverSection.classList.add('hidden');
        profileSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        resultsGrid.innerHTML = '';
        scrollSentinel.classList.add('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    backBtn.addEventListener('click', showDiscoverPage);

    // ── Card Rendering Engine ───────────────────────────
    function renderCardsInContainer(items, containerEl, append = false) {
        if (!append) containerEl.innerHTML = '';
        if (!items || items.length === 0) {
            if (!append) containerEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:48px 20px;">Kriterlere uygun sonuç bulunamadı.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const year    = item.release_date ? new Date(item.release_date).getFullYear() : 'Bilinmiyor';
            const typeStr = item.type === 'tv' ? 'Dizi' : 'Film';
            const rating  = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
            const posterUrl  = item.poster ? `https://image.tmdb.org/t/p/w342${item.poster}` : null;
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

            const favActive = isFavorited(item) ? 'active' : '';

            const card = document.createElement('div');
            card.className = 'movie-card';
            card.tabIndex  = 0;
            card.innerHTML = `
                <div class="poster-container">
                    ${posterHTML}
                    <button class="fav-btn ${favActive}" title="Favorilere Ekle/Çıkar" tabindex="0">❤️</button>
                    <div class="card-badges-row">
                        <div class="card-type-badge">${typeStr}</div>
                        <div class="card-score-badge">⭐ ${rating}</div>
                    </div>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${item.title}</h3>
                    <div class="card-meta"><span>${year}</span></div>
                    ${item.reason ? `<div class="card-reason">${item.reason}</div>` : ''}
                    <p class="card-desc">${item.overview || 'Açıklama bulunmuyor.'}</p>
                    ${badgesHTML}
                </div>
            `;

            const cardFavBtn = card.querySelector('.fav-btn');
            cardFavBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFavorite(item, cardFavBtn);
            });

            const openModal = () => showModal(item, year, typeStr, rating, badgesHTML);
            card.addEventListener('click', openModal);
            card.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); openModal(); } });
            fragment.appendChild(card);
        });

        containerEl.appendChild(fragment);
    }

    function renderCards(items, append = false) {
        if (!append) resultsGrid.innerHTML = '';
        renderCardsInContainer(items, resultsGrid);
        updateSentinel();
    }

    // ── Quick Filter Logic ──────────────────────────────
    if (quickFilterBar) {
        quickFilterBar.querySelectorAll('.filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                quickFilterBar.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeFilter = btn.dataset.filter;
                applyQuickFilter();
            });
        });
    }

    function applyQuickFilter() {
        if (!currentRawResults) return;
        let filtered = [...currentRawResults];

        if (activeFilter === 'movie') {
            filtered = filtered.filter(i => i.type === 'movie');
        } else if (activeFilter === 'tv') {
            filtered = filtered.filter(i => i.type === 'tv');
        } else if (activeFilter === 'netflix') {
            filtered = filtered.filter(i => i.providers && i.providers.some(p => p.provider_name.toLowerCase().includes('netflix')));
        } else if (activeFilter === 'prime') {
            filtered = filtered.filter(i => i.providers && i.providers.some(p => p.provider_name.toLowerCase().includes('amazon') || p.provider_name.toLowerCase().includes('prime')));
        } else if (activeFilter === 'high_rating') {
            filtered = filtered.filter(i => (i.vote_average || 0) >= 8.0);
        }

        renderCards(filtered, false);
    }

    // ── Search & Recommendations Submissions ────────────
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = queryInput.value.trim();
        if (q) await submitSearch(q);
    });

    async function submitSearch(query) {
        errorBox.classList.add('hidden');
        showResultsSection();
        resultsHeading.textContent = 'Yapay Zeka Önerileri';
        loadingText.textContent = 'SineAI isteğinizi analiz ediyor ve en uygun yapımları çıkarıyor...';
        loadingEl.classList.remove('hidden');
        submitBtn.disabled = true;

        pageState = { mode: 'ai', page: 1, totalPages: 1, genreId: null, mediaType: null, label: query, sortBy: 'popularity_desc', shownCount: 0, hasMore: false, isLoading: false };
        renderPaginationUI();

        try {
            const response = await fetch('/api/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || 'Sunucu ile iletişim kurulamadı.');

            currentRawResults = data.results || [];
            pageState.shownCount = Math.min(currentRawResults.length, AI_BATCH_SIZE);
            pageState.hasMore = currentRawResults.length > pageState.shownCount;

            renderCards(currentRawResults.slice(0, pageState.shownCount));
            setupInfiniteScroll();
        } catch (error) {
            console.error('API Error:', error);
            showError(`Bir hata oluştu: ${error.message}. Lütfen tekrar deneyin.`);
        } finally {
            loadingEl.classList.add('hidden');
            submitBtn.disabled = false;
        }
    }

    // ── Profile-Based Recommendation Engine ─────────────
    if (profileRecommendBtn) {
        profileRecommendBtn.addEventListener('click', async () => {
            if (userFavorites.length < 10) {
                showToast('⚠️ Kişisel öneri için en az 10 favori eklemelisiniz!');
                return;
            }

            profileSection.classList.add('hidden');
            showResultsSection();
            resultsHeading.textContent = '✨ Profilinize Özel Yapay Zeka Önerileri';
            loadingText.textContent = 'Favorilerinizdeki sinema zevkiniz analiz ediliyor...';
            loadingEl.classList.remove('hidden');

            try {
                const res = await fetch('/api/recommend/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: currentUser, favorites: userFavorites })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);

                currentRawResults = data.results || [];
                pageState.shownCount = Math.min(currentRawResults.length, AI_BATCH_SIZE);
                pageState.hasMore = currentRawResults.length > pageState.shownCount;

                renderCards(currentRawResults.slice(0, pageState.shownCount));
                setupInfiniteScroll();
                showToast('✨ Zevkinize özel öneriler hazırlandı!');
            } catch (err) {
                showError(`Profil öneri hatası: ${err.message}`);
            } finally {
                loadingEl.classList.add('hidden');
            }
        });
    }

    // ── Random Pick (Şanslı Hissediyorum) ────────────────
    if (randomPickBtn) {
        randomPickBtn.addEventListener('click', async () => {
            try {
                showToast('🎲 Sürpriz öneri hazırlanıyor...');
                const res = await fetch('/api/popular?type=movie&page=1');
                const data = await res.json();
                if (data.ok && data.results?.length > 0) {
                    const randomIndex = Math.floor(Math.random() * data.results.length);
                    const item = data.results[randomIndex];
                    const year = item.release_date ? new Date(item.release_date).getFullYear() : 'Bilinmiyor';
                    const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                    showModal(item, year, 'Film', rating, '');
                }
            } catch (e) {
                showToast('Rastgele öneri alınamadı.');
            }
        });
    }

    // ── Netflix-Style Detail Modal & Explicit Favorites Bar ─────────
    function showModal(item, year, typeStr, rating, badgesHTML) {
        const posterUrl  = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : null;
        const posterHTML = posterUrl
            ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy">`
            : `<div class="no-poster">Afiş Bulunamadı</div>`;

        const genresHTML = item.genres?.length > 0
            ? `<div class="genre-pills">${item.genres.map(g => `<span class="genre-pill">${g}</span>`).join('')}</div>`
            : '';

        let runtimeStr = '';
        if (item.number_of_seasons) runtimeStr = `${item.number_of_seasons} Sezon`;
        else if (item.runtime) runtimeStr = `${item.runtime} dk`;

        const originalTitleHTML = (item.original_title && item.original_title !== item.title)
            ? `<div class="original-title">${item.original_title}</div>` : '';
        const directorHTML = item.director
            ? `<div class="modal-director"><strong>${item.type === 'movie' ? 'Yönetmen' : 'Yaratıcı'}:</strong> ${item.director}</div>` : '';

        const currentRec = getReaction(item);
        const isFav = isFavorited(item);

        const trailerHTML = item.trailer_url
            ? `<button type="button" class="netflix-btn btn-play-trailer" tabindex="0">▶️ Fragmanı Oynat</button>` : '';

        modalBody.innerHTML = `
            <div class="modal-layout">
                <div class="modal-poster">${posterHTML}</div>
                <div class="modal-info">
                    <h2>${item.title}</h2>
                    ${originalTitleHTML}
                    <div class="meta">
                        <span class="meta-badge-year">${year}</span>
                        <span>•</span><span class="meta-badge-type">${typeStr}</span>
                        <span>•</span><span class="meta-badge-score">⭐ ${rating}</span>
                        ${runtimeStr ? `<span>•</span><span>${runtimeStr}</span>` : ''}
                    </div>
                    ${genresHTML}
                    ${directorHTML}
                    ${item.reason ? `<div class="card-reason modal-reason">${item.reason}</div>` : ''}
                    <div class="overview">${item.overview || 'Bu yapım için detaylı bir açıklama bulunmuyor.'}</div>
                    
                    <div class="providers">
                        <h3>İzlenebilecek Platformlar (TR)</h3>
                        <div style="margin-top:8px;">${badgesHTML}</div>
                    </div>

                    <!-- Netflix-Style Control Actions Bar (Including Explicit Favorites Button) -->
                    <div class="netflix-actions-bar">
                        ${trailerHTML}
                        <button type="button" class="netflix-btn btn-reaction btn-fav ${isFav ? 'active' : ''}" data-type="fav" tabindex="0">
                            <span class="btn-icon">${isFav ? '❤️' : '🤍'}</span>
                            <span class="btn-label">${isFav ? 'Favorilerimde' : 'Favorilerime Ekle'}</span>
                        </button>
                        <button type="button" class="netflix-btn btn-reaction btn-super ${currentRec === 'super' ? 'active' : ''}" data-type="super" tabindex="0">
                            <span class="btn-icon">💖</span>
                            <span class="btn-label">Çok Beğendim</span>
                        </button>
                        <button type="button" class="netflix-btn btn-reaction btn-like ${currentRec === 'like' ? 'active' : ''}" data-type="like" tabindex="0">
                            <span class="btn-icon">👍</span>
                            <span class="btn-label">Beğendim</span>
                        </button>
                        <button type="button" class="netflix-btn btn-reaction btn-dislike ${currentRec === 'dislike' ? 'active' : ''}" data-type="dislike" tabindex="0">
                            <span class="btn-icon">👎</span>
                            <span class="btn-label">Beğenmedim</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Handle reactions in modal
        modalBody.querySelectorAll('.btn-reaction').forEach(btn => {
            btn.addEventListener('click', () => {
                const reactionType = btn.dataset.type;
                setReaction(item, reactionType);
                showModal(item, year, typeStr, rating, badgesHTML);
            });
        });

        const playTrailerBtn = modalBody.querySelector('.btn-play-trailer');
        if (playTrailerBtn && item.trailer_url) {
            playTrailerBtn.addEventListener('click', () => {
                openYouTubeModal(item.title, item.trailer_url);
            });
        }

        detailModal.classList.remove('hidden');
    }

    function openYouTubeModal(title, youtubeUrl) {
        let videoId = '';
        const match = youtubeUrl.match(/(?:v=|\/embed\/|\/1.1\/|youtu\.be\/|\/v\/)([^#&?]*)/);
        if (match && match[1].length === 11) videoId = match[1];

        if (videoId) {
            trailerTitle.textContent = `${title} - Fragman`;
            trailerIframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
            trailerModal.classList.remove('hidden');
        } else {
            window.open(youtubeUrl, '_blank');
        }
    }

    closeTrailerModalBtn.addEventListener('click', () => {
        trailerModal.classList.add('hidden');
        trailerIframe.src = '';
    });

    closeModalBtn.addEventListener('click', () => detailModal.classList.add('hidden'));

    // ── Auth Modal Logic ────────────────────────────────
    userAuthBtn.addEventListener('click', () => {
        loginError.classList.add('hidden');
        regError.classList.add('hidden');
        authModal.classList.remove('hidden');
    });

    closeAuthModalBtn.addEventListener('click', () => authModal.classList.add('hidden'));

    tabLogin.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    });

    tabRegister.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);

            saveUserSession(data);
            authModal.classList.add('hidden');
            showToast(`Giriş başarılı! Hoş geldin ${data.displayName}`);
        } catch (err) {
            loginError.textContent = err.message;
            loginError.classList.remove('hidden');
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        regError.classList.add('hidden');
        const username = document.getElementById('regUsername').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error);

            saveUserSession(data);
            authModal.classList.add('hidden');
            showToast(`Kayıt oluşturuldu! Hoş geldin ${data.displayName}`);
        } catch (err) {
            regError.textContent = err.message;
            regError.classList.remove('hidden');
        }
    });

    // ── Logout ──────────────────────────────────────────
    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        userFavorites = [];
        userReactions = {};
        localStorage.removeItem('sineai_user');
        localStorage.removeItem('sineai_reactions');
        updateAuthUI();
        showDiscoverPage();
        showToast('Oturum kapatıldı.');
    });

    // Mood pills handler
    document.querySelectorAll('.pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const q = pill.dataset.query;
            if (q) {
                queryInput.value = q;
                submitSearch(q);
            }
        });
    });

    // Popular See All handler
    document.querySelectorAll('.see-all').forEach(btn => {
        btn.addEventListener('click', async () => {
            const type = btn.dataset.type;
            const label = type === 'tv' ? 'Popüler Diziler' : 'Popüler Filmler';
            showResultsSection();
            resultsHeading.textContent = label;
            loadingEl.classList.remove('hidden');
            try {
                const res = await fetch(`/api/popular?type=${type}&page=1`);
                const data = await res.json();
                if (data.ok) {
                    currentRawResults = data.results || [];
                    renderCards(currentRawResults);
                }
            } catch (e) {
                showError('Popüler yapımlar yüklenemedi.');
            } finally {
                loadingEl.classList.add('hidden');
            }
        });
    });

    function showError(msg) {
        errorBox.textContent = msg;
        errorBox.classList.remove('hidden');
    }

    // Init app state
    initUser();
});
