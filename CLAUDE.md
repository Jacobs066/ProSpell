# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

"pronounce" (repo folder: ProSpell) is a single-page vanilla HTML/CSS/JS word-pronunciation tool. There is no build step, no package manager, no dependencies, and no test suite — just:

- `index.html` — markup for two screens (home / result) and three result-state cards (found / not-found / loading)
- `app.js` — all behavior: theming, screen navigation, dictionary lookup, audio playback
- `style.css` — all styling, including five color themes driven by `data-theme`
- `manifest.webmanifest` + `sw.js` + `icons/icon-192.png` / `icons/icon-512.png` — PWA/offline support (see Architecture below)

## Running the project

There's no dev server config or scripts. Serve the directory statically and open it in a browser, e.g.:

```bash
python -m http.server 5500
```

Then visit `http://localhost:5500`. Opening `index.html` directly via `file://` also mostly works since the only network call is a cross-origin `fetch` to a public HTTPS API, but prefer a local server to match normal browser behavior.

There is no lint, build, or test command — verify changes by loading the page and exercising it manually (search a word, toggle themes, click the speak button).

**Service worker caching gotcha:** since `sw.js` precaches the app shell (`index.html`, `style.css`, `app.js`), a hard refresh may still serve stale JS/CSS after editing them locally. Bump the `SHELL_CACHE` / `API_CACHE` version strings in `sw.js` (e.g. `pronounce-shell-v1` → `v2`) when the shell files change, or unregister the service worker / use an incognito window while iterating.

## Architecture

**Screen state machine.** `.screen-home` and `.screen-result` are toggled via the `is-active` class (`app.js` `showHome()` / `showResultScreen()`). Only one screen is visible at a time (`.screen { display: none }`, `.screen.is-active { display: flex }`).

**Card swapping within the result screen.** Inside `.screen-result` there are three mutually-exclusive cards — `#resultCard`, `#notFoundCard`, `#loadingCard` — toggled via the `showCard(card)` helper, which sets the HTML `hidden` attribute on the other two. Because `.card { display: flex }` in `style.css` would otherwise override the browser's default `[hidden]` styling (author CSS beats the UA stylesheet at equal specificity), there is an explicit `.card[hidden] { display: none; }` rule right after the base `.card` rule. **Keep this override in place** — removing it silently reintroduces a bug where all three cards render stacked at once.

**`[hidden]` vs. `<svg>` gotcha.** Chrome's own UA stylesheet sets `svg { display: inline-block }`, which — at equal specificity to `[hidden] { display: none }` — can beat it depending on UA rule order, so a `hidden` SVG (e.g. the mode-toggle's sun/moon icons) can render anyway. There's a blanket fix for this in `style.css`: `svg[hidden] { display: none; }` near the top of the base rules. Same failure mode as the `.card[hidden]` issue above — **do not remove it**, and if a new hidden SVG element ever appears "stuck visible," this is the first thing to check.

**Dictionary lookup flow** (`lookUp()` in `app.js`):
1. Show the loading card.
2. `fetch` `https://api.dictionaryapi.dev/api/v2/entries/en/<word>`.
3. On failure, `showNotFound(reason)` distinguishes *the word genuinely doesn't exist* (HTTP 404 → "hmm... check the spelling") from *couldn't reach the API* (any other bad status, or a thrown fetch error — offline, DNS, CORS, etc. → "offline? check your connection"). Both reuse the same `#notFoundCard` markup but swap the `#notFoundTitle` / `#notFoundText` copy, rather than being two separate cards.
4. On success, `renderEntry()` picks a phonetic (`pickPhonetic()` prefers an entry with both `text` and `audio`, falling back to audio-only, then text-only, then a synthesized `/word/` fallback), renders up to the first 3 `meanings` (each showing only its first definition), appends synonyms/antonyms per meaning if present (`appendRelation()` — prefers the meaning-level `synonyms`/`antonyms` arrays over the definition-level ones), and records the word via `addRecent()`.

**Pronunciation playback** (`speakBtn` handler): if the API returned an audio URL, play it via `new Audio(...)`; if playback fails or no audio URL exists, fall back to `speechSynthesis` (`speakWithTTS()`). Audio URLs starting with `//` are given an explicit `https:` prefix before use.

**Theming.** Five themes (`white`, `black`, `cyan`, `paper`, `rose`) are CSS custom-property sets scoped under `[data-theme="..."]` selectors in `style.css`, plus the `"custom"` background-photo theme (see below) — six values total, all applied the same way via `applyTheme(theme)` → `document.documentElement.setAttribute("data-theme", ...)`, persisted to `localStorage` (`pronounce-theme`). On load, `initTheme()` falls back to the OS `prefers-color-scheme` if nothing is saved. Theme selection is split across two UI surfaces rather than one control:
- **`#modeToggleBtn`** (always visible in the topbar) is a quick light/dark switch. It doesn't cycle — clicking it jumps straight to `"white"` or `"black"`, whichever is the opposite of the current theme's light/dark *classification* (`DARK_THEMES = ["black", "cyan", "custom"]`; everything else counts as light). `syncThemeUI()` (called from inside `applyTheme()`, so it always stays in sync regardless of which control changed the theme) swaps the sun/moon SVG and updates the button's `aria-label`/`title`.
- **`#settingsPanel`** (opened via the gear `#settingsBtn`, see below) holds everything else: the `cyan`/`paper`/`rose` swatches (`.swatch[data-theme]`, click → `applyTheme(swatch.dataset.theme)`) and the custom-background controls. `syncThemeUI()` also toggles the `.is-active` ring on whichever swatch matches the current theme (none get the ring for `white`/`black`/`custom`, which live outside the swatch row).

**Word suggestions.** Each search input (`inputHero`, `inputSlim`) has a `.suggestions` `<ul>` wired up via `setupSuggestions()`. On `input` (debounced 200ms, min 2 chars), it queries the free Datamuse API (`https://api.datamuse.com/words?sp=<prefix>*`), filters results down to single alphabetic words (Datamuse also returns multi-word phrases), and renders them as clickable/keyboard-navigable (`ArrowUp`/`ArrowDown`/`Enter`/`Escape`) list items. An in-flight request is aborted via `AbortController` whenever the user keeps typing. Selecting a suggestion (click or Enter) fills the input and calls `handleSearch()`.

**Voice search.** Each search form has a `.mic-btn` wired up via `setupMic()`, using the browser `SpeechRecognition`/`webkitSpeechRecognition` API. If neither exists (non-Chromium browsers), the button is hidden. Clicking starts/stops recognition; a recognized transcript fills the input and calls `handleSearch()` directly, same as a typed submission.

**Custom background ("gallery photo as theme").** Inside `#settingsPanel`, `#bgBtn` ("choose photo") opens a hidden `#bgFileInput` (`accept="image/*"`). On file selection, the image is downscaled client-side (`BG_MAX_DIMENSION` = 1600px, JPEG quality 0.82 via an offscreen `<canvas>`) before being stored as a data URL in `localStorage` (`pronounce-bg-image`) and applied via `document.body.style.backgroundImage` — a `linear-gradient` scrim is layered on top of the photo so text stays legible regardless of the image's own colors. This is treated as a sixth theme value, `"custom"`, with its own `[data-theme="custom"]` CSS variable set (light text, since it always sits over the dark scrim, and classified as "dark" for `#modeToggleBtn` purposes). `applyTheme()` clears the background and deletes the stored image whenever a *non*-custom theme is applied — from the mode toggle, a swatch, or `#bgRemoveBtn` (only shown, via `syncThemeUI()`, while `"custom"` is active; it just calls `applyTheme("white")`) — so the five preset themes stay photo-free. `initTheme()` restores `"custom"` on load only if a stored image is actually found — otherwise it falls back to the system color-scheme preference, same as before.

**Settings panel.** `#settingsBtn` (gear icon) toggles `#settingsPanel`'s `hidden` attribute and adds an `.is-spinning` class for a one-shot rotate animation (removed on `animationend`). The panel hosts the `cyan`/`paper`/`rose` theme swatches, the custom-background controls, and the font picker (below) — anything that isn't the one-click light/dark toggle. It closes on any outside click or `Escape` (`document`-level listeners; a `click` listener on the panel itself calls `stopPropagation()` so clicking inside doesn't close it).

**Font picker.** `FONTS` in `app.js` defines four selectable font stacks — Serif (`Lora`, the original default), Sans (`Inter`), Mono (`Space Mono`), Rounded (`Fraunces`) — all loaded from the same Google Fonts `<link>` as Lora was. `applyFont(fontId)` sets `--font-family` as an inline custom property on `document.documentElement`; `body`'s `font-family` in `style.css` reads `var(--font-family, "Lora", ...)`, so every element that uses `font-family: inherit` (search inputs, chips, buttons, etc.) picks it up automatically — there's no per-component font override anywhere. The choice persists to `localStorage` (`pronounce-font`) and restores via `initFont()` on load. `renderFontOptions()` rebuilds the four buttons in `#fontOptions` each time, marking the active one — each button's own `font-family` is set inline to *its* stack so the options preview themselves.

**Share card.** The `#shareBtn` next to the speak button (inside `#resultCard`) renders the current word, phonetic, part of speech, and first definition onto a 1080×1080 `<canvas>` (`buildShareCard()` in `app.js`), reading the active theme's CSS variables (`--bg`/`--text`/`--muted`) so the exported image matches whatever theme is active. The canvas is exported via `canvas.toBlob()` and shared through a fallback chain: (1) `navigator.share({ files })` if the browser supports sharing files (most mobile browsers — this is what hands the image to WhatsApp/Snapchat/etc. through the native OS share sheet); (2) `navigator.share({ text })` text-only if file-sharing isn't supported; (3) otherwise, auto-download the PNG (`downloadBlob()`) so it can be attached manually. There is no server-side rendering or third-party screenshot library involved — the whole card is drawn with the Canvas 2D API.

**Recent searches.** Every successful lookup is recorded via `addRecent()` into `localStorage` (`pronounce-recent`, JSON array, most-recent-first, deduped, capped at `RECENT_MAX` = 8). `renderRecents()` draws them as clickable chips (`.recent-chip`) in the `#recentWrap` section below the home-screen hint text — clicking one calls `handleSearch()` directly. The whole section is `hidden` when the list is empty. `#recentClearBtn` wipes the stored list.

**Offline support (PWA).** `sw.js` is registered from `app.js` on `window load`. It precaches the app shell (`index.html`, `style.css`, `app.js`, the manifest, both icons) under `pronounce-shell-v1` on `install`, and serves same-origin GET requests cache-first. Dictionary lookups to `api.dictionaryapi.dev` are cached separately (`pronounce-api-v1`) using a network-first strategy — so previously-looked-up words still resolve offline, but a live connection always wins when available. Everything else (Google Fonts, the Datamuse suggestions API, speech APIs) passes straight through, uncached. `manifest.webmanifest` (linked from `index.html`'s `<head>`) makes the app installable. `icons/icon-192.png` and `icons/icon-512.png` are the real app icon — a cyan rounded-square with a serif `/p/` mark and three accent dots, matching the cyan theme's palette (`#0d3b3e` bg / `#dff3f1` mark) and echoing the phonetic-slash styling used throughout the UI. `icons/icon.svg` is the original source (kept for reference/regeneration, not fetched by the app itself); the PNGs were rasterized from it via .NET `System.Drawing` (PowerShell) rather than a browser or image tool. `manifest.webmanifest`'s `theme_color` and `index.html`'s `theme-color` meta tag both match the icon's cyan background (`#0d3b3e`).
