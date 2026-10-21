# Maintaining the X adapter

## Boundaries

`src/x-adapter.js` is the only module that understands native X markup. It owns:

- Named, ordered selector alternatives in `X_SELECTORS`.
- Route and interface-language detection.
- Post, author, people, media, and quote extraction.
- Native timeline-tab activation, source scrolling, and navigation.
- Native-page observers and the styles used to hide the source page.

`src/reader.js` owns the Shadow DOM interface, collection state, deduplication, preview controls, and rendering. It must not query the original document for X elements or receive native nodes from the adapter. Generic DOM construction and keyboard handling remain in Reader.

`src/i18n.js` translates UI message descriptors. It does not inspect native markup or translate user content. The adapter reports language as `zh` or `en`.

## Adapter contract

Create an adapter with `createXAdapter({ document, window, location })`. Tests may inject selector overrides and a `MutationObserver` constructor without changing production code.

| API | Purpose |
| --- | --- |
| `pageState()` | Returns route kind, query, filter, and a stable view key. |
| `detectLanguage()` | Detects the source interface language independently of post content. |
| `getTabs()` | Returns plain `{ key, index, label, selected }` objects, never native tab nodes. |
| `snapshot(state)` | Returns normalized entries, opaque source IDs, a source signature, native tabs, health, a message key, and query readiness. |
| `fullText(post)` | On demand, requests same-origin public post HTML without credentials and returns safe text tokens for the matching post, or null. |
| `activateTab(key)` | Finds the current native tab and clicks it; returns false if it no longer exists. |
| `loadMore()` | Scrolls the native page to request more content. |
| `scrollPosition()` / `restoreScroll(position)` | Reads or restores source-page scrolling, independently of Reader scrolling. |
| `searchURL(query, filter)` / `navigate(url)` | Encodes search URLs and navigates the source page. |
| `imageURL(src, size)` | Builds X image thumbnail or viewer URLs. |
| `installReaderStyles()` / `setReaderActive(active)` | Installs source visibility rules and switches them on or off. |
| `observe(callback)` | Observes native changes; returns a cleanup function. |

Post entries include `id`, `url`, author identity, timestamp, text tokens, quote text, media, engagement metrics, and context. `media` belongs to the outer post; `quoteMedia` contains media inside the quoted post, and `quoteURL` is its original-post link when available. These groups stay separate even when they share an image URL. People entries have `person: true` and a biography. Grid-derived media entries have `grid: true`; missing metadata is not invented or fetched separately.

`sourceIds` identify native node lifetimes without exposing DOM nodes. They remain stable while a source node is mounted and change after remounting, even if the same post returns. Reader uses them with the signature to avoid mixing stale content into a new timeline or search.

The optional `health` value distinguishes `ready`, `loading`, `empty`, `error`, `signed-out`, `waiting`, and `unmatched`. These are observations, not a guarantee that every field was extracted correctly. In particular, `unmatched` is a suspected selector mismatch, not proof of an X frontend change. Reader currently preserves its existing loading/error messages; this refactor does not add automatic repair, remote rules, or a new diagnostic UI.

## Selector fallbacks

Each named rule is an ordered array. The adapter uses the first selector that produces matches within the requested scope. A comma-separated selector can intentionally match multiple equivalent forms in one rule. Keep alternatives narrow: broad matches can produce incorrect data that is harder to detect than an empty result.

For example, native post discovery first uses `article[data-testid="tweet"]`, then falls back to `article[role="article"]`. The primary column has a semantic `main[role="main"]` fallback. Extraction still requires a recognizable original-post identity.

## Repair workflow

1. Confirm the problem in Origin. Distinguish DOM changes from expired sessions, rate limits, empty results, and network failures.
2. Identify the affected named rule or extraction function in `src/x-adapter.js`.
3. Add or update a minimal fixture or focused adapter test. Existing fixtures are synthetic, not captured logged-in pages. If using a real sample, remove account data, post text, credentials, and unrelated markup before committing it.
4. Update selector alternatives or extraction logic, leaving Reader unchanged unless the normalized data contract must change.
5. Run `npm run build` and `npm test`. The test command also rejects stale generated files and checks the Reader/adapter boundary.
6. Manually verify the affected feature on a signed-in X page. Offline tests cannot confirm compatibility with the latest live frontend.
7. Keep the release version identical in `src/userscript.meta.js`, `package.json`, and both root package entries in `package-lock.json`. Rebuild, rerun tests, and commit source, tests, metadata, the lockfile, and both generated userscripts together. The tests reject mismatched versions.

Keep the existing namespace and storage key when releasing compatibility fixes. Do not edit the generated files independently or publish untested selector changes automatically.
