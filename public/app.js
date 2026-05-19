document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('recommendForm');
    const queryInput = document.getElementById('query');
    const submitBtn = document.getElementById('submitBtn');
    const errorBox = document.getElementById('errorBox');
    const loadingEl = document.getElementById('loading');
    const resultsGrid = document.getElementById('resultsGrid');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const query = queryInput.value.trim();
        if (!query) return;

        // Reset UI
        errorBox.classList.add('hidden');
        resultsGrid.innerHTML = '';
        loadingEl.classList.remove('hidden');
        submitBtn.disabled = true;

        try {
            const response = await fetch('/api/recommend', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query })
            });

            const data = await response.json();

            if (!response.ok || !data.ok) {
                throw new Error(data.error || 'Sunucu ile iletişim kurulamadı.');
            }

            renderResults(data.results, data.reference);
            
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

    function renderResults(results, reference) {
        if (!results || results.length === 0) {
            resultsGrid.innerHTML = '<div class="no-results" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Aradığınız kriterlere uygun sonuç bulunamadı. Lütfen daha farklı ifadeler kullanmayı deneyin.</div>';
            return;
        }

        const fragment = document.createDocumentFragment();

        if (reference) {
            const titleEl = document.createElement('h2');
            titleEl.style.gridColumn = '1 / -1';
            titleEl.style.color = 'var(--primary-color)';
            titleEl.style.marginBottom = '10px';
            titleEl.style.marginTop = '10px';
            titleEl.textContent = `${reference.title} benzeri öneriler`;
            fragment.appendChild(titleEl);
        }

        results.forEach(item => {
            const card = document.createElement('div');
            card.className = 'movie-card';

            const year = item.release_date ? new Date(item.release_date).getFullYear() : 'Bilinmiyor';
            const typeStr = item.type === 'tv' ? 'Dizi' : 'Film';
            const posterUrl = item.poster ? `https://image.tmdb.org/t/p/w500${item.poster}` : null;
            
            const rating = item.vote_average ? item.vote_average.toFixed(1) : 'N/A';

            let posterHTML = '';
            if (posterUrl) {
                posterHTML = `<img src="${posterUrl}" alt="${item.title} afişi" loading="lazy">`;
            } else {
                posterHTML = `<div class="no-poster">Afiş Bulunamadı</div>`;
            }

            card.innerHTML = `
                <div class="poster-container">
                    ${posterHTML}
                </div>
                <div class="card-content">
                    <h3 class="card-title">${item.title}</h3>
                    <div class="card-meta">
                        <span>${year} • ${typeStr}</span>
                        <span>⭐ ${rating}</span>
                    </div>
                    <p class="card-desc">${item.overview || 'Açıklama bulunmuyor.'}</p>
                </div>
            `;
            
            fragment.appendChild(card);
        });

        resultsGrid.appendChild(fragment);
    }
});
