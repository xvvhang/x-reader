// Native X DOM contracts belong here, not in the Reader UI.
// Alternatives are ordered: use the first selector that has matches.
export const X_SELECTORS = Object.freeze({
  root: ['#react-root'],
  rootLanguage: ['#react-root[lang]'],
  homeLink: ['[data-testid="AppTabBar_Home_Link"]', 'header[role="banner"] nav a[href="/home"]'],
  primary: ['[data-testid="primaryColumn"]', 'main[role="main"]'],
  tabs: ['[role="tablist"] [role="tab"]'],
  posts: ['article[data-testid="tweet"]', 'article[role="article"]'],
  people: ['[data-testid="UserCell"]'],
  searchInput: ['[data-testid="SearchBox_Search_Input"]', 'input[role="combobox"][type="search"]'],
  error: ['[data-testid="error-detail"]'],
  empty: ['[data-testid="emptyState"]'],
  progress: ['[role="progressbar"]'],
  signIn: ['[data-testid="loginButton"]', 'a[href="/login"]'],
  statusLinks: ['a[href*="/status/"]'],
  author: ['[data-testid="User-Name"]'],
  badge: ['[data-testid="icon-verified"]', '[aria-label="Verified account"], [aria-label="Verified Account"], [aria-label="已认证账号"], [aria-label="认证账号"]'],
  avatars: ['[data-testid="Tweet-User-Avatar"] img, [data-testid^="UserAvatar-Container"] img'],
  text: ['[data-testid="tweetText"]'],
  detailText: ['[data-testid="tweetText"]', '[dir="auto"].whitespace-pre-wrap'],
  showMore: ['[data-testid="tweet-text-show-more-link"]'],
  photos: ['[data-testid="tweetPhoto"] img, a[href*="/status/"][href*="/photo/"] img, img[src*="//pbs.twimg.com/media/"], img[srcset*="//pbs.twimg.com/media/"]'],
  videoContainers: ['[data-testid="videoPlayer"], [data-testid="videoComponent"]'],
  backgroundImages: ['[style*="background-image"]'],
  description: ['[data-testid="UserDescription"]'],
  bioCandidates: ['[dir="auto"]'],
  context: ['[data-testid="socialContext"]'],
  card: ['[data-testid="card.wrapper"]'],
  promoted: ['[data-testid="promotedIndicator"]'],
  ad: ['[data-testid="placementTracking"]'],
  quoteScope: ['[role="link"][tabindex="0"]'],
  mediaCardExclude: ['article, [data-testid="placementTracking"]'],
  bioExclude: ['a, button, [data-testid="User-Name"]'],
  interactive: ['a, button'],
  links: ['a[href]'], images: ['img'], video: ['video'], sources: ['source'], time: ['time'],
  reply: ['[data-testid="reply"]'],
  repost: ['[data-testid="retweet"], [data-testid="unretweet"]'],
  like: ['[data-testid="like"], [data-testid="unlike"]'],
});

export const SEARCH_FILTERS = Object.freeze([
  { value: '', label: 'top' }, { value: 'live', label: 'latest' },
  { value: 'user', label: 'people' }, { value: 'image', label: 'photos' },
  { value: 'video', label: 'videos' },
]);

export function safeURL(value, images = false, base = location.origin) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || (images && url.hostname !== 'pbs.twimg.com')) return null;
    return url.href;
  } catch { return null; }
}

export function createXAdapter({ document, window, location, MutationObserver: Observer = window.MutationObserver, selectors = {} }) {
  const rules = { ...X_SELECTORS, ...selectors };
  const identities = new WeakMap();
  let nextIdentity = 0;
  const url = (value, images = false) => safeURL(value, images, location.origin);
  const videoURL = (value) => {
    const href = value && url(value);
    return href && new URL(href).hostname === 'video.twimg.com' ? href : null;
  };
  function all(key, scope = document) {
    for (const selector of rules[key]) {
      const nodes = Array.from(scope?.querySelectorAll(selector) || []);
      if (nodes.length) return nodes;
    }
    return [];
  }
  const one = (key, scope = document) => all(key, scope)[0] || null;
  const closest = (key, node) => node?.closest(rules[key].join(', ')) || null;
  const primary = () => one('primary');
  function imageSource(img) {
    if (!img) return null;
    // Responsive images may expose only srcset until the browser selects a source.
    const candidates = [img.currentSrc, img.getAttribute('src'),
      ...(img.getAttribute('srcset') || '').split(',').map((entry) => entry.trim().split(/\s+/)[0])];
    return candidates.filter(Boolean).map((src) => url(src, true)).find(Boolean) || null;
  }
  function readableText(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeName === 'BR') return '\n';
    if (node.nodeName === 'IMG') return node.getAttribute('alt') || '';
    return Array.from(node.childNodes).map(readableText).join('');
  }
  function pageState() {
    const path = location.pathname.replace(/\/$/, '');
    const params = new URLSearchParams(location.search || '');
    const kind = path === '/home' ? 'home' : path === '/search' ? 'search' : 'other';
    const query = kind === 'search' ? (params.get('q') || '').trim() : '';
    const raw = kind === 'search' ? params.get('f') || '' : '';
    const filter = SEARCH_FILTERS.some((item) => item.value === raw) ? raw : '';
    return { kind, query, filter, key: JSON.stringify([kind, query, filter]) };
  }
  function detectLanguage() {
    const lang = document.documentElement.getAttribute('lang')?.trim() || one('rootLanguage')?.getAttribute('lang')?.trim();
    if (lang) return /^zh(?:[-_]|$)/i.test(lang) ? 'zh' : 'en';
    const home = one('homeLink');
    return /首页|主頁|首頁/.test(`${home?.getAttribute('aria-label') || ''} ${home?.textContent || ''}`) ? 'zh' : 'en';
  }
  function getTabs() {
    return all('tabs', primary()).map((node, index) => ({
      key: `home:${index}`, index, label: node.textContent.trim(), selected: node.getAttribute('aria-selected') === 'true',
    }));
  }
  function extractAuthor(scope, author, authorLink) {
    const authorURL = url(authorLink?.getAttribute('href') || '');
    const handle = authorURL && new URL(authorURL).pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/?$/)?.[1];
    const badge = one('badge', author);
    let verified = '';
    if (badge) {
      verified = 'blue';
      const label = `${badge.getAttribute('aria-label') || ''} ${badge.parentElement?.getAttribute('aria-label') || ''}`;
      const rgb = (window.getComputedStyle?.(badge).color || '').match(/[\d.]+/g)?.map(Number);
      if (/organization|organisation|组织|机构/i.test(label) || (rgb && rgb[0] > 150 && rgb[1] > 100 && rgb[2] < 130)) verified = 'gold';
      else if (/government|政府/i.test(label) || (rgb && rgb[2] > rgb[0] && rgb[2] - rgb[0] < 70)) verified = 'gray';
    }
    const avatar = all('avatars', scope).find((img) => !closest('quoteScope', img) &&
      (!closest('links', img) || url(closest('links', img).getAttribute('href')) === authorURL));
    return { author: readableText(authorLink).trim(), authorURL, username: handle ? `@${handle}` : '', avatar: avatar ? url(avatar.src, true) : null, verified };
  }
  function extractPost(article) {
    if (closest('ad', article) || one('promoted', article)) return null;
    const time = one('time', article);
    const href = url(closest('links', time)?.getAttribute('href') || '');
    const id = href?.match(/\/status\/(\d+)/)?.[1];
    if (!id) return null;
    const author = one('author', article);
    const texts = all('text', article);
    const body = texts.find((node) => !closest('quoteScope', node)) || null;
    const quote = texts.find((node) => node !== body);
    const tokens = textTokens(body);
    const truncated = all('showMore', article).some((node) => !closest('quoteScope', node));
    const media = [];
    const quoteMedia = [];
    let quoteRoot = closest('quoteScope', quote);
    const seen = new Map([[media, new Set()], [quoteMedia, new Set()]]);
    function mediaGroup(node) {
      const root = closest('quoteScope', node);
      if (root && article.contains(root)) {
        quoteRoot ||= root;
        return quoteMedia;
      }
      return media;
    }
    for (const img of all('photos', article)) {
      if (closest('videoContainers', img)) continue;
      const src = imageSource(img);
      const group = mediaGroup(img);
      if (src && !seen.get(group).has(src)) {
        seen.get(group).add(src); group.push({ kind: 'image', src, alt: img.alt || '' });
      }
    }
    for (const container of all('videoContainers', article).filter((node) => !closest('videoContainers', node.parentElement))) {
      const video = one('video', container);
      let poster = url(video?.getAttribute('poster') || '', true) || imageSource(one('images', container));
      if (!poster) for (const node of all('backgroundImages', container)) {
        const match = node.style.backgroundImage?.match(/url\(["']?(.*?)["']?\)/);
        poster = match && url(match[1], true);
        if (poster) break;
      }
      const sources = [video?.currentSrc, video?.getAttribute('src'), ...all('sources', container).map((node) => node.getAttribute('src'))];
      mediaGroup(container).push({ kind: 'video', src: sources.map(videoURL).find(Boolean) || null, poster, alt: '' });
    }
    const metrics = [];
    for (const [selector, key] of [['reply', 'replies'], ['repost', 'reposts'], ['like', 'likes']]) {
      const count = one(selector, article)?.textContent.trim();
      if (count) metrics.push({ count, key });
    }
    const quoteHref = quoteRoot?.getAttribute('href') || one('statusLinks', quoteRoot)?.getAttribute('href');
    return { id, url: href, ...extractAuthor(article, author, one('links', author)), datetime: time?.getAttribute('datetime') || '', time: time?.textContent || '',
      tokens, truncated, quote: readableText(quote), quoteMedia, quoteURL: quoteHref ? url(quoteHref) : null,
      media, metrics, context: one('context', article)?.textContent || '', card: Boolean(one('card', article)) };
  }
  function textTokens(body) {
    const tokens = [];
    function walk(node) {
      if (node.nodeType === 3) tokens.push({ text: node.textContent });
      else if (node.nodeType === 1) {
        if (node.tagName === 'BR') tokens.push({ text: '\n' });
        else if (node.tagName === 'IMG') tokens.push({ text: node.getAttribute('alt') || '' });
        else if (node.tagName === 'A') tokens.push({ text: readableText(node), href: url(node.getAttribute('href')) });
        else if (!['SCRIPT', 'STYLE', 'BUTTON'].includes(node.tagName)) node.childNodes.forEach(walk);
      }
    }
    body?.childNodes.forEach(walk);
    return tokens;
  }
  async function fullText(post) {
    const href = url(post.url);
    if (!href || new URL(href).origin !== location.origin || !/^\/[\w]+\/status\/\d+\/?$/.test(new URL(href).pathname) ||
      new URL(href).pathname.split('/')[3] !== post.id) return null;
    const controller = new window.AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    try {
      // On demand only: request the public post page, never private APIs or account credentials.
      const response = await window.fetch(href, { credentials: 'omit', signal: controller.signal });
      if (!response.ok || (response.url && (new URL(response.url).origin !== location.origin ||
        new URL(response.url).pathname !== new URL(href).pathname))) return null;
      const detail = new window.DOMParser().parseFromString(await response.text(), 'text/html');
      for (const article of detail.querySelectorAll('article')) {
        const identity = all('statusLinks', article).some((node) => node.closest('article') === article &&
          !closest('quoteScope', node) && url(node.getAttribute('href'))?.split('?')[0] === href);
        if (!identity) continue;
        const body = all('detailText', article).find((node) => node.closest('article') === article && !closest('quoteScope', node));
        if (!body || all('showMore', article).some((node) => !closest('quoteScope', node)) || body.querySelector('button')) return null;
        const tokens = textTokens(body);
        return tokens.length ? { tokens } : null;
      }
      return null;
    } catch { return null; }
    finally { window.clearTimeout(timer); }
  }
  function extractPerson(cell) {
    const links = all('links', cell).filter((node) => {
      const href = url(node.getAttribute('href'));
      return href && new URL(href).origin === location.origin && /^\/[a-zA-Z0-9_]{1,15}\/?$/.test(new URL(href).pathname);
    });
    const author = one('author', cell);
    const name = one('links', author) || links.find((node) => readableText(node).trim() && !readableText(node).trim().startsWith('@')) || links[0];
    if (!name) return null;
    const identity = extractAuthor(cell, author || cell, name);
    if (!identity.username) return null;
    const avatar = all('images', cell).find((img) => url(img.src, true) && /\/profile_images\//.test(img.src));
    if (!identity.avatar && avatar) identity.avatar = url(avatar.src, true);
    if (identity.author.includes(identity.username)) identity.author = identity.author.replace(identity.username, '').trim() || identity.username;
    const description = one('description', cell) || all('bioCandidates', cell).find((node) => !closest('bioExclude', node) && !one('interactive', node) && readableText(node).trim() && !readableText(node).trim().startsWith('@'));
    return { ...identity, id: `user:${identity.username.toLowerCase()}`, url: identity.authorURL, bio: readableText(description).trim(), person: true };
  }
  function extractMediaCard(card, state) {
    const href = url(card.getAttribute('href'));
    const match = href && new URL(href).pathname.match(/^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/);
    if (!match || one('promoted', card)) return null;
    const images = all('images', card).map((img) => ({ src: imageSource(img), alt: img.alt || '' })).filter((img) => img.src && !/\/profile_images\//.test(img.src));
    const video = one('video', card);
    const media = state.filter === 'video' ? [{ kind: 'video', src: [video?.currentSrc, video?.getAttribute('src'), one('sources', video)?.getAttribute('src')].map(videoURL).find(Boolean) || null,
      poster: url(video?.getAttribute('poster') || '', true) || images[0]?.src || null, alt: '' }] : images.map((img) => ({ kind: 'image', ...img }));
    return { id: match[2], url: href, author: match[1], username: `@${match[1]}`, authorURL: `${location.origin}/${match[1]}`,
      avatar: null, verified: '', datetime: '', time: '', tokens: [], quote: '', media, metrics: [], context: '', card: false, grid: true };
  }
  function sourceNodes(state) {
    const scope = primary();
    if (state.kind === 'search' && state.filter === 'user') return all('people', scope);
    const nodes = all('posts', scope);
    if (state.kind === 'search' && ['image', 'video'].includes(state.filter)) nodes.push(...all('statusLinks', scope).filter((node) => !closest('mediaCardExclude', node) &&
      (one('video', node) || all('images', node).some((img) => { const src = imageSource(img); return src && !/\/profile_images\//.test(src); }))));
    return nodes;
  }
  function snapshot(state = pageState()) {
    const scope = primary();
    const nodes = sourceNodes(state);
    const sourceIds = nodes.map((node) => {
      if (!identities.has(node)) identities.set(node, ++nextIdentity);
      return identities.get(node);
    });
    const signature = nodes.map((node) => node.getAttribute('href') || closest('links', one('time', node))?.getAttribute('href') || one('links', node)?.getAttribute('href') || '').join('|');
    const items = nodes.map((node) => state.kind === 'search' && state.filter === 'user' ? extractPerson(node) : node.matches(rules.links.join(', ')) ? extractMediaCard(node, state) : extractPost(node)).filter(Boolean);
    const searchInput = one('searchInput', scope);
    const error = Boolean(one('error', scope));
    const empty = Boolean(one('empty', scope));
    const busy = Boolean(one('progress', scope));
    const signedOut = !scope && Boolean(one('signIn'));
    // Suspected drift is diagnostic only: do not mistake slow loading or login errors for DOM changes.
    const health = error ? 'error' : signedOut ? 'signed-out' : empty ? 'empty' : busy ? 'loading' : items.length ? 'ready'
      : scope && all('statusLinks', scope).length ? 'unmatched' : 'waiting';
    return { items, sourceIds, signature, tabs: getTabs(), health,
      messageKey: error ? 'sourceError' : empty ? state.kind === 'search' ? 'noResults' : 'noContent' : null,
      searchMatches: !(state.kind === 'search' && searchInput && searchInput.value.trim() !== state.query) };
  }
  function installReaderStyles() {
    const style = document.createElement('style');
    style.textContent = `
    body { padding-bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important; }
    html[data-x-reader-home] { overflow: hidden !important; }
    ${rules.root.map((selector) => `html[data-x-reader-home] ${selector}`).join(', ')} { opacity: 0 !important; pointer-events: none !important; }
  `;
    document.head.append(style);
    return style;
  }
  function observe(callback) {
    const content = new Observer(callback);
    const language = new Observer(callback);
    content.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected', 'poster', 'src', 'srcset', 'sizes'] });
    language.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    document.addEventListener('loadedmetadata', callback, true);
    document.addEventListener('load', callback, true);
    window.addEventListener('popstate', callback);
    return () => {
      content.disconnect(); language.disconnect();
      document.removeEventListener('loadedmetadata', callback, true); window.removeEventListener('popstate', callback);
      document.removeEventListener('load', callback, true);
    };
  }
  return {
    pageState, detectLanguage, getTabs, snapshot, fullText, installReaderStyles, observe, filters: SEARCH_FILTERS,
    setReaderActive(active) { document.documentElement.toggleAttribute('data-x-reader-home', active); },
    activateTab(key) {
      const tabs = getTabs();
      const index = tabs.findIndex((tab) => tab.key === key);
      const node = all('tabs', primary())[index];
      if (!node) return false;
      node.click(); return true;
    },
    scrollPosition() { return window.scrollY; },
    restoreScroll(position) { window.scrollTo(0, position); },
    loadMore() { window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); },
    searchURL(query, filter = '') { return `/search?q=${encodeURIComponent(query)}&src=typed_query${filter ? `&f=${encodeURIComponent(filter)}` : ''}`; },
    navigate(href) { location.assign(href); },
    imageURL(src, size) { const image = new URL(src); image.searchParams.set('name', size); return image.href; },
  };
}
