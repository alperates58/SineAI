(function () {
    'use strict';

    const CANDIDATE_SELECTOR = [
        '[data-tv-focusable="true"]',
        '.movie-card',
        '.genre-chip',
        '.see-all',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'a[href]',
        '[tabindex="0"]'
    ].join(',');

    const ROW_SELECTOR = [
        '[data-tv-row]',
        '.cards-row',
        '.genre-grid',
        '.results-grid',
        '.search-mode-tabs',
        '.mood-pills',
        '.quick-filter-bar',
        '.pagination-bar',
        '.page-numbers-container',
        '.netflix-actions-bar',
        '.auth-tabs',
        '.adv-type-switcher',
        '.adv-genres-grid',
        '.search-bottom-bar',
        '.top-nav-bar',
        '.profile-ai-actions',
        '.adv-actions'
    ].join(',');

    const HORIZONTAL_SCROLLER = [
        '.cards-row',
        '.genre-grid',
        '.results-grid',
        '.mood-pills',
        '.quick-filter-bar',
        '.netflix-actions-bar',
        '.adv-genres-grid',
        '.page-numbers-container'
    ].join(',');

    const DIRECTION_KEYS = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right'
    };

    let enabled = false;
    let observer = null;
    let refreshFrame = null;
    let pendingPreferredSelector = null;
    let lastContentFocus = null;
    let navigationRoot = document.body;
    let activeRow = null;
    let rowSequence = 0;
    let cacheDirty = true;
    let cacheRoot = null;
    let candidateCache = [];
    let rowItemsCache = new Map();
    let laneItemsCache = new Map();
    let laneOrderCache = [];
    let activeSection = null;
    const sectionLastFocus = new WeakMap();

    function activeModal() {
        const modals = document.querySelectorAll('.modal:not(.hidden), .update-modal:not(.hidden)');
        return modals.length ? modals[modals.length - 1] : null;
    }

    function activeRoot() {
        return activeModal() || document.body;
    }

    function markTvSection(element, name, preferredSelector) {
        if (!element) return;
        element.dataset.tvSection = name;
        element.classList.add('tv-page-section');
        if (preferredSelector) element.dataset.tvPreferred = preferredSelector;
    }

    function prepareTvLayout() {
        const discover = document.getElementById('discoverSection');
        const featured = document.getElementById('tvFeatured');
        const header = document.querySelector('.app-header');
        const topNav = document.querySelector('.top-nav-bar');
        const searchArea = document.getElementById('heroSearchArea');

        if (discover && featured && header && header.parentElement !== discover) {
            featured.insertAdjacentElement('afterend', header);
        }
        if (featured && topNav && topNav.parentElement !== featured) {
            topNav.classList.add('tv-hero-nav');
            featured.prepend(topNav);
        }
        if (searchArea && !searchArea.querySelector('.tv-search-intro')) {
            const intro = document.createElement('div');
            intro.className = 'tv-search-intro';
            intro.innerHTML = `
                <div class="tv-eyebrow">SINEAI KEŞİF</div>
                <h2>Bu gece ne izlemek istersin?</h2>
                <p>Bir tür, ruh hâli veya sevdiğin bir yapımı söyle. Sana uygun seçkiyi saniyeler içinde hazırlayalım.</p>
            `;
            searchArea.prepend(intro);
        }

        markTvSection(featured, 'featured', '#tvFeaturedOpen');
        markTvSection(header, 'search', '.mode-tab.active');
        discover?.querySelectorAll('.row-section').forEach((section, index) => {
            markTvSection(section, `discover-row-${index}`, '.movie-card, .genre-chip');
        });

        const results = document.getElementById('resultsSection');
        if (results && !results.querySelector('.tv-results-controls-section')) {
            const controls = document.createElement('section');
            controls.className = 'tv-results-controls-section';
            const firstControl = results.querySelector('.results-hero-header');
            if (firstControl) results.insertBefore(controls, firstControl);
            [
                results.querySelector('.results-hero-header'),
                document.getElementById('aiAnalysisSummary'),
                results.querySelector('.saas-results-toolbar')
            ].filter(Boolean).forEach(element => controls.appendChild(element));

            const content = document.createElement('section');
            content.className = 'tv-results-content-section';
            const firstContent = document.getElementById('loading') || document.getElementById('resultsGrid');
            if (firstContent) results.insertBefore(content, firstContent);
            [
                document.getElementById('loading'),
                document.getElementById('resultsGrid'),
                document.getElementById('paginationBar'),
                document.getElementById('scrollSentinel')
            ].filter(Boolean).forEach(element => content.appendChild(element));
        }
        markTvSection(results?.querySelector('.tv-results-controls-section'), 'results-controls', '.filter-pill.active, .saas-back-btn');
        markTvSection(results?.querySelector('.tv-results-content-section'), 'results-content', '.movie-card, .pagination-btn');

        const profile = document.getElementById('profileSection');
        if (profile && !profile.querySelector('.tv-profile-overview-section')) {
            const overview = document.createElement('section');
            overview.className = 'tv-profile-overview-section';
            const profileHeader = profile.querySelector('.profile-page-header');
            if (profileHeader) profile.insertBefore(overview, profileHeader);
            [profileHeader, profile.querySelector('.profile-dashboard-grid')]
                .filter(Boolean)
                .forEach(element => overview.appendChild(element));
        }
        markTvSection(profile?.querySelector('.tv-profile-overview-section'), 'profile-overview', '#profileRecommendBtn, #profileBackBtn');
        markTvSection(profile?.querySelector('.profile-gallery-section'), 'profile-gallery', '.movie-card');
    }

    function rowFor(element) {
        return element?.closest?.(ROW_SELECTOR) || null;
    }

    function sectionFor(element) {
        if (activeModal()) return null;
        return element?.closest?.('[data-tv-section]') || null;
    }

    function laneFor(element) {
        return rowFor(element) || element;
    }

    function isAvailable(element, root = activeRoot()) {
        if (!(element instanceof HTMLElement)) return false;
        if (!element.isConnected || element.classList.contains('tv-skip-focus')) return false;
        if (element.matches('.movie-card .fav-btn')) return false;
        if (element.closest('.hidden, [aria-hidden="true"]')) return false;
        if (element.hasAttribute('disabled')) return false;
        if (root !== document.body && !root.contains(element)) return false;

        const rect = element.getBoundingClientRect();
        if (rect.width <= 2 || rect.height <= 2) return false;

        const style = window.getComputedStyle(element);
        return style.display !== 'none'
            && style.visibility !== 'hidden'
            && Number(style.opacity) !== 0;
    }

    function decorateFocusableElements(scope = document.body) {
        scope.querySelectorAll('.movie-card:not([data-tv-decorated]), .genre-chip:not([data-tv-decorated]), .see-all:not([data-tv-decorated])')
            .forEach(element => {
                element.dataset.tvDecorated = 'true';
                element.tabIndex = 0;
                if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
            });

        scope.querySelectorAll('.movie-card .fav-btn:not(.tv-skip-focus)').forEach(button => {
            button.tabIndex = -1;
            button.classList.add('tv-skip-focus');
        });

        scope.querySelectorAll(ROW_SELECTOR).forEach(row => {
            if (!row.dataset.tvRow) row.dataset.tvRow = `row-${rowSequence++}`;
        });
    }

    function rebuildCandidateCache() {
        const root = activeRoot();
        decorateFocusableElements(root);

        const list = Array.from(root.querySelectorAll(CANDIDATE_SELECTOR))
            .filter(element => isAvailable(element, root));
        const rows = new Map();
        const lanes = new Map();
        const laneOrder = [];

        for (const element of list) {
            const row = rowFor(element);
            if (row) {
                if (!rows.has(row)) rows.set(row, []);
                rows.get(row).push(element);
            }

            const lane = laneFor(element);
            if (!lanes.has(lane)) {
                lanes.set(lane, []);
                laneOrder.push(lane);
            }
            lanes.get(lane).push(element);
        }

        cacheRoot = root;
        candidateCache = list;
        rowItemsCache = rows;
        laneItemsCache = lanes;
        laneOrderCache = laneOrder;
        cacheDirty = false;
        return list;
    }

    function candidates() {
        const root = activeRoot();
        if (cacheDirty || cacheRoot !== root) return rebuildCandidateCache();
        return candidateCache;
    }

    function scrollFocusedIntoView(element) {
        const horizontal = element.closest(HORIZONTAL_SCROLLER);
        if (horizontal && horizontal.scrollWidth > horizontal.clientWidth) {
            const elementRect = element.getBoundingClientRect();
            const containerRect = horizontal.getBoundingClientRect();
            const safeInset = Math.min(70, containerRect.width * 0.08);
            let deltaX = 0;

            if (elementRect.left < containerRect.left + safeInset) {
                deltaX = elementRect.left - containerRect.left - safeInset;
            } else if (elementRect.right > containerRect.right - safeInset) {
                deltaX = elementRect.right - containerRect.right + safeInset;
            }

            if (Math.abs(deltaX) > 1) horizontal.scrollLeft += deltaX;
        }

        const section = sectionFor(element);
        if (section) {
            const sectionTop = section.getBoundingClientRect().top + window.scrollY;
            if (Math.abs(window.scrollY - sectionTop) > 1) {
                window.scrollTo({ top: Math.max(0, sectionTop), behavior: 'auto' });
            }
            return;
        }

        const rect = element.getBoundingClientRect();
        const topSafe = Math.max(70, window.innerHeight * 0.14);
        const bottomSafe = window.innerHeight * 0.84;
        let deltaY = 0;

        if (rect.top < topSafe) deltaY = rect.top - topSafe;
        else if (rect.bottom > bottomSafe) deltaY = rect.bottom - bottomSafe;

        if (Math.abs(deltaY) > 1) window.scrollBy({ top: deltaY, behavior: 'auto' });
    }

    function focusElement(element) {
        if (!isAvailable(element)) return false;

        const nextRow = rowFor(element);
        if (activeRow !== nextRow) {
            activeRow?.classList.remove('tv-row-active');
            nextRow?.classList.add('tv-row-active');
            activeRow = nextRow;
        }

        const nextSection = sectionFor(element);
        if (activeSection !== nextSection) {
            activeSection?.classList.remove('tv-section-active');
            nextSection?.classList.add('tv-section-active');
            activeSection = nextSection;
        }

        try {
            element.focus({ preventScroll: true });
        } catch (_error) {
            element.focus();
        }

        if (!activeModal()) {
            lastContentFocus = element;
            if (nextSection) sectionLastFocus.set(nextSection, element);
        }
        scrollFocusedIntoView(element);
        return document.activeElement === element;
    }

    function preferredCandidate(list) {
        const modal = activeModal();
        if (modal) {
            const modalPreferred = [
                '.btn-play-trailer',
                '.btn-similar-recommend',
                '.btn-fav',
                '.netflix-btn',
                '.auth-tab.active',
                'input',
                '.close-btn'
            ];
            for (const selector of modalPreferred) {
                const found = modal.querySelector(selector);
                if (found && list.includes(found)) return found;
            }
        }

        const view = document.body.dataset.view || 'discover';
        const selectors = view === 'results'
            ? ['#resultsGrid .movie-card', '.filter-pill.active', '#query', '.saas-back-btn']
            : view === 'profile'
                ? ['#profileFavGrid .movie-card', '#profileRecommendBtn', '#profileBackBtn']
                : ['#tvFeaturedOpen', '.mode-tab.active', '#query', '#popularMoviesRow .movie-card'];

        for (const selector of selectors) {
            const found = document.querySelector(selector);
            if (found && list.includes(found)) return found;
        }
        return list[0] || null;
    }

    function ensureFocus(forcePreferred = false) {
        if (!enabled) return false;
        const list = candidates();
        if (!list.length) return false;
        if (!forcePreferred && list.includes(document.activeElement)) return true;
        return focusElement(preferredCandidate(list));
    }

    function sameRowTarget(current, direction) {
        const row = rowFor(current);
        const rowItems = row ? rowItemsCache.get(row) : null;
        if (!rowItems?.length) return null;

        const index = rowItems.indexOf(current);
        if (index < 0) return null;
        if (direction === 'left' && index > 0) return rowItems[index - 1];
        if (direction === 'right' && index < rowItems.length - 1) return rowItems[index + 1];
        return current;
    }

    function verticalLaneTarget(current, direction, list) {
        const currentLane = laneFor(current);
        const currentIndex = laneOrderCache.indexOf(currentLane);
        if (currentIndex < 0) return null;

        const step = direction === 'up' ? -1 : 1;
        const currentSection = sectionFor(current);
        const currentRect = current.getBoundingClientRect();
        const currentX = currentRect.left + (currentRect.width / 2);

        for (let index = currentIndex + step; index >= 0 && index < laneOrderCache.length; index += step) {
            const lane = laneOrderCache[index];
            const laneItems = (laneItemsCache.get(lane) || []).filter(item => list.includes(item));
            if (!laneItems.length) continue;

            const targetSection = sectionFor(laneItems[0]);
            if (targetSection && targetSection !== currentSection) {
                const remembered = sectionLastFocus.get(targetSection);
                if (remembered && list.includes(remembered)) return remembered;

                const preferredSelector = targetSection.dataset.tvPreferred;
                if (preferredSelector) {
                    const preferred = targetSection.querySelector(preferredSelector);
                    if (preferred && list.includes(preferred)) return preferred;
                }
            }

            return laneItems.reduce((best, candidate) => {
                const rect = candidate.getBoundingClientRect();
                const x = rect.left + (rect.width / 2);
                if (!best) return candidate;
                const bestRect = best.getBoundingClientRect();
                const bestX = bestRect.left + (bestRect.width / 2);
                return Math.abs(x - currentX) < Math.abs(bestX - currentX) ? candidate : best;
            }, null);
        }
        return null;
    }

    function spatialTarget(current, direction, list) {
        const currentRect = current.getBoundingClientRect();
        const currentX = currentRect.left + (currentRect.width / 2);
        const currentY = currentRect.top + (currentRect.height / 2);
        const currentRow = rowFor(current);
        let best = null;
        let bestScore = Number.POSITIVE_INFINITY;

        for (const candidate of list) {
            if (candidate === current) continue;
            if (currentRow && rowFor(candidate) === currentRow) continue;
            if (direction === 'down' && candidate.matches('.see-all')) {
                const candidateSection = candidate.closest('.row-section');
                if (candidateSection && !candidateSection.contains(current)) continue;
            }

            const rect = candidate.getBoundingClientRect();
            const x = rect.left + (rect.width / 2);
            const y = rect.top + (rect.height / 2);
            const dx = x - currentX;
            const dy = y - currentY;
            let primary;
            let secondary;

            if (direction === 'up') {
                if (dy >= -6) continue;
                primary = Math.abs(dy);
                secondary = Math.abs(dx);
            } else if (direction === 'down') {
                if (dy <= 6) continue;
                primary = Math.abs(dy);
                secondary = Math.abs(dx);
            } else if (direction === 'left') {
                if (dx >= -6) continue;
                primary = Math.abs(dx);
                secondary = Math.abs(dy);
            } else {
                if (dx <= 6) continue;
                primary = Math.abs(dx);
                secondary = Math.abs(dy);
            }

            const overlap = (direction === 'up' || direction === 'down')
                ? Math.max(0, Math.min(currentRect.right, rect.right) - Math.max(currentRect.left, rect.left))
                : Math.max(0, Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top));
            const crossAxisWeight = (direction === 'up' || direction === 'down') ? 2.1 : 1.25;
            const score = (primary * 10) + (secondary * crossAxisWeight) - Math.min(160, overlap);

            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        }
        return best;
    }

    function move(direction) {
        const list = candidates();
        if (!list.length) return false;
        const current = list.includes(document.activeElement) ? document.activeElement : null;
        if (!current) return focusElement(preferredCandidate(list));

        if (direction === 'left' || direction === 'right') {
            const rowTarget = sameRowTarget(current, direction);
            if (rowTarget) return rowTarget === current || focusElement(rowTarget);
        }

        if ((direction === 'up' || direction === 'down') && !activeModal()) {
            const laneTarget = verticalLaneTarget(current, direction, list);
            return laneTarget ? focusElement(laneTarget) : true;
        }

        const target = spatialTarget(current, direction, list);
        return target ? focusElement(target) : true;
    }

    function activateCurrent() {
        const list = candidates();
        const current = list.includes(document.activeElement)
            ? document.activeElement
            : preferredCandidate(list);
        if (!current) return false;
        if (document.activeElement !== current) focusElement(current);

        current.click();
        if (!current.matches('textarea, input, select')) scheduleRefresh();
        return true;
    }

    function closeModalById(modalId, closeId) {
        const modal = document.getElementById(modalId);
        if (!modal || modal.classList.contains('hidden')) return false;
        const restoreTarget = lastContentFocus;
        document.getElementById(closeId)?.click();
        window.setTimeout(() => {
            cacheDirty = true;
            if (restoreTarget && isAvailable(restoreTarget)) focusElement(restoreTarget);
            else ensureFocus(true);
        }, 0);
        return true;
    }

    function handleBack() {
        if (!enabled) return false;
        if (closeModalById('trailerModal', 'closeTrailerModalBtn')) return true;
        if (closeModalById('detailModal', 'closeModalBtn')) return true;
        if (closeModalById('authModal', 'closeAuthModalBtn')) return true;
        if (closeModalById('advSearchModal', 'closeAdvSearchModalBtn')) return true;

        const active = document.activeElement;
        if (active?.matches?.('textarea, input, select')) {
            active.blur();
            return ensureFocus(true);
        }

        if (!document.getElementById('profileSection')?.classList.contains('hidden')) {
            document.getElementById('profileBackBtn')?.click();
            scheduleRefresh();
            return true;
        }

        if (!document.getElementById('resultsSection')?.classList.contains('hidden')) {
            document.getElementById('backToDiscoverBtn')?.click();
            scheduleRefresh();
            return true;
        }
        return false;
    }

    function handleNativeKey(direction) {
        if (!enabled) return false;
        if (direction === 'select' || direction === 'enter' || direction === 'ok') return activateCurrent();
        if (['up', 'down', 'left', 'right'].includes(direction)) return move(direction);
        return false;
    }

    function handleKeyboard(event) {
        if (!enabled) return;
        const direction = DIRECTION_KEYS[event.key];
        const isSelect = event.key === 'Enter' || event.key === ' ';
        const isBack = event.key === 'Escape' || event.key === 'BrowserBack';
        if (!direction && !isSelect && !isBack) return;
        if (isSelect && event.repeat) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        if (direction) handleNativeKey(direction);
        else if (isSelect) handleNativeKey('select');
        else handleBack();
    }

    function classMutationOnlyChangesFocusState(mutation) {
        if (mutation.attributeName !== 'class') return false;
        const before = new Set(String(mutation.oldValue || '').split(/\s+/).filter(Boolean));
        const after = new Set(mutation.target.classList);
        const changed = new Set([...before, ...after].filter(name => before.has(name) !== after.has(name)));
        return changed.size > 0 && [...changed].every(name => [
            'tv-row-active', 'tv-focus-active', 'tv-nav-ready'
        ].includes(name));
    }

    function ensureDetailCinematicLayer() {
        const modal = document.getElementById('detailModal');
        if (!modal || modal.classList.contains('hidden')) return;

        const body = modal.querySelector('.modal-body');
        if (!body || body.querySelector('.modal-cinematic-backdrop')) return;

        const poster = body.querySelector('.modal-poster img');
        const source = poster?.currentSrc || poster?.src || '';
        const backdrop = document.createElement('div');
        const shade = document.createElement('div');
        backdrop.className = 'modal-cinematic-backdrop tv-poster-fallback';
        shade.className = 'modal-cinematic-shade';
        backdrop.setAttribute('aria-hidden', 'true');
        shade.setAttribute('aria-hidden', 'true');
        if (source) backdrop.style.backgroundImage = `url("${source.replace('/w500/', '/w780/')}")`;
        body.prepend(shade);
        body.prepend(backdrop);
    }

    function scheduleRefresh(preferredSelector) {
        cacheDirty = true;
        if (preferredSelector) pendingPreferredSelector = preferredSelector;
        if (refreshFrame) return;

        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = null;
            ensureDetailCinematicLayer();
            const list = rebuildCandidateCache();
            const root = activeRoot();
            const modalJustOpened = root !== document.body && root !== navigationRoot;
            navigationRoot = root;

            const preferred = pendingPreferredSelector;
            pendingPreferredSelector = null;
            if (preferred) {
                const target = root.querySelector(preferred) || document.querySelector(preferred);
                if (target && list.includes(target)) {
                    focusElement(target);
                    return;
                }
            }

            if (modalJustOpened) ensureFocus(true);
            else if (!list.includes(document.activeElement)) ensureFocus(false);
        });
    }

    function observeMutations(mutations) {
        const affectsNavigation = mutations.some(mutation => {
            if (mutation.type === 'childList') return true;
            return !classMutationOnlyChangesFocusState(mutation);
        });
        if (affectsNavigation) scheduleRefresh();
    }

    function addRemoteHint() {
        if (document.querySelector('.tv-remote-hint')) return;
        const hint = document.createElement('div');
        hint.className = 'tv-remote-hint';
        hint.textContent = 'Yön tuşlarıyla gezin  •  OK ile seç  •  Geri ile çık';
        document.body.appendChild(hint);
        window.setTimeout(() => hint.remove(), 6500);
    }

    function enable(flag = true) {
        enabled = Boolean(flag);
        document.body.classList.toggle('tv-nav-ready', enabled);
        document.body.classList.toggle('tv-focus-active', enabled);
        document.documentElement.classList.toggle('tv-nav-ready', enabled);

        if (!enabled) {
            observer?.disconnect();
            observer = null;
            document.querySelector('.tv-remote-hint')?.remove();
            candidateCache = [];
            rowItemsCache.clear();
            laneItemsCache.clear();
            laneOrderCache = [];
            cacheDirty = true;
            return false;
        }

        prepareTvLayout();
        decorateFocusableElements(document.body);
        navigationRoot = activeRoot();
        addRemoteHint();
        if (!observer) {
            observer = new MutationObserver(observeMutations);
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeOldValue: true,
                attributeFilter: ['class', 'disabled', 'aria-hidden']
            });
        }
        scheduleRefresh();
        window.setTimeout(() => ensureFocus(true), 80);
        return true;
    }

    function refresh(preferredSelector) {
        if (!enabled) return false;
        scheduleRefresh(preferredSelector);
        return true;
    }

    window.addEventListener('keydown', handleKeyboard, true);
    window.addEventListener('resize', () => { cacheDirty = true; }, { passive: true });
    window.addEventListener('sineai:viewchange', () => scheduleRefresh());
    window.SineAITV = {
        enable,
        refresh,
        handleNativeKey,
        handleBack,
        isEnabled: () => enabled
    };

    const tvPreviewRequested = new URLSearchParams(window.location.search).get('tv') === '1'
        || navigator.userAgent.includes('SineAITV/');
    if (tvPreviewRequested) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => enable(true), { once: true });
        } else {
            enable(true);
        }
    }
})();
