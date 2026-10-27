# X Reader

A Tampermonkey userscript that extracts content from X home and search pages and presents it in an independent Shadow DOM interface, without relying on X's native layout.

The application and Tampermonkey display name is **X Reader**. Package and file identifiers retain `x-reader`.

## Installation and upgrades

1. Install and enable Tampermonkey.
2. Create a userscript, or edit your existing copy, and replace its contents with [dist/x-reader.user.js](./dist/x-reader.user.js). Save the script. The [root copy](./x-reader.user.js) is identical and remains available for existing links.
3. Disable any older copies and refresh <https://x.com/home>. Reader is enabled by default on a fresh installation.
4. Use the floating **Origin / Reader** control at the bottom center to switch views, or press **Alt + Shift + R**.

If the script does not run in Chrome or Edge, check the extension's site permissions and the browser's **Allow user scripts** setting.

On GitHub, use the **Raw** version of `dist/x-reader.user.js` when installing directly. Do not install individual files from `src/`.

The first public version is **1.0.0**. Earlier development builds used higher version numbers, so Tampermonkey may not offer 1.0.0 as an automatic upgrade. Replace the contents of the existing script manually when moving from a development build.

## Features

- **Independent home feed:** home and search navigation, timeline tabs, and a compact numbered list. Uses X's blue accent and follows the system light or dark theme.
- Reads the available native home tabs, preserving For you, Following, and custom list entries.
- Displays posts in collection order with author details, timestamps, engagement counts, and original-post links. **Compact** mode uses five-line previews; Expand appears only when text is truncated and is rechecked after viewport or font changes. Turning Compact off shows loaded post text and media-grid captions without folding.
- Two independent switches at the top right control **Image-free** and **Compact** modes. Defaults are images shown and Compact on. Choices are saved across reloads. Image-free mode replaces media previews with original-post links and avatars with text placeholders, including quoted posts and newly collected results. Photo/video search uses text rows while Image-free is on and restores its media grid when switched off. This is a Reader display preference, not a network-wide data-saving mode: native X may still load images underneath.
- For posts truncated by X itself, Expand (or **Load full text** when Compact is off) attempts to retrieve the full text from the public original-post page without account credentials. It does not automatically fetch every long post when Compact is turned off. If that page does not provide the text, an original-post link is shown instead. Later native text updates are also synchronized without collapsing expanded posts.
- Author details include an avatar, display name, `@username`, and a verification badge only when one exists in the original author's header. Delayed avatar and badge updates are synchronized.
- Image and video thumbnails appear below the text. Images load lazily and open in an in-page viewer. Close it with Escape, the close button, or a click on the backdrop. Closing stops video playback.
- Collected media survives partial snapshots and native-node remounts. Image renditions are deduplicated, explicit photo positions determine order when available, and quoted-post media stays in its own group. Background photos are recognized only in native photo regions, not arbitrary page backgrounds or link cards.
- Failed thumbnails and viewer images retry at most twice per media item and view size within a collection, using the native original URL as a fallback. Rerendering does not renew the retry budget; resetting the collection does. Closed or removed images do not keep retrying.
- Videos can play in the viewer when the source page provides a reusable `video.twimg.com` URL. Blob or streaming-only sources fall back to a poster and an original-post playback link. Delayed posters and source URLs are synchronized.
- Quotes are displayed directly without folding. Link cards open in the original post.
- Automatically attempts to load the next batch, with a manual **Load more** option. Results are deduplicated by post or user identity, with a limit of 1,000 entries per collection.
- Loading more uses overlapping source-page scroll steps, with pauses for delayed content. Each attempt stops on new results, a route/tab/mode change, a native loading error, 12 steps, or a 10-second timeout. Reader's scroll position remains independent.
- **Independent search:** use the search navigation or enter a query in the search box. Supports Top, Latest, People, Photos, and Videos, along with native X search syntax such as `from:alice`, hashtags, and quoted phrases.
- People results show avatars, display names, verification, usernames, and available biographies. Media search also supports recognizable original-post link grids. Missing author details or text are not fetched separately.
- Photo search uses a three-column square-thumbnail grid. Video search uses two-column 16:9 previews instead of numbered text rows. Multiple images from the same post form a collage with individually clickable thumbnails. Smaller screens use fewer columns.
- Search supports pagination, deduplication, empty results, and native loading-error detection. Submitting a query or changing a filter navigates to the corresponding X search URL; Reader activates after the page reloads. New queries preserve the current filter.
- Loading messages, the load-more button, and the explanatory footer are centered with consistent spacing.
- **Automatic interface language:** Chinese X interfaces, including Simplified and Traditional Chinese language tags, use Chinese; all other interface languages use English. Detection prefers the page's `lang` attribute and falls back to native navigation labels, not browser or post language. Runtime changes update navigation, filters, buttons, status messages, timestamps, media notices, and accessibility labels. Posts, author names, and custom list names are not translated.
- Author links, content links, and original posts open in new tabs. Likes, replies, and posting are not implemented in Reader; use the original post to interact.
- **Alt + Shift + R** switches views. The selected mode is saved automatically.
- An opaque, iOS-style **Origin / Reader** segmented control floats at the bottom center. Its slider moves to the selected option. There is no glass effect or full-width bottom bar, and clicks outside the control pass through. Extra space at the end of the list keeps the final entry accessible. Supports keyboard arrow navigation, system themes, and reduced-motion preferences.

## How it works and limitations

The native X home or search page remains underneath Reader, visually hidden but retaining its layout and data loading. The script reads already-loaded content and rebuilds it using safe text nodes and links. Expanding a source-truncated post additionally requests its public original-post HTML on demand, without account credentials. It does not copy native HTML into Reader, call private APIs, or upload data. Home tabs trigger their native counterparts. Loading more scrolls the underlying page without changing the Reader's scroll position.

You must be signed in, and the native page must load successfully. Reader does not bypass search restrictions, access controls, or rate limits. X can change its DOM, advertisement markers, or virtual scrolling behavior, so extraction and pagination are not guaranteed to work indefinitely. Full-text expansion depends on the public post page supplying recognizable text; private, restricted, or otherwise unavailable posts must be opened in the original view. Engagement counts are snapshots taken during extraction.

An absent media node is not treated as an authoritative deletion: previously collected images remain until the collection is reset. DOM observations cannot prove that every attachment has been seen. This version does not read timeline network responses or fetch missing media from post detail pages.

Switching to Origin restores the native page and the scroll position saved when Reader was activated. Only `/home` and `/search` use the independent interface; other pages keep their native layout. Colors follow the system theme.

Local syntax and DOM tests are included; the current implementation has not been verified against a real signed-in account by automated browser tests. If content, tab switching, or pagination fails, switch to Origin first to check the native page.

## Development and maintenance

Source files are separate from the installable userscript:

```text
src/
  x-adapter.js        Native X selectors, extraction, navigation, and loading
  reader.js           Reader interface, rendering, and application state
  i18n.js             UI messages and translation helpers
  media.js            Stable media identities and incremental merging
  image-loader.js     Bounded image recovery and retry cleanup
  userscript.meta.js  Tampermonkey metadata and release version
scripts/
  build.mjs           Bundles the source into standalone userscripts
tests/
  home.test.cjs       Regression tests against the generated userscript
  x-adapter.test.mjs  Adapter contracts and architecture checks
  media.test.mjs      Media identity, ordering, and merge regressions
  fixtures/x/        Synthetic native-page fixtures
dist/
  x-reader.user.js    Generated installable userscript
x-reader.user.js      Generated compatibility copy, identical to dist/
```

Edit `src/`, not the generated userscripts. Native X selectors and extraction rules belong in `src/x-adapter.js`; Reader consumes normalized data rather than native DOM nodes. See [Maintenance](./docs/maintenance.md) for the adapter contract and repair workflow.

For development:

```sh
npm ci
npm run build
npm test
```

`npm run build` generates both installation paths using esbuild, without runtime dependencies or remote imports. `npm run build:check` verifies that the committed outputs match the source. `npm test` checks generated files, validates the bundled script's syntax, and runs both UI regressions and adapter tests. Rebuild after source changes before running tests.

The existing storage key, namespace, and user-facing behavior are preserved by this refactor. When upgrading from the former `x-reader` display name, edit the existing Tampermonkey entry or disable the old copy to avoid duplicate execution. Installing the userscript does not require Node.js or the development dependencies.

Chinese UI translations and multilingual test fixtures are intentionally retained. Project documentation, source comments, and test descriptions are written in English.

## License

Licensed under the [MIT License](./LICENSE).
