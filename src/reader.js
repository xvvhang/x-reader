import { createXAdapter, safeURL } from './x-adapter.js';
import { createI18n } from './i18n.js';

// Reader owns presentation and state; only the adapter reads or controls native X DOM.
{
  const adapter = createXAdapter({ document, window, location, MutationObserver });
  const i18n = createI18n(adapter.detectLanguage());
  const { msg, t, text, translatedAttribute } = i18n;
  const textMessage = text;
  const KEY = 'x-reader-home-v3';
  let enabled = true;
  try { enabled = GM_getValue(KEY, true) !== false; } catch { /* Enabled by default. */ }
  const host = document.createElement('div');
  host.id = 'x-reader-app';
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  adapter.installReaderStyles();

  // Use X's React tree only as a data source; never inject its HTML into Reader.
  shadow.innerHTML = `
    <style>
      :host { all: initial; display: block; font: 13px/1.5 Verdana, Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        color: var(--ink); color-scheme: light dark; --bg: #fff; --ink: #0f1419; --muted: #536471;
        --line: #eff3f4; --link: #1d9bf0; --surface: #f7f9f9; --segment-bg: #eff3f4; --segment-thumb: #fff; }
      * { box-sizing: border-box; }
      [hidden] { display: none !important; }
      button, input { font: inherit; }
      button, a { -webkit-tap-highlight-color: transparent; }
      button { cursor: pointer; }
      button:disabled { cursor: wait; opacity: .5; }
      a { color: inherit; text-decoration: none; }
      a:hover { text-decoration: underline; }
      button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid var(--link); outline-offset: 3px; }
      .app { position: fixed; inset: 0; z-index: 2147483645; background: var(--surface); color: var(--ink); display: flex; flex-direction: column; }
      .masthead { background: var(--bg); border-bottom: 1px solid var(--line); flex: none; }
      .top { max-width: 1200px; margin: auto; min-height: 40px; padding: 6px 18px; display: flex; gap: 18px; align-items: center; }
      .brand { font-weight: 800; letter-spacing: -.5px; font-size: 16px; white-space: nowrap; }
      .mark { padding: 0 4px; margin-right: 6px; color: var(--link); }
      .nav { display: flex; gap: 12px; align-items: center; }
      .nav a { font-size: 12px; }
      .search { display: flex; gap: 6px; margin-left: auto; }
      .search input { width: 190px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 4px; background: var(--surface); color: var(--ink); }
      .search button { border: 0; background: transparent; color: var(--link); font-size: 12px; white-space: nowrap; }
      .viewport { overflow: auto; flex: 1; min-height: 0; overscroll-behavior: contain; }
      .paper { max-width: 1200px; margin: 0 auto; min-height: 100%; background: var(--bg); padding: 0 22px calc(88px + env(safe-area-inset-bottom, 0px)); }
      .feedbar { display: flex; align-items: center; gap: 16px; border-bottom: 1px solid var(--line); padding: 12px 0 9px; }
      .tabs { display: flex; gap: 15px; flex-wrap: wrap; }
      .tabs button { background: none; border: 0; color: var(--muted); padding: 3px 0; font-weight: 600; }
      .tabs button[aria-selected="true"] { color: var(--link); box-shadow: 0 2px var(--link); }
      .count { margin-left: auto; color: var(--muted); font-size: 11px; }
      .status { padding: 12px 16px; color: var(--muted); font-size: 11px; min-height: 40px; text-align: center; line-height: 1.6; }
      .search-heading { padding: 14px 0 0; margin: 0; font-size: 15px; font-weight: 600; overflow-wrap: anywhere; }
      .nav a[aria-current="page"] { color: var(--link); font-weight: 600; }
      .person .author { font-size: 12px; margin-bottom: 5px; }
      .person .avatar { width: 28px; height: 28px; }
      .bio { color: var(--muted); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .list { margin: 0; padding: 0; list-style: none; counter-reset: item; }
      .list[data-layout="image"], .list[data-layout="video"] { display: grid; gap: 20px 12px; padding: 4px 0 8px; }
      .list[data-layout="image"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .list[data-layout="video"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .media-card { min-width: 0; }
      .media-card .media { display: grid; gap: 2px; margin: 0; border-radius: 12px; overflow: hidden;
        background: var(--surface); aspect-ratio: 1; }
      .list[data-layout="video"] .media-card .media { aspect-ratio: 16 / 9; }
      .media-card .media[data-multiple="true"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .media-card .thumbnail { width: 100%; height: 100%; min-height: 0; border: 0; border-radius: 0; }
      .media-card .media[data-count="3"] .thumbnail:last-child { grid-column: 1 / -1; }
      .media-card .thumbnail:hover img { filter: brightness(.94); }
      .media-card .play { font-size: 32px; }
      .media-card .meta { margin-top: 8px; gap: 4px 8px; font-size: 11px; }
      .media-card .author { font-size: 11px; }
      .media-card .caption { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
        overflow: hidden; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; margin: 5px 0 0; }
      .media-card .media-placeholder { display: grid; place-items: center; padding: 16px; text-align: center; color: var(--muted); font-size: 12px; }
      .item { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 6px; padding: 8px 0 9px; border-bottom: 1px solid var(--line); }
      .rank { color: var(--muted); text-align: right; padding-top: 1px; font-size: 12px; }
      .context { color: var(--muted); font-size: 10px; margin-bottom: 2px; }
      .text { font-size: 14px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; margin: 0; }
      .text.clamped { display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
      .text a { color: var(--link); }
      .meta { display: flex; align-items: center; gap: 5px 9px; flex-wrap: wrap; font-size: 10px; color: var(--muted); margin-top: 4px; }
      .meta button { background: transparent; border: 0; padding: 0; color: var(--link); font-size: 10px; }
      .author { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); max-width: 100%; flex-wrap: wrap; }
      .author-name { color: var(--ink); font-weight: 600; overflow-wrap: anywhere; }
      .avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex: none; }
      .avatar-fallback { display: inline-grid; place-items: center; background: var(--surface); font-size: 10px; }
      .username { color: var(--muted); overflow-wrap: anywhere; }
      .verified { display: inline-grid; place-items: center; width: 13px; height: 13px; border-radius: 50%;
        background: var(--link); color: #fff; font: bold 10px/1 Arial, sans-serif; flex: none; }
      .verified.gold { background: #b88900; }
      .verified.gray { background: #829aab; }
      .quote { border-left: 2px solid var(--line); padding: 3px 9px; margin: 6px 0 0; font-size: 12px; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; }
      .media { display: flex; flex-wrap: wrap; gap: 6px; margin: 7px 0 4px; }
      .thumbnail { position: relative; width: 112px; height: 76px; border: 1px solid var(--line); border-radius: 6px;
        padding: 0; overflow: hidden; background: var(--surface); color: var(--ink); }
      .thumbnail img { display: block; width: 100%; height: 100%; object-fit: cover; }
      .play { position: absolute; inset: 0; display: grid; place-items: center; color: white;
        text-shadow: 0 1px 4px #000; background: #0002; font-size: 23px; }
      .thumbnail .fallback { font-size: 11px; }
      .empty { padding: 50px 10px; text-align: center; color: var(--muted); }
      .more { display: block; margin: 28px auto 14px; min-width: 120px; min-height: 36px; padding: 8px 20px;
        border: 1px solid var(--line); border-radius: 8px; background: none; color: var(--link); }
      .foot { margin: 0 auto; padding: 0 16px; max-width: 640px; text-align: center; font-size: 10px; line-height: 1.8; color: var(--muted); }
      .switchbar { position: fixed; left: 0; right: 0; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); z-index: 2147483646;
        display: flex; justify-content: center; pointer-events: none; }
      .segments { position: relative; display: flex; width: 240px; max-width: calc(100vw - 32px); height: 36px; padding: 4px;
        border-radius: 10px; background: var(--segment-bg); pointer-events: auto; box-shadow: 0 2px 8px #00000014; }
      .segment-slider { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px);
        border-radius: 7px; background: var(--segment-thumb); box-shadow: 0 1px 4px #0002;
        transform: translateX(0); transition: transform 180ms cubic-bezier(.2, .8, .2, 1); pointer-events: none; }
      .segments[data-mode="reader"] .segment-slider { transform: translateX(100%); }
      .mode-tab { position: relative; z-index: 1; flex: 1; border: 0; padding: 0 10px; border-radius: 7px;
        background: transparent; color: var(--muted); font-size: 12px; cursor: pointer; touch-action: manipulation; }
      .mode-tab[aria-pressed="true"] { color: var(--ink); font-weight: 600; }
      @media (prefers-reduced-motion: reduce) { .segment-slider { transition: none; } }
      .viewer { position: fixed; inset: 0; z-index: 2147483647; background: #000d; color: #fff;
        display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 16px 24px; }
      .viewer-content { max-width: min(1200px, 100%); min-height: 0; display: flex; flex-direction: column; align-items: center; gap: 12px; }
      .viewer-content :is(img, video) { display: block; max-width: 100%; max-height: 75dvh; object-fit: contain; }
      .viewer-close { position: absolute; right: 20px; top: 16px; border: 1px solid #fff5; background: #222; color: white; border-radius: 20px; padding: 6px 14px; }
      .viewer-content a { color: #8ecdf8; font-size: 12px; }
      .viewer-note { color: #ddd; font-size: 12px; text-align: center; }
      @media (prefers-color-scheme: dark) {
        :host { --bg: #000; --ink: #e7e9ea; --muted: #71767b; --line: #2f3336; --surface: #16181c;
          --segment-bg: #202327; --segment-thumb: #3a3d41; }
      }
      @media (max-width: 650px) {
        .top { padding: 7px 10px; gap: 12px; flex-wrap: wrap; }
        .search { order: 2; width: 100%; }
        .search input { width: 100%; min-width: 0; }
        .paper { padding: 0 10px calc(88px + env(safe-area-inset-bottom, 0px)); }
        .item { grid-template-columns: 22px minmax(0, 1fr); }
        .text { font-size: 13px; }
        .feedbar { gap: 8px; }
        .list[data-layout="image"] { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 8px; }
        .list[data-layout="video"] { grid-template-columns: minmax(0, 1fr); gap: 20px; }
        .media-card .media { border-radius: 8px; }
      }
      @media (max-width: 380px) { .list[data-layout="image"] { grid-template-columns: minmax(0, 1fr); } }
    </style>
    <section class="app" aria-label="X Reader" hidden>
      <header class="masthead"><div class="top">
        <a class="brand" href="/home"><span class="mark">X</span>Reader</a>
        <nav class="nav" data-i18n-aria="mainNav"><a href="/home" aria-current="page" data-i18n="home"></a><a href="/search" data-i18n="search"></a></nav>
        <form class="search" role="search"><input name="q" type="search" data-i18n-placeholder="searchX" data-i18n-aria="searchX" required><button type="submit" data-i18n="search"></button></form>
      </div></header>
      <div class="viewport"><main class="paper">
        <h1 class="search-heading" hidden></h1>
        <div class="feedbar"><div class="tabs" role="tablist"></div><span class="count"></span></div>
        <div class="status" role="status" aria-live="polite"></div>
        <ol class="list"></ol>
        <div class="empty"></div>
        <button class="more" type="button" data-i18n="more"></button>
        <div class="foot" data-i18n="foot"></div>
      </main></div>
    </section>
    <footer class="switchbar" data-i18n-aria="mode">
      <div class="segments" role="group" data-i18n-aria="modeChoice" data-mode="x">
        <span class="segment-slider" aria-hidden="true"></span>
        <button class="mode-tab" data-mode="x" type="button" aria-pressed="true">Origin</button>
        <button class="mode-tab" data-mode="reader" type="button" aria-pressed="false">Reader</button>
      </div>
    </footer>
    <div class="viewer" role="dialog" aria-modal="true" data-i18n-aria="viewer" hidden>
      <button class="viewer-close" type="button" data-i18n="close"></button><div class="viewer-content"></div>
    </div>
  `;
  const $ = (selector) => shadow.querySelector(selector);
  const app = $('.app');
  const viewport = $('.viewport');
  const list = $('.list');
  const status = $('.status');
  const more = $('.more');
  const entries = new Map();
  let active = false;
  let currentTab = '';
  let pending = null;
  let frame = 0;
  let loading = false;
  let loadTimer = 0;
  let switchTimer = 0;
  let savedScroll = 0;
  let viewerTrigger = null;
  let viewKey = '';
  let routePending = null;
  let lastSources = [];
  let lastSignature = '';
  let appliedLanguage = '';
  const searchFilters = adapter.filters;
  const pageState = adapter.pageState;
  const searchURL = adapter.searchURL;
  const nativeTabs = adapter.getTabs;

  function syncLanguage() {
    const next = adapter.detectLanguage();
    if (appliedLanguage === next) return;
    appliedLanguage = next;
    const changed = i18n.language !== next;
    i18n.setLanguage(next);
    host.setAttribute('lang', i18n.language);
    for (const node of shadow.querySelectorAll('*')) {
      const key = node.getAttribute('data-i18n');
      if (key && !node._readerMessage) text(node, key);
      if (changed && node._readerMessage) text(node, node._readerMessage.key, node._readerMessage.params);
      if (changed && node._readerDateTime) updateTimestamp(node, node._readerDateTime);
      const aria = node.getAttribute('data-i18n-aria');
      const placeholder = node.getAttribute('data-i18n-placeholder');
      if (aria) translatedAttribute(node, 'aria-label', aria);
      if (placeholder) translatedAttribute(node, 'placeholder', placeholder);
      if (changed) for (const [name, value] of Object.entries(node._readerAttributes || {})) translatedAttribute(node, name, value.key, value.params);
    }
    if (changed) $('.tabs').dataset.key = '';
  }

  function homeTabLabel(index, fallback) {
    return index === 0 ? t('forYou') : index === 1 ? t('following') : fallback;
  }

  function tabMessage(state) {
    if (state.kind === 'search') return msg(searchFilters.find((filter) => filter.value === state.filter)?.label || 'search');
    const tabs = nativeTabs();
    const index = tabs.findIndex((tab) => tab.selected);
    return index === 0 ? msg('forYou') : index === 1 ? msg('following') : tabs[index]?.label || msg('home');
  }

  function updateTimestamp(node, datetime) {
    const date = new Date(datetime);
    if (!Number.isFinite(date.getTime())) return;
    node._readerDateTime = datetime;
    const seconds = (date.getTime() - Date.now()) / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
    const [unit, divisor] = units.find(([, value]) => Math.abs(seconds) >= value) || units.at(-1);
    node.textContent = new Intl.RelativeTimeFormat(i18n.language === 'zh' ? 'zh-CN' : 'en', { numeric: 'auto', style: 'short' }).format(Math.trunc(seconds / divisor) || 0, unit);
    node.title = date.toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en');
  }

  function updateView(state) {
    currentTab = '';
    pending = null; clearTimeout(switchTimer);
    resetFeed();
    $('.tabs').dataset.key = '';
    $('.search input').value = state.query;
    $('.search-heading').hidden = state.kind !== 'search';
    text($('.search-heading'), state.query ? 'searchHeading' : 'searchX', { query: state.query });
    translatedAttribute($('.tabs'), 'aria-label', state.kind === 'search' ? 'searchTabs' : 'homeTabs');
    translatedAttribute(list, 'aria-label', state.filter === 'user' ? 'peopleResults' : state.kind === 'search' ? 'results' : 'posts');
    list.dataset.layout = state.kind === 'search' && ['image', 'video'].includes(state.filter) ? state.filter : 'feed';
    for (const nav of shadow.querySelectorAll('.nav a')) {
      if (nav.getAttribute('href') === `/${state.kind}`) nav.setAttribute('aria-current', 'page');
      else nav.removeAttribute('aria-current');
    }
    text($('.empty'), state.kind === 'search' ? state.query ? 'searching' : 'searchHelp' : 'homeWaiting');
  }

  function closeViewer() {
    const viewer = $('.viewer');
    if (viewer.hidden) return;
    const video = viewer.querySelector('video');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    viewer.hidden = true;
    $('.viewer-content').replaceChildren();
    viewport.style.overflow = '';
    if (viewerTrigger?.isConnected) viewerTrigger.focus();
    viewerTrigger = null;
  }

  function openViewer(media, data, trigger) {
    closeViewer();
    viewerTrigger = trigger;
    const content = $('.viewer-content');
    if (media.kind === 'video' && media.src) {
      const video = el('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      if (media.poster) video.poster = media.poster;
      video.src = media.src;
      video.addEventListener('error', () => {
        if (!content.querySelector('.viewer-note')) content.append(el('p', 'viewer-note', msg('videoError')));
      });
      content.append(video);
    } else if (media.kind === 'image' || media.poster) {
      const img = el('img');
      img.src = media.kind === 'image' ? adapter.imageURL(media.src, 'large') : media.poster;
      if (media.alt) img.alt = media.alt;
      else translatedAttribute(img, 'alt', 'videoPoster');
      content.append(img);
    }
    if (media.kind === 'video' && !media.src) content.append(el('p', 'viewer-note', msg('noVideoSource')));
    content.append(link(msg(media.kind === 'video' ? 'playOriginal' : 'openOriginal'), data.url));
    $('.viewer').hidden = false;
    viewport.style.overflow = 'hidden';
    $('.viewer-close').focus();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text && typeof text === 'object' && text.key) {
      node._readerMessage = text;
      node.textContent = t(text.key, text.params);
    } else if (text !== undefined) node.textContent = text;
    return node;
  }

  function link(label, href, className) {
    const node = el('a', className, label);
    node.href = safeURL(href) || location.origin + '/home';
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  }

  function renderAuthor(data) {
    const author = link('', data.authorURL || data.url, 'author');
    const fallback = () => el('span', 'avatar avatar-fallback', Array.from(data.author)[0] || '?');
    if (data.avatar) {
      const img = el('img', 'avatar');
      img.src = data.avatar; img.alt = ''; img.loading = 'lazy';
      img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
      author.append(img);
    } else {
      const placeholder = fallback();
      placeholder.setAttribute('aria-hidden', 'true');
      author.append(placeholder);
    }
    author.append(el('span', 'author-name', data.author || msg('author')));
    if (data.verified) {
      const badge = el('span', `verified ${data.verified}`, '✓');
      const key = data.verified === 'gold' ? 'verifiedGold' : data.verified === 'gray' ? 'verifiedGray' : 'verified';
      badge.setAttribute('role', 'img');
      translatedAttribute(badge, 'aria-label', key); translatedAttribute(badge, 'title', key);
      author.append(badge);
    }
    if (data.username) author.append(el('span', 'username', data.username));
    return author;
  }

  function authorSignature(data) {
    return JSON.stringify([data.author, data.authorURL, data.username, data.avatar, data.verified]);
  }

  function renderPerson(data, index) {
    const item = el('li', 'item person');
    item.dataset.id = data.id;
    item.append(el('span', 'rank', `${index}.`));
    const content = el('div');
    content.append(renderAuthor(data));
    if (data.bio) content.append(el('div', 'bio', data.bio));
    item.append(content);
    return item;
  }

  function renderMedia(data) {
    const mediaRow = el('div', 'media');
    for (const [index, media] of data.media.entries()) {
      const thumbnail = el('button', 'thumbnail');
      thumbnail.type = 'button';
      translatedAttribute(thumbnail, 'aria-label', media.kind === 'video' ? 'enlargeVideo' : 'enlargeImage', { index: index + 1 });
      thumbnail.setAttribute('aria-haspopup', 'dialog');
      const src = media.kind === 'image' ? adapter.imageURL(media.src, 'small') : media.poster;
      if (src) {
        const img = el('img');
        img.loading = 'lazy'; img.src = src;
        if (media.alt) img.alt = media.alt;
        else translatedAttribute(img, 'alt', media.kind === 'video' ? 'videoThumb' : 'imageAlt');
        img.addEventListener('error', () => {
          img.hidden = true;
          thumbnail.append(el('span', 'fallback', msg('previewError')));
        }, { once: true });
        thumbnail.append(img);
      } else thumbnail.append(el('span', 'fallback', msg('video')));
      if (media.kind === 'video') thumbnail.append(el('span', 'play', '▶'));
      thumbnail.addEventListener('click', () => openViewer(media, data, thumbnail));
      mediaRow.append(thumbnail);
    }
    return mediaRow;
  }

  function renderQuote(data) {
    if (!data.quote && !data.quoteMedia?.length) return null;
    const quote = el('blockquote', 'quote', data.quote || '');
    if (data.quoteMedia?.length) quote.append(renderMedia({ ...data, media: data.quoteMedia, url: data.quoteURL || data.url }));
    return quote;
  }

  function renderEntry(data, index) {
    const item = el('li', 'item');
    item.dataset.id = data.id;
    item.append(el('span', 'rank', `${index}.`));
    const content = el('div');
    if (data.context) content.append(el('div', 'context', data.context));
    const text = el('p', 'text clamped');
    for (const token of data.tokens) {
      text.append(token.href ? link(token.text, token.href) : document.createTextNode(token.text));
    }
    if (!data.tokens.length) text.append(link(msg(data.media.some((media) => media.kind === 'video') ? 'videoPost' : data.media.length ? 'imagePost' : 'quotePost'), data.url));
    content.append(text);
    if (data.media.length) content.append(renderMedia(data));
    const meta = el('div', 'meta');
    meta.append(renderAuthor(data));
    const time = link(data.time || msg('original'), data.url);
    if (data.datetime) updateTimestamp(time, data.datetime);
    meta.append(time);
    if (data.metrics.length) {
      const metrics = el('span');
      data.metrics.forEach((metric, index) => {
        if (index) metrics.append(document.createTextNode(' · '));
        metrics.append(el('span', '', msg(metric.key, { count: metric.count })));
      });
      meta.append(metrics);
    }
    meta.append(link(msg('originalLink'), data.url));
    const button = (label, handler) => {
      const node = el('button', '', label);
      node.type = 'button';
      node.addEventListener('click', () => handler(node));
      meta.append(node);
      return node;
    };
    if (data.tokens.length) {
      const expand = button(msg('expand'), (node) => {
        const collapsed = text.classList.toggle('clamped');
        textMessage(node, collapsed ? 'expand' : 'collapse');
        node.setAttribute('aria-expanded', String(!collapsed));
        measureText();
      });
      expand.setAttribute('aria-expanded', 'false');
      // Measure after mounting; show Expand only for truncation and recheck on resize.
      expand.hidden = true;
      text._readerExpand = expand;
    }
    const quote = renderQuote(data);
    if (quote) content.append(quote);
    if (data.card) meta.append(link(msg('card'), data.url));
    content.append(meta); item.append(content);
    return item;
  }

  function renderMediaEntry(data) {
    const kind = pageState().filter === 'video' ? 'video' : 'image';
    const media = data.media.filter((entry) => entry.kind === kind);
    const item = el('li', 'media-card');
    item.dataset.id = data.id;
    // Reuse thumbnails and the viewer without the numbered text-result layout.
    const thumbnails = media.length ? renderEntry({ ...data, media }, 0).querySelector('.media') : el('div', 'media media-placeholder');
    thumbnails.dataset.multiple = String(media.length > 1);
    thumbnails.dataset.count = String(media.length);
    if (!media.length) thumbnails.append(link(msg('mediaWaiting'), data.url));
    item.append(thumbnails);
    const caption = data.tokens.map((token) => token.text).join('');
    if (caption) {
      const summary = el('p', 'caption');
      summary.append(link(caption, data.url));
      item.append(summary);
    }
    const meta = el('div', 'meta');
    meta.append(renderAuthor(data));
    if (data.time) {
      const time = link(data.time, data.url);
      if (data.datetime) updateTimestamp(time, data.datetime);
      meta.append(time);
    }
    meta.append(link(msg('originalLink'), data.url));
    item.append(meta);
    return item;
  }

  function renderResult(data, index) {
    if (data.person) return renderPerson(data, index);
    if (['image', 'video'].includes(list.dataset.layout)) return renderMediaEntry(data);
    return renderEntry(data, index);
  }

  function resetFeed() {
    closeViewer();
    entries.clear(); list.replaceChildren(); viewport.scrollTop = 0;
    finishLoading();
    $('.empty').hidden = false;
    text($('.count'), null);
  }

  function finishLoading(message) {
    loading = false; clearTimeout(loadTimer);
    more.disabled = false; text(more, 'more');
    if (message?.key) text(status, message.key, message.params);
    else if (message) { status._readerMessage = null; status.textContent = message; }
  }

  function switchTab(tab) {
    if (pending || tab.selected) return;
    const previous = adapter.snapshot();
    pending = { signature: previous.signature, nodes: new Set(previous.sourceIds), label: tab.label };
    resetFeed();
    const index = tab.index;
    text(status, 'switching', { label: index === 0 ? msg('forYou') : index === 1 ? msg('following') : pending.label });
    adapter.activateTab(tab.key);
    adapter.restoreScroll(0);
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => {
      if (pending) text(status, 'switchTimeout');
      // Do not mistake the previous timeline for the newly selected tab.
      renderTabs();
    }, 12000);
    schedule();
  }

  function renderTabs() {
    const state = pageState();
    if (state.kind === 'search') {
      const container = $('.tabs');
      const key = `search:${state.query}:${state.filter}`;
      if (container.dataset.key === key) return;
      container.dataset.key = key;
      container.replaceChildren();
      for (const filter of searchFilters) {
        const node = el('button', '', msg(filter.label));
        node.type = 'button'; node.setAttribute('role', 'tab');
        node.setAttribute('aria-selected', String(filter.value === state.filter));
        node.disabled = !state.query;
        node.addEventListener('click', () => {
          if (filter.value !== state.filter) adapter.navigate(searchURL(state.query, filter.value));
        });
        container.append(node);
      }
      return;
    }
    const tabs = nativeTabs();
    const container = $('.tabs');
    const key = tabs.map((tab) => `${tab.label}:${tab.selected}`).join('|') + `:${Boolean(pending)}`;
    if (container.dataset.key === key) return;
    container.dataset.key = key;
    container.replaceChildren();
    for (const [index, tab] of tabs.entries()) {
      const node = el('button', '', homeTabLabel(index, tab.label));
      node.type = 'button'; node.setAttribute('role', 'tab');
      node.setAttribute('aria-selected', String(tab.selected));
      node.addEventListener('click', () => {
        if (pending) {
          // Retain the original fingerprint on retry so stale content is not accepted.
          adapter.activateTab(tab.key); text(status, 'retrySwitch'); schedule();
        } else switchTab(tab);
      });
      container.append(node);
    }
  }

  function refresh() {
    frame = 0;
    syncLanguage();
    const state = pageState();
    const shouldActivate = enabled && state.kind !== 'other';
    if (active !== shouldActivate) {
      active = shouldActivate;
      if (active) savedScroll = adapter.scrollPosition();
      adapter.setReaderActive(active);
      app.hidden = !active;
      if (!active) {
        closeViewer();
        pending = null; clearTimeout(switchTimer); finishLoading();
        adapter.restoreScroll(savedScroll);
      }
    }
    $('.segments').dataset.mode = active ? 'reader' : 'x';
    for (const tab of shadow.querySelectorAll('.mode-tab')) {
      const selected = tab.dataset.mode === (active ? 'reader' : 'x');
      tab.setAttribute('aria-pressed', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    if (!active) return;
    if (viewKey !== state.key) {
      routePending = viewKey && lastSources.length ? { nodes: new Set(lastSources), signature: lastSignature } : null;
      viewKey = state.key;
      updateView(state);
    }
    renderTabs();
    more.hidden = state.kind === 'search' && !state.query;
    if (state.kind === 'search' && !state.query) {
      text(status, null); text($('.count'), null); return;
    }
    const snapshot = adapter.snapshot(state);
    if (!snapshot.searchMatches) {
      text(status, 'waitSearch'); return;
    }
    const nodes = snapshot.sourceIds;
    const message = snapshot.messageKey ? msg(snapshot.messageKey) : null;
    if (routePending) {
      const replaced = nodes.some((node) => !routePending.nodes.has(node));
      if (!message && (!nodes.length || (snapshot.signature === routePending.signature && !replaced))) {
        text(status, 'waitResults'); return;
      }
      routePending = null;
    }
    lastSources = nodes;
    lastSignature = snapshot.signature;
    const selected = state.kind === 'search' ? state.filter || 'top' : snapshot.tabs.find((tab) => tab.selected)?.label || '';
    if (pending) {
      const replaced = nodes.some((node) => !pending.nodes.has(node));
      if (!nodes.length || (snapshot.signature === pending.signature && !replaced) || selected !== pending.label) return;
      pending = null; clearTimeout(switchTimer); currentTab = selected;
      renderTabs();
    } else if (selected && currentTab && selected !== currentTab) resetFeed();
    currentTab = selected;
    let added = 0;
    for (const data of snapshot.items) {
      const previous = entries.get(data.id);
      if (previous) {
        if (data.grid) {
          const combined = new Map();
          for (const media of [...previous.media, ...data.media]) combined.set(`${media.kind}:${media.kind === 'image' ? media.src : media.poster || ''}`, media);
          data.media = Array.from(combined.values());
        }
        if (!data.grid && authorSignature(previous) !== authorSignature(data)) {
          list.querySelector(`[data-id="${data.id}"] .author`)?.replaceWith(renderAuthor(data));
          for (const key of ['author', 'authorURL', 'username', 'avatar', 'verified']) previous[key] = data[key];
        }
        // Posters and URLs often arrive after text; update media without resetting expanded text.
        if (!data.person && JSON.stringify(previous.media) !== JSON.stringify(data.media)) {
          const item = list.querySelector(`[data-id="${data.id}"]`);
          if (item?.classList.contains('media-card')) {
            item.replaceWith(renderMediaEntry({ ...previous, media: data.media }));
          } else {
            const oldRow = item?.querySelector(':scope > div > .media');
            const newRow = data.media.length ? renderMedia(data) : null;
            if (oldRow && newRow) oldRow.replaceWith(newRow);
            else if (oldRow) oldRow.remove();
            else if (newRow) item?.querySelector('.text').after(newRow);
          }
          previous.media = data.media;
        }
        if (!data.person && (previous.quote !== data.quote || previous.quoteURL !== data.quoteURL ||
          JSON.stringify(previous.quoteMedia) !== JSON.stringify(data.quoteMedia))) {
          const item = list.querySelector(`[data-id="${data.id}"]`);
          if (item?.classList.contains('item')) {
            const oldQuote = item.querySelector('.quote');
            const newQuote = renderQuote(data);
            if (oldQuote && newQuote) oldQuote.replaceWith(newQuote);
            else if (oldQuote) oldQuote.remove();
            else if (newQuote) item.querySelector('.meta').before(newQuote);
          }
          previous.quote = data.quote;
          previous.quoteMedia = data.quoteMedia;
          previous.quoteURL = data.quoteURL;
        }
        continue;
      }
      if (entries.size >= 1000) break;
      entries.set(data.id, data);
      list.append(renderResult(data, entries.size));
      added++;
    }
    $('.empty').hidden = entries.size > 0;
    text($('.count'), 'count', { count: entries.size });
    if (added) finishLoading(msg('collected', { count: entries.size, label: tabMessage(state) }));
    else if (!entries.size && message) {
      text($('.empty'), message.key, message.params);
      finishLoading(message); more.hidden = true;
    } else if (!entries.size) text(status, state.kind === 'search' ? 'searchWaiting' : 'homeDataWaiting');
    if (entries.size >= 1000) {
      more.disabled = true; text(status, 'limit');
    }
    measureText();
  }

  function measureText() {
    if (!active) return;
    for (const text of list.querySelectorAll('.text')) {
      const expand = text._readerExpand;
      if (!expand) continue;
      // Zero height or missing layout is not truncation; keep Collapse available after expansion.
      const clamped = text.classList.contains('clamped');
      const truncated = text.clientHeight > 0 && text.scrollHeight > text.clientHeight + 1;
      expand.hidden = clamped && !truncated;
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }

  function loadMore() {
    if (loading || pending || routePending || !active || entries.size >= 1000) return;
    loading = true; more.disabled = true; text(more, 'loading');
    text(status, pageState().kind === 'search' ? 'loadSearch' : 'loadHome');
    // Keep the source page's layout and scroll it without moving the Reader viewport.
    adapter.loadMore();
    loadTimer = setTimeout(() => {
      finishLoading(msg('noNewContent'));
    }, 10000);
    schedule();
  }

  function setEnabled(value) {
    enabled = value;
    try { GM_setValue(KEY, enabled); } catch { /* Keep the current switch working if persistence fails. */ }
    schedule();
  }
  $('.viewer-close').addEventListener('click', closeViewer);
  $('.viewer').addEventListener('click', (event) => {
    if (event.target === $('.viewer')) closeViewer();
  });
  shadow.addEventListener('keydown', (event) => {
    if ($('.viewer').hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeViewer();
    } else if (event.key === 'Tab') {
      const focusable = Array.from($('.viewer').querySelectorAll('button, a, video[controls]'));
      const index = focusable.indexOf(shadow.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault(); focusable.at(-1)?.focus();
      } else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) {
        event.preventDefault(); focusable[0]?.focus();
      }
    }
  });
  window.addEventListener('resize', measureText);
  document.fonts?.ready.then(measureText);
  document.fonts?.addEventListener('loadingdone', measureText);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measureText).observe(viewport);
  shadow.addEventListener('load', measureText, true);
  function selectMode(mode) {
    setEnabled(mode === 'reader');
    if (mode === 'reader' && pageState().kind === 'other') adapter.navigate('/home');
  }
  for (const tab of shadow.querySelectorAll('.mode-tab')) {
    tab.addEventListener('click', () => selectMode(tab.dataset.mode));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const mode = event.key === 'ArrowLeft' || event.key === 'Home' ? 'x' : 'reader';
      $(`.mode-tab[data-mode="${mode}"]`).focus();
      selectMode(mode);
    });
  }
  $('.search').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = $('.search input').value.trim();
    if (query) adapter.navigate(searchURL(query, pageState().kind === 'search' ? pageState().filter : ''));
  });
  more.addEventListener('click', loadMore);
  const intersection = new IntersectionObserver((events) => {
    if (events.some((event) => event.isIntersecting) && entries.size > 0) loadMore();
  }, { root: viewport, rootMargin: '0px 0px 300px 0px' });
  intersection.observe(more);

  adapter.observe(schedule);
  // pushState does not emit popstate; poll infrequently to detect SPA navigation.
  setInterval(() => {
    if (active !== (enabled && pageState().kind !== 'other') || (active && viewKey !== pageState().key)) schedule();
  }, 800);
  document.addEventListener('keydown', (event) => {
    if (event.altKey && event.shiftKey && event.code === 'KeyR' && !event.repeat) {
      const target = event.composedPath()[0];
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
      event.preventDefault(); setEnabled(!enabled);
    }
  });
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(t('menuToggle'), () => setEnabled(!enabled));
  schedule();
}
