> 조사 보고서 원본 (작성: Claude Code 조사 서브에이전트, 2026-10-28). 저장소 파일은 고치지 않고 패키지 코드·공식 문서·자료 파일을 읽어 확인했다. 표기: V 직접 확인 / V* 공식 페이지를 검색 요약으로만 확인(이 세션에서 webkit.org·web.dev·developer.chrome.com·statcounter·vite-pwa 문서 사이트가 막힘) / A 추정 / U 모름. 결정은 구현 때 ADR(PWA·지원 브라우저)에 남긴다.

# PWA (vite-plugin-pwa 2.0.0) and browser baseline: research from 2026-10-28

## Bugs to fix whatever we decide
1. **`toSorted` already ships to phones.** `packages/shared/src/clock.ts` uses it. `apps/game/src/net/connection.ts` imports that code, and the built `dist` bundle contains it.
   - On iOS below 16 the TypeError is swallowed by the `catch` in connection.ts, so clock sync silently never finishes.
   - The comment in `frameStats.ts` and worklog 28-1820 say client code avoids `toSorted`; that is wrong. **V**
2. **The reject screen's reload button will loop once a service worker (SW) exists.** `window.location.reload()` loads the old cached build again, because a waiting SW does not take over on a reload. The server then rejects it again. **V** (SW spec "Try Activate"; [web.dev](https://web.dev/articles/service-worker-lifecycle) V\*)
3. **The server's not-found handler answers missing files with index.html.** In `apps/server/src/app.ts` it returns index.html with status 200 for a missing `/assets/*.js` or `/sw.js`.
   - Stale lazy-loaded chunks then fail with a MIME error.
   - A SW could never be retired. **V**

## 1. The plugin package (all V)
- **Version and peers.** 2.0.0 was published 2026-10-03, MIT licence, needs Node 20.19 or later.
  - Peers: `vite ^3.1 … || ^8.0.0`, plus `workbox-build` and `workbox-window ^7.4.1` (7.4.1 is from 2026-05-04).
- **"Vite 8 support" is only a peer-range bump** (commit 276af62, one line in package.json). The plugin's own tests still run on Vite 5. Vite's ecosystem CI does include the plugin, but I could not see results (U). Our own build is the real test.
- **No `allowBuilds` change needed.** I resolved the tree with pnpm 11.28.9 using our `minimumReleaseAge` and `allowBuilds` settings: 391 packages. Only `fsevents` has an install script; it is macOS-only and already in our lockfile.
- **Use `generateSW`.** We need no custom SW code. workbox-build bundles the SW with its own Rollup 4.
  - `injectManifest` would build the SW through Vite with `esbuild`/`rollupOptions` options that Vite 8 marks deprecated.
  - Revisit at web push: either `workbox.importScripts` or a switch to injectManifest.
- **Use `registerType: 'prompt'`, not `autoUpdate`.** `autoUpdate` forces skipWaiting and clientsClaim, deletes the old cache mid-session and reloads every tab. The docs warn that switching away from it later is painful. Version 2.0 has an `onNeedReload` hook so we can own the reload.
- **The navigation fallback only touches page loads.** It handles only `mode: 'navigate'` requests and matches the denylist against pathname plus query.
  - `/api` must be on the denylist: Better Auth's OAuth callbacks are page navigations to `/api/auth/callback/:id` (better-auth 1.7.14 code).
  - `/ws` never reaches a SW (WHATWG WebSockets spec: service-workers mode "none").
  - fetch and sendBeacon calls to `/api` pass through untouched.
- **Keep `devOptions` off.** In dev the virtual module is a do-nothing stub.
- **Server headers are already fine.** Fastify serves `.webmanifest` as `application/manifest+json` with `Cache-Control: public, max-age=0`.
- **It does ship runtime code to the browser:**
  - the register code (about 3 KB)
  - a `workbox-window` chunk (2.3 KB gzipped)
  - `sw.js`
- **`workbox-window` must be a direct dependency.** With pnpm (this repo has no public hoisting), the virtual module's `import("workbox-window")` only resolves that way. The plugin's docs say the same, and Vite's resolver code agrees; I did not run a build.
  - Classification: the plugin goes in devDependencies. `workbox-window` goes in `dependencies`, like react.
  - That makes `check-docs` require an ADR.

## 2. Update prompt and the WebSocket
- **Check for updates on every `welcome`.** Browsers only look for a new SW on page navigations, or on SW events once 24 hours have passed (V spec). A home-screen app rarely navigates and has no reload button (A).
  - So call `registration.update()` on every `welcome`. A deploy restarts the server and every socket reconnects, so the new build is found within seconds, with no protocol change.
  - Also call it when the app becomes visible, at most every 10 minutes.
- **Normal update.** `onNeedRefresh` shows a banner. On tap, `updateServiceWorker()` sends SKIP_WAITING, the browser fires `controlling`, and our `onNeedReload` runs:
  1. stop sending commands
  2. wait up to 2 s for acknowledgements
  3. `close(1000)`
  4. reload

  Commands carry an id and a dedupe key, so this is safe (A).
- **Forced update.** On `reject: protocol_unsupported`, or a `vite:preloadError` (V, Vite 8.3.5), run `forceUpdate()`:
  1. call `update()`
  2. wait up to 15 s for a waiting worker
  3. apply it if one arrives, otherwise do a plain reload

  This also covers a rollback, where the client is newer than the server.
- **No "ready to work offline" toast.**

## 3. Manifest (V: MDN content, BCD 8.1.7)
BCD is MDN's browser-compat-data.
- **Chrome and Samsung Internet require:**
  - `name` or `short_name`
  - 192 and 512 px icons
  - `start_url` and `display`
  - no `prefer_related_applications`
  - HTTPS (127.0.0.1 also counts)

  Install from the menu has needed no SW since Chrome 108, but the automatic prompt still wanted a fetch handler ([Chrome](https://developer.chrome.com/blog/update-install-criteria) V\*). Only Chrome (with Google services) and Samsung create real installed apps (WebAPKs); others, such as Whale (A), add a shortcut.
- **iOS ignores** `background_color`, `orientation` and `fullscreen`. It uses manifest icons only when there is no apple-touch-icon.
- **Values:**
  - `id`, `start_url`, `scope`: `"/"`
  - `display: standalone`, `orientation: any`, `lang: ko`
  - colours: placeholder `#0b1020`, already used in index.html
  - name strings: from `messages/ko.json`, because mobile browsers cannot localise a manifest
- **Icons** (placeholders, using the assets-generator "minimal-2023" names):
  - `pwa-192x192.png`
  - `pwa-512x512.png`
  - `maskable-icon-512x512.png` (logo inside the central 80%)
  - `apple-touch-icon-180x180.png` (opaque background)
  - `favicon.ico`

## 4. iOS
- **Storage eviction:** Safari deletes script-written storage after 7 days of use without interaction on the site. That covers the SW, the Cache API and the language choice in localStorage. Cookies set by the server are exempt (V MDN). Home-screen apps keep their own day counter ([WebKit 2020](https://webkit.org/?p=10218) V\*).
- **Home screen:** iOS 26 opens every home-screen site as a web app ([WWDC25](https://webkit.org/?p=16993) V\*). From 16.4, Safari, Chrome, Edge and Firefox can all add to the home screen (V).
- **Web push:** needs 16.4+, a home-screen install, a non-default `display`, and a permission request after a tap (V BCD). Declarative Web Push from 18.4 ([WebKit](https://webkit.org/?p=16574) V\*).
- **In-app browsers:** KakaoTalk-style in-app browsers (WKWebView) get no SW (V BCD), so the app must work without one.
- **Splash and safe areas:** no splash screen is generated from the manifest; it would need per-device `apple-touch-startup-image` files, so I'd postpone it (A). Add left, right and bottom safe-area insets for the HUD.
- **OAuth:** whether social login works inside a home-screen app is U.

## 5. Browser baseline
- **Korean mobile share** ([StatCounter](https://gs.statcounter.com/browser-market-share/mobile/south-korea), June 2026, V\*): Chrome 41.8%, Safari 26.8%, Whale 15.3%, Samsung Internet 14.2%.
- **Version shares** (caniuse-lite 1.0.30001819, 2026-10-22, Korea, StatCounter-based, V):

| Browser and version | Share of that browser's traffic |
|---|---|
| iOS Safari 16.4 or later | 97.3% |
| iOS Safari 17 or later | 95.3% |
| iOS Safari 18 or later | 93.2% |
| Samsung Internet 30 | 96.5% |

  Whale is not tracked (U).
- **Recommendation:** iOS 16.4+, Chrome and Edge 111+, Samsung Internet 22+, Firefox 114.
  - This is exactly Vite 8.3.5's built-in `baseline-widely-available` target (V).
  - It is also the minimum for web push and for class static blocks. Our current `es2022` target would ship static blocks unconverted.
- **Usable at that floor:**
  - ES2023 (`toSorted`, `findLast`, `with`)
  - `structuredClone`
  - `:has()`, container queries, `dvh`
- **Feature-detect first:**
  - `Object.groupBy`, `Promise.withResolvers` (iOS 17.4)
  - Set methods (17)
  - iterator helpers (18.4)
  - OffscreenCanvas WebGL2 (17)
  - WebGPU (26)
- **Enforce it** with `build.target: "baseline-widely-available"` and `lib: ES2023` in the game's tsconfig. Shared and protocol source is type-checked under that setting (A).

## 6. Testing
- **CI, no browser:**
  - A post-build script checks the manifest fields and icons, that `theme_color` matches the meta tag, that the manifest link is present, and that sw.js contains the denylist and `SKIP_WAITING`.
  - The image smoke test checks content types with curl and expects `/assets/missing.js` to return 404.
- **Nightly Playwright, Chromium only** (Playwright supports SWs only there, V):
  - `serviceWorker.ready` and `context.serviceWorkers()`.
  - The DevTools-protocol call `Page.getAppManifest`, plus the experimental `getInstallabilityErrors` (U in headless mode).
  - `setOffline` then reload should still render the app shell (U whether offline mode applies to SW traffic).
  - An offline navigation to `/api/…` must fail.
  - A test that builds twice and checks the update flow.
  - Tests that use `page.route` need `serviceWorkers: 'block'`.
- **iPhone and Whale:** a manual checklist.

## Implementation plan
1. **ADR.** `docs/adr/<date>-pwa-and-browser-baseline.md` covering: the new dependencies (MIT licences), `generateSW`, the prompt policy, shell-only caching, the baseline, icons kept in git as an exception to PLAN 9.8.
2. **Dependencies.** In `apps/game/package.json`: `vite-plugin-pwa 2.0.0` in devDependencies, `workbox-window 7.4.1` in dependencies.
3. **Vite config.** In `apps/game/vite.config.ts`, add the plugin, plus `build.target: "baseline-widely-available"`:
```ts
const ko = JSON.parse(readFileSync(new URL("./messages/ko.json", import.meta.url), "utf8"));
VitePWA({
  registerType: "prompt",
  injectRegister: false, // virtual:pwa-register로 직접 등록
  includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png"],
  manifest: {
    id: "/", start_url: "/", scope: "/", display: "standalone", orientation: "any", lang: "ko",
    name: ko.app_title, short_name: ko.app_short_name, description: ko.app_description,
    theme_color: "#0b1020", background_color: "#0b1020", // 임시값 — 디자인 시스템 ADR 때 교체
    icons: [
      { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
      { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  },
  workbox: { navigateFallback: "index.html", navigateFallbackDenylist: [/^\/(api|ws|health)(\/|\?|$)/] },
});
```
4. **TypeScript.** In `apps/game/tsconfig.json`, add `vite-plugin-pwa/vanillajs` to the types and set `lib` to ES2023.
5. **Icons.** Put the icons in `apps/game/public/` and add icon and apple-touch-icon links to `apps/game/index.html`.
6. **Update module.** Create `apps/game/src/pwa/updates.ts`.
   - It calls `registerSW` once, outside React, so the connection and preload code can call `forceUpdate`. Keep the default "register after page load" so it doesn't slow the first screen.
   - Put the rules in a pure, tested `updatePolicy.ts`, with an `UpdateBanner.tsx` for the banner.
   - Add `closeForReload()` to connection.ts.
7. **Server fallback.** In `apps/server/src/app.ts`, use the single-page-app fallback only for paths without a file extension. Return 404 for the rest, and add a test.
8. **Message keys (ko and en):**
   - `update_available`: 새 버전이 있습니다 / A new version is available
   - `update_later`: 나중에 / Later
   - `update_applying`: 새 버전으로 바꾸는 중… / Updating…
   - `app_short_name`: 테라 / Terra
   - `app_description`
   - Reuse `reload`.
   - Reword `status_rejected_protocol` so it doesn't say "old version"; after a rollback the client is the newer one.
9. **Tests and docs.**
   - Add the tests from section 6.
   - Add the baseline to PLAN §3.
   - Add a note to AGENTS.md §6: Vite 8 support is a peer range only, `workbox-window` must be a direct dependency, and `onNeedReload` exists.
   - Fix the `toSorted` comment and write a worklog entry.
   - Emergency switch-off is `selfDestroying: true` (V docs).

## Decisions for the user
1. **iOS floor:** 16.4 (recommendation; reaches 2 points more of iOS traffic) or 17 (adds OffscreenCanvas WebGL2 in workers; iPhone 8 and X are left behind, A).
2. **How updates apply:** banner only, or also apply automatically when an update is already waiting at launch, before the first tap.
3. **Placeholders:** OK to ship until the design-system ADR? (name 테라 인코그니타 / short name 테라, colour `#0b1020`, simple icons, `orientation: any`)

**Sources** (fetched 2026-10-28): npm registry (vite-plugin-pwa, workbox packages, caniuse-lite, @mdn/browser-compat-data 8.1.7, devtools-protocol, better-auth); the vite-plugin-pwa git history; GitHub raw: vite-pwa/docs, mdn/content, whatwg/websockets, w3c/ServiceWorker, Playwright docs, vite-ecosystem-ci. V\* pages are linked inline above.
