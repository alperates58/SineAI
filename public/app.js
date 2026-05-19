document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('recommendForm');
    const queryInput = document.getElementById('query');
    const submitBtn = document.getElementById('submitBtn');
    const errorBox = document.getElementById('errorBox');
    const loadingEl = document.getElementById('loading');
    const resultsGrid = document.getElementById('resultsGrid');
    const voiceBtn = document.getElementById('voiceBtn');
    
    const detailModal = document.getElementById('detailModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalBody = document.getElementById('modalBody');

    let isListening = false;
    let recognition = null;

    // Web Speech API Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'tr-TR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            isListening = true;
            voiceBtn.classList.add('listening');
            voiceBtn.textContent = 'Dinleniyor...';
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            queryInput.value = transcript;
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            showError(`Ses algılanamadı veya izin verilmedi (${event.error}). Lütfen tekrar deneyin.`);
        };

        recognition.onend = () => {
            isListening = false;
            voiceBtn.classList.remove('listening');
            voiceBtn.textContent = '🎤 Sesle Ara';
        };
    } else {
        voiceBtn.style.display = 'none';
        console.warn('Web Speech API is not supported in this browser.');
    }

    voiceBtn.addEventListener('click', () => {
        if (!recognition) {
            showError('Sesli arama bu tarayıcıda desteklenmiyor.');
            return;
        }
        if (isListening) {
            recognition.stop();
        } else {
            errorBox.classList.add('hidden');
            recognition.start();
        }
    });

    // Form Submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const query = queryInput.value.trim();
        if (!query) return;

        errorBox.classList.add('hidden');
        resultsGrid.innerHTML = '';
        loadingEl.classList.remove('hidden');
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/recommend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                throw new Error(data.error || 'Sunucu ile iletişim kurulamadı.');
            }

            if (data.warnings && data.warnings.length > 0) {
                console.warn("API Warnings:", data.warnings);
            }

            renderResults(data.results, data.reference, data.normalized);
            
        } catch (error) {
            console.error('API Error:', error);
            showError(`Bir hata oluştu: ${error.message}. Lütfen tekrar deneyin.`);
        } finally {
            loadingEl.classList.add('hidden');
            submitBtn.disabled = false;
        }
    });

    function showError(message) {
        errorBox.textContent = message;
        errorBox.classList.remove('hidden');
    }

    function renderResults(results, reference, normalized) {
        if (!results || results.length === 0) {
            resultsGrid.innerHTML = '<div class="no-results" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Aradığınız kriterlere uygun sonuç bulunamadı. Lütfen daha farklı ifadeler kullanmayı deneyin.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();

        // Dinamik Başlık
        const titleEl = document.createElement('h2');
        titleEl.style.gridColumn = '1 / -1';
        titleEl.style.color = 'var(--primary-color)';
        titleEl.style.marginBottom = '15px';
        
        if (normalized.intent === 'similar_to_title' && reference) {
            titleEl.textContent = `"${reference.title}" benzeri öneriler`;
        } else if (normalized.intent === 'person_search' && normalized.actors && normalized.actors.length > 0) {
            titleEl.textContent = `"${normalized.actors[0]}" yer aldığı yapımlar`;
        } else if (normalized.intent === 'person_search' && normalized.directors && normalized.directors.length > 0) {
            titleEl.textContent = `"${normalized.directors[0]}" yönettiği yapımlar`;
        } else if (normalized.watch_provider) {
            titleEl.textContent = `${normalized.watch_provider} platformundaki öneriler`;
        } else {
            titleEl.textContent = 'Keşfet: Sizin için önerilenler';
        }
        
        fragment.appendChild(titleEl);

        results.forEach(item => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.tabIndex = 0; // TV Focus için

            const year = item.release_date ? new Date(item.release_date).getFullYear() : 'Bilinmiyor';
            const typeStr = item.type === 'tv' ? 'Dizi' : 'Film';
            const posterUrl = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : null;
            const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';

            let posterHTML = posterUrl ? `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy">` : `<div class="no-poster">Afiş Bulunamadı</div>`;

            let badgesHTML = '';
            if (item.providers && item.providers.length > 0) {
                const uniqueProviders = item.providers.slice(0, 3);
                badgesHTML = `<div class="provider-badges">
                    ${uniqueProviders.map(p => `
                        <div class="badge">
                            <img src="https://image.tmdb.org/t/p/original${p.logo_path}" alt="${p.provider_name}">
                            ${p.provider_name}
                        </div>
                    `).join('')}
                    ${item.providers.length > 3 ? '<span class="badge">+</span>' : ''}
                </div>`;
            } else {
                badgesHTML = `<div class="provider-badges"><div class="badge" style="background:#444">Platform bilgisi yok</div></div>`;
            }

            card.innerHTML = `
                <div class="poster-container">${posterHTML}</div>
                <div class="card-content">
                    <h3 class="card-title">${item.title}</h3>
                    <div class="card-meta">
                        <span>${year} • ${typeStr}</span>
                        <span>⭐ ${rating}</span>
                    </div>
                    ${item.reason ? `<div class="card-reason">${item.reason}</div>` : ''}
                    <p class="card-desc">${item.overview || 'Açıklama bulunmuyor.'}</p>
                    ${badgesHTML}
                </div>
            `;
            
            // Kart Tıklama & TV Enter Tuşu Aksiyonu
            const openModal = () => showModal(item, year, typeStr, rating, badgesHTML);
            card.addEventListener('click', openModal);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    openModal();
                }
            });

            fragment.appendChild(card);
        });

        resultsGrid.appendChild(fragment);
    }

    // Modal Logic
    function showModal(item, year, typeStr, rating, badgesHTML) {
        let trailerHTML = '';
        if (item.trailer_url) {
            trailerHTML = `<a href="${item.trailer_url}" target="_blank" rel="noopener noreferrer" class="trailer-btn" style="padding:10px 20px; border-radius:8px;" tabindex="0">📺 Fragmanı Aç (YouTube)</a>`;
        }

        modalBody.innerHTML = `
            <h2>${item.title}</h2>
            <div class="meta">${year} • ${typeStr} • ⭐ ${rating}</div>
            ${item.reason ? `<div class="card-reason" style="margin-bottom:15px; font-size:1rem;">${item.reason}</div>` : ''}
            <div class="overview">${item.overview || 'Bu yapım için detaylı bir açıklama bulunmuyor.'}</div>
            <div class="providers" style="margin-bottom: 20px;">
                <h3>İzlenebilecek Platformlar (TR)</h3>
                <div style="margin-top:10px;">${badgesHTML}</div>
            </div>
            ${trailerHTML}
        `;

        detailModal.classList.remove('hidden');
        
        // TV Focus management inside modal
        setTimeout(() => {
            const trailerBtn = modalBody.querySelector('.trailer-btn');
            if (trailerBtn) {
                trailerBtn.focus();
            } else {
                closeModalBtn.focus();
            }
        }, 50);
    }

    function closeModal() {
        detailModal.classList.add('hidden');
        modalBody.innerHTML = '';
        queryInput.focus();
    }

    closeModalBtn.addEventListener('click', closeModal);
    closeModalBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !detailModal.classList.contains('hidden')) {
            closeModal();
        }
    });
});
