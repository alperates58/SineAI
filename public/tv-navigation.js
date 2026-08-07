(function () {
    'use strict';

    const TV_CONTRACT_VERSION = 2;
    const TV_ASSET_VERSION = '2.0.0';

    // Candidate selector for D-pad focus graph.
    // NOTE: Input, textarea, select are intentionally EXCLUDED from default directional navigation
    // to prevent unwanted soft-keyboard popup on Android TV. They are accessed via explicit edit mode.
    const CANDIDATE_SELECTOR = [
        '[data-tv-focusable="true"]',
        '.movie-card',
        '.genre-chip',
        '.see-all',
        '.tv-input-trigger',
        'button:not([disabled]):not(.tv-skip-focus)',
        'a[href]:not(.tv-skip-focus)',
        '[tabindex="0"]:not(.tv-skip-focus)'
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
    let isTextEditMode = false;
    let currentInputTarget = null;
    const sectionLastFocus = new WeakMap();

    // Check debug flag ?tv=1&focusDebug=1
    const isDebug = new URLSearchParams(window.location.search).get('focusDebug') === '1';

    function debugLog(...args) {
        if (isDebug) {
            console.log('[TV Focus]', ...args);
        }
    }

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
        const queryTextarea = document.getElementById('query');

        // Setup fixed header top-nav-bar if not already created
        if (topNav) {
            topNav.classList.add('tv-fixed-header');
            if (topNav.parentElement !== document.body) {
                document.body.prepend(topNav);
            }
        }

        // Add explicit text input trigger button if missing to avoid auto-keyboard on navigation
        if (searchArea && queryTextarea && !document.getElementById('tvQueryTrigger')) {
            const triggerBtn = document.createElement('button');
            triggerBtn.type = 'button';
            triggerBtn.id = 'tvQueryTrigger';
            triggerBtn.className = 'tv-input-trigger';
            triggerBtn.setAttribute('tabindex', '0');
            triggerBtn.innerHTML = '✏️ <span>İsteğini Yaz / Klavye Aç</span>';
            queryTextarea.parentElement.insertBefore(triggerBtn, queryTextarea);
            
            // Textarea is hidden from direct D-pad focus until trigger is activated
            queryTextarea.classList.add('tv-hidden-input');

            triggerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                enterTextEditMode(queryTextarea);
            });
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
        markTvSection(header, 'search', '.mode-tab.active, #tvQueryTrigger');
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

    function enterTextEditMode(inputElement) {
        if (!inputElement) return;
        isTextEditMode = true;
        currentInputTarget = inputElement;
        inputElement.classList.remove('tv-hidden-input');
        inputElement.focus();
        debugLog('Entered Text Edit Mode for:', inputElement.id);
    }

    function exitTextEditMode() {
        if (!isTextEditMode) return false;
        if (currentInputTarget) {
            currentInputTarget.blur();
            currentInputTarget.classList.add('tv-hidden-input');
        }
        isTextEditMode = false;
        currentInputTarget = null;
        debugLog('Exited Text Edit Mode');
        const trigger = document.getElementById('tvQueryTrigger') || lastContentFocus;
        if (trigger) focusElement(trigger);
        return true;
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
        
        // Skip inputs/textarea/select from standard D-pad candidates unless explicitly in text mode
        if (element.matches('textarea, input, select') && !isTextEditMode) return false;
        
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

        // Ensure input fields inside auth or adv modal have explicit focus handling
        scope.querySelectorAll('input:not([data-tv-input-bound]), textarea:not([data-tv-input-bound])').forEach(input => {
            input.dataset.tvInputBound = 'true';
            input.addEventListener('focus', () => {
                if (!isTextEditMode) {
                    isTextEditMode = true;
                    currentInputTarget = input;
                }
            });
            input.addEventListener('blur', () => {
                if (currentInputTarget === input) {
                    isTextEditMode = false;
                    currentInputTarget = null;
                }
            });
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

    // Unified horizontal & vertical scroll for focused element with safe viewport margins
    function scrollFocusedIntoView(element) {
        if (!element) return;

        // 1. Horizontal container scrolling (Action bar, Movie rows, Filter chips)
        const horizontal = element.closest(HORIZONTAL_SCROLLER);
        if (horizontal && horizontal.scrollWidth > horizontal.clientWidth) {
            const elementRect = element.getBoundingClientRect();
            const containerRect = horizontal.getBoundingClientRect();
            const safeInset = Math.min(80, containerRect.width * 0.1);
            let deltaX = 0;

            if (elementRect.left < containerRect.left + safeInset) {
                deltaX = elementRect.left - containerRect.left - safeInset;
            } else if (elementRect.right > containerRect.right - safeInset) {
                deltaX = elementRect.right - containerRect.right + safeInset;
            }

            if (Math.abs(deltaX) > 1) {
                horizontal.scrollLeft += deltaX;
            }
        }

        // 2. Section vertical alignment
        const section = sectionFor(element);
        if (section) {
            const sectionTop = section.getBoundingClientRect().top + window.scrollY;
            const topHeaderOffset = 70; // Header safe offset
            const targetY = Math.max(0, sectionTop - topHeaderOffset);
            
            if (Math.abs(window.scrollY - targetY) > 8) {
                window.scrollTo({ top: targetY, behavior: 'auto' });
            }
            return;
        }

        // 3. Fallback element vertical safe bounds check
        const rect = element.getBoundingClientRect();
        const topSafe = 80;
        const bottomSafe = window.innerHeight - 90;
        let deltaY = 0;

        if (rect.top < topSafe) {
            deltaY = rect.top - topSafe;
        } else if (rect.bottom > bottomSafe) {
            deltaY = rect.bottom - bottomSafe;
        }

        if (Math.abs(deltaY) > 2) {
            window.scrollBy({ top: deltaY, behavior: 'auto' });
        }
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

        // Add tv-focused visual feedback class
        document.querySelectorAll('.tv-focused').forEach(el => el.classList.remove('tv-focused'));
        element.classList.add('tv-focused');

        if (!activeModal()) {
            lastContentFocus = element;
            if (nextSection) sectionLastFocus.set(nextSection, element);
        }
        
        debugLog('Focus ->', element.tagName, element.id || element.className);
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
                '#loginUsername',
                '.close-btn'
            ];
            for (const selector of modalPreferred) {
                const found = modal.querySelector(selector);
                if (found && list.includes(found)) return found;
            }
        }

        const view = document.body.dataset.view || 'discover';
        const selectors = view === 'results'
            ? ['#resultsGrid .movie-card', '.filter-pill.active', '#tvQueryTrigger', '.saas-back-btn']
            : view === 'profile'
                ? ['#profileFavGrid .movie-card', '#profileRecommendBtn', '#profileBackBtn']
                : ['#tvFeaturedOpen', '.mode-tab.active', '#tvQueryTrigger', '#popularMoviesRow .movie-card'];

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
        // If in text edit mode, standard D-pad navigates within text input or exits on Escape/Back
        if (isTextEditMode) {
            return false;
        }

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
            if (laneTarget) return focusElement(laneTarget);
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

        // 1. Text Edit Mode active -> exit text mode first
        if (isTextEditMode) {
            exitTextEditMode();
            return true;
        }

        // 2. Modals active -> close top modal
        if (closeModalById('trailerModal', 'closeTrailerModalBtn')) return true;
        if (closeModalById('detailModal', 'closeModalBtn')) return true;
        if (closeModalById('authModal', 'closeAuthModalBtn')) return true;
        if (closeModalById('advSearchModal', 'closeAdvSearchModalBtn')) return true;

        // 3. Sub-views active -> return to discover
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
        
        // Allow normal typing inside input/textarea when in text edit mode
        if (isTextEditMode && !isBack && (event.key !== 'Enter' || currentInputTarget?.tagName === 'TEXTAREA')) {
            return;
        }

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
            'tv-row-active', 'tv-focus-active', 'tv-focused', 'tv-nav-ready'
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

    // Intercept Recommendation submit to trigger smooth loading state & result focus
    function setupRecommendationFormListener() {
        const recommendForm = document.getElementById('recommendForm');
        if (recommendForm && !recommendForm.dataset.tvBound) {
            recommendForm.dataset.tvBound = 'true';
            recommendForm.addEventListener('submit', () => {
                if (isTextEditMode) exitTextEditMode();
                
                // Ensure results section container is brought smoothly into view
                const resultsSection = document.getElementById('resultsSection');
                if (resultsSection) {
                    resultsSection.classList.remove('hidden');
                    window.scrollTo({ top: resultsSection.offsetTop - 70, behavior: 'smooth' });
                }

                // Schedule focus once results pop in
                const observer = new MutationObserver(() => {
                    const firstCard = resultsSection?.querySelector('#resultsGrid .movie-card');
                    if (firstCard) {
                        observer.disconnect();
                        window.setTimeout(() => {
                            focusElement(firstCard);
                        }, 120);
                    }
                });
                if (resultsSection) {
                    observer.observe(resultsSection, { childList: true, subtree: true });
                    window.setTimeout(() => observer.disconnect(), 10000); // safety timeout
                }
            });
        }
    }

    function scheduleRefresh(preferredSelector) {
        cacheDirty = true;
        if (preferredSelector) pendingPreferredSelector = preferredSelector;
        if (refreshFrame) return;

        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = null;
            ensureDetailCinematicLayer();
            setupRecommendationFormListener();

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
        contractVersion: TV_CONTRACT_VERSION,
        assetVersion: TV_ASSET_VERSION,
        enable,
        refresh,
        handleNativeKey,
        handleBack,
        exitTextEditMode,
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
