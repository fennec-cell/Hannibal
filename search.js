(function () {
    'use strict';

    /* ---------- Разделы портала (id совпадают с <section id="..."> в index.html) ---------- */
    var SECTIONS = [
        { id: 'hero',       name: 'Главная' },
        { id: 'characters', name: 'Персонажи' },
        { id: 'plot',       name: 'Сюжет' },
        { id: 'symbols',    name: 'Символика' },
        { id: 'kitchen',    name: 'Высокая кухня' },
        { id: 'game',       name: 'Игра Уилла' },
        { id: 'playlist',   name: 'Плейлист' },
        { id: 'test',       name: 'Психо-тест' }
    ];

    var index = null;    // поисковый индекс
    var results = [];    // текущие результаты
    var activeIdx = -1;  // индекс выбранного результата

    function $(sel) { return document.querySelector(sel); }
    function overlay()  { return $('#search-overlay'); }
    function inputEl()  { return $('#search-input'); }
    function listBox()  { return $('#search-results'); }

    /* ---------- Нормализация текста ---------- */
    function norm(s) {
        return String(s).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function highlight(htmlTitle, words) {
        if (!words || !words.length) return htmlTitle;
        var re = new RegExp('(' + words.map(function (w) {
            return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }).join('|') + ')', 'gi');
        return htmlTitle.replace(re, '<mark>$1</mark>');
    }

    /* ---------- Построение индекса ---------- */
    function buildIndex() {
        var list = [];
        SECTIONS.forEach(function (sec) {
            var root = document.getElementById(sec.id);
            if (!root) return;

            // Сам раздел — как «вход» в поиск
            list.push({
                section: sec, title: sec.name, titleN: norm(sec.name),
                textN: 'раздел портала', el: root, baseScore: 2
            });

            // Заголовки, названия серий, имена персонажей и их карточки
            root.querySelectorAll('h1, h2, h3, h4, .ep-title, .char-name').forEach(function (h) {
                var title = String(h.textContent).replace(/\s+/g, ' ').trim().slice(0, 90);
                if (!title) return;

                var block = h.closest('.episode-card, .char-card, .recipe-card, .symbol-card, .season-block') || h.parentElement;
                var text = '';
                if (block && block !== root) {
                    text = norm(block.textContent).slice(0, 400);
                }
                list.push({
                    section: sec, title: title, titleN: norm(title),
                    textN: text, el: h, baseScore: 0
                });
            });
        });
        index = list;
    }

    /* ---------- Поиск ---------- */
    function makeSnippet(text, words) {
        if (!text) return '';
        var pos = -1;
        words.forEach(function (w) {
            var p = text.indexOf(w);
            if (p >= 0 && (pos < 0 || p < pos)) pos = p;
        });
        if (pos < 0) pos = 0;
        var start = Math.max(0, pos - 60);
        return (start > 0 ? '…' : '') + text.slice(start, start + 200) + '…';
    }

    function search(q) {
        var query = norm(q);
        if (query.length < 2 || !index) return [];
        var words = query.split(' ').filter(function (w) { return w.length > 1; });
        if (!words.length) return [];

        var found = [];
        index.forEach(function (item) {
            var score = item.baseScore || 0;
            words.forEach(function (w) {
                var pT = item.titleN.indexOf(w);
                var pX = item.textN.indexOf(w);
                if (pT === 0) score += 6;          // начало заголовка
                else if (pT > 0) score += 3;       // внутри заголовка
                else if (pX >= 0) score += 1;      // внутри текста блока
                else score -= 3;                   // слово не найдено — штраф
            });
            if (score > 0) found.push({ item: item, score: score });
        });

        found.sort(function (a, b) { return b.score - a.score; });
        return found.slice(0, 12).map(function (f) {
            var item = f.item;
            return {
                section: item.section, title: item.title, el: item.el,
                snippet: makeSnippet(item.textN, words),
                words: words
            };
        });
    }

    /* ---------- Отрисовка результатов ---------- */
    function render() {
        var box = listBox();
        if (!box) return;

        if (!results.length) {
            var q = inputEl().value.trim();
            box.innerHTML =
                '<div class="search-empty">' +
                (q.length < 2
                    ? 'Введите минимум 2 символа — например: «Уилл», «Вендиго», «Беделия»'
                    : 'Ничего не найдено. Попробуйте другой запрос.') +
                '</div>';
            activeIdx = -1;
            return;
        }

        box.innerHTML = results.map(function (r, i) {
            return '<button type="button" data-idx="' + i + '" class="search-item">' +
                '<div class="search-row">' +
                '<span class="search-tag">' + esc(r.section.name) + '</span>' +
                '<span class="search-title">' + highlight(esc(r.title), r.words) + '</span>' +
                '</div>' +
                (r.snippet ? '<div class="search-snippet">' +
                    highlight(esc(r.snippet), r.words) + '</div>' : '') +
                '</button>';
        }).join('');

        setActive(0);
    }

    function setActive(i) {
        activeIdx = i;
        listBox().querySelectorAll('.search-item').forEach(function (el, k) {
            el.classList.toggle('active', k === i);
        });
        var act = listBox().querySelector('.search-item.active');
        if (act) act.scrollIntoView({ block: 'nearest' });
    }

    /* ---------- Переход к результату ---------- */
    function goTo(i) {
        var r = results[i];
        if (!r) return;
        closeSearch();
        if (typeof showSection === 'function') showSection(r.section.id);
        setTimeout(function () {
            if (r.el && r.el.scrollIntoView) {
                r.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 400);
    }

    /* ---------- Открытие / закрытие ---------- */
    function openSearch() {
        if (!index) buildIndex();
        var ov = overlay();
        if (!ov) return;
        ov.classList.remove('hidden');
        results = [];
        render();
        var inp = inputEl();
        if (inp) { inp.value = ''; inp.focus(); }
    }

    function closeSearch() {
        var ov = overlay();
        if (ov) ov.classList.add('hidden');
    }

    /* ---------- События ---------- */
    function bindEvents() {
        var ov = overlay();
        if (!ov || ov.dataset.searchBound) return;
        ov.dataset.searchBound = '1';

        // Ввод с небольшой задержкой (debounce)
        var timer = null;
        inputEl().addEventListener('input', function () {
            clearTimeout(timer);
            timer = setTimeout(function () {
                results = search(inputEl().value);
                render();
            }, 150);
        });

        // Клавиатура в поле ввода
        inputEl().addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length) setActive(Math.min(activeIdx + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) setActive(Math.max(activeIdx - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (results.length) goTo(Math.max(activeIdx, 0)); }
            else if (e.key === 'Escape') { closeSearch(); }
        });

        // Клик по результату / по фону / по крестику
        listBox().addEventListener('click', function (e) {
            var btn = e.target.closest('.search-item');
            if (btn) goTo(parseInt(btn.dataset.idx, 10));
        });
        ov.addEventListener('click', function (e) {
            if (e.target === ov) closeSearch();
        });
        var closeBtn = $('#search-close');
        if (closeBtn) closeBtn.addEventListener('click', closeSearch);

        // Глобальные горячие клавиши
        document.addEventListener('keydown', function (e) {
            // Ctrl+K / Cmd+K — открыть или закрыть
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                if (overlay().classList.contains('hidden')) openSearch(); else closeSearch();
                return;
            }
            // "/" — открыть (если пользователь не печатает в поле)
            if (e.key === '/' && overlay().classList.contains('hidden')) {
                var t = e.target;
                if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
                e.preventDefault();
                openSearch();
                return;
            }
            // Escape — закрыть
            if (e.key === 'Escape' && !overlay().classList.contains('hidden')) {
                closeSearch();
            }
        });
    }

    /* ---------- Инициализация ---------- */
    function init() {
        bindEvents();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* ---------- Глобальный API ---------- */
    window.openSearch = openSearch;
    window.closeSearch = closeSearch;
})();
