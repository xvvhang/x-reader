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
