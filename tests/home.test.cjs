const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

const script = readFileSync(require('node:path').join(__dirname, '../x-reader.user.js'), 'utf8');

function tweet(id, text = 'Hello reader') {
  return `<article data-testid="tweet">
    <div data-testid="Tweet-User-Avatar"><a href="/alice"><img src="https://pbs.twimg.com/profile_images/alice.jpg"></a></div>
    <div data-testid="User-Name"><a href="/alice">Alice</a><span>@alice</span></div>
    <a href="/alice/status/${id}"><time datetime="2026-10-20T10:00:00Z">1h</time></a>
    <div data-testid="tweetText">${text}</div>
    <button data-testid="like">12</button>
    <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/example.jpg" alt="示例"></div>
  </article>`;
}

function setup({ pathname = '/home', search = '', lang = 'zh-CN', fetch, storage = new Map(), content = tweet('1') + tweet('2', '第二条 &lt;script&gt;alert(1)&lt;/script&gt;') } = {}) {
  const { window, document } = parseHTML(`<html lang="${lang}"><head></head><body><div id="react-root">
    <main data-testid="primaryColumn"><div role="tablist">
      <button role="tab" aria-selected="true">For you</button>
      <button role="tab" aria-selected="false">Following</button>
    </div><section id="feed">${content}</section></main>
    </div></body></html>`);
  const frames = [];
  const observers = [];
  const scrolls = [];
  const assignments = [];
  const timers = new Map();
  let clock = 0;
  let timerId = 0;
  const later = (fn, delay = 0) => { const id = ++timerId; timers.set(id, { fn, at: clock + delay }); return id; };
  const cancel = (id) => timers.delete(id);
  window.scrollY = 42;
  window.innerHeight = 800;
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 20000, configurable: true });
  window.fetch = fetch;
  window.AbortController = AbortController;
  window.setTimeout = later;
  window.clearTimeout = cancel;
  window.scrollTo = (...args) => { scrolls.push(args); window.scrollY = typeof args[0] === 'object' ? args[0].top : args[1]; };
  const context = vm.createContext({
    window, document, Node: window.Node, Element: window.Element, URL, URLSearchParams, console,
    location: { origin: 'https://x.com', pathname, search, assign: (url) => assignments.push(url) },
    GM_getValue: (key, fallback) => storage.get(key) ?? fallback,
    GM_setValue: (key, value) => storage.set(key, value),
    GM_registerMenuCommand: () => {},
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    IntersectionObserver: class { observe() {} },
    setInterval: () => 1,
    setTimeout: later,
    clearTimeout: cancel,
  });
  vm.runInContext(script, context);
  const flush = () => { while (frames.length) frames.shift()(); };
  const notify = () => { observers.forEach((fn) => fn()); flush(); };
  const advance = (ms) => {
    const end = clock + ms;
    let count = 0;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      if (++count > 200) throw new Error('Unbounded timer loop');
      clock = next[1].at; timers.delete(next[0]); next[1].fn(); flush();
    }
    clock = end;
  };
  flush();
  return {
    window, document, scrolls, assignments, notify, flush, advance, timers, storage, location: context.location,
    ui: document.querySelector('#x-reader-app').shadowRoot,
    nativeTabs: document.querySelectorAll('[role="tab"]'),
    feed: document.querySelector('#feed'),
  };
}

test('extracts, safely renders, and deduplicates home posts without modifying native content', () => {
  const h = setup();
  assert.equal(h.document.documentElement.hasAttribute('data-x-reader-home'), true);
  assert.equal(h.ui.querySelectorAll('.item').length, 2);
  assert.equal(h.feed.querySelectorAll('article').length, 2);
  assert.match(h.ui.querySelector('.list').textContent, /第二条 <script>alert\(1\)<\/script>/);
  assert.equal(h.ui.querySelector('.list script'), null);
  assert.equal(h.ui.querySelector('.item .author-name').textContent, 'Alice');
  assert.equal(h.ui.querySelectorAll('.media img').length, 2);
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item').length, 2);
  assert.equal(h.ui.querySelector('.media img').loading, 'lazy');
  h.ui.querySelector('.thumbnail').click();
  assert.equal(h.ui.querySelector('.viewer').hidden, false);
  assert.match(h.ui.querySelector('.viewer-content img').src, /name=large/);
  h.ui.querySelector('.viewer-close').click();
  assert.equal(h.ui.querySelector('.viewer').hidden, true);
});

test('offers independent accessible image-free and compact switches at the right of the header', () => {
  const h = setup();
  const controls = h.ui.querySelector('.top .view-controls');
  assert.equal(controls.getAttribute('role'), 'group');
  assert.equal(controls.querySelectorAll('[role="switch"]').length, 2);
  const imageFree = controls.querySelector('[data-setting="imageFree"]');
  const compact = controls.querySelector('[data-setting="compact"]');
  assert.equal(imageFree.getAttribute('aria-checked'), 'false');
  assert.equal(imageFree.getAttribute('aria-label'), '无图模式');
  assert.equal(compact.getAttribute('aria-checked'), 'true');
  assert.equal(compact.type, 'button');
  const css = h.ui.querySelector('style').textContent;
  assert.match(css.match(/\.view-controls \{([^}]+)\}/)[1], /margin-left: auto/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('image-free mode removes media previews and avatars without losing text, expansion, input or media caches', () => {
  const h = setup({ content: tweet('1').replace('</article>', '<div role="link" tabindex="0"><a href="/bob/status/99">Quoted</a><div data-testid="tweetText">Quoted text</div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/quoted.jpg"></div></div></article>') });
  h.ui.querySelector('.text')._readerExpand.click();
  h.ui.querySelector('.search input').value = 'unsent query';
  h.ui.querySelector('.viewport').scrollTop = 123;
  const imageFree = h.ui.querySelector('[data-setting="imageFree"]');
  imageFree.click();
  assert.equal(h.ui.querySelectorAll('img, video, .thumbnail').length, 0);
  assert.equal(h.ui.querySelectorAll('.media a').length, 2);
  assert.match(h.ui.querySelector('.quote').textContent, /Quoted text/);
  assert.equal(h.ui.querySelector('.text').classList.contains('clamped'), false);
  assert.equal(h.ui.querySelector('.search input').value, 'unsent query');
  assert.equal(h.ui.querySelector('.viewport').scrollTop, 123);
  h.feed.querySelector('[data-testid="tweetPhoto"]').remove(); h.notify();
  h.feed.insertAdjacentHTML('beforeend', tweet('2')); h.notify();
  assert.equal(h.ui.querySelector('img'), null);
  imageFree.click();
  assert.equal(h.ui.querySelectorAll('.thumbnail').length, 3);
  assert.equal(h.ui.querySelector('.text').classList.contains('clamped'), false);
  assert.equal(h.ui.querySelector('.search input').value, 'unsent query');
});

test('image-free mode closes the viewer and cancels pending image retries', () => {
  const h = setup({ content: tweet('1') });
  h.ui.querySelector('.thumbnail').click();
  const img = h.ui.querySelector('.viewer img');
  img.dispatchEvent(new h.window.Event('error'));
  const src = img.src;
  h.ui.querySelector('[data-setting="imageFree"]').click();
  h.advance(2000);
  assert.equal(h.ui.querySelector('.viewer').hidden, true);
  assert.equal(h.ui.querySelector('img'), null);
  assert.equal(img.src, src);
  assert.equal(h.timers.size, 0);
});

test('normal mode unfolds existing and future posts while compact mode restores five-line previews', () => {
  const h = setup();
  const compact = h.ui.querySelector('[data-setting="compact"]');
  h.ui.querySelector('.viewport').scrollTop = 123;
  compact.click();
  assert.equal(compact.getAttribute('aria-checked'), 'false');
  for (const body of h.ui.querySelectorAll('.text')) {
    assert.equal(body.classList.contains('clamped'), false);
    assert.equal(body._readerExpand.hidden, true);
  }
  h.feed.insertAdjacentHTML('beforeend', tweet('3')); h.notify();
  assert.equal(h.ui.querySelector('[data-id="3"] .text').classList.contains('clamped'), false);
  assert.equal(h.ui.querySelector('.viewport').scrollTop, 123);
  compact.click();
  const body = h.ui.querySelector('.text');
  Object.defineProperty(body, 'clientHeight', { value: 100 });
  Object.defineProperty(body, 'scrollHeight', { value: 150 });
  h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(body.classList.contains('clamped'), true);
  assert.equal(body._readerExpand.hidden, false);
  assert.equal(body._readerExpand.textContent, '展开');
});

test('persists view preferences across reloads and applies them to media search without changing the filter', () => {
  const storage = new Map();
  const first = setup({ storage });
  first.ui.querySelector('[data-setting="imageFree"]').click();
  first.ui.querySelector('[data-setting="compact"]').click();
  assert.deepEqual(JSON.parse(JSON.stringify(storage.get('x-reader-view-preferences-v1'))), { imageFree: true, compact: false });
  const h = setup({ storage, pathname: '/search', search: '?q=photo&f=image' });
  assert.equal(h.ui.querySelector('.list').dataset.layout, 'feed');
  assert.equal(h.ui.querySelector('img'), null);
  assert.equal(h.ui.querySelector('.text').classList.contains('clamped'), false);
  assert.equal(h.ui.querySelector('.tabs [aria-selected="true"]').textContent, '图片');
  h.ui.querySelector('[data-setting="imageFree"]').click();
  assert.equal(h.ui.querySelector('.list').dataset.layout, 'image');
  assert.equal(h.ui.querySelectorAll('.media-card').length, 2);
  assert.equal(h.assignments.length, 0);
});

test('translates the switches at runtime without resetting their state', () => {
  const h = setup();
  h.ui.querySelector('[data-setting="imageFree"]').click();
  h.ui.querySelector('[data-setting="compact"]').click();
  h.document.documentElement.lang = 'en'; h.notify();
  const imageFree = h.ui.querySelector('[data-setting="imageFree"]');
  assert.equal(imageFree.getAttribute('aria-label'), 'Image-free');
  assert.match(imageFree.textContent, /Image-free/);
  assert.equal(imageFree.getAttribute('aria-checked'), 'true');
  assert.equal(h.ui.querySelector('[data-setting="compact"]').getAttribute('aria-checked'), 'false');
  assert.match(h.ui.querySelector('.media a').textContent, /Image 1/);
});

test('automatically loads source-truncated text in normal mode and survives an image-mode change mid-request', async () => {
  let resolveFetch;
  let requests = 0;
  const h = setup({ content: tweet('1', 'Short preview…').replace('</article>', '<a data-testid="tweet-text-show-more-link">Show more</a></article>'),
    fetch: () => { requests++; return new Promise((resolve) => { resolveFetch = resolve; }); } });
  h.ui.querySelector('[data-setting="compact"]').click();
  assert.equal(requests, 1);
  const expand = h.ui.querySelector('.text')._readerExpand;
  assert.equal(expand.textContent, '正在加载…');
  assert.equal(expand.hidden, false);
  assert.equal(expand.disabled, true);
  h.ui.querySelector('[data-setting="imageFree"]').click();
  assert.equal(h.ui.querySelector('.text')._readerExpand.disabled, true);
  resolveFetch({ ok: true, text: async () => '<article><a href="/alice/status/1">Timestamp</a><div data-testid="tweetText">The complete full text arriving after the view has changed.</div></article>' });
  await new Promise(setImmediate);
  assert.equal(requests, 1);
  assert.match(h.ui.querySelector('.text').textContent, /complete full text/);
  assert.equal(h.ui.querySelector('.text').classList.contains('clamped'), false);
  assert.equal(h.ui.querySelector('.text')._readerExpand.hidden, true);
});

test('saved normal mode automatically loads initial, future and late-truncated posts without duplicate requests', async () => {
  const requests = [];
  const truncated = (id) => tweet(id, 'Preview…').replace('</article>', '<a data-testid="tweet-text-show-more-link">Show more</a></article>');
  const h = setup({ storage: new Map([['x-reader-view-preferences-v1', { compact: false }]]),
    content: truncated('1') + tweet('2'), fetch: async (url) => {
      requests.push(url);
      return { ok: true, text: async () => '' };
    } });
  assert.equal(requests.length, 1);
  h.notify();
  assert.equal(requests.length, 1);
  await new Promise(setImmediate);
  h.notify();
  assert.equal(requests.length, 1, 'failed automatic requests are not repeated on refresh');
  h.feed.insertAdjacentHTML('beforeend', truncated('3'));
  h.feed.querySelectorAll('article')[1].insertAdjacentHTML('beforeend', '<a data-testid="tweet-text-show-more-link">Show more</a>');
  h.notify();
  assert.equal(requests.length, 3);
  await new Promise(setImmediate);
  const body = h.ui.querySelector('[data-id="1"] .text');
  assert.equal(body._readerExpand.disabled, false);
  body._readerExpand.click();
  assert.equal(requests.length, 4, 'manual retry remains available');
  await new Promise(setImmediate);
});

test('view switches remain usable when preference storage fails', () => {
  const h = setup({ storage: { get() { throw new Error('Storage unavailable'); }, set() { throw new Error('Storage unavailable'); } } });
  h.ui.querySelector('[data-setting="imageFree"]').click();
  h.ui.querySelector('[data-setting="compact"]').click();
  assert.equal(h.ui.querySelector('img'), null);
  assert.equal(h.ui.querySelector('.text').classList.contains('clamped'), false);
});

test('collects photo-link and unwrapped media alongside standard photos without including avatars or video posters', () => {
  const content = tweet('1').replace('</article>', `
    <a href="/alice/status/1/photo/2"><img srcset="https://pbs.twimg.com/media/second.jpg 1x"></a>
    <img src="https://pbs.twimg.com/media/third.jpg">
    <div data-testid="videoPlayer"><img src="https://pbs.twimg.com/media/poster.jpg"></div>
  </article>`);
  const h = setup({ content });
  const images = h.ui.querySelectorAll('.media .thumbnail:not(:has(.play)) img');
  assert.equal(images.length, 3);
  assert.match(images[1].src, /second\.jpg/);
  assert.match(images[2].src, /third\.jpg/);
});

test('adds images when responsive sources arrive later without resetting expanded text or Reader scroll', () => {
  const h = setup({ content: tweet('1').replace('src="https://pbs.twimg.com/media/example.jpg"', '') });
  const body = h.ui.querySelector('.text');
  body.classList.remove('clamped');
  h.ui.querySelector('.viewport').scrollTop = 123;
  assert.equal(h.ui.querySelectorAll('.media img').length, 0);
  h.feed.querySelector('[data-testid="tweetPhoto"] img').setAttribute('srcset', 'https://pbs.twimg.com/media/late.jpg 1x');
  h.notify();
  assert.match(h.ui.querySelector('.media img').src, /late\.jpg/);
  assert.equal(h.ui.querySelector('.text'), body);
  assert.equal(body.classList.contains('clamped'), false);
  assert.equal(h.ui.querySelector('.viewport').scrollTop, 123);
});

test('keeps a quoted post image separate from the quoting post image, including identical image URLs', () => {
  const h = setup({ content: tweet('1').replace('</article>', `
    <div role="link" tabindex="0">
      <a href="/bob/status/99">Quoted post</a>
      <div data-testid="tweetText">Bob's photo</div>
      <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/example.jpg"></div>
    </div></article>`) });
  const item = h.ui.querySelector('.item');
  assert.equal(item.querySelectorAll(':scope > div > .media .thumbnail').length, 1);
  assert.equal(item.querySelectorAll('.quote .thumbnail').length, 1);
  assert.match(item.querySelector('.quote').textContent, /Bob's photo/);
  item.querySelector('.quote .thumbnail').click();
  assert.equal(h.ui.querySelector('.viewer-content a').href, 'https://x.com/bob/status/99');
});

test('retains collected parent and quote media across partial native snapshots', () => {
  const h = setup({ content: tweet('1').replace('</article>', `
    <div role="link" tabindex="0"><a href="/bob/status/99">Quoted post</a>
      <div data-testid="tweetPhoto"><img></div>
      <div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/media/quote-video.jpg" src="https://video.twimg.com/quote.mp4"></video></div>
    </div></article>`) });
  const body = h.ui.querySelector('.text');
  body.classList.remove('clamped');
  h.feed.querySelector('[role="link"] img').setAttribute('src', 'https://pbs.twimg.com/media/quote.jpg');
  h.notify();
  assert.equal(h.ui.querySelectorAll('.quote .thumbnail').length, 2);
  h.feed.querySelector('[data-testid="tweetPhoto"]').remove();
  h.notify();
  assert.equal(h.ui.querySelectorAll('.quote .thumbnail').length, 2);
  assert.equal(h.ui.querySelectorAll('.item > div > .media .thumbnail').length, 1);
  h.feed.querySelector('article').insertAdjacentHTML('afterbegin', '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/new.jpg"></div>');
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item > div > .media .thumbnail').length, 2);
  assert.equal(h.ui.querySelectorAll('.quote .thumbnail').length, 2);
  assert.equal(h.ui.querySelector('.text'), body);
  assert.equal(body.classList.contains('clamped'), false);
});

test('retains images across native node remounts and deduplicates image renditions in photo order', () => {
  const h = setup({ content: tweet('1').replace('https://pbs.twimg.com/media/example.jpg', 'https://pbs.twimg.com/media/example?format=jpg&name=small') });
  h.feed.innerHTML = tweet('1').replace('https://pbs.twimg.com/media/example.jpg', 'https://pbs.twimg.com/media/example?format=webp&name=large');
  h.notify();
  assert.equal(h.ui.querySelectorAll('.thumbnail').length, 1);
  h.feed.querySelector('[data-testid="tweetPhoto"]').remove();
  h.notify();
  assert.equal(h.ui.querySelectorAll('.thumbnail').length, 1);
  h.feed.innerHTML = tweet('1').replace('<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/example.jpg" alt="示例"></div>', `
    <a href="/alice/status/1/photo/2"><img src="https://pbs.twimg.com/media/second.jpg"></a>
    <a href="/alice/status/1/photo/1"><img src="https://pbs.twimg.com/media/example.jpg"></a>`);
  h.notify();
  const images = [...h.ui.querySelectorAll('.thumbnail img')];
  assert.equal(images.length, 2);
  assert.match(images[0].src, /example/);
  assert.match(images[1].src, /second/);
});

test('does not classify an ordinary clickable photo as quoted media', () => {
  const h = setup({ content: tweet('1').replace('<div data-testid="tweetPhoto">', '<div role="link" tabindex="0" data-testid="tweetPhoto">') });
  assert.equal(h.ui.querySelectorAll('.item > div > .media .thumbnail').length, 1);
  assert.equal(h.ui.querySelector('.quote'), null);
});

test('retries failed thumbnails with original URLs and stops after a bounded number of failures', () => {
  const h = setup({ content: tweet('1') });
  const img = h.ui.querySelector('.thumbnail img');
  const fail = () => img.dispatchEvent(new h.window.Event('error'));
  fail();
  h.advance(1000);
  assert.equal(img.src, 'https://pbs.twimg.com/media/example.jpg');
  img.dispatchEvent(new h.window.Event('load'));
  assert.equal(img.hidden, false);
  assert.equal(h.ui.querySelector('.thumbnail .fallback'), null);
  fail(); h.advance(2000); fail(); h.advance(20000);
  assert.equal(img.hidden, true);
  assert.equal(h.ui.querySelectorAll('.thumbnail .fallback').length, 1);
  const src = img.src;
  h.notify(); h.advance(20000);
  assert.equal(img.src, src);
  assert.equal(h.timers.size, 0);
});

test('cancels pending image retries when the collection is reset', () => {
  const h = setup({ content: tweet('1') });
  const img = h.ui.querySelector('.thumbnail img');
  img.dispatchEvent(new h.window.Event('error'));
  const src = img.src;
  h.ui.querySelectorAll('.tabs button')[1].click();
  h.flush(); h.advance(2000);
  assert.equal(img.src, src);
});

test('does not renew an exhausted retry budget when another media item rerenders the row', () => {
  const h = setup({ content: tweet('1') });
  const img = h.ui.querySelector('.thumbnail img');
  for (let i = 0; i < 3; i++) { img.dispatchEvent(new h.window.Event('error')); h.advance(1000); }
  h.feed.querySelector('article').insertAdjacentHTML('beforeend', '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/second.jpg"></div>');
  h.notify();
  const replacement = h.ui.querySelector('.thumbnail img');
  assert.notEqual(replacement, img);
  assert.equal(replacement.hidden, true);
  assert.equal(replacement.getAttribute('src'), null);
  h.advance(10000);
  assert.equal(h.timers.size, 0);
});

test('cancels viewer image recovery after the viewer closes', () => {
  const h = setup({ content: tweet('1') });
  h.ui.querySelector('.thumbnail').click();
  const img = h.ui.querySelector('.viewer img');
  img.dispatchEvent(new h.window.Event('error'));
  const src = img.src;
  h.ui.querySelector('.viewer-close').click();
  h.advance(2000);
  assert.equal(img.src, src);
  assert.equal(h.timers.size, 0);
});

test('preserves quoted media through unmounts but resets it for a different quoted post', () => {
  const quoted = (id, name) => `<div role="link" tabindex="0"><a href="/bob/status/${id}">Quoted post</a><div data-testid="tweetText">Quote ${id}</div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/${name}.jpg"></div></div>`;
  const h = setup({ content: tweet('1').replace('</article>', `${quoted('99', 'quoted')}</article>`) });
  h.feed.querySelector('[role="link"]').remove();
  h.notify();
  assert.equal(h.ui.querySelectorAll('.quote .thumbnail').length, 1);
  h.feed.querySelector('article').insertAdjacentHTML('beforeend', quoted('100', 'different'));
  h.notify();
  assert.equal(h.ui.querySelectorAll('.quote .thumbnail').length, 1);
  assert.match(h.ui.querySelector('.quote img').src, /different/);
  h.ui.querySelector('.quote .thumbnail').click();
  assert.match(h.ui.querySelector('.viewer-content a').href, /status\/100$/);
});

test('steps through the source timeline and cancels loading on mode changes or timeout', () => {
  const h = setup();
  h.ui.querySelector('.viewport').scrollTop = 123;
  h.ui.querySelector('.more').click();
  const first = h.scrolls.at(-1)[0].top;
  assert.ok(first > 42 && first <= 842);
  h.advance(500);
  assert.ok(h.scrolls.at(-1)[0].top > first);
  assert.equal(h.ui.querySelector('.viewport').scrollTop, 123);
  h.ui.querySelector('.mode-tab[data-mode="x"]').click(); h.flush();
  const count = h.scrolls.length;
  h.advance(20000);
  assert.equal(h.scrolls.length, count);
  const stalled = setup();
  stalled.ui.querySelector('.more').click();
  stalled.advance(20000);
  assert.equal(stalled.ui.querySelector('.more').disabled, false);
  assert.ok(stalled.scrolls.length <= 12);
  assert.equal(stalled.timers.size, 0);
});

test('stops source scrolling before a new route or native tab can receive stale collection steps', () => {
  for (const change of ['route', 'tab']) {
    const h = setup();
    h.ui.querySelector('.more').click();
    const count = h.scrolls.length;
    if (change === 'route') h.location.pathname = '/search';
    else {
      h.nativeTabs[0].setAttribute('aria-selected', 'false');
      h.nativeTabs[1].setAttribute('aria-selected', 'true');
    }
    h.advance(1000);
    assert.equal(h.scrolls.length, count);
    assert.equal(h.ui.querySelector('.more').disabled, false);
    assert.equal(h.timers.size, 0);
  }
});

test('synchronizes delayed native body text without collapsing it or changing scroll position', () => {
  const h = setup({ content: tweet('1', 'Short preview') });
  const body = h.ui.querySelector('.text');
  body.classList.remove('clamped');
  h.ui.querySelector('.viewport').scrollTop = 123;
  h.feed.querySelector('[data-testid="tweetText"]').textContent = 'Full text arriving later';
  h.notify();
  assert.equal(body.textContent, 'Full text arriving later');
  assert.equal(body.classList.contains('clamped'), false);
  assert.equal(h.ui.querySelector('.viewport').scrollTop, 123);
});

test('fetches source-truncated text only on Expand and retains the full text across snapshots', async () => {
  let requests = 0;
  const h = setup({ content: tweet('1', 'Short preview…').replace('</article>', '<a data-testid="tweet-text-show-more-link" href="/alice/status/1">Show more</a></article>'),
    fetch: async (href, options) => {
      requests++;
      assert.equal(href, 'https://x.com/alice/status/1');
      assert.equal(options.credentials, 'omit');
      return { ok: true, text: async () => `<article><div dir="auto" class="whitespace-pre-wrap">Full text with a safe <a href="https://example.com">link</a><script>alert(1)</script></div><a href="/alice/status/1">Timestamp</a></article>` };
    } });
  assert.equal(requests, 0);
  const expand = h.ui.querySelector('.meta button');
  assert.equal(expand.hidden, false);
  expand.click();
  await new Promise(setImmediate);
  const body = h.ui.querySelector('.text');
  assert.equal(requests, 1);
  assert.equal(body.textContent, 'Full text with a safe link');
  assert.equal(body.querySelector('script'), null);
  h.notify();
  assert.equal(body.textContent, 'Full text with a safe link');
  expand.click(); expand.click();
  await new Promise(setImmediate);
  assert.equal(requests, 1);
});

test('provides an original-post fallback when the public detail page cannot supply full text', async () => {
  const h = setup({ content: tweet('1', 'Short preview…').replace('</article>', '<a data-testid="tweet-text-show-more-link">Show more</a></article>'),
    fetch: async () => ({ ok: true, text: async () => '<html><body>Log in</body></html>' }) });
  h.ui.querySelector('.meta button').click();
  await new Promise(setImmediate);
  assert.match(h.ui.querySelector('.full-text-note').textContent, /全文/);
  assert.equal(h.ui.querySelector('.text').textContent, 'Short preview…');
});

test('excludes stale timeline data and restarts numbering after a tab switch', () => {
  const h = setup();
  h.ui.querySelectorAll('.tabs button')[1].click();
  h.flush();
  assert.equal(h.ui.querySelectorAll('.item').length, 0);
  h.nativeTabs[0].setAttribute('aria-selected', 'false');
  h.nativeTabs[1].setAttribute('aria-selected', 'true');
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item').length, 0);
  h.feed.innerHTML = tweet('3', 'Following 内容');
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item').length, 1);
  assert.equal(h.ui.querySelector('.rank').textContent, '1.');
  assert.match(h.ui.querySelector('.list').textContent, /Following 内容/);
});

test('loads more by scrolling the source page while preserving the Reader position', () => {
  const h = setup();
  h.ui.querySelector('.viewport').scrollTop = 123;
  h.ui.querySelector('.more').click();
  assert.equal(h.ui.querySelector('.more').disabled, true);
  assert.ok(h.scrolls.length);
  h.feed.insertAdjacentHTML('beforeend', tweet('3'));
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item').length, 3);
  h.advance(1000);
  assert.equal(h.ui.querySelector('.more').disabled, false);
  assert.equal(h.ui.querySelector('.viewport').scrollTop, 123);
});

test('recognizes a completed tab switch through new native nodes when both feeds have identical posts', () => {
  const h = setup();
  h.ui.querySelectorAll('.tabs button')[1].click();
  h.flush();
  h.nativeTabs[0].setAttribute('aria-selected', 'false');
  h.nativeTabs[1].setAttribute('aria-selected', 'true');
  h.feed.innerHTML = tweet('1') + tweet('2');
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item').length, 2);
  assert.match(h.ui.querySelector('.status').textContent, /正在关注/);
});

test('restores the original view and correctly encodes search navigation', () => {
  const h = setup();
  h.ui.querySelector('.search input').value = '中文 & AI';
  h.ui.querySelector('.search').dispatchEvent(new h.window.Event('submit', { cancelable: true }));
  assert.equal(h.assignments[0], '/search?q=%E4%B8%AD%E6%96%87%20%26%20AI&src=typed_query');
  h.ui.querySelector('.mode-tab[data-mode="x"]').click();
  h.flush();
  assert.equal(h.document.documentElement.hasAttribute('data-x-reader-home'), false);
  assert.equal(h.ui.querySelector('.app').hidden, true);
  assert.deepEqual(h.scrolls.at(-1), [0, 42]);
});

test('clamps text to five lines and shows Expand only when content overflows', () => {
  const h = setup();
  assert.match(h.ui.querySelector('style').textContent, /-webkit-line-clamp: 5/);
  const text = h.ui.querySelector('.text');
  const expand = text._readerExpand;
  Object.defineProperty(text, 'clientHeight', { value: 100, configurable: true });
  Object.defineProperty(text, 'scrollHeight', { value: 100, configurable: true });
  h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(expand.hidden, true);
  Object.defineProperty(text, 'scrollHeight', { value: 150, configurable: true });
  h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(expand.hidden, false);
  expand.click();
  assert.equal(text.classList.contains('clamped'), false);
  assert.equal(expand.textContent, '收起');
});

test('shows video posters as thumbnails and plays available direct URLs in the viewer', () => {
  const h = setup();
  h.feed.insertAdjacentHTML('beforeend', tweet('3').replace(
    '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/example.jpg" alt="示例"></div>',
    '<div data-testid="videoPlayer"><div data-testid="videoComponent"><video poster="https://pbs.twimg.com/ext_tw_video_thumb/poster.jpg" src="https://video.twimg.com/example.mp4"></video></div></div>',
  ));
  h.notify();
  const thumbnail = h.ui.querySelector('[data-id="3"] .thumbnail');
  assert.ok(thumbnail.querySelector('.play'));
  assert.match(thumbnail.querySelector('img').src, /poster.jpg/);
  assert.equal(h.ui.querySelectorAll('[data-id="3"] .thumbnail').length, 1);
  thumbnail.click();
  const video = h.ui.querySelector('.viewer video');
  assert.equal(video.src, 'https://video.twimg.com/example.mp4');
  assert.equal(video.controls, true);
  let paused = false;
  video.pause = () => { paused = true; };
  video.load = () => {};
  h.ui.querySelector('.viewer-close').click();
  assert.equal(paused, true);
});

test('updates delayed video posters and safely falls back for blob video sources', () => {
  const h = setup();
  h.feed.insertAdjacentHTML('beforeend', tweet('3').replace(
    '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/example.jpg" alt="示例"></div>',
    '<div data-testid="videoPlayer"><video src="blob:https://x.com/example"></video></div>',
  ));
  h.notify();
  assert.equal(h.ui.querySelector('[data-id="3"] .thumbnail img'), null);
  h.feed.querySelector('[data-testid="videoPlayer"] video').setAttribute('poster', 'https://pbs.twimg.com/media/poster.jpg');
  h.notify();
  const thumbnail = h.ui.querySelector('[data-id="3"] .thumbnail');
  assert.ok(thumbnail.querySelector('img'));
  thumbnail.click();
  assert.equal(h.ui.querySelector('.viewer video'), null);
  assert.match(h.ui.querySelector('.viewer-note').textContent, /原帖播放/);
  assert.match(h.ui.querySelector('.viewer-content a').href, /status\/3/);
});

test('supports system themes and an opaque floating segmented control at the bottom center', () => {
  const h = setup();
  const css = h.ui.querySelector('style').textContent;
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /--link: #1d9bf0/);
  assert.doesNotMatch(css, /#ff6600|#f60\b/);
  const footerCSS = css.match(/\.switchbar \{([^}]+)\}/)[1];
  assert.match(footerCSS, /position: fixed/);
  assert.doesNotMatch(footerCSS, /background:|border-top:|height:/);
  assert.match(footerCSS, /pointer-events: none/);
  assert.doesNotMatch(css, /backdrop-filter|glass-glint|glass-edge|linear-gradient/);
  assert.match(css, /--segment-bg: #eff3f4; --segment-thumb: #fff/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /pointer-events: auto/);
  assert.match(h.document.head.querySelector('style').textContent, /body \{ padding-bottom: calc\(88px/);
  assert.equal(h.ui.querySelectorAll('.mode-tab').length, 2);
  const original = h.ui.querySelector('.mode-tab[data-mode="x"]');
  const reader = h.ui.querySelector('.mode-tab[data-mode="reader"]');
  assert.equal(original.textContent, 'Origin');
  assert.equal(reader.textContent, 'Reader');
  assert.equal(reader.getAttribute('aria-pressed'), 'true');
  assert.equal(h.ui.querySelector('.segments').dataset.mode, 'reader');
  original.click();
  h.flush();
  assert.equal(original.getAttribute('aria-pressed'), 'true');
  assert.equal(reader.getAttribute('aria-pressed'), 'false');
  assert.equal(h.ui.querySelector('.segments').dataset.mode, 'x');
  assert.equal(h.ui.querySelector('.switchbar').parentNode, h.ui);
  original.click();
  h.flush();
  assert.equal(h.ui.querySelector('.app').hidden, true);
  reader.click();
  h.flush();
  assert.equal(reader.getAttribute('aria-pressed'), 'true');
  assert.equal(h.ui.querySelector('.segments').dataset.mode, 'reader');
  assert.equal(h.ui.querySelectorAll('.switchbar').length, 1);
  assert.equal(h.ui.querySelector('.switchbar').parentNode, h.ui);
  assert.equal(h.ui.querySelector('.original'), null);
});

test('displays quotes directly without folding controls or the five-line body limit', () => {
  const h = setup();
  h.feed.insertAdjacentHTML('beforeend', tweet('3', '外层正文').replace('</article>', `
    <div role="link" tabindex="0">
      <a href="/quoted/status/99">Quoted post</a>
      <div data-testid="User-Name"><a href="/quoted">引用作者</a><svg data-testid="icon-verified"></svg></div>
      <div data-testid="tweetText">引用原文第一行<br>第二行</div>
    </div></article>`));
  h.notify();
  const item = h.ui.querySelector('[data-id="3"]');
  const quote = item.querySelector('.quote');
  assert.equal(quote.hidden, false);
  assert.match(quote.textContent, /引用原文第一行/);
  assert.equal(quote.classList.contains('clamped'), false);
  assert.equal(item.querySelector('.text').textContent, '外层正文');
  assert.equal(item.querySelector('.verified'), null);
  assert.equal([...item.querySelectorAll('button')].some((button) => /^(引用|收起引用)$/.test(button.textContent)), false);
});

test('shows author avatars, display names, usernames, and only genuine source badges', () => {
  const h = setup();
  const item = h.ui.querySelector('[data-id="1"]');
  assert.match(item.querySelector('.author .avatar').src, /profile_images\/alice.jpg/);
  assert.equal(item.querySelector('.author-name').textContent, 'Alice');
  assert.equal(item.querySelector('.username').textContent, '@alice');
  assert.equal(item.querySelector('.verified'), null);
  h.feed.querySelector('[data-testid="User-Name"]').insertAdjacentHTML('beforeend', '<svg data-testid="icon-verified" aria-label="Verified account"></svg>');
  h.notify();
  assert.equal(item.querySelector('.verified').getAttribute('aria-label'), '已认证');
  assert.equal(item.querySelectorAll('.avatar').length, 1);
});

test('hides Expand before layout and removes it when the text no longer overflows', () => {
  const h = setup();
  const text = h.ui.querySelector('.text');
  const expand = text._readerExpand;
  Object.defineProperty(text, 'clientHeight', { value: 0, configurable: true });
  Object.defineProperty(text, 'scrollHeight', { value: 200, configurable: true });
  h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(expand.hidden, true);
  Object.defineProperty(text, 'clientHeight', { value: 100, configurable: true });
  h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(expand.hidden, false);
  Object.defineProperty(text, 'scrollHeight', { value: 100, configurable: true });
  h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(expand.hidden, true);
});

test('shows search instructions without collecting stale posts before a query is entered', () => {
  const h = setup({ pathname: '/search' });
  assert.equal(h.ui.querySelector('.app').hidden, false);
  assert.equal(h.ui.querySelectorAll('.item').length, 0);
  assert.equal(h.ui.querySelector('.more').hidden, true);
  assert.match(h.ui.querySelector('.empty').textContent, /输入关键词/);
  assert.equal(h.ui.querySelector('.nav a[href="/search"]').getAttribute('aria-current'), 'page');
});

test('renders independent search results, safely displays queries, and offers five filters', () => {
  const query = '中文 & <script> from:alice';
  const h = setup({ pathname: '/search', search: `?q=${encodeURIComponent(query)}` });
  assert.equal(h.ui.querySelectorAll('.item').length, 2);
  assert.equal(h.ui.querySelector('.search input').value, query);
  assert.equal(h.ui.querySelector('.search-heading').textContent, `搜索：${query}`);
  assert.equal(h.ui.querySelector('.search-heading script'), null);
  assert.deepEqual([...h.ui.querySelectorAll('.tabs button')].map((tab) => tab.textContent), ['热门', '最新', '用户', '图片', '视频']);
  h.ui.querySelectorAll('.tabs button')[1].click();
  assert.equal(h.assignments[0], `/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`);
});

test('preserves the search filter on submission and stays on search when switching views', () => {
  const h = setup({ pathname: '/search', search: '?q=hello&f=image' });
  assert.equal(h.ui.querySelectorAll('.tabs button')[3].getAttribute('aria-selected'), 'true');
  h.ui.querySelector('.search input').value = '#AI';
  h.ui.querySelector('.search').dispatchEvent(new h.window.Event('submit', { cancelable: true }));
  assert.equal(h.assignments[0], '/search?q=%23AI&src=typed_query&f=image');
  h.ui.querySelector('.mode-tab[data-mode="x"]').click(); h.flush();
  assert.equal(h.ui.querySelector('.app').hidden, true);
  h.ui.querySelector('.mode-tab[data-mode="reader"]').click(); h.flush();
  assert.equal(h.ui.querySelector('.app').hidden, false);
  assert.equal(h.assignments.length, 1);
});

test('renders and deduplicates people results with avatars, badges, usernames, and biographies', () => {
  const person = `<div data-testid="UserCell">
    <a href="/alice"><img src="https://pbs.twimg.com/profile_images/alice.jpg"></a>
    <div data-testid="User-Name"><a href="/alice">Alice</a><span>@alice</span><svg data-testid="icon-verified"></svg></div>
    <div data-testid="UserDescription">Build things &lt;img src=x&gt;</div>
  </div>`;
  const h = setup({ pathname: '/search', search: '?q=alice&f=user', content: person });
  assert.equal(h.ui.querySelectorAll('.person').length, 1);
  assert.equal(h.ui.querySelector('.username').textContent, '@alice');
  assert.ok(h.ui.querySelector('.avatar[src]'));
  assert.ok(h.ui.querySelector('.verified'));
  assert.match(h.ui.querySelector('.bio').textContent, /Build things <img src=x>/);
  assert.equal(h.ui.querySelector('.bio img'), null);
  h.feed.insertAdjacentHTML('beforeend', person);
  h.notify();
  assert.equal(h.ui.querySelectorAll('.person').length, 1);
});

test('appends search results without changing the Reader scroll position', () => {
  const h = setup({ pathname: '/search', search: '?q=hello&f=live' });
  h.ui.querySelector('.viewport').scrollTop = 250;
  h.ui.querySelector('.more').click();
  assert.match(h.ui.querySelector('.status').textContent, /搜索加载/);
  h.feed.insertAdjacentHTML('beforeend', tweet('3', 'next result'));
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item').length, 3);
  assert.equal(h.ui.querySelector('.viewport').scrollTop, 250);
});

test('shows empty-result feedback instead of remaining in a loading state', () => {
  const h = setup({ pathname: '/search', search: '?q=nothing', content: '<div data-testid="emptyState">没有找到结果，请换个关键词</div>' });
  assert.match(h.ui.querySelector('.empty').textContent, /没有找到结果/);
  assert.equal(h.ui.querySelector('.more').hidden, true);
  assert.equal(h.ui.querySelectorAll('.item').length, 0);
});

test('clears old results on SPA query changes without mixing posts from the previous search', () => {
  const h = setup({ pathname: '/search', search: '?q=first' });
  assert.equal(h.ui.querySelectorAll('.item').length, 2);
  h.location.search = '?q=second';
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item').length, 0);
  assert.equal(h.ui.querySelector('.search input').value, 'second');
  h.feed.innerHTML = tweet('3', 'second result');
  h.notify();
  assert.equal(h.ui.querySelectorAll('.item').length, 1);
  assert.match(h.ui.querySelector('.list').textContent, /second result/);
  assert.equal(h.ui.querySelector('.rank').textContent, '1.');
});

test('supports photo link grids without articles and deduplicates them by post', () => {
  const h = setup({ pathname: '/search', search: '?q=photo&f=image', content: `
    <a href="/alice/status/3/photo/1"><img src="https://pbs.twimg.com/media/a.jpg" alt="示例"></a>
    <a href="/alice/status/3/photo/2"><img src="https://pbs.twimg.com/media/b.jpg" alt="示例"></a>` });
  assert.equal(h.ui.querySelectorAll('.media-card').length, 1);
  assert.equal(h.ui.querySelectorAll('.thumbnail').length, 2);
  assert.equal(h.ui.querySelector('.username').textContent, '@alice');
  h.ui.querySelector('.thumbnail').click();
  assert.ok(h.ui.querySelector('.viewer-content img'));
});

test('supports video search link grids containing only poster images', () => {
  const h = setup({ pathname: '/search', search: '?q=video&f=video', content: `
    <a href="/alice/status/3"><img src="https://pbs.twimg.com/ext_tw_video_thumb/poster.jpg"></a>` });
  assert.ok(h.ui.querySelector('.thumbnail .play'));
  h.ui.querySelector('.thumbnail').click();
  assert.match(h.ui.querySelector('.viewer-note').textContent, /原帖播放/);
});

test('uses dedicated photo and video grids while retaining the text feed layout', () => {
  const photos = setup({ pathname: '/search', search: '?q=photo&f=image' });
  assert.equal(photos.ui.querySelector('.list').dataset.layout, 'image');
  assert.equal(photos.ui.querySelectorAll('.media-card').length, 2);
  assert.equal(photos.ui.querySelector('.rank'), null);
  assert.equal(photos.ui.querySelector('.text'), null);
  assert.ok(photos.ui.querySelector('.media-card .caption'));
  photos.ui.querySelector('.thumbnail').click();
  assert.ok(photos.ui.querySelector('.viewer-content img'));
  const videos = setup({ pathname: '/search', search: '?q=video&f=video', content: `
    <a href="/alice/status/3"><img src="https://pbs.twimg.com/ext_tw_video_thumb/poster.jpg"></a>` });
  assert.equal(videos.ui.querySelector('.list').dataset.layout, 'video');
  assert.ok(videos.ui.querySelector('.media-card .play'));
  assert.equal(videos.ui.querySelector('.rank'), null);
  const home = setup();
  assert.equal(home.ui.querySelector('.list').dataset.layout, 'feed');
  assert.ok(home.ui.querySelector('.rank'));
});

test('preserves the media grid when media arrives asynchronously', () => {
  const h = setup({ pathname: '/search', search: '?q=video&f=video', content: tweet('3').replace(
    '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/example.jpg" alt="示例"></div>', '',
  ) });
  assert.ok(h.ui.querySelector('.media-placeholder'));
  h.feed.querySelector('article').insertAdjacentHTML('beforeend', '<div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/media/poster.jpg"></video></div>');
  h.notify();
  assert.equal(h.ui.querySelector('.media-placeholder'), null);
  assert.ok(h.ui.querySelector('.media-card .thumbnail img'));
  assert.equal(h.ui.querySelector('.rank'), null);
});

test('centers loading messages, the load-more button, and footer text with consistent spacing', () => {
  const h = setup();
  const css = h.ui.querySelector('style').textContent;
  assert.match(css.match(/\.status \{([^}]+)\}/)[1], /text-align: center/);
  assert.match(css.match(/\.more \{([^}]+)\}/)[1], /margin: 28px auto 14px/);
  assert.match(css.match(/\.foot \{([^}]+)\}/)[1], /text-align: center/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /aspect-ratio: 16 \/ 9/);
});

test('uses Chinese for Chinese interfaces, including Simplified and Traditional language tags', () => {
  for (const lang of ['zh', 'zh-CN', 'zh-TW', 'zh-HK', 'ZH_hans']) {
    const h = setup({ lang, pathname: '/search', search: '?q=测试' });
    assert.equal(h.ui.querySelector('.nav a').textContent, '首页');
    assert.equal(h.ui.querySelector('.more').textContent, '加载更多');
    assert.equal(h.ui.querySelector('.search input').getAttribute('placeholder'), '搜索 X');
    assert.equal(h.ui.querySelector('.tabs button').textContent, '热门');
    assert.equal(h.document.querySelector('#x-reader-app').getAttribute('lang'), 'zh');
  }
});

test('uses English for all non-Chinese interfaces without translating Chinese posts', () => {
  for (const lang of ['en', 'ja', 'fr-FR', 'ko', 'ar', '']) {
    const h = setup({ lang, pathname: '/search', search: '?q=中文' });
    assert.equal(h.ui.querySelector('.nav a').textContent, 'Home');
    assert.equal(h.ui.querySelector('.more').textContent, 'Load more');
    assert.equal(h.ui.querySelector('.search-heading').textContent, 'Search: 中文');
    assert.deepEqual([...h.ui.querySelectorAll('.tabs button')].map((tab) => tab.textContent), ['Top', 'Latest', 'People', 'Photos', 'Videos']);
    assert.match(h.ui.querySelector('.list').textContent, /第二条/);
    assert.match(h.ui.querySelector('.meta').textContent, /12 likes/);
    assert.equal(h.ui.querySelector('.thumbnail').getAttribute('aria-label'), 'View image 1');
    assert.equal(h.ui.querySelector('.viewer').getAttribute('aria-label'), 'Media viewer');
  }
});

test('updates interface language at runtime without clearing content, input, or expansion state', () => {
  const h = setup();
  const row = h.ui.querySelector('.item');
  const expand = h.ui.querySelector('.text')._readerExpand;
  expand.click();
  h.ui.querySelector('.search input').value = '尚未提交';
  h.ui.querySelector('.viewport').scrollTop = 123;
  h.ui.querySelector('.thumbnail').click();
  h.document.documentElement.setAttribute('lang', 'ja');
  h.notify();
  assert.equal(h.ui.querySelector('.item'), row);
  assert.equal(expand.textContent, 'Collapse');
  assert.equal(h.ui.querySelector('.more').textContent, 'Load more');
  assert.equal(h.ui.querySelector('.search input').value, '尚未提交');
  assert.equal(h.ui.querySelector('.viewport').scrollTop, 123);
  assert.equal(h.ui.querySelector('.viewer-close').textContent, 'Close ✕');
  assert.equal(h.ui.querySelector('.viewer-content a').textContent, 'Open original post ↗');
  assert.match(h.ui.querySelector('.status').textContent, /For you/);
  h.document.documentElement.setAttribute('lang', 'zh-TW');
  h.notify();
  assert.equal(expand.textContent, '收起');
  assert.equal(h.ui.querySelector('.more').textContent, '加载更多');
});

test('translates standard home tabs into English while preserving custom list names', () => {
  const h = setup({ lang: 'ja' });
  h.nativeTabs[0].textContent = 'おすすめ';
  h.nativeTabs[1].textContent = 'フォロー中';
  h.document.querySelector('[role="tablist"]').insertAdjacentHTML('beforeend', '<button role="tab" aria-selected="false">我的列表</button>');
  h.notify();
  assert.deepEqual([...h.ui.querySelectorAll('.tabs button')].map((tab) => tab.textContent), ['For you', 'Following', '我的列表']);
});

test('falls back to native navigation labels only when an explicit language tag is missing', () => {
  const h = setup({ lang: '' });
  h.document.body.insertAdjacentHTML('afterbegin', '<header role="banner"><nav><a href="/home" data-testid="AppTabBar_Home_Link" aria-label="首頁">首頁</a></nav></header>');
  h.notify();
  assert.equal(h.ui.querySelector('.nav a').textContent, '首页');
  h.document.documentElement.setAttribute('lang', 'en');
  h.notify();
  assert.equal(h.ui.querySelector('.nav a').textContent, 'Home');
});

test('uses English for non-Chinese empty-result notices and video fallback messages', () => {
  const empty = setup({ lang: 'ja', pathname: '/search', search: '?q=missing', content: '<div data-testid="emptyState">結果はありません</div>' });
  assert.match(empty.ui.querySelector('.empty').textContent, /No results found/);
  const video = setup({ lang: 'fr', pathname: '/search', search: '?q=video&f=video', content: '<a href="/alice/status/3"><img src="https://pbs.twimg.com/ext_tw_video_thumb/poster.jpg"></a>' });
  video.ui.querySelector('.thumbnail').click();
  assert.match(video.ui.querySelector('.viewer-note').textContent, /playable video URL/);
  assert.equal(video.ui.querySelector('.viewer-content a').textContent, 'Watch original video ↗');
});
