/*!
 * Pubblicazioni flipbook viewer
 * PDF.js (Mozilla, Apache-2.0) + StPageFlip (MIT)
 *
 * Usage:
 *   <div data-flipbook data-pdf="https://…/file.pdf" data-title="Document title"></div>
 *   <script type="module" src="flipbook.js"></script>
 *
 * If data-pdf is empty, the URL is taken from the first <a data-flipbook-pdf href="…">
 * on the page (e.g. a download link bound to the CMS file field).
 */
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
import { PageFlip } from 'https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.module.js';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

const MIN_PAGE_W = 340;   // narrower than 2× this → single-page mode
const RADIUS = 4;         // pages rendered on each side of the current one
const MAX_DPR = 2;
const MAX_CANVAS_PX = 12e6;
const ZOOM_LEVELS = [1.5, 2, 3, 4];

const STRINGS = {
  it: {
    prev: 'Pagina precedente', next: 'Pagina successiva', first: 'Prima pagina', last: 'Ultima pagina',
    thumbs: 'Miniature', pages: 'Pagine', zoom: 'Ingrandisci', zoomIn: 'Aumenta zoom', zoomOut: 'Riduci zoom',
    fullscreen: 'Schermo intero', share: 'Condividi', copied: 'Link copiato', download: 'Scarica PDF',
    loading: 'Caricamento…', error: 'Non è stato possibile caricare il documento.', page: 'Pagina', close: 'Chiudi',
  },
  en: {
    prev: 'Previous page', next: 'Next page', first: 'First page', last: 'Last page',
    thumbs: 'Thumbnails', pages: 'Pages', zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
    fullscreen: 'Full screen', share: 'Share', copied: 'Link copied', download: 'Download PDF',
    loading: 'Loading…', error: 'The document could not be loaded.', page: 'Page', close: 'Close',
  },
};

const svg = (d) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  prev: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>'),
  first: svg('<path d="M17 18l-6-6 6-6"/><path d="M7 6v12"/>'),
  last: svg('<path d="M7 18l6-6-6-6"/><path d="M17 6v12"/>'),
  grid: svg('<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>'),
  zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/>'),
  zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M8 11h6"/>'),
  expand: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  shrink: svg('<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'),
  share: svg('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v13"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>'),
  close: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
};

class Flipbook {
  constructor(root) {
    this.root = root;
    const lang = (root.dataset.lang || document.documentElement.lang || 'it').slice(0, 2);
    this.t = STRINGS[lang] || STRINGS.it;
    this.url = root.dataset.pdf || document.querySelector('a[data-flipbook-pdf]')?.href || '';
    this.title = root.dataset.title || document.title;
    this.current = 0;
    this.zoomIdx = 1;
    this.renderGen = 0;
    this.build();
    if (!this.url) return this.fail('missing data-pdf');
    this.load().catch((e) => this.fail(e));
  }

  /* ---------- DOM ---------- */

  build() {
    const t = this.t;
    const btn = (act, icon, label, cls = '') =>
      `<button type="button" class="sfb-btn ${cls}" data-act="${act}" aria-label="${label}" title="${label}">${ICON[icon]}</button>`;
    this.root.classList.add('sfb');
    this.root.innerHTML = `
      <div class="sfb-stage">
        <div class="sfb-box"><div class="sfb-book"></div></div>
        ${btn('prev', 'prev', t.prev, 'sfb-side sfb-side--prev')}
        ${btn('next', 'next', t.next, 'sfb-side sfb-side--next')}
        <div class="sfb-loader"><div class="sfb-loader__track"><span></span></div><p>${t.loading}</p></div>
      </div>
      <div class="sfb-bar" role="toolbar" aria-label="${this.title}">
        <div class="sfb-bar__group">${btn('thumbs', 'grid', t.thumbs)}</div>
        <div class="sfb-bar__group">
          ${btn('first', 'first', t.first, 'sfb-hide-sm')}
          ${btn('prev', 'prev', t.prev)}
          <label class="sfb-pageno"><input type="text" inputmode="numeric" aria-label="${t.page}" value="1"><span class="sfb-pageno__total">/ –</span></label>
          ${btn('next', 'next', t.next)}
          ${btn('last', 'last', t.last, 'sfb-hide-sm')}
        </div>
        <div class="sfb-bar__group">
          ${btn('zoom', 'zoomIn', t.zoom)}
          ${btn('fullscreen', 'expand', t.fullscreen, 'sfb-fs')}
          ${btn('share', 'share', t.share)}
          <a class="sfb-btn" data-act="download" href="${this.url}" target="_blank" rel="noopener" download aria-label="${t.download}" title="${t.download}">${ICON.download}</a>
        </div>
      </div>
      <aside class="sfb-thumbs" aria-label="${t.pages}" inert>
        <div class="sfb-thumbs__head"><span>${t.pages}</span>${btn('thumbs', 'close', t.close)}</div>
        <div class="sfb-thumbs__grid"></div>
      </aside>
      <div class="sfb-zoom" hidden>
        <div class="sfb-zoom__scroll"><div class="sfb-zoom__pages"></div></div>
        <div class="sfb-zoom__bar">
          ${btn('zoom-out', 'zoomOut', t.zoomOut)}<span class="sfb-zoom__level">200%</span>${btn('zoom-in', 'zoomIn', t.zoomIn)}
          <span class="sfb-sep"></span>${btn('zoom-close', 'close', t.close)}
        </div>
      </div>
      <div class="sfb-toast" role="status" aria-live="polite"></div>`;

    const $ = (s) => this.root.querySelector(s);
    this.stage = $('.sfb-stage');
    this.box = $('.sfb-box');
    this.bookEl = $('.sfb-book');
    this.loader = $('.sfb-loader');
    this.input = $('.sfb-pageno input');
    this.totalEl = $('.sfb-pageno__total');
    this.thumbs = $('.sfb-thumbs');
    this.thumbGrid = $('.sfb-thumbs__grid');
    this.zoomEl = $('.sfb-zoom');
    this.zoomScroll = $('.sfb-zoom__scroll');
    this.zoomPages = $('.sfb-zoom__pages');
    this.zoomLabel = $('.sfb-zoom__level');
    this.toastEl = $('.sfb-toast');
    if (!document.fullscreenEnabled) this.root.querySelectorAll('.sfb-fs').forEach((b) => b.remove());

    this.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || !this.root.contains(el)) return;
      const act = el.dataset.act;
      if (act === 'download') return;
      e.preventDefault();
      ({
        prev: () => this.flip?.flipPrev(),
        next: () => this.flip?.flipNext(),
        first: () => this.go(0),
        last: () => this.go(this.count - 1),
        thumbs: () => this.toggleThumbs(),
        zoom: () => this.openZoom(),
        'zoom-in': () => this.setZoom(this.zoomIdx + 1),
        'zoom-out': () => this.setZoom(this.zoomIdx - 1),
        'zoom-close': () => this.closeZoom(),
        fullscreen: () => this.toggleFullscreen(),
        share: () => this.share(),
        goto: () => { this.go(+el.dataset.page); if (this.isPortrait()) this.toggleThumbs(false); },
      })[act]?.();
    });

    this.input.addEventListener('focus', () => this.input.select());
    this.input.addEventListener('change', () => {
      const n = parseInt(this.input.value, 10);
      if (n >= 1 && n <= this.count) this.go(n - 1);
      else this.updateLabel();
      this.input.blur();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.flip || e.target.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'Escape') { if (!this.zoomEl.hidden) this.closeZoom(); else this.toggleThumbs(false); return; }
      if (!this.zoomEl.hidden) return;
      const map = { ArrowLeft: 'prev', PageUp: 'prev', ArrowRight: 'next', PageDown: 'next', Home: 'first', End: 'last' };
      if (!map[e.key]) return;
      e.preventDefault();
      ({ prev: () => this.flip.flipPrev(), next: () => this.flip.flipNext(), first: () => this.go(0), last: () => this.go(this.count - 1) })[map[e.key]]();
    });

    window.addEventListener('hashchange', () => {
      const n = this.pageFromHash();
      if (n != null) this.go(n);
    });
    document.addEventListener('fullscreenchange', () => {
      const on = document.fullscreenElement === this.root;
      this.root.querySelectorAll('.sfb-fs').forEach((b) => (b.innerHTML = on ? ICON.shrink : ICON.expand));
    });

    this.enableDragPan();
  }

  /* ---------- Loading ---------- */

  async load() {
    const task = pdfjsLib.getDocument({ url: this.url, isEvalSupported: false });
    const bar = this.loader.querySelector('span');
    task.onProgress = ({ loaded, total }) => { if (total) bar.style.width = `${Math.min(100, (loaded / total) * 100)}%`; };
    this.pdf = await task.promise;
    this.count = this.pdf.numPages;
    this.totalEl.textContent = `/ ${this.count}`;

    const vp = (await this.pdf.getPage(1)).getViewport({ scale: 1 });
    this.ratio = vp.width / vp.height;

    this.pageEls = Array.from({ length: this.count }, (_, i) => {
      const el = document.createElement('div');
      el.className = 'sfb-page';
      el.dataset.page = i;
      return el;
    });
    this.bookEl.append(...this.pageEls);

    this.layout();
    const start = Math.min(this.pageFromHash() ?? 0, this.count - 1);
    this.flip = new PageFlip(this.bookEl, {
      width: vp.width,
      height: vp.height,
      size: 'stretch',
      minWidth: MIN_PAGE_W,
      maxWidth: 5000,
      minHeight: 100,
      maxHeight: 5000,
      showCover: true,
      usePortrait: true,
      autoSize: true,
      mobileScrollSupport: false,
      maxShadowOpacity: 0.3,
      flippingTime: 750,
      startPage: start,
    });
    this.flip.loadFromHTML(this.pageEls);
    this.flip.on('flip', (e) => this.onPage(e.data));
    this.flip.on('changeOrientation', () => this.onPage(this.flip.getCurrentPageIndex()));

    new ResizeObserver(() => {
      const before = this.pageW;
      this.layout();
      this.flip.update();
      if (Math.abs(this.pageW - before) / before > 0.15) this.renderAround(this.current, true);
    }).observe(this.stage);

    this.onPage(this.flip.getCurrentPageIndex(), { replaceHash: false });
    await this.renderPage(this.current);
    this.loader.classList.add('is-done');
    this.root.classList.add('is-ready');
  }

  fail(err) {
    console.error('[flipbook]', err);
    this.loader.classList.add('is-error');
    this.loader.innerHTML = `<p>${this.t.error}</p>${this.url ? `<a class="sfb-link" href="${this.url}" target="_blank" rel="noopener">${this.t.download}</a>` : ''}`;
  }

  /* ---------- Layout ---------- */

  // Size the book box so the pages fit the stage in both width and height.
  // StPageFlip then fills the box (its "stretch" mode only fits width).
  layout() {
    const cs = getComputedStyle(this.stage);
    const W = this.stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = this.stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let pw = Math.min(W / 2, H * this.ratio);
    const landscape = pw >= MIN_PAGE_W;
    if (!landscape) pw = Math.min(W, H * this.ratio);
    pw = Math.max(1, Math.floor(pw));
    this.pageW = pw;
    this.box.style.width = `${landscape ? pw * 2 : pw}px`;
    this.box.style.height = `${Math.floor(pw / this.ratio)}px`;
    this.root.classList.toggle('is-portrait', !landscape);
  }

  isPortrait() {
    return this.flip ? this.flip.getOrientation() === 'portrait' : this.root.classList.contains('is-portrait');
  }

  spread(i) {
    if (this.isPortrait() || i === 0) return [i];
    const left = i % 2 ? i : i - 1;
    return left + 1 < this.count ? [left, left + 1] : [left];
  }

  /* ---------- Navigation ---------- */

  go(i) {
    i = Math.max(0, Math.min(this.count - 1, i | 0));
    if (this.spread(this.current).includes(i)) return;
    this.renderAround(i);
    if (Math.abs(i - this.current) <= 2) this.flip.flip(i);
    else { this.flip.turnToPage(i); this.onPage(this.flip.getCurrentPageIndex()); }
  }

  onPage(i, { replaceHash = true } = {}) {
    this.current = i;
    this.updateLabel();
    const s = this.spread(i);
    this.root.querySelectorAll('[data-act="prev"],[data-act="first"]').forEach((b) => (b.disabled = s[0] === 0));
    this.root.querySelectorAll('[data-act="next"],[data-act="last"]').forEach((b) => (b.disabled = s[s.length - 1] >= this.count - 1));
    if (replaceHash) history.replaceState(null, '', `#page/${s[0] + 1}`);
    this.thumbGrid.querySelectorAll('.is-current').forEach((el) => el.classList.remove('is-current'));
    s.forEach((p) => this.thumbGrid.children[p]?.classList.add('is-current'));
    this.renderAround(i);
  }

  updateLabel() {
    const s = this.spread(this.current).map((p) => p + 1);
    this.input.value = s.join('–');
    this.input.style.width = `calc(${Math.max(2, this.input.value.length) + 1}ch + 10px)`;
  }

  pageFromHash() {
    const m = location.hash.match(/page\/(\d+)/);
    return m ? Math.max(0, parseInt(m[1], 10) - 1) : null;
  }

  /* ---------- Rendering ---------- */

  async drawPage(num, cssWidth) {
    const page = await this.pdf.getPage(num + 1);
    const base = page.getViewport({ scale: 1 });
    let scale = (cssWidth * Math.min(window.devicePixelRatio || 1, MAX_DPR)) / base.width;
    const area = base.width * base.height * scale * scale;
    if (area > MAX_CANVAS_PX) scale *= Math.sqrt(MAX_CANVAS_PX / area);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
    return canvas;
  }

  renderPage(i, force = false) {
    const el = this.pageEls[i];
    if (!el) return;
    const target = this.pageW;
    if (!force && el._w && Math.abs(el._w - target) / target < 0.15) return;
    if (el._task) return el._task;
    el._task = this.drawPage(i, target)
      .then((canvas) => {
        el.querySelector('canvas')?.remove();
        el.append(canvas);
        el._w = target;
        el.classList.add('is-rendered');
      })
      .catch((e) => console.warn('[flipbook] page', i + 1, e))
      .finally(() => (el._task = null));
    return el._task;
  }

  // Render the pages near `center` (nearest first) and free the canvases of distant ones.
  async renderAround(center, force = false) {
    const gen = ++this.renderGen;
    const order = [];
    for (let d = 0; d <= RADIUS; d++) {
      order.push(center + d);
      if (d) order.push(center - d);
    }
    this.pageEls.forEach((el, i) => {
      if (Math.abs(i - center) > RADIUS + 2 && el._w) {
        const c = el.querySelector('canvas');
        if (c) { c.width = c.height = 0; c.remove(); }
        el._w = 0;
        el.classList.remove('is-rendered');
      }
    });
    for (const i of order) {
      if (gen !== this.renderGen) return;
      if (i >= 0 && i < this.count) await this.renderPage(i, force);
    }
  }

  /* ---------- Thumbnails ---------- */

  toggleThumbs(open = !this.thumbs.classList.contains('is-open')) {
    if (!this.pdf) return;
    if (open && !this.thumbGrid.children.length) this.buildThumbs();
    this.thumbs.classList.toggle('is-open', open);
    this.thumbs.inert = !open;
    if (open) this.thumbGrid.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
  }

  buildThumbs() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < this.count; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sfb-thumb';
      b.dataset.act = 'goto';
      b.dataset.page = i;
      b.setAttribute('aria-label', `${this.t.page} ${i + 1}`);
      b.innerHTML = `<span class="sfb-thumb__img" style="aspect-ratio:${this.ratio}"></span><span class="sfb-thumb__num">${i + 1}</span>`;
      frag.append(b);
    }
    this.thumbGrid.append(frag);
    this.spread(this.current).forEach((p) => this.thumbGrid.children[p].classList.add('is-current'));

    let queue = Promise.resolve();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        const i = +en.target.dataset.page;
        queue = queue.then(() => this.drawPage(i, 120))
          .then((c) => en.target.firstElementChild.append(c))
          .catch(() => {});
      });
    }, { root: this.thumbGrid, rootMargin: '200px' });
    [...this.thumbGrid.children].forEach((b) => io.observe(b));
  }

  /* ---------- Zoom ---------- */

  openZoom() {
    if (!this.pdf) return;
    this.toggleThumbs(false);
    this.zoomEl.hidden = false;
    this.zoomSpread = this.spread(this.current);
    this.zoomPages.innerHTML = '';
    this.zoomEls = this.zoomSpread.map(() => {
      const d = document.createElement('div');
      d.className = 'sfb-zoom__page';
      d.style.aspectRatio = this.ratio;
      this.zoomPages.append(d);
      return d;
    });
    this.setZoom(this.zoomIdx, true);
    this.zoomEl.querySelector('[data-act="zoom-close"]').focus({ preventScroll: true });
  }

  closeZoom() {
    this.zoomEl.hidden = true;
    this.zoomPages.innerHTML = '';
  }

  setZoom(idx, center = false) {
    this.zoomIdx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx));
    const level = ZOOM_LEVELS[this.zoomIdx];
    const w = Math.round(this.pageW * level);
    const sc = this.zoomScroll;
    const fx = (sc.scrollLeft + sc.clientWidth / 2) / (sc.scrollWidth || 1);
    const fy = (sc.scrollTop + sc.clientHeight / 2) / (sc.scrollHeight || 1);
    this.zoomEls.forEach((d) => (d.style.width = `${w}px`));
    this.zoomLabel.textContent = `${Math.round(level * 100)}%`;
    this.zoomEl.querySelector('[data-act="zoom-out"]').disabled = this.zoomIdx === 0;
    this.zoomEl.querySelector('[data-act="zoom-in"]').disabled = this.zoomIdx === ZOOM_LEVELS.length - 1;
    // keep the same point in the middle of the view
    sc.scrollLeft = center ? (sc.scrollWidth - sc.clientWidth) / 2 : fx * sc.scrollWidth - sc.clientWidth / 2;
    sc.scrollTop = center ? 0 : fy * sc.scrollHeight - sc.clientHeight / 2;

    clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => {
      const gen = (this.zoomGen = (this.zoomGen || 0) + 1);
      this.zoomSpread.forEach(async (p, k) => {
        const c = await this.drawPage(p, w);
        if (gen !== this.zoomGen || this.zoomEl.hidden) return;
        this.zoomEls[k].replaceChildren(c);
      });
    }, 120);
  }

  enableDragPan() {
    const sc = this.zoomScroll;
    let start = null;
    sc.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      start = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop };
      sc.setPointerCapture(e.pointerId);
      sc.classList.add('is-dragging');
    });
    sc.addEventListener('pointermove', (e) => {
      if (!start) return;
      sc.scrollLeft = start.l - (e.clientX - start.x);
      sc.scrollTop = start.t - (e.clientY - start.y);
    });
    const end = () => { start = null; sc.classList.remove('is-dragging'); };
    sc.addEventListener('pointerup', end);
    sc.addEventListener('pointercancel', end);
  }

  /* ---------- Misc ---------- */

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else this.root.requestFullscreen?.().catch(() => {});
  }

  async share() {
    const url = location.href;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: this.title, url }); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toast(this.t.copied);
    } catch {
      prompt(this.t.share, url);
    }
  }

  toast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('is-visible'), 2000);
  }
}

document.querySelectorAll('[data-flipbook]').forEach((el) => {
  el._flipbook = new Flipbook(el);
});
