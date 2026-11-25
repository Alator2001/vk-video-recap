/* =====================================================================
   «Продолжить с пересказом» — прототип доработки VK Видео (концепт, не продукт VK)
   Один файл без сборки и зависимостей. Данные — data.js (window.DATA), фон — fx.js.

   ПРОДУКТ (то, что уходит в разработку по SPEC.md):
     состояние и утилиты · аналитика track() · превью · экран «Моё» · список
     «Продолжить просмотр» · экран видео и плеер · шторка пересказа (5.3) ·
     панель глав и «Описание» (входы этапа 2 выключены флагом STAGE2) ·
     плашка «Что было до X» с таймером и правилом 2 пропусков (5.2, раздел 6) ·
     снекбар · навигация между экранами
   ТОЛЬКО ДЛЯ ДЕМОНСТРАЦИИ (в продукт не переносится):
     панель проверяющего и сценарии (runTour) · демо-курсор и окошко шагов
     (runGhostDemo, STEPS) · подсветка рабочих зон при нажатии мимо ·
     переключатели версии и темы · масштаб телефона-рамки
   Названия событий аналитики — как в SPEC.md, раздел 9.
   ===================================================================== */
(() => {
  'use strict';
  const D = window.DATA;
  let M = D.videos[D.continueList[0]];   // видео, открытое сейчас
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- состояние ---------- */
  const S = {
    mode: 'after',          // before | after
    scenario: 'days',       // days | hours | nospeech | error
    t: M.stoppedAt,
    playing: false,
    sheetOpen: false,
    errorResolved: false,
    skips: 0,               // сколько раз подряд пересказ проигнорировали
    autoOff: false,         // автопоказ выключен после 2 пропусков подряд
    hideTimer: null,
    tickTimer: null,
  };
  const GAP = { days: 72, hours: 2, nospeech: 72, error: 72 }; // часов с прошлого просмотра

  /* ---------- утилиты ---------- */
  const pad = n => String(n).padStart(2, '0');
  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }
  function fmtLeft(sec) {
    const h = Math.floor(sec / 3600), m = Math.round(sec % 3600 / 60);
    return 'Осталось ' + (h ? `${h} ч ${m} мин` : `${m} мин`);
  }
  const chapterIndexAt = t => { let i = 0; M.chapters.forEach((c, k) => { if (t >= c.t) i = k; }); return i; };
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- аналитика (лог в панели) ---------- */
  const evList = $('#events');
  function track(name, params = {}) {
    const empty = $('.events__empty', evList); if (empty) empty.remove();
    const cnt = $('#evCount'); if (cnt) { cnt.hidden = false; cnt.textContent = evList.children.length + 1; }
    const li = document.createElement('li');
    const p = Object.entries(params).map(([k, v]) => `${k}: ${v}`).join(', ');
    li.innerHTML = `<b>${name}</b>${p ? ' { ' + esc(p) + ' }' : ''}`;
    evList.prepend(li);
    while (evList.children.length > 30) evList.lastChild.remove();
  }

  /* ---------- превью ---------- */
  function thumb(th, o = {}) {
    const size = o.big ? 30 : o.wide ? 24 : 17;
    return `<div class="thumb">
      <div class="thumb__art${th.img ? ' thumb__art--img' : ''}" style="${th.img ? `background:#222 url('${th.img}') center/cover` : `background:linear-gradient(135deg,${th.from},${th.to})`}">
        ${th.text ? `<span class="thumb__txt" style="font-size:${size}px;color:${th.accent}">${esc(th.text)}</span>` : ''}
        ${th.img ? '' : '<i class="thumb__face"></i>'}
      </div>
      ${o.ai ? `<span class="ai-tag"><svg viewBox="0 0 24 24"><use href="#i-spark"/></svg>Есть пересказ</span>` : ''}
      ${o.left ? `<span class="thumb__left">${o.left}</span>` : ''}
      ${o.dur ? `<span class="thumb__dur">${o.dur}</span>` : ''}
      ${o.progress != null && o.progress > 0 ? `<div class="thumb__prog"><i style="width:${Math.min(100, o.progress)}%"></i></div>` : ''}
    </div>`;
  }
  const chapterOf = (v, t) => { let c = v.chapters[0]; v.chapters.forEach(x => { if (t >= x.t) c = x; }); return c; };
  function asItem(x) {
    const id = typeof x === 'string' ? x : x.ref;
    const v = id && D.videos[id];
    if (!v) return x;
    return { id: v.id, title: v.title, channel: v.channel.name, duration: v.duration, position: v.stoppedAt,
      chapter: chapterOf(v, v.stoppedAt).title, thumb: v.thumb, live: true };
  }

  /* ---------- экран «Моё» ---------- */
  function renderMoe() {
    $('#continueRow').innerHTML = D.continueList.map(asItem).map(v => `
      <button class="card card--continue${v.live ? ' is-live' : ''}" data-open="${v.id}" data-src="continue_shelf">
        ${thumb(v.thumb, { wide: true, left: fmtLeft(v.duration - v.position), progress: v.position / v.duration * 100, ai: v.live })}
        <div class="card__title">${esc(v.title)}</div>
        <div class="card__stop"><svg viewBox="0 0 24 24"><use href="#i-resume"/></svg><span>Остановились: «${esc(v.chapter)}»</span></div>
      </button>`).join('');

    $('#historyRow').innerHTML = D.history.map(asItem).map(v => `
      <button class="card${v.live ? ' is-live' : ''}" data-open="${v.id}" data-src="history">
        ${thumb(v.thumb, { dur: fmt(v.duration), progress: v.position / v.duration * 100 })}
        <div class="card__title">${esc(v.title)}</div>
        <div class="card__ch"><span>${esc(v.channel)}</span><svg class="verified" viewBox="0 0 24 24"><use href="#i-verified"/></svg></div>
      </button>`).join('');

    $('#laterRow').innerHTML = D.later.map(v => `
      <button class="card" data-open="${v.id}" data-src="later">
        ${thumb(v.thumb, { dur: fmt(v.duration) })}
        <div class="card__title">${esc(v.title)}</div>
        <div class="card__ch"><span>${esc(v.channel)}</span></div>
      </button>`).join('');
  }

  /* ---------- экран «Продолжить просмотр» ---------- */
  function renderList(kind = 'continue') {
    const items = kind === 'history' ? D.history : D.continueList;
    $('#continueRows').innerHTML = items.map(asItem).map(v => `
      <button class="row${v.live ? ' is-live' : ''}" data-open="${v.id}" data-src="${kind}_list">
        ${thumb(v.thumb, { dur: fmt(v.duration), progress: v.position / v.duration * 100 })}
        <div class="row__body">
          <div class="row__title">${esc(v.title)}</div>
          <div class="card__ch"><span>${esc(v.channel)}</span><svg class="verified" viewBox="0 0 24 24"><use href="#i-verified"/></svg></div>
          ${v.live ? `<div class="card__stop"><svg viewBox="0 0 24 24"><use href="#i-resume"/></svg><span>${fmtLeft(v.duration - v.position)} · «${esc(v.chapter)}»</span></div>` : ''}
          ${v.live ? '<span class="row__ai"><svg viewBox="0 0 24 24"><use href="#i-spark"/></svg>Есть пересказ</span>' : ''}
        </div>
        <span class="row__more"><svg viewBox="0 0 24 24"><use href="#i-more"/></svg></span>
      </button>`).join('');
  }

  function setAvatar(el, img, initials, hue) {
    el.textContent = img ? '' : initials;
    el.style.background = img ? `#2a2a2c url('${img}') center/cover`
      : `linear-gradient(135deg,hsl(${hue} 70% 45%),hsl(${hue + 60} 60% 35%))`;
  }

  /* ---------- экран видео: статичная часть ---------- */
  function renderVideoStatic() {
    $('#vTitle').textContent = M.title;
    $('#vMeta').textContent = M.meta;
    $('#vChName').textContent = M.channel.name;
    $('#vChSubs').textContent = M.channel.subs;
    $('#vLikes').textContent = M.likes;
    $('#vComments').textContent = M.comments;
    $('#vComment').textContent = M.comment.text;
    setAvatar($('#vCommentAv'), M.comment.img, M.comment.av, 210);
    setAvatar($('#vChAvatar'), D.avatars[M.channel.name], M.channel.initials, M.channel.hue);
    $('#timeDur').textContent = fmt(M.duration);
    const pv = $('#playerVideo');
    if (M.clip && pv.getAttribute('src') !== M.clip) { pv.poster = M.poster || ''; pv.src = M.clip; pv.load(); }
    const hue = str => [...str].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
    $('#alsoList').innerHTML = (M.also || D.also).map(v => `
      <div class="also__item">
        ${thumb(v.thumb, { big: true, dur: fmt(v.duration) })}
        <div class="also__row">
          ${D.avatars[v.channel]
            ? `<div class="avatar" style="background:#2a2a2c url('${D.avatars[v.channel]}') center/cover"></div>`
            : `<div class="avatar" style="background:linear-gradient(135deg,hsl(${hue(v.channel)} 65% 45%),hsl(${hue(v.channel) + 50} 55% 32%))">${v.channel.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>`}
          <div class="also__info"><div class="also__t">${esc(v.title)}</div><div class="also__m">${esc(v.channel)} · ${v.views}</div></div>
          <span class="row__more"><svg viewBox="0 0 24 24"><use href="#i-more"/></svg></span>
        </div>
      </div>`).join('');

    // сегменты прогресса по главам
    const track = $('#barTrack');
    track.innerHTML = M.chapters.map((c, i) => {
      const end = (M.chapters[i + 1] || { t: M.duration }).t;
      return `<div class="seg" style="flex:${end - c.t}"><i></i></div>`;
    }).join('');
  }

  /* ---------- плеер ---------- */
  const player = $('#player'), bar = $('#bar'), thumbEl = $('#barThumb');
  function updatePlayer() {
    $('#timeCur').textContent = fmt(S.t);
    const ci = chapterIndexAt(S.t);
    $('#chapterLabel').textContent = M.chapters[ci].title;
    $$('.seg', bar).forEach((seg, i) => {
      const st = M.chapters[i].t, en = (M.chapters[i + 1] || { t: M.duration }).t;
      const p = S.t >= en ? 100 : S.t <= st ? 0 : (S.t - st) / (en - st) * 100;
      seg.firstChild.style.width = p + '%';
    });
    // позиция бегунка с учётом зазоров между сегментами
    const segs = $$('.seg', bar), seg = segs[ci];
    if (seg) {
      const st = M.chapters[ci].t, en = (M.chapters[ci + 1] || { t: M.duration }).t;
      const x = seg.offsetLeft + seg.offsetWidth * Math.min(1, (S.t - st) / (en - st));
      thumbEl.style.left = x + 'px';
    }
  }
  function setPlaying(on) {
    S.playing = on;
    player.classList.toggle('is-paused', !on);
    $('#playBtn use').setAttribute('href', on ? '#i-pause' : '#i-play');
    $('#playBtn').setAttribute('aria-label', on ? 'Пауза' : 'Смотреть');
    clearInterval(S.tickTimer);
    const pv = $('#playerVideo');
    if (on) pv.play().catch(() => {}); else pv.pause();
    if (on) {
      S.tickTimer = setInterval(() => { S.t = Math.min(M.duration, S.t + 1); updatePlayer(); }, 1000);
      scheduleHide();
    } else { showControls(false); }
  }
  function showControls(autoHide = true) {
    player.classList.remove('is-clean');
    if (autoHide) scheduleHide(); else clearTimeout(S.hideTimer);
  }
  function scheduleHide() {
    clearTimeout(S.hideTimer);
    S.hideTimer = setTimeout(() => { if (S.playing) player.classList.add('is-clean'); }, 2600);
  }
  function seekTo(t, animate = false) {
    S.t = Math.max(0, Math.min(M.duration, t));
    if (animate) { bar.classList.add('is-anim'); setTimeout(() => bar.classList.remove('is-anim'), 750); }
    // ролик короткий: при перемотке меняем кадр, чтобы было видно «прыжок» по видео
    const pv = $('#playerVideo');
    if (pv.duration) pv.currentTime = (S.t * 0.37) % pv.duration;
    updatePlayer();
  }
  $('#playerFrame').addEventListener('click', () => {
    if (player.classList.contains('is-clean')) showControls(); else if (S.playing) player.classList.add('is-clean');
  });
  $('#playerUi').addEventListener('click', e => { if (e.target === e.currentTarget && S.playing) player.classList.add('is-clean'); });
  $('#playBtn').addEventListener('click', e => { e.stopPropagation(); setPlaying(!S.playing); });

  // перемотка по полосе
  const tip = $('#barTip');
  function timeFromX(clientX) {
    const r = $('#barTrack').getBoundingClientRect();
    const scale = r.width / $('#barTrack').offsetWidth || 1;
    const x = (clientX - r.left) / scale;
    const segs = $$('.seg', bar);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], st = M.chapters[i].t, en = (M.chapters[i + 1] || { t: M.duration }).t;
      if (x <= s.offsetLeft + s.offsetWidth + 1.5 || i === segs.length - 1) {
        const p = Math.max(0, Math.min(1, (x - s.offsetLeft) / s.offsetWidth));
        return st + p * (en - st);
      }
    }
    return 0;
  }
  let dragging = false;
  bar.addEventListener('pointerdown', e => { dragging = true; bar.setPointerCapture(e.pointerId); showControls(false); onBarMove(e); });
  bar.addEventListener('pointermove', e => { if (dragging) onBarMove(e); });
  bar.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; tip.classList.remove('is-on'); if (S.playing) scheduleHide(); });
  function onBarMove(e) {
    const t = timeFromX(e.clientX); seekTo(t);
    tip.textContent = `${fmt(t)} · ${M.chapters[chapterIndexAt(t)].title}`;
    tip.style.left = thumbEl.style.left; tip.classList.add('is-on');
  }
  function highlightChapter(i) { $$('.seg', bar).forEach((s, k) => s.classList.toggle('is-hl', k === i)); }

  /* ---------- шторка пересказа ---------- */
  const sheet = $('#sheet'), scrim = $('#sheetScrim');
  function openSheet(trigger) {
    if (peek.classList.contains('is-on')) hidePeek('open');
    if (trigger === 'chip' || trigger === 'description') {
      S.skips = 0;
      if (S.autoOff) {   // сам пришёл за пересказом — значит, он полезен: возвращаем автопоказ
        S.autoOff = false;
        track('recap_autoshow_on', { reason: 'manual_open', via: trigger });
        setTimeout(() => snack('Пересказ снова будет появляться, когда вы вернётесь к видео'), 600);
      }
      updateStyleNote();
    }
    S.sheetOpen = true;
    setPlaying(false);
    $('#sheetSub').innerHTML = `До&nbsp;${fmt(M.stoppedAt)} · смотрели ${GAP[S.scenario] >= 24 ? '3&nbsp;дня' : '2&nbsp;часа'} назад`;
    $('#btnContinue').innerHTML = `Продолжить с&nbsp;${fmt(M.stoppedAt)}`;
    $$('.feedback button').forEach(b => b.classList.remove('is-on'));

    // 1) скелетон, пока «генерируется» ответ
    $('#sheetBody').innerHTML = `<div class="skeleton">
      <div class="skeleton__status"><svg viewBox="0 0 24 24"><use href="#i-spark"/></svg>Собираем пересказ по&nbsp;субтитрам…</div>
      <div class="skeleton__row w1"></div><div class="skeleton__row w2"></div><div class="skeleton__row w3"></div>
      <div class="skeleton__row w1"></div><div class="skeleton__row w2"></div></div>`;
    scrim.classList.add('is-on'); document.body.classList.add('sheet-open');
    requestAnimationFrame(() => sheet.classList.add('is-on'));
    const latency = trigger === 'auto' ? 900 : 450;
    setTimeout(() => { if (S.sheetOpen) renderRecap(); }, latency);
    track('recap_shown', { video_id: M.id, trigger, gap_hours: GAP[S.scenario], position: M.stoppedAt, latency_ms: latency });
  }
  function renderRecap() {
    const now = M.chapters[chapterIndexAt(M.stoppedAt)];
    const items = M.recap.map((r, i) => `
      <button class="recap__item" style="animation-delay:${i * 70}ms" data-seek="${r.t}" data-idx="${i}" data-ch="${chapterIndexAt(r.t)}">
        <div class="recap__top"><span class="recap__tc">${fmt(r.t)}</span><span class="recap__dash"> — </span><span class="recap__title">${esc(r.title)}</span></div>
        <div class="recap__text">${esc(r.text)}</div>
      </button>`).join('');
    const nowItem = `
      <button class="recap__item recap__item--now" style="animation-delay:${M.recap.length * 70}ms" data-continue="1" data-ch="${chapterIndexAt(M.stoppedAt)}">
        <div class="recap__top"><span class="recap__next">Дальше — «${esc(now.title)}»</span></div>
      </button>`;
    const body = $('#sheetBody'), sk = body.querySelector('.skeleton');
    const put = () => { if (S.sheetOpen) body.innerHTML = `<div class="recap">${items}${nowItem}</div>`; };
    if (sk) { sk.classList.add('is-out'); setTimeout(put, 180); } else put();
  }
  function closeSheet(method) {
    if (!S.sheetOpen) return;
    S.sheetOpen = false;
    sheet.classList.remove('is-on'); scrim.classList.remove('is-on'); document.body.classList.remove('sheet-open');
    sheet.style.transform = '';
    highlightChapter(-1);
    if (method) track('recap_closed', { video_id: M.id, method });
  }
  $('#sheetBody').addEventListener('click', e => {
    const it = e.target.closest('.recap__item'); if (!it) return;
    if (it.dataset.continue) { closeSheet(); showControls(false); seekTo(M.stoppedAt, true); setTimeout(() => setPlaying(true), 650); track('recap_continue', { video_id: M.id, from: fmt(M.stoppedAt), via: 'now_item' }); return; }
    const t = +it.dataset.seek;
    closeSheet();
    showControls(false);
    seekTo(t, true);
    setTimeout(() => setPlaying(true), 650);
    track('recap_item_click', { video_id: M.id, item_index: it.dataset.idx, seek_to: fmt(t) });
  });
  $('#sheetBody').addEventListener('pointerover', e => {
    const it = e.target.closest('.recap__item'); highlightChapter(it ? +it.dataset.ch : -1);
  });
  $('#sheetBody').addEventListener('pointerleave', () => highlightChapter(-1));
  $('#btnContinue').addEventListener('click', () => { closeSheet(); seekTo(M.stoppedAt); setPlaying(true); track('recap_continue', { video_id: M.id, from: fmt(M.stoppedAt), via: 'button' }); });
  $('#btnChapter').addEventListener('click', () => {
    const st = M.chapters[chapterIndexAt(M.stoppedAt)].t;
    closeSheet(); showControls(false); seekTo(st, true); setTimeout(() => setPlaying(true), 650);
    track('recap_chapter_start', { video_id: M.id, seek_to: fmt(st) });
  });
  $('#sheetClose').addEventListener('click', () => closeSheet('close'));
  scrim.addEventListener('click', () => closeSheet('scrim'));
  $$('.feedback button').forEach(b => b.addEventListener('click', () => {
    $$('.feedback button').forEach(x => x.classList.toggle('is-on', x === b));
    track('recap_feedback', { video_id: M.id, value: b.dataset.fb === 'up' ? 'useful' : 'inaccurate' });
    if (b.dataset.fb === 'down') snack('Спасибо! Учтём при улучшении пересказов');
  }));
  // свайп шторки вниз
  (() => {
    let y0 = null, dy = 0;
    sheet.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || !e.target.closest('.sheet__handle, .sheet__head, .sheet__title, .sheet__sub')) return;
      y0 = e.clientY; dy = 0; sheet.classList.add('is-dragging'); sheet.setPointerCapture(e.pointerId);
    });
    sheet.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
    const end = () => { if (y0 == null) return; sheet.classList.remove('is-dragging'); y0 = null; if (dy > 90) closeSheet('swipe'); else sheet.style.transform = ''; };
    sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
  })();
  $('#recapChip').addEventListener('click', () => openSheet('chip'));
  $('#recapInfo').addEventListener('click', () => snack('Пересказ создан ИИ по субтитрам видео и может содержать неточности'));

  /* ---------- панель глав (по нажатию на название главы в плеере) + вкладка «✦ Пересказ» ---------- */
  const chSheet = $('#chSheet');
  let chTab = 'chapters';
  function renderChapters() {
    const hasRecap = STAGE2 && recapAvailable();
    $('#chTabs .ch-tabs__recap').hidden = !hasRecap;
    if (!hasRecap && chTab === 'recap') chTab = 'chapters';
    $$('#chTabs button').forEach(b => b.classList.toggle('is-on', b.dataset.tab === chTab));
    const ci = chapterIndexAt(S.t);
    if (chTab === 'chapters') {
      $('#chBody').innerHTML = `<div class="ch-list">${M.chapters.map((c, i) => `
        <button class="ch-row${i === ci ? ' is-now' : ''}${i < ci ? ' is-seen' : ''}" data-seek="${c.t}">
          <span class="ch-row__tc">${tc(c.t)}</span>
          <span class="ch-row__title">${esc(c.title)}</span>
          ${i === ci ? '<span class="ch-row__now">Сейчас</span>' : ''}
        </button>`).join('')}</div>`;
    } else {
      const now = chapterOf(M, M.stoppedAt);
      $('#chBody').innerHTML = `
        <div class="ch-recap__head">До ${fmt(M.stoppedAt)} · вот что было раньше</div>
        <div class="recap">${M.recap.map((r, i) => `
          <button class="recap__item" style="animation-delay:${i * 60}ms" data-seek="${r.t}">
            <div class="recap__top"><span class="recap__tc">${fmt(r.t)}</span><span class="recap__dash"> — </span><span class="recap__title">${esc(r.title)}</span></div>
            <div class="recap__text">${esc(r.text)}</div>
          </button>`).join('')}
          <button class="recap__item recap__item--now" style="animation-delay:${M.recap.length * 60}ms" data-seek="${M.stoppedAt}">
            <div class="recap__top"><span class="recap__next">Дальше — «${esc(now.title)}»</span></div>
          </button>
        </div>
        <button class="desc__recap-more ch-recap__go" data-seek="${M.stoppedAt}">Продолжить с ${fmt(M.stoppedAt)}</button>`;
    }
    $('#chBody').scrollTop = 0;
  }
  function openChapters(tab = 'chapters') {
    chTab = tab; renderChapters();
    chSheet.classList.add('is-on'); document.body.classList.add('desc-open');
    track('chapters_open', { video_id: M.id, tab: chTab });
  }
  const closeChapters = () => { chSheet.classList.remove('is-on'); if (!descSheet.classList.contains('is-on')) document.body.classList.remove('desc-open'); };
  $('#chapterLabel').addEventListener('click', e => { e.stopPropagation(); openChapters('chapters'); });
  $('#chClose').addEventListener('click', closeChapters);
  $$('#chTabs button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.tab === chTab) return;
    chTab = b.dataset.tab; renderChapters();
    track('chapters_tab', { video_id: M.id, tab: chTab });
    if (chTab === 'recap') {
      // ручное открытие пересказа: счётчик пропусков сбрасывается, автопоказ возвращается
      S.skips = 0;
      if (S.autoOff) { S.autoOff = false; track('recap_autoshow_on', { reason: 'manual_open', via: 'chapters' }); setTimeout(() => snack('Пересказ снова будет появляться, когда вы вернётесь к видео'), 400); }
      updateStyleNote();
      track('recap_shown', { video_id: M.id, trigger: 'chapters', position: M.stoppedAt });
    }
  }));
  $('#chBody').addEventListener('click', e => {
    const b = e.target.closest('[data-seek]'); if (!b) return;
    const t = +b.dataset.seek;
    closeChapters(); showControls(false); seekTo(t, true); setTimeout(() => setPlaying(true), 650);
    track(chTab === 'recap' ? 'recap_item_click' : 'chapter_click', { video_id: M.id, seek_to: fmt(t), via: 'chapters' });
  });

  /* ---------- шторка «Описание» ---------- */
  const descSheet = $('#descSheet');
  const tc = t => { const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60; return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(sec); };
  function openDesc() {
    const stats = M.meta.split(' · ').slice(0, 2).join(' · ');
    $('#descBody').innerHTML = `
      <div class="desc__stats">${esc(stats)}</div>
      ${STAGE2 && recapAvailable() ? `
      <div class="desc__recap">
        <div class="desc__recap-head"><svg viewBox="0 0 24 24"><use href="#i-spark"/></svg>Что было раньше</div>
        <div class="desc__recap-title">До ${fmt(M.stoppedAt)} · дальше «${esc(chapterOf(M, M.stoppedAt).title)}»</div>
        <div class="desc__recap-list">${M.recap.map(r => `<button class="desc__tc" data-seek="${r.t}"><span>${tc(r.t)}</span> — ${esc(r.title)}</button>`).join('')}</div>
        <button class="desc__recap-more" id="descRecapMore">Читать пересказ</button>
      </div>` : ''}
      <p class="desc__text">${esc(M.desc || '').replace(/\n/g, '<br>')}</p>
      <p class="desc__text">Таймкоды:</p>
      <div class="desc__tcs">${M.chapters.map(c => `<button class="desc__tc" data-seek="${c.t}"><span>${tc(c.t)}</span> — ${esc(c.title)}</button>`).join('')}</div>`;
    $('#descBody').scrollTop = 0;
    descSheet.classList.add('is-on'); document.body.classList.add('desc-open');
    track('description_open', { video_id: M.id });
  }
  const closeDesc = () => { descSheet.classList.remove('is-on'); document.body.classList.remove('desc-open'); };
  // MVP — два входа: автоматическая подсказка при возврате и кнопка в ряду действий.
  // Блок в «Описании» и вкладка в панели глав — этап 2 (см. SPEC), в прототипе выключены.
  const STAGE2 = false;
  const recapAvailable = () => S.mode === 'after' && S.scenario !== 'nospeech' && !(S.scenario === 'error' && !S.errorResolved);
  $('#vMetaBtn').addEventListener('click', openDesc);
  $('#descClose').addEventListener('click', closeDesc);
  $('#descBody').addEventListener('click', e => {
    if (e.target.closest('#descRecapMore')) {
      closeDesc(); track('recap_open_from_description', { video_id: M.id });
      setTimeout(() => openSheet('description'), 250); return;
    }
    const b = e.target.closest('.desc__tc'); if (!b) return;
    const t = +b.dataset.seek;
    showControls(false); seekTo(t, true); setTimeout(() => setPlaying(true), 650);
    track('description_timecode_click', { video_id: M.id, seek_to: fmt(t) });
  });

  /* ---------- неблокирующая плашка ---------- */
  const PEEK_MS = 8000, SKIP_LIMIT = 2;
  const peek = $('#peek');
  let peekTimer;
  // таймер с паузой: пока палец или курсор на плашке, она не исчезает
  let peekLeft = 0, peekStarted = 0, peekPaused = false;
  const ring = $('#peekRing');
  function runPeekTimer() {
    clearTimeout(peekTimer);
    peekStarted = performance.now();
    peekTimer = setTimeout(() => hidePeek('timeout'), peekLeft);
    ring.style.animationPlayState = 'running';
  }
  function pausePeekTimer() {
    if (!peek.classList.contains('is-on') || peekPaused) return;
    peekPaused = true; clearTimeout(peekTimer);
    peekLeft = Math.max(600, peekLeft - (performance.now() - peekStarted));
    ring.style.animationPlayState = 'paused';
  }
  // peekHold: в демо плашка «заморожена», пока проверяющий не нажмёт «Далее» — наведение и уход мышью таймер не запускают
  let peekHold = false;
  function resumePeekTimer() { if (!peekPaused || peekHold) return; peekPaused = false; runPeekTimer(); }
  function releasePeekHold() { if (!peekHold) return; peekHold = false; resumePeekTimer(); }
  const peekCardEl = $('#peek .peek__card');
  peekCardEl.addEventListener('pointerenter', pausePeekTimer);
  peekCardEl.addEventListener('pointerleave', resumePeekTimer);
  peekCardEl.addEventListener('touchstart', pausePeekTimer, { passive: true });
  peekCardEl.addEventListener('touchend', () => setTimeout(resumePeekTimer, 1200), { passive: true });

  function flyToButton(collapseBy) {
    const btn = $('#recapChip'), from = $('#peek .peek__icon');
    if (!btn || btn.offsetParent === null || !from) return;
    const scr = $('#screen').getBoundingClientRect(), k = scr.width / $('#screen').offsetWidth || 1;
    const a = from.getBoundingClientRect(), b = btn.querySelector('svg').getBoundingClientRect();
    const x0 = (a.left - scr.left) / k + a.width / k / 2, y0 = (a.top - scr.top) / k + a.height / k / 2;
    const x1 = (b.left - scr.left) / k + b.width / k / 2, y1 = (b.top - scr.top) / k + b.height / k / 2 - collapseBy;
    const fly = document.createElement('div');
    fly.className = 'fly';
    fly.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-spark"/></svg>';
    $('#screen').appendChild(fly);
    const midX = (x0 + x1) / 2, midY = Math.min(y0, y1) - 28;   // лёгкая дуга
    fly.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
      { transform: `translate(${midX}px, ${midY}px) scale(.9)`, opacity: 1, offset: .45 },
      { transform: `translate(${x1}px, ${y1}px) scale(.55)`, opacity: .9 }
    ], { duration: 620, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' }).onfinish = () => {
      fly.remove();
      btn.classList.remove('is-arrive'); void btn.offsetWidth; btn.classList.add('is-arrive');
      // подпись раскрывается на пару секунд — так иконка запоминается как «пересказ»
      btn.classList.add('is-labeled'); clearTimeout(btn._lbl);
      btn._lbl = setTimeout(() => btn.classList.remove('is-labeled'), 2600);
    };
  }
  const EASE_SHEET = 'cubic-bezier(.32,.72,0,1)';
  function peekHeightTo(to, ms, done) {
    peek.getAnimations().forEach(a => a.cancel());
    const from = peek.getBoundingClientRect().height / ((($('#screen').getBoundingClientRect().width) / $('#screen').offsetWidth) || 1);
    const target = to === 'auto' ? (() => { peek.style.height = 'auto'; const h = peek.offsetHeight; peek.style.height = from + 'px'; return h; })() : to;
    const a = peek.animate([{ height: from + 'px' }, { height: target + 'px' }], { duration: ms, easing: EASE_SHEET, fill: 'forwards' });
    a.onfinish = () => { peek.style.height = to === 'auto' ? 'auto' : to + 'px'; a.cancel(); done && done(); };
  }
  function showPeek() {
    $('#peekTitle').textContent = `Что было до ${fmt(M.stoppedAt)}`;
    peek.classList.remove('is-on', 'is-leaving');
    ring.style.animation = 'none'; void ring.getBoundingClientRect(); ring.style.animation = '';
    ring.style.animationDuration = PEEK_MS + 'ms';
    // место под плашкой раскрывается, карточка проявляется с небольшой задержкой (CSS transition-delay)
    peekHeightTo('auto', 440);
    requestAnimationFrame(() => peek.classList.add('is-on'));
    peekLeft = PEEK_MS; peekPaused = false; runPeekTimer();
    track('recap_peek_shown', { video_id: M.id, gap_hours: GAP[S.scenario], autohide_ms: PEEK_MS });
  }
  function hidePeek(method) {
    clearTimeout(peekTimer); peekPaused = false; peekHold = false;
    if (!peek.classList.contains('is-on') || peek.classList.contains('is-leaving')) return;
    // такт 1: карточка гаснет и чуть уменьшается; такт 2: место под ней плавно схлопывается
    const collapseBy = peek.offsetHeight;
    peek.classList.add('is-leaving');
    setTimeout(() => peekHeightTo(0, 380, () => peek.classList.remove('is-on', 'is-leaving')), 170);
    if (method === 'open') return;
    // пропуск: искра с плашки «улетает» в кнопку ✦ — видно, где пересказ теперь живёт
    flyToButton(collapseBy);
    S.skips++;
    track('recap_peek_skipped', { video_id: M.id, method, skips_in_row: S.skips });
    if (S.skips >= SKIP_LIMIT && !S.autoOff) { S.autoOff = true; track('recap_autoshow_off', { after_skips: S.skips }); }
    updateStyleNote();
  }
  $('#peekCard').addEventListener('click', () => {
    hidePeek('open'); S.skips = 0; updateStyleNote();
    track('recap_peek_open', { video_id: M.id });
    openSheet('peek');
  });
  $('#peekClose').addEventListener('click', () => hidePeek('close'));
  // решение, что показать при возврате (≥ 24 ч)
  function autoRecap() {
    setPlaying(true);   // видео не ждёт пользователя
    if (S.autoOff) {
      track('resume_without_recap', { reason: 'autoshow_off_after_skips' });
      snack(`Продолжаем с ${fmt(M.stoppedAt)}`);
      return;
    }
    setTimeout(showPeek, 180);
  }
  function updateStyleNote() {
    $('#styleNote').innerHTML = `Видео не останавливается: под плеером появляется плашка и через ${PEEK_MS / 1000}&nbsp;с сама сворачивается в кнопку. После ${SKIP_LIMIT} пропусков подряд автопоказ выключается, пересказ остаётся по кнопке ✦ под видео. Включается обратно сам, как только человек откроет пересказ вручную. <b>Пропусков подряд: ${Math.min(S.skips, SKIP_LIMIT)}/${SKIP_LIMIT}${S.autoOff ? ' — автопоказ выключен' : ''}</b>`;
  }

  /* ---------- снекбар ---------- */
  let snackTimer;
  function snack(text, action, onAction) {
    const el = $('#snackbar');
    $('#snackText').textContent = text;
    const b = $('#snackAction'); b.textContent = action || ''; b.onclick = () => { el.classList.remove('is-on'); onAction && onAction(); };
    el.classList.add('is-on'); clearTimeout(snackTimer);
    snackTimer = setTimeout(() => el.classList.remove('is-on'), action ? 5000 : 2800);
  }

  /* ---------- подсказки для проверяющего ---------- */
  // Что в прототипе реально работает. Клик мимо — рабочие зоны коротко подсвечиваются (как в Figma).
  const LIVE = `.promo__close, #vMetaBtn, #descSheet, #sheet, #chSheet, #chapterLabel, #peekCard, #peekClose, .card.is-live, .row.is-live, #continueAll, #historyAll, #listBack, .recap__item, #btnContinue, #btnChapter, #sheetClose, .feedback button,
    #recapChip:not(.is-hidden), #playBtn, #playerBack, .bar, #snackAction, #playerFrame, #playerUi, .sheet__handle, .sheet-scrim`;
  const screen = $('#screen');
  let flashTimer;
  screen.addEventListener('click', e => {
    if (e.target.closest(LIVE)) return;
    screen.classList.remove('show-hot'); void screen.offsetWidth; screen.classList.add('show-hot');
    clearTimeout(flashTimer); flashTimer = setTimeout(() => screen.classList.remove('show-hot'), 700);
  });
  // Пульсирующих подсказок нет: человек сам исследует прототип. Направляет панель сценариев,
  // а нажатие мимо коротко подсвечивает рабочие зоны.

  /* ---------- навигация ---------- */
  const viewMoe = $('#viewMoe'), viewVideo = $('#viewVideo'), viewList = $('#viewList');
  function showView(v) {
    const listShown = v === viewList || (v === viewVideo && S.from === viewList);
    viewMoe.classList.toggle('is-active', v === viewMoe);
    viewMoe.classList.toggle('is-under', v !== viewMoe);
    viewMoe.classList.toggle('is-pushed', listShown);
    viewList.classList.toggle('is-active', v === viewList);
    viewList.classList.toggle('is-under', v === viewVideo && S.from === viewList);
    viewVideo.classList.toggle('is-active', v === viewVideo);
    document.body.classList.toggle('is-video', v === viewVideo);
  }
  function openList(kind = 'continue') {
    const isHistory = kind === 'history';
    S.listKind = kind;
    $('#listTitle').textContent = isHistory ? 'История просмотра' : 'Продолжить просмотр';
    $('#listHint').hidden = isHistory;
    $('#listSearch').hidden = !isHistory;
    $('#listTrash').hidden = !isHistory;
    renderList(kind);
    showView(viewList); $('#viewList .scroll').scrollTop = 0;
    track(kind + '_list_open', { items: (isHistory ? D.history : D.continueList).length });
  }
  function openVideo(src) {
    S.from = viewList.classList.contains('is-active') ? viewList : viewMoe;
    showView(viewVideo);
    $('#videoScroll').scrollTop = 0;
    S.t = M.stoppedAt; updatePlayer();
    showControls(false);
    track('video_open', { video_id: M.id, source: src, version: S.mode === 'after' ? 'test' : 'control' });

    const chip = $('#recapChip');
    chip.classList.toggle('is-hidden', S.scenario === 'nospeech' || (S.scenario === 'error' && !S.errorResolved));

    if (S.mode === 'before') { setTimeout(() => setPlaying(true), 400); return; }
    setTimeout(() => {
      if (S.scenario === 'days') autoRecap();
      else if (S.scenario === 'hours') { setPlaying(true); snack(`Продолжаем с ${fmt(M.stoppedAt)}`); track('resume_without_recap', { reason: 'gap_lt_24h' }); }
      else if (S.scenario === 'nospeech') { setPlaying(true); snack(`Продолжаем с ${fmt(M.stoppedAt)}`); track('resume_without_recap', { reason: 'no_speech' }); }
      else if (S.scenario === 'error') {
        setPlaying(true);
        track('recap_error', { video_id: M.id, code: 'timeout' });
        snack('Не удалось загрузить пересказ', 'Повторить', () => { S.errorResolved = true; $('#recapChip').classList.remove('is-hidden'); track('recap_retry', { video_id: M.id }); openSheet('retry'); });
      }
    }, 380);
  }
  function closeVideo(toMoe) {
    // краевые случаи («без речи», «ошибка») относятся к одному видео: ушли с него — остальные видео снова обычные
    if (viewVideo.classList.contains('is-active') && (S.scenario === 'nospeech' || S.scenario === 'error')) {
      S.scenario = 'days'; S.errorResolved = false;
    }
    if (!ghostNav) stopGhost(); closeSheet(); closeDesc(); closeChapters(); setPlaying(false);
    clearTimeout(peekTimer); peek.getAnimations().forEach(a => a.cancel()); peek.style.height = '0px'; peek.classList.remove('is-on', 'is-leaving');
    $('#snackbar').classList.remove('is-on');
    const back = toMoe ? viewMoe : (S.from || viewMoe);
    showView(back);
  }
  $('#playerBack').addEventListener('click', e => { e.stopPropagation(); closeVideo(); });
  function onOpenClick(e) {
    const c = e.target.closest('[data-open]'); if (!c) return;
    const v = D.videos[c.dataset.open]; if (!v) return;
    M = v; renderVideoStatic();
    if (c.dataset.src !== 'history') track(c.dataset.src + '_click', { video_id: M.id, position: fmt(M.stoppedAt) });
    openVideo(c.dataset.src);
  }
  viewMoe.addEventListener('click', onOpenClick);
  viewList.addEventListener('click', onOpenClick);
  $('#continueAll').addEventListener('click', () => openList('continue'));
  $('#historyAll').addEventListener('click', () => openList('history'));
  $('#listBack').addEventListener('click', () => { showView(viewMoe); });

  /* ---------- панель ---------- */
  function setMode(m) {
    S.mode = m; document.body.dataset.mode = m;
    $$('[data-mode-set]').forEach(b => { const on = b.dataset.modeSet === m; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
    syncPill($('.mode-switch'));
    closeVideo(true); $('#moeScroll').scrollTop = 0;
  }
  function setScenario(sc) {
    closeVideo(true);   // сначала закрываем текущее видео — иначе сброс краевого случая в closeVideo перетрёт новый сценарий
    S.scenario = sc; S.errorResolved = false; S.skips = 0; S.autoOff = false;
  }
  const panel = $('#panel');
  const closePanel = () => panel.classList.remove('is-open');
  $('#conceptPill').addEventListener('click', () => panel.classList.add('is-open'));
  $('#panelClose').addEventListener('click', closePanel);

  /* ---------- сценарии для проверяющего: одно нажатие — сценарий открыт в телефоне ---------- */
  const TOUR = {
    days:     { vid: 'v_17', mode: 'after',  sc: 'days',     demo: true, hint: 'Курсор покажет сценарий по шагам. Нажимайте «Далее» в окошке рядом с телефоном (или клавишу →). Коснитесь экрана — и демо уступит вам.' },
    hours:    { vid: 'v_31', mode: 'after',  sc: 'hours',    demo: true, hint: 'Прошло всего 2 часа — подсказки нет. Курсор покажет, где найти пересказ. Нажимайте «Далее» в окошке рядом с телефоном.' },
    skips:    { vid: 'v_31', mode: 'after',  sc: 'days',     demo: true, hint: 'Человек закрывает подсказку на двух разных видео подряд — и она перестаёт появляться везде, не только в одном ролике. Нажимайте «Далее» в окошке рядом с телефоном.' },
    before:   { mode: 'before', sc: 'days',     hint: 'Так VK Видео работает сейчас: видео просто продолжается с места остановки — без полки «Продолжить просмотр» и без пересказа.' },
    nospeech: { vid: 'v_31', mode: 'after',  sc: 'nospeech', demo: true, hint: 'В видео нет речи — пересказывать нечего: ни подсказки, ни кнопки ✦. Видео просто продолжается.' },
    error:    { vid: 'v_17', mode: 'after',  sc: 'error',    demo: true, hint: 'Пересказ не загрузился, но видео всё равно играет. Нажимайте «Далее» — курсор нажмёт «Повторить».' },
  };
  function runTour(key) {
    const t = TOUR[key];
    setMode(t.mode); setScenario(t.sc);
    if (t.skips) { S.skips = 2; S.autoOff = true; updateStyleNote(); }
    $$('.tour__item').forEach(b => b.classList.toggle('is-on', b.dataset.tour === key));
    $('#tourHintText').textContent = t.hint;
    $('#tourHint').classList.remove('is-new'); void $('#tourHint').offsetWidth; $('#tourHint').classList.add('is-new');
    closePanel();
    track('tour_start', { scenario: key });
    stopGhost();
    setTimeout(() => { M = D.videos[t.vid || D.continueList[0]]; renderVideoStatic(); openVideo('tour'); if (t.demo) runGhostDemo(t.demo === true ? key : t.demo); }, 380);
  }

  /* ---------- демо-курсор: сам нажимает на плашку и открывает пересказ ---------- */
  const ghost = document.createElement('div');
  ghost.className = 'ghost'; ghost.setAttribute('aria-hidden', 'true');
  ghost.innerHTML = '<span class="ghost__tap"></span><svg class="ghost__arrow" viewBox="0 0 24 24"><path d="M5 2.8v16.6l4.3-4.1 2.7 6.2 3-1.3-2.7-6.1h6z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg><span class="ghost__label">Демо</span>';
  $('#screen').appendChild(ghost);
  let ghostRun = 0, ghostNav = false;   // ghostNav: «Назад» нажал сам демо-курсор — демо не прерываем
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function ghostPos(x, y, ms) {
    ghost.style.transition = ms ? `transform ${ms}ms cubic-bezier(.45,.05,.25,1), opacity .3s` : 'opacity .3s';
    ghost.style.transform = `translate(${x}px, ${y}px)`;
  }
  function ghostTarget(el) {   // центр элемента в координатах экрана телефона (с учётом масштаба рамки)
    const sr = $('#screen').getBoundingClientRect(), er = el.getBoundingClientRect();
    const k = sr.width / $('#screen').offsetWidth;
    return [(er.left + er.width * 0.42 - sr.left) / k, (er.top + er.height * 0.55 - sr.top) / k];
  }
  // Пошаговое демо: курсор делает одно действие, в окошке — одна простая фраза, дальше — по кнопке «Далее».
  // Окошко справа от телефона на уровне плеера; если места нет — под телефоном; на мобильном — сверху.
  const demoStatus = document.createElement('div');
  demoStatus.className = 'demo-status'; demoStatus.setAttribute('aria-live', 'polite');
  demoStatus.innerHTML = `<div class="ds__head"><span class="demo-status__live"></span><span class="ds__scn"></span></div>
    <div class="demo-status__text"></div>
    <div class="ds__foot"><span class="demo-status__steps"></span><button class="ds__next" type="button">Далее</button></div>`;
  $('#stage').appendChild(demoStatus);
  const DEMO_NAMES = { days: 'Вернулся через 3 дня', hours: 'Вернулся через 2 часа', skips: 'Дважды пропустил плашку', nospeech: 'Видео без речи', error: 'Ошибка загрузки' };
  let demoKind = 'days', nextResolve = null;
  function placeStatus() {
    if (innerWidth <= 760) { demoStatus.classList.remove('is-side'); demoStatus.style.left = ''; demoStatus.style.top = ''; return; }
    const st = $('#stage').getBoundingClientRect(), p = $('#phone').getBoundingClientRect();
    const side = st.right - p.right >= 330;
    demoStatus.classList.toggle('is-side', side);
    if (side) {
      demoStatus.style.left = (p.right - st.left + 32) + 'px';
      demoStatus.style.top = (p.top - st.top + p.height * 0.13) + 'px';
    } else { demoStatus.style.left = ''; demoStatus.style.top = ''; }
  }
  addEventListener('resize', placeStatus);
  function setStatus(text, i = 0, n = 0, done = false) {
    document.body.classList.toggle('demo-on', !!text);
    if (!text) { demoStatus.classList.remove('is-on', 'is-waiting', 'is-done'); return; }
    placeStatus();
    $('.ds__scn', demoStatus).textContent = DEMO_NAMES[demoKind] || '';
    const t = $('.demo-status__text', demoStatus);
    if (t.textContent !== text) { t.classList.remove('is-in'); void t.offsetWidth; t.textContent = text; t.classList.add('is-in'); }
    $('.demo-status__steps', demoStatus).innerHTML = n > 1
      ? Array.from({ length: n }, (_, k) => `<i class="${k < i || done ? 'is-done' : k === i ? 'is-now' : ''}"></i>`).join('') : '';
    $('.ds__next', demoStatus).textContent = done === 'edge' ? 'Готово' : done ? 'Закрыть' : 'Далее';
    demoStatus.classList.toggle('is-done', done);
    demoStatus.classList.add('is-on');
  }
  // «Далее»: следующий шаг запускает сам проверяющий — темп его, а не таймера
  function waitNext() {
    demoStatus.classList.add('is-waiting');
    return new Promise(res => { nextResolve = res; });
  }
  function pressNext() {
    if (!nextResolve) return;
    const r = nextResolve; nextResolve = null;
    demoStatus.classList.remove('is-waiting');
    track('demo_next', { scenario: demoKind });
    r();
  }
  $('.ds__next', demoStatus).addEventListener('click', pressNext);
  addEventListener('keydown', e => {
    if (!nextResolve || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pressNext(); }
  });
  function stopGhost() { ghostRun++; nextResolve = null; releasePeekHold(); ghost.classList.remove('is-on', 'is-press', 'is-drag'); setStatus(''); }
  // одна короткая фраза на шаг — что сейчас происходит на экране
  const STEPS = {
    days: ['Человек вернулся к видео через 3 дня. Под плеером — подсказка', 'Нажимает на неё — открывается пересказ', 'Вот всё, что было раньше', 'Можно пересмотреть главу с начала', 'Пересказ всегда под рукой — кнопка ✦ в ряду под видео', 'Можно оценить пересказ', 'Смотрим дальше — с того же места'],
    hours: ['Человек вернулся через 2 часа. Он всё помнит — подсказки нет', 'Если нужно — кнопка ✦ в ряду под видео', 'Вот что было раньше', 'Смотрим дальше — с того же места'],
    skips: ['Под плеером — подсказка с пересказом', 'Человек её закрыл', 'Открыл другое видео — подсказка снова тут', 'Снова закрыл', 'Третье видео — подсказки больше нет. Не надоедаем', 'Сам открыл пересказ — подсказка вернётся', 'Смотрим дальше — с того же места'],
    nospeech: ['В видео нет речи — пересказывать нечего. Ни подсказки, ни кнопки'],
    error: ['Пересказ не загрузился, но видео играет', 'Нажимает «Повторить» — пересказ появился', 'Смотрим дальше — с того же места'],
  };
  async function runGhostDemo(kind = 'days') {
    const id = ++ghostRun, alive = () => id === ghostRun;
    demoKind = kind;
    const P = 1.3;   // темп движений курсора
    const scr = $('#screen');
    let cx = scr.offsetWidth * 0.78, cy = scr.offsetHeight * 0.86;
    const step = async ms => { await wait(ms * P); if (!alive()) throw 0; };
    const say = i => setStatus(STEPS[kind][i], i, STEPS[kind].length);
    const next = async () => { await waitNext(); if (!alive()) throw 0; };
    const move = async (x, y, ms) => { cx = x; cy = y; ghostPos(x, y, ms * P); await step(ms + 120); };
    const moveTo = (el, ms) => { const [x, y] = ghostTarget(el); return move(x, y, ms); };
    async function tap(el, ms = 1000, label) {
      await moveTo(el, ms);
      await step(250);
      ghost.classList.add('is-press'); await wait(170); if (!alive()) throw 0;
      el.click(); track('demo_cursor_click', { target: label || el.id });
      await wait(260); ghost.classList.remove('is-press');
    }
    async function scrollDown(el, ms) {
      ms *= P;
      await moveTo(el, 700);
      const from = el.scrollTop, to = el.scrollHeight - el.clientHeight;
      if (to - from < 4) return;
      ghost.classList.add('is-drag');
      const y0 = cy, t0 = performance.now();
      ghostPos(cx, y0 - Math.min(160, el.clientHeight * 0.45), ms);
      await new Promise(res => {
        const f = now => {
          if (!alive()) return res();
          const p = Math.min(1, (now - t0) / ms), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          el.scrollTop = from + (to - from) * e;
          p < 1 ? requestAnimationFrame(f) : res();
        };
        requestAnimationFrame(f);
      });
      ghost.classList.remove('is-drag'); if (!alive()) throw 0;
      cy = y0 - Math.min(160, el.clientHeight * 0.45);
    }
    const appear = async () => { if (ghost.classList.contains('is-on')) return; ghostPos(cx, cy, 0); ghost.classList.add('is-on'); await step(350); };
    const waitRecap = async () => { for (let i = 0; i < 30 && !$('#sheetBody .recap'); i++) await step(100); };
    const waitPeek = async () => { for (let i = 0; i < 40 && !peek.classList.contains('is-on'); i++) await step(100); await step(500); pausePeekTimer(); peekHold = true; };
    // edge: краевой случай — самому его не воспроизвести, поэтому без «попробуйте сами»: последний шаг остаётся с кнопкой «Готово»
    async function finish(edge) {
      await step(400);
      if (ghost.classList.contains('is-on')) { await move(cx + 60, cy - 120, 700); ghost.classList.remove('is-on'); }
      if (edge) setStatus(STEPS[kind][STEPS[kind].length - 1], STEPS[kind].length - 1, STEPS[kind].length, 'edge');
      else setStatus('Готово! Теперь попробуйте сами', 0, STEPS[kind].length, true);
      await next();
      setStatus('');
    }
    try {
      if (kind === 'nospeech') {
        await step(600);
        return finish(true);
      }
      if (kind === 'error') {
        await step(400); clearTimeout(snackTimer);   // уведомление «Повторить» ждёт, пока проверяющий нажмёт «Далее»
        say(0); await next();
        say(1); await appear(); await tap($('#snackAction'), 1100, 'recap_retry'); await waitRecap(); await next();
        say(2); await tap($('#btnContinue'), 1000, 'recap_continue');
        return finish(true);
      }
      if (kind === 'skips') {
        // каждый возврат — другое видео: пропуски считаются подряд для человека, а не для одного ролика
        const reopen = async vid => {
          ghostNav = true;
          try { await tap($('#playerBack'), 900, 'player_back'); } finally { ghostNav = false; }
          await step(600);
          const card = $(`#continueRow [data-open="${vid}"]`);
          card.parentElement.scrollTo({ left: Math.max(0, card.offsetLeft - 16), behavior: 'smooth' });
          await step(500);
          await tap(card, 900, 'continue_shelf');
        };
        await waitPeek(); say(0); await next();
        say(1); await appear(); await tap($('#peekClose'), 1000, 'recap_peek_close'); await next();
        say(2); await reopen('v_17'); await waitPeek(); await next();
        say(3); await tap($('#peekClose'), 900, 'recap_peek_close'); await next();
        say(4); await reopen('v_42'); await step(1200); await next();
        say(5); await tap($('#recapChip'), 1500, 'recap_chip'); await waitRecap(); await next();
        say(6); await tap($('#btnContinue'), 1000, 'recap_continue');
        return finish();
      }
      if (kind === 'hours') {
        await step(900); say(0); await next();
        say(1); await appear(); await tap($('#recapChip'), 1500, 'recap_chip'); await waitRecap(); await next();
        say(2); await step(400); await scrollDown($('#sheetBody'), 2000); await next();
        say(3); await tap($('#btnContinue'), 1000, 'recap_continue');
        return finish();
      }
      // 3 дня
      await waitPeek(); say(0); await next();
      say(1); await appear(); await tap($('#peekCard'), 1100, 'recap_peek'); await waitRecap(); await next();
      say(2); await step(300); await scrollDown($('#sheetBody'), 2200); await next();
      say(3); await tap($('#btnChapter'), 1000, 'recap_chapter_start'); await step(800); await next();
      say(4); await tap($('#recapChip'), 1500, 'recap_chip'); await waitRecap(); await next();
      say(5); await tap($('.feedback [data-fb="up"]'), 1100, 'recap_feedback_up'); await next();
      say(6); await tap($('#btnContinue'), 1000, 'recap_continue');
      return finish();
    } catch (e) { /* демо прервано */ }
  }
  // настоящий пользователь коснулся экрана — демо уступает ему
  $('#screen').addEventListener('pointerdown', e => { if (e.isTrusted && ghost.classList.contains('is-on')) stopGhost(); }, true);
  $$('.tour__item').forEach(b => b.addEventListener('click', () => runTour(b.dataset.tour)));
  // Переключение версий НЕ уводит с текущего экрана: интерфейс меняется на месте,
  // чтобы было видно, что именно добавляет доработка.
  function switchVersion(m) {
    S.mode = m; document.body.dataset.mode = m;
    $$('[data-mode-set]').forEach(b => { const on = b.dataset.modeSet === m; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
    syncPill($('.mode-switch'));
    const onVideo = viewVideo.classList.contains('is-active');
    const onList = viewList.classList.contains('is-active');
    // в текущей версии нет полки «Продолжить просмотр», а значит и её полного списка
    if (onList && S.listKind === 'continue' && m === 'before') { showView(viewMoe); return; }
    if (!onVideo) return;
    const descOpen = descSheet.classList.contains('is-on');
    if (m === 'before') {
      closeSheet();
      clearTimeout(peekTimer);
      peek.getAnimations().forEach(a => a.cancel());
      peek.style.height = '0px';
      peek.classList.remove('is-on', 'is-leaving');
    } else {
      $('#recapChip').classList.toggle('is-hidden', S.scenario === 'nospeech' || (S.scenario === 'error' && !S.errorResolved));
      // плашка появляется прямо на глазах
      if (!descOpen && S.scenario === 'days' && !S.autoOff) setTimeout(showPeek, 250);
    }
    // перерисовать описание: блок пересказа появляется или исчезает
    if (descOpen) openDesc();
    if (chSheet.classList.contains('is-on')) renderChapters();
  }

  // переключатель версий «Сейчас в VK Видео / С доработкой»
  const DEFAULT_HINT = $('#tourHintText').textContent;
  $$('[data-mode-set]').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.modeSet;
    if (m === S.mode) return;
    switchVersion(m);
    $$('.tour__item').forEach(x => x.classList.remove('is-on'));
    $('#tourHintText').textContent = m === 'before'
      ? 'Так VK Видео работает сейчас: нажмите на видео «Как продакт принимает решения» в «Истории просмотра» — оно просто продолжится с места остановки, без пересказа. Переключите «С доработкой», чтобы сравнить.'
      : DEFAULT_HINT;
    $('#tourHint').classList.remove('is-new'); void $('#tourHint').offsetWidth; $('#tourHint').classList.add('is-new');
    track('version_switch', { version: m === 'after' ? 'test' : 'control' });
    closePanel();
  }));

  /* ---------- плашка «Отключить рекламу»: крестик сворачивает её ---------- */
  const promo = $('.promo');
  $('.promo__close').addEventListener('click', e => {
    e.stopPropagation();
    if (promo.dataset.closing) return;
    promo.dataset.closing = '1';
    const cs = getComputedStyle(promo), h = promo.offsetHeight;
    // такт 1: плашка гаснет и чуть уменьшается
    promo.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }],
      { duration: 200, easing: 'ease-out', fill: 'forwards' });
    // такт 2: место под ней плавно схлопывается, контент ниже поднимается
    setTimeout(() => {
      promo.style.overflow = 'hidden';
      promo.animate([
        { height: h + 'px', marginTop: cs.marginTop, marginBottom: cs.marginBottom, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, minHeight: '0px' },
        { height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', minHeight: '0px' }
      ], { duration: 340, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards' }).onfinish = () => { promo.style.display = 'none'; };
    }, 160);
    track('promo_close', { place: 'moe', promo: 'premium_trial' });
  });

  /* ---------- «таблетка» переключателей ---------- */
  function syncPill(box) {
    const on = box && box.querySelector('button.is-on');
    if (!on || !box.offsetParent) return;
    box.style.setProperty('--pill-x', (on.offsetLeft - 0) + 'px');
    box.style.setProperty('--pill-w', on.offsetWidth + 'px');
  }
  const syncPills = () => { syncPill($('.mode-switch')); syncPill($('#themeSwitch')); };
  addEventListener('resize', syncPills);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    syncPills();
    requestAnimationFrame(() => { $('.mode-switch').classList.add('pill-ready'); $('#themeSwitch').classList.add('pill-ready'); });
  });

  /* ---------- тема оформления ---------- */
  const THEME_KEY = 'vk-recap-theme';
  function setTheme(t, animate) {
    // Плавная смена темы — через View Transitions: браузер растворяет снимок старой темы в новой целиком,
    // поэтому ничего не мигает. Где механизма нет (или включено «уменьшение движения») — мгновенно.
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && document.startViewTransition && !reduce) {
      // на время растворения отключаем собственные переходы элементов — иначе две анимации накладываются и мигают
      const root = document.documentElement;
      root.classList.add('vt');
      const vt = document.startViewTransition(() => applyTheme(t));
      vt.finished.finally(() => root.classList.remove('vt'));
    } else applyTheme(t);
  }
  function applyTheme(t) {
    document.body.dataset.theme = t;
    $$('#themeSwitch button').forEach(b => { const on = b.dataset.themeSet === t; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
    syncPill($('#themeSwitch'));
    document.querySelector('meta[name="theme-color"]').content = t === 'light' ? '#FFFFFF' : '#19191A';
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  $$('#themeSwitch button').forEach(b => b.addEventListener('click', () => {
    if (document.body.dataset.theme === b.dataset.themeSet) return;
    setTheme(b.dataset.themeSet, true);
    track('theme_switch', { theme: b.dataset.themeSet });
  }));
  let savedTheme = 'dark';
  try { savedTheme = localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) {}
  setTheme(savedTheme, false);

  /* ---------- масштаб телефона под окно ---------- */
  function fit() {
    const ph = $('#phone');
    if (innerWidth <= 760) { ph.style.transform = ''; updatePlayer(); return; }
    const st = $('#stage').getBoundingClientRect();
    const k = Math.min(1, (innerHeight - 136) / ph.offsetHeight, (st.width - 48) / ph.offsetWidth);
    ph.style.transform = `scale(${k})`;
    updatePlayer();
  }
  addEventListener('resize', fit);

  /* ---------- старт ---------- */
  renderMoe(); renderList(); renderVideoStatic(); updateStyleNote(); setMode('after'); setScenario('days'); fit();
})();
