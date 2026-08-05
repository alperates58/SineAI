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
        '.page-numbers',
        '.netflix-actions-bar',
        '.auth-tabs',
        '.adv-type-selector',
        '.adv-genres-grid',
        '.search-bottom-bar',
        '.top-nav-bar'
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
    let lastContentFocus = null;
    let navigationRoot = document.body;

    function activeModal() {
        const modals = Array.from(document.querySelectorAll('.modal:not(.hidden), .update-modal:not(.hidden)'));
        return modals.length ? modals[modals.length - 1] : null;
    }

    function activeRoot() {
        return activeModal() || document.body;
    }

    function isAvailable(element, root = activeRoot()) {
        if (!(element instanceof HTMLElement)) return false;
        if (element.classList.contains('tv-skip-focus')) return false;
        if (element.matches('.see-all')) return false;
        if (element.matches('.movie-card .fav-btn')) return false;
        if (element.closest('.hidden, [aria-hidden="true"]')) return false;
        if (element.hasAttribute('disabled')) return false;
        if (root !== document.body && !root.contains(element)) return false;

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 2 && rect.height > 2;
    }

    function decorateFocusableElements() {
        document.querySelectorAll('.movie-card, .genre-chip, .see-all').forEach(element => {
            element.tabIndex = 0;
            if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
        });

        document.querySelectorAll('.movie-card .fav-btn').forEach(button => {
            button.tabIndex = -1;
            button.classList.add('tv-skip-focus');
        });

        document.querySelectorAll([
            '.cards-row', '.genre-grid', '.results-grid', '.search-mode-tabs', '.mood-pills',
            '.quick-filter-bar', '.pagination-bar', '.page-numbers', '.netflix-actions-bar',
            '.auth-tabs', '.adv-type-selector', '.adv-genres-grid', '.search-bottom-bar', '.top-nav-bar'
        ].join(',')).forEach((row, index) => {
            if (!row.dataset.tvRow) row.dataset.tvRow = `row-${index}`;
        });
    }

    function candidates() {
        const root = activeRoot();
        const all = Array.from(root.querySelectorAll(CANDIDATE_SELECTOR));
        return all.filter((element, index) => isAvailable(element, root) && all.indexOf(element) === index);
    }

    function rowFor(element) {
        return element?.closest?.(ROW_SELECTOR) || null;
    }

    function scrollFocusedIntoView(element) {
        const horizontal = element.closest('.cards-row, .genre-grid, .results-grid, .mood-pills, .quick-filter-bar, .netflix-actions-bar, .adv-genres-grid');
        if (horizontal && horizontal.scrollWidth > horizontal.clientWidth) {
            const elementCenter = element.offsetLeft + (element.offsetWidth / 2);
            const targetLeft = Math.max(0, elementCenter - (horizontal.clientWidth / 2));
            horizontal.scrollTo({ left: targetLeft, behavior: 'auto' });
        }

        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
    }

    function focusElement(element) {
        if (!isAvailable(element)) return false;

        document.querySelectorAll('.tv-row-active').forEach(row => row.classList.remove('tv-row-active'));
        const row = rowFor(element);
        if (row) row.classList.add('tv-row-active');

        try {
            element.focus({ preventScroll: true });
        } catch (error) {
            element.focus();
        }

        if (!activeModal()) lastContentFocus = element;
        scrollFocusedIntoView(element);
        return document.activeElement === element;
    }

    function preferredCandidate(list) {
        const modal = activeModal();
        if (modal) {
            const modalPreferred = [
                '.btn-play-trailer',
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
                : ['#tvFeaturedOpen', '#popularMoviesRow .movie-card', '#query', '.mode-tab.active'];

        for (const selector of selectors) {
            const found = document.querySelector(selector);
            if (found && list.includes(found)) return found;
        }
        return list[0] || null;
    }

    function ensureFocus(forcePreferred = false) {
        if (!enabled) return false;
        decorateFocusableElements();
        const list = candidates();
        if (!list.length) return false;

        if (!forcePreferred && list.includes(document.activeElement)) return true;
        return focusElement(preferredCandidate(list));
    }

    function sameRowTarget(current, direction, list) {
        const row = rowFor(current);
        if (!row) return null;
        const rowItems = list.filter(element => rowFor(element) === row);
        const index = rowItems.indexOf(current);
        if (index < 0) return null;
        if (direction === 'left' && index > 0) return rowItems[index - 1];
        if (direction === 'right' && index < rowItems.length - 1) return rowItems[index + 1];
        return current;
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
            if (rowFor(candidate) === currentRow && currentRow) continue;

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

            const horizontalOverlap = Math.max(0, Math.min(currentRect.right, rect.right) - Math.max(currentRect.left, rect.left));
            const verticalOverlap = Math.max(0, Math.min(currentRect.bottom, rect.bottom) - Math.max(currentRect.top, rect.top));
            const alignmentBonus = (direction === 'up' || direction === 'down')
                ? Math.min(180, horizontalOverlap)
                : Math.min(180, verticalOverlap);
            const score = (primary * 10) + (secondary * 1.35) - alignmentBonus;

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
            const rowTarget = sameRowTarget(current, direction, list);
            if (rowTarget) return rowTarget === current ? true : focusElement(rowTarget);
        }

        const target = spatialTarget(current, direction, list);
        return target ? focusElement(target) : true;
    }

    function activateCurrent() {
        const list = candidates();
        const current = list.includes(document.activeElement) ? document.activeElement : preferredCandidate(list);
        if (!current) return false;
        if (document.activeElement !== current) focusElement(current);

        if (current.matches('textarea, input')) {
            current.focus();
            current.click();
            return true;
        }

        current.click();
        window.setTimeout(() => ensureFocus(false), 60);
        return true;
    }

    function closeModalById(modalId, closeId) {
        const modal = document.getElementById(modalId);
        if (!modal || modal.classList.contains('hidden')) return false;
        const restoreTarget = lastContentFocus;
        document.getElementById(closeId)?.click();
        window.setTimeout(() => {
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
            window.setTimeout(() => ensureFocus(true), 50);
            return true;
        }

        if (!document.getElementById('resultsSection')?.classList.contains('hidden')) {
            document.getElementById('backToDiscoverBtn')?.click();
            window.setTimeout(() => ensureFocus(true), 50);
            return true;
        }
        return false;
    }

    function handleNativeKey(direction) {
        if (!enabled) return false;
        document.body.classList.add('tv-focus-active');
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

    function scheduleRefresh() {
        if (refreshFrame) cancelAnimationFrame(refreshFrame);
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = null;
            decorateFocusableElements();
            const root = activeRoot();
            const modalJustOpened = root !== document.body && root !== navigationRoot;
            navigationRoot = root;
            if (modalJustOpened) ensureFocus(true);
            else if (!candidates().includes(document.activeElement)) ensureFocus(false);
        });
    }

    function addRemoteHint() {
        if (document.querySelector('.tv-remote-hint')) return;
        const hint = document.createElement('div');
        hint.className = 'tv-remote-hint';
        hint.textContent = '← → ↑ ↓ Gezin   •   OK Seç   •   Geri Çık';
        document.body.appendChild(hint);
        window.setTimeout(() => {
            hint.style.opacity = '0.28';
        }, 8000);
    }

    function enable(flag = true) {
        enabled = Boolean(flag);
        document.body.classList.toggle('tv-nav-ready', enabled);
        document.body.classList.toggle('tv-focus-active', enabled);

        if (!enabled) {
            observer?.disconnect();
            observer = null;
            document.querySelector('.tv-remote-hint')?.remove();
            return false;
        }

        decorateFocusableElements();
        navigationRoot = activeRoot();
        addRemoteHint();
        if (!observer) {
            observer = new MutationObserver(scheduleRefresh);
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'disabled', 'aria-hidden']
            });
        }
        window.setTimeout(() => ensureFocus(true), 80);
        return true;
    }

    function refresh(preferredSelector) {
        if (!enabled) return false;
        decorateFocusableElements();
        if (preferredSelector) {
            const target = document.querySelector(preferredSelector);
            if (target && isAvailable(target)) return focusElement(target);
        }
        return ensureFocus(false);
    }

    window.addEventListener('keydown', handleKeyboard, true);
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
