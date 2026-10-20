# Changelog

## 1.0.0

Initial public release:

- Independent home feed and search interface with Top, Latest, People, Photos, and Videos filters.
- Five-line post previews, expanded quotes, author details, media thumbnails, and an in-page viewer.
- Dedicated photo and video search grids.
- Automatic Chinese or English interface selection and system light/dark themes.
- Floating Origin / Reader segmented control and saved mode preference.
- A dedicated X adapter with centralized selectors and fallbacks.
- Reproducible standalone userscript builds and offline UI/adapter regression tests.

### Upgrade note

Development builds previously used version numbers greater than 1.0.0. Update those installations manually by replacing the existing Tampermonkey script contents. Do not enable duplicate copies.

### Known limitations

- Requires a signed-in account and a working native X page.
- Depends on X's frontend markup and cannot bypass access restrictions or rate limits.
- Videos without a reusable direct URL open in the original post.
- Offline tests do not replace verification against the current signed-in X frontend.
