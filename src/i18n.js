// Messages are UI-only. Posts, author names, and custom list names remain untouched.
const messages = {
  home: ['首页', 'Home'], search: ['搜索', 'Search'], searchX: ['搜索 X', 'Search X'],
  mainNav: ['主导航', 'Main navigation'], homeTabs: ['首页时间线', 'Home timelines'], searchTabs: ['搜索结果类型', 'Search filters'],
  posts: ['推文列表', 'Posts'], results: ['搜索结果', 'Search results'], peopleResults: ['用户搜索结果', 'People results'],
  homeWaiting: ['正在等待 X 首页内容…', 'Waiting for the X home feed…'],
  more: ['加载更多', 'Load more'], loading: ['正在加载…', 'Loading…'],
  foot: ['只显示当前账号已加载的内容 · 摘要为原文截取，并非 AI 总结 · 互动请打开原帖', 'Only content loaded for your account · Previews are excerpts, not AI summaries · Open the original post to interact'],
  mode: ['阅读模式切换', 'Reading mode'], modeChoice: ['选择页面版本', 'Choose a view'],
  viewOptions: ['阅读显示设置', 'Reader display options'], imageFree: ['无图模式', 'Image-free'], compact: ['紧凑模式', 'Compact'],
  imageOriginal: ['图片 {index} ↗', 'Image {index} ↗'], videoOriginal: ['视频 {index} ↗', 'Video {index} ↗'],
  loadFullText: ['加载全文', 'Load full text'],
  viewer: ['媒体查看器', 'Media viewer'], close: ['关闭 ✕', 'Close ✕'],
  top: ['热门', 'Top'], latest: ['最新', 'Latest'], people: ['用户', 'People'], photos: ['图片', 'Photos'], videos: ['视频', 'Videos'],
  forYou: ['为你推荐', 'For you'], following: ['正在关注', 'Following'],
  searchHeading: ['搜索：{query}', 'Search: {query}'], searching: ['正在搜索…', 'Searching…'],
  searchHelp: ['输入关键词开始搜索，支持 from:、to:、#话题等 X 搜索语法。', 'Enter a query to search. X search operators such as from:, to:, and #hashtags are supported.'],
  videoError: ['此视频无法直接播放，请在原帖查看。', 'This video cannot be played here. Open the original post to watch.'],
  noVideoSource: ['原页面未提供可直接播放的视频地址，请在原帖播放。', 'The page has not provided a playable video URL. Watch it in the original post.'],
  videoPoster: ['视频封面', 'Video poster'], imageAlt: ['推文图片', 'Post image'], videoThumb: ['视频缩略图', 'Video thumbnail'],
  playOriginal: ['在原帖播放视频 ↗', 'Watch original video ↗'], openOriginal: ['打开原帖 ↗', 'Open original post ↗'],
  author: ['作者', 'Author'], verified: ['已认证', 'Verified'], verifiedGold: ['已认证组织', 'Verified organization'], verifiedGray: ['已认证（灰标）', 'Verified (gray badge)'],
  replies: ['{count} 回复', '{count} replies'], reposts: ['{count} 转帖', '{count} reposts'], likes: ['{count} 赞', '{count} likes'],
  videoPost: ['[视频推文]', '[Video post]'], imagePost: ['[图片推文]', '[Image post]'], quotePost: ['[引用 / 链接推文]', '[Quote / link post]'],
  enlargeImage: ['放大查看图片 {index}', 'View image {index}'], enlargeVideo: ['放大查看视频 {index}', 'View video {index}'],
  previewError: ['预览不可用', 'Preview unavailable'], video: ['视频', 'Video'], original: ['原帖', 'Original post'], originalLink: ['原帖 ↗', 'Original post ↗'],
  expand: ['展开', 'Expand'], collapse: ['收起', 'Collapse'], card: ['链接卡片 ↗', 'Link card ↗'],
  fullTextUnavailable: ['未能获取全文，请打开原帖查看 ↗', 'Full text unavailable. Open the original post ↗'],
  mediaWaiting: ['媒体尚未加载，打开原帖查看 ↗', 'Media not loaded. Open original post ↗'],
  switching: ['正在切换到 {label}…', 'Switching to {label}…'],
  switchTimeout: ['时间线仍未更新。可再次点击目标标签重试，或返回原版检查网络 / 登录状态。', 'The timeline has not updated. Select the tab to retry, or switch to X to check your connection and sign-in.'],
  retrySwitch: ['正在重试切换…', 'Retrying timeline switch…'],
  waitSearch: ['等待 X 更新搜索结果…', 'Waiting for X to update search results…'], waitResults: ['等待 X 更新结果…', 'Waiting for X to update results…'],
  count: ['{count} 条', '{count} items'],
  collected: ['已收集 {count} 条 · {label} · 按 X 原始顺序排列', '{count} items · {label} · In the original X order'],
  searchWaiting: ['正在等待搜索结果；如长时间无内容，请返回原版检查登录状态或搜索限制。', 'Waiting for search results. If nothing appears, switch to X to check your sign-in or search restrictions.'],
  homeDataWaiting: ['等待首页数据；如长时间无内容，请返回原版确认已经登录。', 'Waiting for the home feed. If nothing appears, switch to X to check that you are signed in.'],
  limit: ['本次已收集 1000 条，刷新页面后可重新开始。', '1,000 items collected. Refresh the page to start again.'],
  loadSearch: ['正在从 X 搜索加载下一批内容…', 'Loading more search results from X…'], loadHome: ['正在从 X 首页加载下一批内容…', 'Loading more posts from X…'],
  noNewContent: ['暂未收到新内容，可重试加载，或返回原版检查。', 'No new content received. Retry loading, or switch to X to check.'],
  noResults: ['没有找到结果，请换个关键词或稍后重试。', 'No results found. Try another query or check again later.'],
  noContent: ['暂无内容，请稍后重试。', 'No content yet. Please try again later.'],
  sourceError: ['X 未能加载内容，请返回原版检查或重试。', 'X could not load this content. Switch to X to check or retry.'],
  menuToggle: ['切换 X Reader', 'Toggle X Reader'],
};

export function createI18n(initialLanguage = 'en') {
  let language = initialLanguage === 'zh' ? 'zh' : 'en';
  const msg = (key, params = {}) => ({ key, params });
  function t(key, params = {}) {
    return messages[key][language === 'zh' ? 0 : 1].replace(/\{(\w+)\}/g, (_, name) => {
      const value = params[name];
      return value?.key ? t(value.key, value.params) : String(value ?? '');
    });
  }
  function text(node, key, params = {}) {
    node._readerMessage = key ? msg(key, params) : null;
    node.textContent = key ? t(key, params) : '';
  }
  function translatedAttribute(node, name, key, params = {}) {
    (node._readerAttributes ||= {})[name] = msg(key, params);
    node.setAttribute(name, t(key, params));
  }
  return {
    msg, t, text, translatedAttribute,
    get language() { return language; },
    setLanguage(next) { language = next === 'zh' ? 'zh' : 'en'; },
  };
}
