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
    const aiAnalysisSummary = document.getElementById('aiAnalysisSummary');
    const aiAnalysisText  = document.getElementById('aiAnalysisText');
    const tvFeaturedBackdrop = document.getElementById('tvFeaturedBackdrop');
    const tvFeaturedTitle    = document.getElementById('tvFeaturedTitle');
    const tvFeaturedMeta     = document.getElementById('tvFeaturedMeta');
    const tvFeaturedOverview = document.getElementById('tvFeaturedOverview');
    const tvFeaturedOpen     = document.getElementById('tvFeaturedOpen');

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
    const IS_TV = navigator.userAgent.includes('SineAITV/')
        || new URLSearchParams(window.location.search).get('tv') === '1';

    function scrollPageTo(top) {
        window.scrollTo({ top, behavior: IS_TV ? 'auto' : 'smooth' });
    }

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

    function setViewState(view) {
        document.body.dataset.view = view;
        window.dispatchEvent(new CustomEvent('sineai:viewchange', { detail: { view } }));
        window.requestAnimationFrame(() => window.SineAITV?.refresh());
    }

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

    const heroSearchArea = document.getElementById('heroSearchArea');
    const brandLogoBtn   = document.getElementById('brandLogoBtn');

    function showProfilePage() {
        if (heroSearchArea) heroSearchArea.classList.add('hidden');
        discoverSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        profileSection.classList.remove('hidden');
        setViewState('profile');
        updateProfilePageUI();
        scrollPageTo(0);
    }

    function showDiscoverPage() {
        if (heroSearchArea) heroSearchArea.classList.remove('hidden');
        profileSection.classList.add('hidden');
        resultsSection.classList.add('hidden');
        discoverSection.classList.remove('hidden');
        setViewState('discover');
        scrollPageTo(0);
    }

    function showResultsSection() {
        if (heroSearchArea) heroSearchArea.classList.remove('hidden');
        discoverSection.classList.add('hidden');
        profileSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        setViewState('results');
        scrollPageTo(0);
    }

    userProfileBtn.addEventListener('click', showProfilePage);
    if (profileBackBtn) profileBackBtn.addEventListener('click', showDiscoverPage);
    if (goToDiscoverBtn) goToDiscoverBtn.addEventListener('click', showDiscoverPage);
    if (brandLogoBtn) brandLogoBtn.addEventListener('click', showDiscoverPage);

    // ── Toast Notification ─────────────────────────────
    function showToast(message) {
        if (toastTimer) clearTimeout(toastTimer);
        toast.textContent = message;
        toast.classList.remove('hidden');
        toastTimer = setTimeout(() => { toast.classList.add('hidden'); }, 3000);
    }

    // Native Android speech recognition is the primary TV path. Browsers use
    // Web Speech as a fallback so the same button remains functional on web.
    let voiceRecognition = null;
    let voiceListening = false;
    let voiceResultReceived = false;
    const VOICE_IDLE_LABEL = '🎤 Sesli Arama';

    function setVoiceListening(listening, label) {
        voiceListening = listening;
        voiceBtn.classList.toggle('listening', listening);
        voiceBtn.setAttribute('aria-pressed', String(listening));
        voiceBtn.textContent = label || (listening ? '🎙️ Dinliyorum…' : VOICE_IDLE_LABEL);
    }

    function finishVoiceSearch(transcript) {
        const normalized = String(transcript || '').trim();
        setVoiceListening(false);
        if (!normalized) {
            showError('Ses algılanamadı. Lütfen tekrar deneyin.');
            return;
        }

        voiceResultReceived = true;
        queryInput.value = normalized;
        queryInput.dispatchEvent(new Event('input', { bubbles: true }));
        errorBox.classList.add('hidden');
        showToast(`“${normalized}” aranıyor`);

        // TV'de klavye kullanmadan tek adımda aramayı tamamla.
        window.setTimeout(() => {
            if (typeof form.requestSubmit === 'function') form.requestSubmit();
            else submitBtn.click();
        }, 40);
    }

    function failVoiceSearch(message) {
        setVoiceListening(false);
        showError(message || 'Sesli arama başlatılamadı. Lütfen tekrar deneyin.');
        window.SineAITV?.refresh('#voiceBtn');
    }

    window.addEventListener('sineai:voice-start', () => {
        voiceResultReceived = false;
        errorBox.classList.add('hidden');
        setVoiceListening(true);
    });
    window.addEventListener('sineai:voice-result', (event) => {
        finishVoiceSearch(event.detail?.transcript);
    });
    window.addEventListener('sineai:voice-cancelled', () => {
        setVoiceListening(false);
        window.SineAITV?.refresh('#voiceBtn');
    });
    window.addEventListener('sineai:voice-error', (event) => {
        failVoiceSearch(event.detail?.message);
    });
    window.addEventListener('sineai:microphone-permission', (event) => {
        if (event.detail?.granted === false) {
            failVoiceSearch('Mikrofon izni verilmedi. TV ayarlarından SineAI için mikrofon iznini açın.');
        }
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        voiceRecognition = new SpeechRecognition();
        voiceRecognition.lang = 'tr-TR';
        voiceRecognition.continuous = false;
        voiceRecognition.interimResults = false;
        voiceRecognition.maxAlternatives = 1;
        voiceRecognition.onstart = () => {
            voiceResultReceived = false;
            errorBox.classList.add('hidden');
            setVoiceListening(true);
        };
        voiceRecognition.onresult = (event) => {
            finishVoiceSearch(event.results?.[0]?.[0]?.transcript);
        };
        voiceRecognition.onerror = (event) => {
            const messages = {
                'not-allowed': 'Mikrofon izni verilmedi. Tarayıcı ayarlarından mikrofon iznini açın.',
                'audio-capture': 'Mikrofon kullanılamıyor. TV mikrofonunu veya kumandayı kontrol edin.',
                'no-speech': 'Ses algılanamadı. Lütfen tekrar deneyin.',
                network: 'Ses tanıma servisine bağlanılamadı.'
            };
            failVoiceSearch(messages[event.error] || 'Sesli arama tamamlanamadı.');
        };
        voiceRecognition.onend = () => {
            if (!voiceResultReceived) setVoiceListening(false);
        };
    }

    voiceBtn.addEventListener('click', () => {
        errorBox.classList.add('hidden');
        voiceResultReceived = false;

        try {
            if (window.SineAIAndroid && typeof window.SineAIAndroid.startVoiceSearch === 'function') {
                setVoiceListening(true, '🎙️ Hazırlanıyor…');
                window.SineAIAndroid.startVoiceSearch();
                return;
            }
        } catch (error) {
            console.warn('Native voice bridge unavailable:', error);
        }

        if (!voiceRecognition) {
            failVoiceSearch('Bu cihazda sesli arama hizmeti bulunamadı.');
            return;
        }

        try {
            if (voiceListening) voiceRecognition.stop();
            else voiceRecognition.start();
        } catch (error) {
            failVoiceSearch('Sesli arama şu anda başlatılamıyor. Birkaç saniye sonra tekrar deneyin.');
        }
    });
    window.SineAIVoiceReady = true;

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
            if (type === 'movie') renderTvFeatured(data.results[0]);
            data.results.forEach((item, index) => {
                const year = item.release_date ? new Date(item.release_date).getFullYear() : '';
                const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
                const typeStr = type === 'tv' ? 'Dizi' : 'Film';
                const posterUrl = item.poster ? `https://image.tmdb.org/t/p/w342${item.poster}` : null;
                const posterHTML = posterUrl
                    ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="${IS_TV && index < 7 ? 'eager' : 'lazy'}" decoding="async">`
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
                card.setAttribute('role', 'button');
                card.setAttribute('aria-label', `${item.title}, ${year || 'yıl bilinmiyor'}, ${typeStr}, ${rating} puan`);
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
                        ${IS_TV ? '' : badgesHTML}
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
            window.SineAITV?.refresh();
        } catch (err) {
            container.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:20px 0;">Yüklenemedi.</div>';
            console.error('Popular load error:', err);
        }
    }

    function renderTvFeatured(item) {
        if (!item || !tvFeaturedOpen) return;

        const year = item.release_date ? new Date(item.release_date).getFullYear() : 'Yıl bilinmiyor';
        const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
        const backdrop = item.backdrop || item.poster;
        if (tvFeaturedBackdrop && backdrop) {
            const size = item.backdrop ? 'w1280' : 'w780';
            tvFeaturedBackdrop.style.backgroundImage = `url("https://image.tmdb.org/t/p/${size}${backdrop}")`;
        }
        if (tvFeaturedTitle) tvFeaturedTitle.textContent = item.title;
        if (tvFeaturedMeta) tvFeaturedMeta.textContent = `${year}   •   ⭐ ${rating}   •   Film`;
        if (tvFeaturedOverview) tvFeaturedOverview.textContent = item.overview || 'Bu yapım için açıklama bulunmuyor.';
        tvFeaturedOpen.setAttribute('aria-label', `${item.title} detaylarını gör`);
        tvFeaturedOpen.onclick = () => {
            const providers = item.providers || [];
            const badgesHTML = providers.length
                ? `<div class="provider-badges">${providers.slice(0, 3).map(provider => `<div class="badge"><img src="https://image.tmdb.org/t/p/original${provider.logo_path}" alt="${provider.provider_name}">${provider.provider_name}</div>`).join('')}</div>`
                : '<div class="provider-badges"><div class="badge">Platform bilgisi yok</div></div>';
            showModal(item, year, 'Film', rating, badgesHTML);
        };
    }

    function buildGenreGrid(containerId, genres, mediaType) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';
        genres.forEach(g => {
            const chip = document.createElement('div');
            chip.className = 'genre-chip';
            chip.tabIndex = 0;
            chip.setAttribute('role', 'button');
            chip.setAttribute('aria-label', `${g.name} ${mediaType === 'tv' ? 'dizilerini' : 'filmlerini'} göster`);
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
            updateSentinel();
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

        currentRawResults = items;
        if (pageState.mode === 'ai') {
            renderAIPage(1);
        } else {
            renderCards(items);
        }
    }

    const AI_PAGE_SIZE = 12;

    function renderAIPage(targetPage = 1) {
        pageState.page = targetPage;
        pageState.totalPages = Math.max(1, Math.ceil(currentRawResults.length / AI_PAGE_SIZE));
        const start = (targetPage - 1) * AI_PAGE_SIZE;
        const pageItems = currentRawResults.slice(start, start + AI_PAGE_SIZE);
        renderCards(pageItems);
        renderPaginationUI();
        updateSentinel();
    }

    // ── Pagination UI Handler ──────────────────────────
    function renderPaginationUI() {
        const isPaginatable = ['genre', 'direct', 'advanced', 'ai'].includes(pageState.mode) && pageState.totalPages > 1;
        if (!isPaginatable) {
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
                handlePageSwitch(i);
            });
            pageNumbersContainer.appendChild(numBtn);
        }
    }

    function handlePageSwitch(targetPage) {
        if (pageState.mode === 'genre') {
            submitGenre(pageState.mediaType, pageState.genreId, pageState.label, targetPage);
        } else if (pageState.mode === 'direct') {
            submitDirectSearch(pageState.label, targetPage);
        } else if (pageState.mode === 'advanced') {
            submitAdvSearch(targetPage);
        } else if (pageState.mode === 'ai') {
            renderAIPage(targetPage);
        }
        scrollPageTo(resultsSection.offsetTop - 40);
    }

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (pageState.page > 1) handlePageSwitch(pageState.page - 1);
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if (pageState.page < pageState.totalPages) handlePageSwitch(pageState.page + 1);
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
        if (scrollSentinel) scrollSentinel.classList.add('hidden');
    }

    function showResultsSection() {
        if (heroSearchArea) heroSearchArea.classList.remove('hidden');
        discoverSection.classList.add('hidden');
        profileSection.classList.add('hidden');
        resultsSection.classList.remove('hidden');
        setViewState('results');
        resultsGrid.innerHTML = '';
        scrollSentinel.classList.add('hidden');
        if (aiAnalysisSummary) aiAnalysisSummary.classList.add('hidden');
        scrollPageTo(0);
    }

    function renderAIAnalysis(analysis) {
        if (!aiAnalysisSummary || !aiAnalysisText || !analysis?.summary) return;
        aiAnalysisText.textContent = analysis.summary;
        aiAnalysisSummary.classList.remove('hidden');
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
        items.forEach((item, index) => {
            const year    = item.release_date ? new Date(item.release_date).getFullYear() : 'Bilinmiyor';
            const typeStr = item.type === 'tv' ? 'Dizi' : 'Film';
            const rating  = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';
            const posterUrl  = item.poster ? `https://image.tmdb.org/t/p/w342${item.poster}` : null;
            const posterHTML = posterUrl
                ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="${IS_TV && index < 7 ? 'eager' : 'lazy'}" decoding="async">`
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
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `${item.title}, ${year}, ${typeStr}, ${rating} puan`);
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
                    ${!IS_TV && item.reason ? `<div class="card-reason">${item.reason}</div>` : ''}
                    ${IS_TV ? '' : `<p class="card-desc">${item.overview || 'Açıklama bulunmuyor.'}</p>`}
                    ${IS_TV ? '' : badgesHTML}
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
        window.SineAITV?.refresh();
    }

    function renderCards(items, append = false) {
        if (!append) resultsGrid.innerHTML = '';
        renderCardsInContainer(items, resultsGrid);
        updateSentinel();
        window.SineAITV?.refresh('#resultsGrid .movie-card');
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

    // ── Search Modes (AI vs Direct TMDB) ────────────────
    let currentSearchMode = 'ai';
    const searchModeTabs = document.querySelectorAll('.mode-tab');
    const searchIcon = document.getElementById('searchIcon');
    const submitBtnText = document.getElementById('submitBtnText');
    const submitBtnIcon = document.getElementById('submitBtnIcon');

    if (searchModeTabs.length > 0) {
        searchModeTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.id === 'openAdvSearchBtn') {
                    openAdvSearchModal();
                    return;
                }
                searchModeTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentSearchMode = tab.dataset.mode;

                if (currentSearchMode === 'direct') {
                    queryInput.placeholder = "Film veya dizi adı girin (Örn: Interstellar, Kurtlar Vadisi, Breaking Bad...)";
                    if (searchIcon) searchIcon.textContent = '🔍';
                    if (submitBtnText) submitBtnText.textContent = 'Aramayı Başlat';
                    if (submitBtnIcon) submitBtnIcon.textContent = '🔍';
                } else {
                    queryInput.placeholder = "Ne izlemek istiyorsun? (Örn: Okyanusta geçen romantik film öner veya From benzeri dizi...)";
                    if (searchIcon) searchIcon.textContent = '✨';
                    if (submitBtnText) submitBtnText.textContent = 'Öneri Getir';
                    if (submitBtnIcon) submitBtnIcon.textContent = '✨';
                }
            });
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const q = queryInput.value.trim();
        if (!q) return;

        if (currentSearchMode === 'direct') {
            await submitDirectSearch(q);
        } else {
            await submitSearch(q);
        }
    });

    async function submitDirectSearch(query, targetPage = 1) {
        errorBox.classList.add('hidden');
        showResultsSection();
        resultsHeading.textContent = `"${query}" Arama Sonuçları (TMDB API)`;
        loadingText.textContent = 'TMDB veritabanında arama yapılıyor...';
        loadingEl.classList.remove('hidden');
        submitBtn.disabled = true;

        pageState = { mode: 'direct', page: targetPage, totalPages: 1, genreId: null, mediaType: null, label: query, sortBy: 'popularity_desc', shownCount: 0, hasMore: false, isLoading: false };

        try {
            const response = await fetch(`/api/search/direct?query=${encodeURIComponent(query)}&page=${targetPage}`);
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || 'Sunucu ile iletişim kurulamadı.');

            currentRawResults = data.results || [];
            pageState.totalPages = data.totalPages || 1;
            pageState.shownCount = currentRawResults.length;
            pageState.hasMore = false;

            const resultsCountBadge = document.getElementById('resultsCountBadge');
            if (resultsCountBadge) resultsCountBadge.textContent = `🔍 ${currentRawResults.length} Sonuç Bulundu`;

            renderCards(currentRawResults);
            renderPaginationUI();
            updateSentinel();
        } catch (error) {
            console.error('API Error:', error);
            showError(`Bir hata oluştu: ${error.message}. Lütfen tekrar deneyin.`);
        } finally {
            loadingEl.classList.add('hidden');
            submitBtn.disabled = false;
        }
    }

    // ── Advanced Search Modal & Handler ─────────────────
    const advSearchModal         = document.getElementById('advSearchModal');
    const closeAdvSearchModalBtn = document.getElementById('closeAdvSearchModalBtn');
    const advSearchForm          = document.getElementById('advSearchForm');
    const advGenrePillsContainer = document.getElementById('advGenrePills');
    const advResetBtn            = document.getElementById('advResetBtn');

    let advSelectedType = 'movie';
    let advSelectedGenres = [];

    const TMDB_ALL_GENRES = [
        { id: 28, name: 'Aksiyon' }, { id: 12, name: 'Macera' }, { id: 16, name: 'Animasyon' },
        { id: 35, name: 'Komedi' }, { id: 80, name: 'Suç' }, { id: 99, name: 'Belgesel' },
        { id: 18, name: 'Dram' }, { id: 10751, name: 'Aile' }, { id: 14, name: 'Fantastik' },
        { id: 36, name: 'Tarih' }, { id: 27, name: 'Korku' }, { id: 10402, name: 'Müzik' },
        { id: 9648, name: 'Gizem' }, { id: 10749, name: 'Romantik' }, { id: 878, name: 'Bilim Kurgu' },
        { id: 53, name: 'Gerilim' }, { id: 10752, name: 'Savaş' }, { id: 37, name: 'Vahşi Batı' }
    ];

    function openAdvSearchModal() {
        if (!advSearchModal) return;
        renderAdvGenres();
        advSearchModal.classList.remove('hidden');
    }

    if (closeAdvSearchModalBtn) {
        closeAdvSearchModalBtn.addEventListener('click', () => {
            advSearchModal.classList.add('hidden');
        });
    }

    document.querySelectorAll('.adv-type-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.adv-type-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            advSelectedType = pill.dataset.type;
        });
    });

    function renderAdvGenres() {
        if (!advGenrePillsContainer) return;
        advGenrePillsContainer.innerHTML = '';
        TMDB_ALL_GENRES.forEach(g => {
            const chip = document.createElement('div');
            chip.className = `adv-genre-chip ${advSelectedGenres.includes(g.id) ? 'selected' : ''}`;
            chip.textContent = g.name;
            chip.addEventListener('click', () => {
                if (advSelectedGenres.includes(g.id)) {
                    advSelectedGenres = advSelectedGenres.filter(id => id !== g.id);
                    chip.classList.remove('selected');
                } else {
                    advSelectedGenres.push(g.id);
                    chip.classList.add('selected');
                }
            });
            advGenrePillsContainer.appendChild(chip);
        });
    }

    if (advResetBtn) {
        advResetBtn.addEventListener('click', () => {
            advSelectedGenres = [];
            document.getElementById('advYearMin').value = '';
            document.getElementById('advYearMax').value = '';
            document.getElementById('advMinScore').value = '7';
            document.getElementById('advSortBy').value = 'popularity.desc';
            renderAdvGenres();
        });
    }

    async function submitAdvSearch(targetPage = 1) {
        const yearMin = document.getElementById('advYearMin').value;
        const yearMax = document.getElementById('advYearMax').value;
        const minVote = document.getElementById('advMinScore').value;
        const sortBy = document.getElementById('advSortBy').value;
        const genresStr = advSelectedGenres.join(',');

        showResultsSection();
        resultsHeading.textContent = `⚙️ Detaylı Filtreleme Sonuçları (${advSelectedType === 'movie' ? 'Filmler' : 'Diziler'})`;
        loadingText.textContent = 'Detaylı kriterlerinize uygun yapımlar filtreleniyor...';
        loadingEl.classList.remove('hidden');

        pageState = { mode: 'advanced', page: targetPage, totalPages: 1, genreId: null, mediaType: advSelectedType, label: 'Detaylı Arama', sortBy: 'popularity_desc', shownCount: 0, hasMore: false, isLoading: false };

        try {
            const params = new URLSearchParams({
                type: advSelectedType,
                genres: genresStr,
                year_min: yearMin,
                year_max: yearMax,
                min_vote: minVote,
                sort_by: sortBy,
                page: targetPage
            });
            const res = await fetch(`/api/search/advanced?${params.toString()}`);
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error);

            currentRawResults = data.results || [];
            pageState.totalPages = data.totalPages || 1;
            pageState.shownCount = currentRawResults.length;
            pageState.hasMore = false;

            const resultsCountBadge = document.getElementById('resultsCountBadge');
            if (resultsCountBadge) resultsCountBadge.textContent = `⚙️ ${currentRawResults.length} Filtrelenmiş Yapım`;

            renderCards(currentRawResults);
            renderPaginationUI();
            updateSentinel();
        } catch (err) {
            showError(`Bir hata oluştu: ${err.message}`);
        } finally {
            loadingEl.classList.add('hidden');
        }
    }

    if (advSearchForm) {
        advSearchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            advSearchModal.classList.add('hidden');
            submitAdvSearch(1);
        });
    }

    async function submitSearch(query, options = {}) {
        errorBox.classList.add('hidden');
        showResultsSection();
        resultsHeading.textContent = options.heading || 'Yapay Zeka Önerileri';
        loadingText.textContent = options.loadingText || 'SineAI isteğinizi analiz ediyor ve en uygun yapımları çıkarıyor...';
        loadingEl.classList.remove('hidden');
        submitBtn.disabled = true;

        pageState = { mode: 'ai', page: 1, totalPages: 1, genreId: null, mediaType: null, label: options.label || query, sortBy: 'popularity_desc', shownCount: 0, hasMore: false, isLoading: false };
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
            renderAIAnalysis(data.analysis);
            const resultsCountBadge = document.getElementById('resultsCountBadge');
            if (resultsCountBadge) resultsCountBadge.textContent = `✨ ${currentRawResults.length} Yapım Hazır`;

            renderAIPage(1);
        } catch (error) {
            console.error('API Error:', error);
            showError(`Bir hata oluştu: ${error.message}. Lütfen tekrar deneyin.`);
        } finally {
            loadingEl.classList.add('hidden');
            submitBtn.disabled = false;
        }
    }

    function buildSimilarRecommendationQuery(item, year) {
        const referenceTitle = item.original_title || item.title;
        const requestedType = item.type === 'tv' ? 'diziler' : 'filmler';
        const context = [];

        if (item.genres?.length) context.push(`Türler: ${item.genres.slice(0, 5).join(', ')}`);
        if (item.director) context.push(`${item.type === 'tv' ? 'Yaratıcı' : 'Yönetmen'}: ${item.director}`);

        return `"${referenceTitle}" (${year}) gibi; önce referansın ayırt edici özelliklerini belirle, sonra tür, tema, atmosfer, anlatı yapısı, tempo, karakter ilişkileri ve bıraktığı his açısından gerçekten benzeyen ${requestedType} öner. Aynı seri veya yönetmen tek başına yeterli değildir. Referans yapımı sonuçlara ekleme.${context.length ? ` Referans bilgileri: ${context.join('; ')}.` : ''}`;
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
                renderAIAnalysis(data.analysis);
                renderAIPage(1);
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
        const backdropPath = item.backdrop || item.poster;
        const backdropUrl = backdropPath
            ? `https://image.tmdb.org/t/p/${item.backdrop ? 'w1280' : 'w780'}${backdropPath}`
            : '';
        const posterHTML = posterUrl
            ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy" decoding="async">`
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
            <div class="modal-cinematic-backdrop"${backdropUrl ? ` style="background-image:url('${backdropUrl}')"` : ''}></div>
            <div class="modal-cinematic-shade"></div>
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
                        <button type="button" class="netflix-btn btn-similar-recommend" tabindex="0" aria-label="Benzerlerini Öner">
                            <span class="btn-icon">✨</span>
                            <span class="btn-label">Benzerlerini Öner</span>
                        </button>
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

        const similarRecommendBtn = modalBody.querySelector('.btn-similar-recommend');
        if (similarRecommendBtn) {
            similarRecommendBtn.addEventListener('click', async () => {
                const requestedType = item.type === 'tv' ? 'Diziler' : 'Filmler';
                const aiQuery = buildSimilarRecommendationQuery(item, year);

                similarRecommendBtn.disabled = true;
                detailModal.classList.add('hidden');
                queryInput.value = `${item.title} benzeri ${requestedType.toLocaleLowerCase('tr-TR')} öner`;

                await submitSearch(aiQuery, {
                    heading: `✨ ${item.title} Benzeri ${requestedType}`,
                    label: `${item.title} benzerleri`,
                    loadingText: `SineAI ${item.title} yapımını analiz ediyor ve gerçekten benzeyen seçenekleri çıkarıyor...`
                });
            });
        }

        detailModal.classList.remove('hidden');
        window.setTimeout(() => {
            window.SineAITV?.refresh('.modal:not(.hidden) .btn-play-trailer, .modal:not(.hidden) .btn-similar-recommend, .modal:not(.hidden) .btn-fav, .modal:not(.hidden) .close-btn');
        }, 80);
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
        btn.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                btn.click();
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
