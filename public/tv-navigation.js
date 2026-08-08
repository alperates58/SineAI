(function () {
    'use strict';

    const TV_CONTRACT_VERSION = 4;
    const TV_ASSET_VERSION = '4.0.0';

    // Candidate selector for D-pad focus graph.
    // NOTE: Input, textarea, select are intentionally EXCLUDED from default directional navigation
    // to prevent unwanted soft-keyboard popup on Android TV. They are accessed strictly via text entry mode.
    const CANDIDATE_SELECTOR = [
        '[data-tv-focusable="true"]',
        '.movie-card',
        '.genre-chip',
        '.see-all',
        '.tv-card-action',
        '.tv-nav-link',
        '.tv-input-trigger',
        '.pill',
        '.mode-tab',
        '.filter-pill',
        '.modal input:not([disabled])',
        '.modal textarea:not([disabled])',
        'select:not([disabled])',
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
        '.tv-discovery-cards',
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
        '.page-numbers-container',
        '.tv-discovery-cards'
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
    let tvTextEntryMode = false;
    let currentInputTarget = null;
    let triggerSourceCard = null;

    // Focus Memory per section
    const focusMemory = {
        home: null,
        ai: null,
        results: null,
        profile: null,
        detail: null
    };

    const sectionLastFocus = new WeakMap();
    const isDebug = new URLSearchParams(window.location.search).get('focusDebug') === '1';

    function debugLog(...args) {
        if (isDebug) console.log('[SineAI TV]', ...args);
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

    // Build TV Navigation Header & Discovery Card Structure
    // Setup TV Section markings for D-pad navigation graph
    function prepareTvLayout() {
        const discover = document.getElementById('discoverSection');
        const featured = document.getElementById('tvFeatured');
        const searchArea = document.getElementById('heroSearchArea');
        const results = document.getElementById('resultsSection');
        const profile = document.getElementById('profileSection');

        if (featured) markTvSection(featured, 'tv-hero', '#tvFeaturedOpen');
        if (searchArea) markTvSection(searchArea, 'tv-ai-prompt', '#submitBtn, .mode-tab.active');

        discover?.querySelectorAll('.row-section').forEach((section, index) => {
            markTvSection(section, `tv-row-${index}`, '.movie-card, .genre-chip');
        });

        if (results) {
            markTvSection(results.querySelector('.saas-results-toolbar') || results, 'tv-ai-results-controls', '.filter-pill.active, #backToDiscoverBtn');
            markTvSection(document.getElementById('resultsGrid') || results, 'tv-ai-results-content', '.movie-card, #prevPageBtn');
        }

        if (profile) {
            markTvSection(profile, 'tv-profile', '#profileRecommendBtn, #profileBackBtn, .movie-card');
        }

        const queryTrigger = document.getElementById('tvQueryTrigger');
        const queryInput = document.getElementById('query');
        if (queryTrigger && queryInput && !queryTrigger.dataset.tvInputTriggerBound) {
            queryTrigger.dataset.tvInputTriggerBound = 'true';
            queryTrigger.addEventListener('click', () => enterTextEditMode(queryInput));
        }
    }

    function enterTextEditMode(inputElement) {
        if (!inputElement) return;
        tvTextEntryMode = true;
        currentInputTarget = inputElement;
        if (inputElement.id === 'query') inputElement.classList.remove('tv-hidden-input');
        inputElement.focus({ preventScroll: true });
        try {
            window.SineAIAndroid?.showKeyboard?.();
        } catch (_error) {
            // Browser preview has no Android bridge; native TV does.
        }
        debugLog('Entered Text Entry Mode for:', inputElement.id);
    }

    function exitTextEditMode() {
        if (!tvTextEntryMode) return false;
        const previousInput = currentInputTarget;
        if (previousInput) {
            previousInput.blur();
            if (previousInput.id === 'query') previousInput.classList.add('tv-hidden-input');
        }
        tvTextEntryMode = false;
        currentInputTarget = null;
        try {
            window.SineAIAndroid?.hideKeyboard?.();
        } catch (_error) {
            // Browser preview has no Android bridge; native TV does.
        }
        debugLog('Exited Text Entry Mode');
        const trigger = previousInput?.closest('.modal:not(.hidden)')
            ? previousInput
            : document.getElementById('tvQueryTrigger') || lastContentFocus;
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

        // Main search uses an explicit TV trigger. Modal form fields remain
        // directional candidates and enter keyboard mode only after OK.
        if (element.matches('textarea, input') && !tvTextEntryMode && !element.closest('.modal:not(.hidden)')) return false;

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

        // Add explicit card click memory listener to restore focus on BACK
        scope.querySelectorAll('.movie-card:not([data-tv-memory-bound])').forEach(card => {
            card.dataset.tvMemoryBound = 'true';
            card.addEventListener('click', () => {
                triggerSourceCard = card;
                focusMemory.detail = card;
            });
        });

        // Modal fields are navigable. Focusing them must not lock D-pad
        // movement; OK explicitly enters text edit mode.
        scope.querySelectorAll('input:not([data-tv-input-bound]), textarea:not([data-tv-input-bound])').forEach(input => {
            input.dataset.tvInputBound = 'true';
            input.addEventListener('blur', () => {
                if (currentInputTarget === input) {
                    tvTextEntryMode = false;
                    currentInputTarget = null;
                }
            });
            input.addEventListener('click', () => {
                if (enabled && input.closest('.modal:not(.hidden)') && !tvTextEntryMode) {
                    enterTextEditMode(input);
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

    // Unified Element Visibility (ensureTvElementVisible)
    function ensureTvElementVisible(element, alignSection = false) {
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

        // 2. Modal / Scrollable container vertical bounds check
        const modalContainer = element.closest('.modal-info, .modal-content, .modal');
        if (modalContainer && modalContainer.scrollHeight > modalContainer.clientHeight) {
            const elRect = element.getBoundingClientRect();
            const containerRect = modalContainer.getBoundingClientRect();
            const safePadding = 40;

            if (elRect.bottom > containerRect.bottom - safePadding) {
                modalContainer.scrollTop += (elRect.bottom - containerRect.bottom + safePadding);
            } else if (elRect.top < containerRect.top + safePadding) {
                modalContainer.scrollTop -= (containerRect.top + safePadding - elRect.top);
            }
            return;
        }

        // 3. Section vertical alignment
        const section = sectionFor(element);
        if (section && alignSection) {
            const sectionTop = section.getBoundingClientRect().top + window.scrollY;
            const topHeaderOffset = 80;
            const targetY = Math.max(0, sectionTop - topHeaderOffset);

            if (Math.abs(window.scrollY - targetY) > 8) {
                window.scrollTo({ top: targetY, behavior: 'auto' });
            }
            return;
        }

        // 4. Fallback element vertical safe bounds check
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
        const sectionChanged = activeSection !== nextSection;
        if (sectionChanged) {
            activeSection?.classList.remove('tv-section-active');
            nextSection?.classList.add('tv-section-active');
            activeSection = nextSection;
        }

        try {
            element.focus({ preventScroll: true });
        } catch (_error) {
            element.focus();
        }

        document.querySelectorAll('.tv-focused').forEach(el => el.classList.remove('tv-focused'));
        element.classList.add('tv-focused');

        if (!activeModal()) {
            lastContentFocus = element;
            if (nextSection) sectionLastFocus.set(nextSection, element);
        }

        debugLog('Focus ->', element.tagName, element.id || element.className);
        ensureTvElementVisible(element, sectionChanged);
        requestAnimationFrame(() => {
            if (document.activeElement === element) ensureTvElementVisible(element, false);
        });
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
                : view === 'ai' || view === 'search'
                    ? ['#tvQueryTrigger', '.mode-tab.active', '#voiceBtn', '#randomPickBtn']
                : ['#tvFeaturedOpen', '#btnAiDiscover', '.mode-tab.active', '#tvQueryTrigger', '#popularMoviesRow .movie-card'];

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
            const currentIsGrid = Boolean(current.closest('.results-grid, .genre-grid, .adv-genres-grid'));
            if (currentRow && rowFor(candidate) === currentRow && !currentIsGrid) continue;
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
            // Prefer the nearest row/column first. Excessive cross-axis weighting
            // made D-pad Down skip adjacent form fields for a farther aligned chip.
            const crossAxisWeight = (direction === 'up' || direction === 'down') ? 1.25 : 1.0;
            const score = (primary * 3.0) + (secondary * crossAxisWeight) - Math.min(120, overlap);

            if (score < bestScore) {
                bestScore = score;
                best = candidate;
            }
        }
        return best;
    }

    function move(direction) {
        if (tvTextEntryMode) return false;

        const list = candidates();
        if (!list.length) return false;
        const current = list.includes(document.activeElement) ? document.activeElement : null;
        if (!current) return focusElement(preferredCandidate(list));

        const currentIsGrid = Boolean(current.closest('.results-grid, .genre-grid, .adv-genres-grid'));

        if ((direction === 'left' || direction === 'right') && !currentIsGrid) {
            const rowTarget = sameRowTarget(current, direction);
            if (rowTarget) return rowTarget === current || focusElement(rowTarget);
        }

        if ((direction === 'up' || direction === 'down') && !activeModal() && !currentIsGrid) {
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

        if (current.matches('textarea, input')) {
            enterTextEditMode(current);
            current.click();
            return true;
        }

        current.click();
        if (!current.matches('select')) scheduleRefresh();
        return true;
    }

    function closeModalById(modalId, closeId) {
        const modal = document.getElementById(modalId);
        if (!modal || modal.classList.contains('hidden')) return false;
        const restoreTarget = triggerSourceCard || focusMemory.detail || lastContentFocus;
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

        // 1. Text Entry Mode active -> exit text mode first
        if (tvTextEntryMode) {
            exitTextEditMode();
            return true;
        }

        // 2. Modals active -> close top modal & restore focus to source card
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
        if (direction === 'select' || direction === 'enter' || direction === 'ok') {
            if (tvTextEntryMode && currentInputTarget?.id === 'query') {
                const queryForm = currentInputTarget.form;
                exitTextEditMode();
                if (typeof queryForm?.requestSubmit === 'function') queryForm.requestSubmit();
                else queryForm?.querySelector('[type="submit"]')?.click();
                return true;
            }
            return activateCurrent();
        }
        if (['up', 'down', 'left', 'right'].includes(direction)) return move(direction);
        return false;
    }

    function handleKeyboard(event) {
        if (!enabled) return;
        const direction = DIRECTION_KEYS[event.key];
        const isSelect = event.key === 'Enter' || event.key === ' ';
        const isBack = event.key === 'Escape' || event.key === 'BrowserBack';

        if (!direction && !isSelect && !isBack) return;

        if (tvTextEntryMode && event.key === 'Enter' && currentInputTarget?.id === 'query') {
            event.preventDefault();
            event.stopImmediatePropagation();
            handleNativeKey('select');
            return;
        }

        // Allow normal typing inside input/textarea when in text edit mode
        if (tvTextEntryMode && !isBack && (event.key !== 'Enter' || currentInputTarget?.tagName === 'TEXTAREA')) {
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
        const shell = body.querySelector('.modal-detail-shell');
        const source = poster?.currentSrc || poster?.src || '';
        const backdrop = document.createElement('div');
        const shade = document.createElement('div');
        backdrop.className = `modal-cinematic-backdrop ${shell?.classList.contains('has-poster-backdrop') ? 'tv-poster-fallback' : 'tv-wide-backdrop'}`;
        shade.className = 'modal-cinematic-shade';
        backdrop.setAttribute('aria-hidden', 'true');
        shade.setAttribute('aria-hidden', 'true');
        if (shell?.style.backgroundImage) backdrop.style.backgroundImage = shell.style.backgroundImage;
        else if (source) backdrop.style.backgroundImage = `url("${source.replace('/w500/', '/w780/')}")`;
        body.prepend(shade);
        body.prepend(backdrop);
    }

    // Intercept Recommendation Submit for Instant Glowing AI Loading & Results Auto-Scroll
    function setupRecommendationFormListener() {
        const recommendForm = document.getElementById('recommendForm');
        if (recommendForm && !recommendForm.dataset.tvBound) {
            recommendForm.dataset.tvBound = 'true';
            recommendForm.addEventListener('submit', () => {
                if (tvTextEntryMode) exitTextEditMode();

                const resultsSection = document.getElementById('resultsSection');
                const loadingEl = document.getElementById('loading');

                if (resultsSection) {
                    resultsSection.classList.remove('hidden');
                }

                if (loadingEl) {
                    loadingEl.classList.remove('hidden');
                    window.setTimeout(() => {
                        loadingEl.scrollIntoView({ block: 'center', behavior: 'auto' });
                    }, 40);
                }

                // MutationObserver watches for results Grid population & auto-focuses first poster
                const observer = new MutationObserver(() => {
                    const firstCard = resultsSection?.querySelector('#resultsGrid .movie-card');
                    if (firstCard) {
                        observer.disconnect();
                        window.setTimeout(() => {
                            firstCard.scrollIntoView({ block: 'center', behavior: 'auto' });
                            focusElement(firstCard);
                        }, 80);
                    }
                });
                if (resultsSection) {
                    observer.observe(resultsSection, { childList: true, subtree: true });
                    window.setTimeout(() => observer.disconnect(), 10000);
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

            // Class changes on the visible TV search input are observed as layout
            // mutations. Keep the software-keyboard target focused while editing;
            // otherwise a refresh can jump back to the featured hero button.
            if (tvTextEntryMode && currentInputTarget?.isConnected) {
                if (document.activeElement !== currentInputTarget) {
                    currentInputTarget.focus({ preventScroll: true });
                }
                return;
            }

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
