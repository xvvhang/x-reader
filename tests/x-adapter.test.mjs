import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
import { createXAdapter, safeURL } from '../src/x-adapter.js';
import { createI18n } from '../src/i18n.js';

const fixture = readFileSync(new URL('./fixtures/x/home.html', import.meta.url), 'utf8');

function setup({ html = fixture, pathname = '/home', search = '', selectors = {} } = {}) {
  const { window, document } = parseHTML(html);
  const scrolls = [];
  const navigations = [];
  window.scrollY = 42;
  window.scrollTo = (...args) => scrolls.push(args);
  const location = { origin: 'https://x.com', pathname, search, assign: (url) => navigations.push(url) };
  const adapter = createXAdapter({ document, window, location, selectors });
  return { adapter, document, window, location, scrolls, navigations };
}

test('returns normalized post data and opaque source identities without exposing DOM nodes', () => {
  const { adapter } = setup();
  const snapshot = adapter.snapshot();
  assert.equal(snapshot.health, 'ready');
  assert.equal(snapshot.items.length, 1);
  const post = snapshot.items[0];
  assert.equal(post.id, '123');
  assert.equal(post.username, '@alice');
  assert.equal(post.verified, 'blue');
  assert.equal(post.quote, 'Quoted text\nSecond line');
  assert.equal(post.tokens.map((token) => token.text).join(''), 'Hello\nexample🙂<script>example</script>');
  assert.deepEqual(post.metrics, [{ count: '12', key: 'likes' }]);
  assert.equal(post.media[0].kind, 'image');
  assert.equal(snapshot.tabs[0].selected, true);
  assert.equal(typeof snapshot.sourceIds[0], 'number');
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
});

test('separates parent and quoted media into normalized groups', () => {
  const html = fixture.replace('Second line</div></div>', `Second line</div>
    <a href="/bob/status/456">Quoted post</a>
    <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/quoted.jpg"></div>
    <div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/media/quoted-video.jpg" src="https://video.twimg.com/quoted.mp4"></video></div>
  </div>`);
  const post = setup({ html }).adapter.snapshot().items[0];
  assert.equal(post.media.length, 1);
  assert.equal(post.media[0].src, 'https://pbs.twimg.com/media/example.jpg');
  assert.equal(post.quoteMedia.length, 2);
  assert.equal(post.quoteMedia[0].src, 'https://pbs.twimg.com/media/quoted.jpg');
  assert.equal(post.quoteMedia[1].kind, 'video');
  assert.equal(post.quoteURL, 'https://x.com/bob/status/456');
});

test('extracts only scoped background photos, excluding cards, avatars, emoji and video posters', () => {
  const html = fixture.replace('<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/example.jpg" alt="Example"></div>', `
    <a href="/alice/status/123/photo/1"><div style="background-image: url('https://pbs.twimg.com/media/background.jpg')"></div></a>
    <div style="background-image: url(https://pbs.twimg.com/media/unrelated.jpg)"></div>
    <div data-testid="card.wrapper"><img src="https://pbs.twimg.com/media/card.jpg"></div>
    <div data-testid="Tweet-User-Avatar"><img src="https://pbs.twimg.com/media/avatar.jpg"></div>
    <div data-testid="tweetText"><img src="https://pbs.twimg.com/media/emoji.jpg" alt="🙂"></div>
    <div data-testid="videoPlayer"><div style="background-image: url(https://pbs.twimg.com/media/poster.jpg)"></div></div>`);
  const post = setup({ html }).adapter.snapshot().items[0];
  assert.deepEqual(post.media.filter((media) => media.kind === 'image').map((media) => media.src), ['https://pbs.twimg.com/media/background.jpg']);
  assert.equal(post.media.find((media) => media.kind === 'video').poster, 'https://pbs.twimg.com/media/poster.jpg');
});

test('uses post identities to classify nested clickable media and reject same-post quote lookalikes', () => {
  const html = fixture.replace('<div role="link" tabindex="0">', '<div role="link" tabindex="0" data-href="/bob/status/456">')
    .replace('Second line</div></div>', `Second line</div><a role="link" tabindex="0" href="/bob/status/456/photo/1"><img src="https://pbs.twimg.com/media/quoted.jpg"></a></div>`)
    .replace('<div data-testid="tweetPhoto">', '<div role="link" tabindex="0" data-href="/alice/status/123/photo/1" data-testid="tweetPhoto">');
  const post = setup({ html }).adapter.snapshot().items[0];
  assert.equal(post.media.length, 1);
  assert.equal(post.quoteMedia.length, 1);
  assert.equal(post.quoteId, '456');
  assert.equal(post.quoteMedia[0].ownerId, '456');
  assert.equal(post.media[0].ownerId, '123');
});

test('treats absent media as unknown and observed media as partial rather than authoritative emptiness', () => {
  const h = setup();
  assert.equal(h.adapter.snapshot().items[0].mediaState, 'partial');
  h.document.querySelector('[data-testid="tweetPhoto"]').remove();
  assert.equal(h.adapter.snapshot().items[0].mediaState, 'unknown');
});

test('keeps media in an explicit quote frame separate before its identity link mounts', () => {
  const html = fixture.replace('<div role="link" tabindex="0"><a href="/bob/status/456">Quoted post</a><div data-testid="tweetText">Quoted text<br>Second line</div></div>', '<div data-testid="quoteTweet"><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/pending.jpg"></div></div>');
  const h = setup({ html });
  const first = h.adapter.snapshot().items[0];
  assert.equal(first.media.length, 1);
  assert.equal(first.quoteMedia.length, 1);
  assert.equal(first.quoteMedia[0].ownerId, null);
  h.document.querySelector('[data-testid="quoteTweet"]').setAttribute('data-href', '/bob/status/456');
  const second = h.adapter.snapshot().items[0];
  assert.equal(second.media.length, 1);
  assert.equal(second.quoteMedia[0].ownerId, '456');
});

test('extracts background-only photo search links and rejects unsafe background sources', () => {
  const html = `<html><body><main data-testid="primaryColumn">
    <a href="/alice/status/123/photo/1" style="background-image: url(https://pbs.twimg.com/media/background.jpg)"></a>
    <a href="/alice/status/123/photo/2"><div style="background-image: url(https://example.com/tracker.jpg)"></div></a>
  </main></body></html>`;
  const snapshot = setup({ html, pathname: '/search', search: '?q=photos&f=image' }).adapter.snapshot();
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].media[0].src, 'https://pbs.twimg.com/media/background.jpg');
  assert.equal(snapshot.items[0].media[0].order, 1);
});

test('deduplicates image and background representations and keeps explicit photo order', () => {
  const html = fixture.replace('<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/example.jpg" alt="Example"></div>', `
    <a href="/alice/status/123/photo/2"><img src="https://pbs.twimg.com/media/second.jpg"></a>
    <a href="/alice/status/123/photo/1"><div style="background-image: url(https://pbs.twimg.com/media/example?format=webp&amp;name=small)"></div><img src="https://pbs.twimg.com/media/example.jpg" alt="Example"></a>`);
  const media = setup({ html }).adapter.snapshot().items[0].media;
  assert.equal(media.length, 2);
  assert.equal(media[0].order, 1);
  assert.equal(media[0].alt, 'Example');
  assert.equal(media[1].order, 2);
});

test('source scrolling uses overlapping steps and does not scroll backwards or beyond the end', () => {
  const h = setup();
  h.window.innerHeight = 800;
  Object.defineProperty(h.document.documentElement, 'scrollHeight', { value: 2000 });
  h.adapter.loadMore();
  assert.equal(h.scrolls.at(-1)[0].top, 642);
  h.window.scrollY = 1000;
  assert.deepEqual(h.adapter.loadMore(), { moved: true, atEnd: true });
  assert.equal(h.scrolls.at(-1)[0].top, 1200);
  h.window.scrollY = 1500;
  const count = h.scrolls.length;
  assert.deepEqual(h.adapter.loadMore(), { moved: false, atEnd: true });
  assert.equal(h.scrolls.length, count);
});

test('recognizes source truncation independently of quoted-post truncation', () => {
  const quoted = fixture.replace('Second line</div>', 'Second line</div><a data-testid="tweet-text-show-more-link">Show more</a>');
  assert.equal(setup({ html: quoted }).adapter.snapshot().items[0].truncated, false);
  const parent = fixture.replace('</article>', '<a data-testid="tweet-text-show-more-link">Show more</a></article>');
  assert.equal(setup({ html: parent }).adapter.snapshot().items[0].truncated, true);
});

test('full-text loading validates post identity and excludes quoted text and unsafe links', async () => {
  const h = setup();
  h.window.AbortController = AbortController;
  h.window.setTimeout = () => 1;
  h.window.clearTimeout = () => {};
  let html = `<article><div role="link" tabindex="0"><article><div dir="auto" class="whitespace-pre-wrap">Quoted text</div><a href="/bob/status/456">Timestamp</a></article></div>
    <div dir="auto" class="whitespace-pre-wrap">Full body<br><a href="javascript:alert(1)">unsafe</a><img alt="🙂"></div><a href="/alice/status/123">Timestamp</a></article>`;
  let requests = 0;
  h.window.fetch = async () => { requests++; return { ok: true, text: async () => html }; };
  const post = { id: '123', url: 'https://x.com/alice/status/123' };
  const result = await h.adapter.fullText(post);
  assert.equal(result.tokens.map((token) => token.text).join(''), 'Full body\nunsafe🙂');
  assert.equal(result.tokens.find((token) => token.text === 'unsafe').href, null);
  html = html.replace('/alice/status/123', '/alice/status/999');
  assert.equal(await h.adapter.fullText(post), null);
  assert.equal(await h.adapter.fullText({ ...post, url: 'https://example.com/alice/status/123' }), null);
  assert.equal(requests, 2);
});

test('uses ordered primary-column and article fallbacks after native markup changes', () => {
  const html = fixture.replace('data-testid="primaryColumn"', 'role="main"').replace('data-testid="tweet"', 'role="article"');
  assert.equal(setup({ html }).adapter.snapshot().items[0].id, '123');
});

test('adapts renamed text and author elements through selector rules only', () => {
  const html = fixture.replaceAll('data-testid="tweetText"', 'class="post-body"').replace('data-testid="User-Name"', 'class="identity"');
  const { adapter } = setup({ html, selectors: { text: ['.post-body'], author: ['.identity'] } });
  const post = adapter.snapshot().items[0];
  assert.equal(post.author, 'Alice');
  assert.match(post.tokens[0].text, /Hello/);
  assert.equal(post.quote, 'Quoted text\nSecond line');
});

test('keeps source identity stable and changes it when an identical post is remounted', () => {
  const h = setup();
  const first = h.adapter.snapshot();
  assert.deepEqual(h.adapter.snapshot().sourceIds, first.sourceIds);
  const post = h.document.querySelector('article');
  post.replaceWith(post.cloneNode(true));
  const second = h.adapter.snapshot();
  assert.equal(first.signature, second.signature);
  assert.notDeepEqual(first.sourceIds, second.sourceIds);
});

test('reports loading, empty, error, signed-out, and suspected selector drift separately', () => {
  const html = (content) => `<html><body><div id="react-root"><main data-testid="primaryColumn">${content}</main></div></body></html>`;
  assert.equal(setup({ html: html('<div role="progressbar"></div>') }).adapter.snapshot().health, 'loading');
  assert.equal(setup({ html: html('<div data-testid="emptyState">No content</div>') }).adapter.snapshot().health, 'empty');
  assert.equal(setup({ html: html('<div data-testid="error-detail">Error</div>') }).adapter.snapshot().health, 'error');
  assert.equal(setup({ html: '<html><body><a href="/login">Log in</a></body></html>' }).adapter.snapshot().health, 'signed-out');
  assert.equal(setup({ html: html('<a href="/alice/status/123">Unrecognized card</a>') }).adapter.snapshot().health, 'unmatched');
  assert.equal(setup({ html: html('') }).adapter.snapshot().health, 'waiting');
});

test('rejects promoted posts and unsafe media URLs', () => {
  const promoted = setup({ html: fixture.replace('<article data-testid="tweet">', '<article data-testid="tweet"><span data-testid="promotedIndicator"></span>') });
  assert.equal(promoted.adapter.snapshot().items.length, 0);
  const unsafe = setup({ html: fixture.replace('https://pbs.twimg.com/media/example.jpg', 'https://example.com/tracker.jpg') });
  assert.equal(unsafe.adapter.snapshot().items[0].media.length, 0);
  assert.equal(safeURL('javascript:alert(1)', false, 'https://x.com'), null);
  assert.equal(safeURL('https://example.com/a.jpg', true, 'https://x.com'), null);
});

test('reads currentSrc and responsive photo sources while rejecting unsafe source candidates', () => {
  const h = setup();
  const img = h.document.querySelector('[data-testid="tweetPhoto"] img');
  img.setAttribute('src', 'data:image/gif;base64,AAAA');
  img.setAttribute('srcset', 'https://example.com/tracker.jpg 1x, https://pbs.twimg.com/media/responsive.jpg 2x');
  assert.equal(h.adapter.snapshot().items[0].media[0].src, 'https://pbs.twimg.com/media/responsive.jpg');
  Object.defineProperty(img, 'currentSrc', { configurable: true, value: 'https://pbs.twimg.com/media/selected.jpg' });
  assert.equal(h.adapter.snapshot().items[0].media[0].src, 'https://pbs.twimg.com/media/selected.jpg');
  Object.defineProperty(img, 'currentSrc', { value: 'https://example.com/tracker.jpg' });
  img.setAttribute('srcset', 'javascript:alert(1) 1x');
  assert.equal(h.adapter.snapshot().items[0].media.length, 0);
});

test('discovers responsive-only media search cards', () => {
  const h = setup({ pathname: '/search', search: '?q=photos&f=image', html: `<html><body><main data-testid="primaryColumn">
    <a href="/alice/status/123/photo/1"><img srcset="https://pbs.twimg.com/media/responsive.jpg 1x"></a>
  </main></body></html>` });
  assert.equal(h.adapter.snapshot().items[0].media[0].src, 'https://pbs.twimg.com/media/responsive.jpg');
});

test('detects stale native search input without accepting results for another query', () => {
  const h = setup({ pathname: '/search', search: '?q=new&f=live', html: fixture.replace('<article', '<input data-testid="SearchBox_Search_Input" value="old"><article') });
  assert.equal(h.adapter.snapshot().searchMatches, false);
  h.document.querySelector('input').value = 'new';
  assert.equal(h.adapter.snapshot().searchMatches, true);
  assert.equal(h.adapter.pageState().filter, 'live');
});

test('owns native tab activation, pagination, navigation, and source visibility', () => {
  const h = setup();
  let clicked = 0;
  h.document.querySelectorAll('[role="tab"]')[1].addEventListener('click', () => clicked++);
  assert.equal(h.adapter.activateTab('home:1'), true);
  assert.equal(clicked, 1);
  assert.equal(h.adapter.activateTab('missing'), false);
  assert.equal(h.adapter.scrollPosition(), 42);
  h.adapter.restoreScroll(12);
  assert.deepEqual(h.scrolls.at(-1), [0, 12]);
  h.adapter.loadMore();
  assert.equal(h.scrolls.at(-1)[0].behavior, 'instant');
  h.adapter.navigate(h.adapter.searchURL('a & b', 'image'));
  assert.equal(h.navigations[0], '/search?q=a%20%26%20b&src=typed_query&f=image');
  h.adapter.setReaderActive(true);
  assert.equal(h.document.documentElement.hasAttribute('data-x-reader-home'), true);
  h.adapter.setReaderActive(false);
  assert.equal(h.document.documentElement.hasAttribute('data-x-reader-home'), false);
});

test('observes native changes and releases observers and listeners on cleanup', () => {
  const h = setup();
  const observers = [];
  let notifications = 0;
  const adapter = createXAdapter({ ...h, MutationObserver: class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.options = options; }
    disconnect() { this.disconnected = true; }
  } });
  const stop = adapter.observe(() => notifications++);
  assert.ok(observers[0].options.attributeFilter.includes('srcset'));
  assert.ok(observers[0].options.attributeFilter.includes('sizes'));
  assert.ok(observers[0].options.attributeFilter.includes('style'));
  observers[0].callback(); observers[1].callback();
  h.window.dispatchEvent(new h.window.Event('popstate'));
  assert.equal(notifications, 3);
  h.document.dispatchEvent(new h.window.Event('load'));
  assert.equal(notifications, 4);
  stop();
  assert.equal(observers.every((observer) => observer.disconnected), true);
  h.window.dispatchEvent(new h.window.Event('popstate'));
  h.document.dispatchEvent(new h.window.Event('load'));
  assert.equal(notifications, 4);
});

test('keeps the UI module independent of native X selectors and document queries', () => {
  const reader = readFileSync(new URL('../src/reader.js', import.meta.url), 'utf8');
  assert.doesNotMatch(reader, /data-testid|react-root|document\.querySelector/);
  assert.doesNotMatch(reader, /window\.scrollTo|\.getAttribute\('aria-selected'\)/);
});

test('generates a self-contained installable bundle and an identical compatibility copy', () => {
  const bundle = readFileSync(new URL('../dist/x-reader.user.js', import.meta.url), 'utf8');
  const legacyPath = readFileSync(new URL('../x-reader.user.js', import.meta.url), 'utf8');
  assert.equal(bundle, legacyPath);
  assert.match(bundle, /^\/\/ ==UserScript==\n\/\/ @name\s+X Reader/);
  const metadata = readFileSync(new URL('../src/userscript.meta.js', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(metadata.match(/^\/\/ @version\s+(\S+)/m)[1], pkg.version);
  assert.equal(bundle.match(/^\/\/ @version\s+(\S+)/m)[1], pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(pkg.license, 'MIT');
  assert.equal(lock.packages[''].license, pkg.license);
  assert.match(bundle, /^\/\/ @license\s+MIT$/m);
  const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8').trim();
  assert.ok(bundle.includes(license));
  assert.match(bundle, /x-reader-home-v3/);
  assert.doesNotMatch(bundle, /^import\s/m);
});

test('translates message descriptors without depending on native page markup', () => {
  const i18n = createI18n('en');
  const message = i18n.msg('collected', { count: 2, label: i18n.msg('forYou') });
  assert.match(i18n.t(message.key, message.params), /For you/);
  i18n.setLanguage('zh');
  assert.match(i18n.t(message.key, message.params), /为你推荐/);
});
