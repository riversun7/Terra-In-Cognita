> 조사 보고서 원본의 한국어판 (작성: Claude Code 조사 에이전트, 2026-10-29. 영어로 쓴 원본을 같은 날 Claude Code가 옮겼다). npm 레지스트리 정보, MDN browser-compat-data 8.1.7, 명세·라이브러리 문서, Apple 문서, 로컬 꾸러미 코드를 읽었다. 묶음 크기·타입 검사·웹 푸시 암호화·서비스 워커 빌드는 세션 임시 폴더에서 직접 돌렸다. 옮기면서 숫자·판·날짜·출처 주소·확인 표기(Verified·Assumed·Unknown·[OLD])는 원본 그대로 두었고 내용을 더하지 않았다. 문서 안의 `/tmp/...` 경로는 그 세션의 임시 폴더라 나중에는 없을 수 있다. 결정은 ADR `docs/adr/2026-10-29-app-shell.md`(앱 뼈대, 제안)에 있다. 웹 푸시는 그 ADR 9절대로 나중에 새 ADR에서 정한다.

# 앱 뼈대 조사: 화면 주소 처리(라우팅), 끌어 옮기기, 웹 푸시 (2026-10-29)

저장소는 고치지 않았다. 시험은 모두 임시 폴더에서 돌렸다.

**조사 방법**
- npm 레지스트리 메타데이터. 2026-10-29에 받았다.
- MDN browser-compat-data(BCD) **8.1.7**, 2026-10-22 공개. BCD 자료가 말하는 지금 브라우저 판은 Chrome 156, Firefox 158, Safari·iOS 27, 삼성 인터넷 30이다.
- GitHub raw에서 읽은 1차 문서: 명세, 라이브러리 자체 문서, RFC 초안.
- Apple 개발자 문서. JSON 형태로 읽었다.
- 로컬 꾸러미 코드.
- 저장소 도구로 직접 잰 값:
  - rolldown 1.2.15(Vite 8.3.5 안의 묶음 도구) + oxc 줄이기 + gzip 9단계(ADR 36 묶음 크기와 같은 방법)
  - TypeScript 7.0.2, 저장소의 strict 설정
  - Node 24.22.1
  - Vite 8.3.5 + vite-plugin-pwa 2.0.0 시험 빌드

**표기**
- **Verified**: 내가 확인했다.
- **Assumed**: 추정이다. 확인하지 않았다.
- **Unknown**: 알아내지 못했다.
- **[OLD]**: 출처가 약 2년보다 오래됐다. 곧 2024-10 전이다.

**네트워크 제약**
- 웹 받기 도구가 **webkit.org**와 **dndkit.com**에 닿지 못했다("outside the session's allowed network domains"). WebKit 블로그 글과 dndkit.com을 직접 다시 확인하려면 세션 네트워크 설정에서 두 호스트를 허용해야 한다.
- 프록시가 막은 곳: web.dev, developer.chrome.com, MDN, tanstack.com, reactrouter.com, caniuse, rfc-editor.org/ietf.org, w3c.github.io, firebase.google.com, chromium.googlesource.com, bugs.webkit.org.
- Apple 포럼은 봇 검사 뒤에 있다.
- 막힌 곳은 같은 문서·명세의 GitHub raw 사본이나 검색 결과 요약을 썼다(그렇게 표시했다).

## 0. 답에 영향을 주는 저장소 사정 (Verified, 저장소 파일)
- **S2 가지는 이미 main에 합쳐졌다**(합침 `523f373`). 작업 트리 `.claude/worktrees/wf_cf86e8da-f84-1`의 `App.tsx`, `AccountBar.tsx`, `vite.config.ts`, `apps/game/package.json`은 main과 바이트까지 같다.
- **지금 `App.tsx`는 화면을 주소가 아니라 상태로 바꾼다.** 주석은 "주소·라우터 없이 상태로"다.
  - 1차맵·2차맵 임시 화면은 지연 조각이다. three.js는 그 조각에만 들어 있다.
  - 지도가 화면을 덮는 동안 계정 줄은 숨는다.
  - `LazyView` + `ChunkErrorBoundary` + `forceUpdate`가 받기에 실패한 조각을 처리한다.
- S2 통합 뒤 **첫 화면 JS**는 372,600 B, **gzip 115,427 B**다(ADR `2026-10-29-s2-planet-lod.md`). ADR마다 늘어난 크기를 kB 한 자리 단위로 적어 왔으므로, 라우터 크기가 여기서 중요하다.
- **PLAN 3장에는 이미** "화면 이동 | TanStack Router | 1.170.x"와 "web-push 3.6.7 (MPL-2.0, 2024-01 이후 갱신 없음)"이 있다. **둘 다 설치되지 않았다.** 그래서 아래 어느 쪽을 고르든 ADR이 필요하다. PLAN 줄을 확정하거나 바꾼다.
- **PWA:** `generateSW`, `registerType: "prompt"`, `navigateFallback: "index.html"`, 제외 목록 `/^\/(api|ws|health)(\/|\?|$)/`.
  - 새 버전 정책은 기다리는 워커에 `SKIP_WAITING`을 바로 보낸다.
  - `scripts/pwa-build.mjs`는 `sw.js`에 `SKIP_WAITING`/`skipWaiting()`, 제외 목록, 미리 캐시한 `index.html`이 있는지 본다.
  - ADR 28은 워커 방식을 "웹 푸시를 넣을 때" 다시 본다고 한다.
- **서버의 화면 경로 대체(SPA fallback)** (`apps/server/src/app.ts:227-238`): 파일 확장자가 없고 `/api`나 `/ws`로 시작하지 않는 GET 경로만 `index.html`을 받는다.
  - 그래서 **화면 경로에는 `.`이 없어야 한다**.
  - 경로가 글자 `api`나 `ws`로 시작해도 안 된다. 검사가 빗금 없는 `startsWith("/api")`라서 `/apiary`는 404를 받는다.
- **초점 방식이 이미 있다:** `src/ui/useMountFocus.ts`는 화면이 바뀌면 초점을 옮기고, 처음 켤 때는 옮기지 않는다(휴대폰 자판이 뜨지 않게).

---

## 1. 화면 주소 처리 (Vite 8 + React 19.3 단일 페이지 앱·PWA)

### 1.1 틀이 라우터에 바라는 것 (D-6001~D-6016 + 저장소 규칙에서)
- **깊은 주소(딥 링크).**
  - 푸시를 누르면 처리함 항목이나 다른 화면이 열린다(D-6011, D-6015).
  - 복귀 요약은 다시 연결한 뒤 한 번 뜬다(D-6014).
  - 푸시 주소는 서버가 만든다. 그래서 서버와 기기가 주소 표 하나를 같이 쓰는 것이 좋다. `packages/shared`는 다른 내부 패키지를 가져올 수 없는데, 단순한 경로 표는 그 조건에 맞는다.
- **뒤로 버튼.**
  - 안드로이드의 시스템 뒤로는 기록 칸을 뺀다. ☰ 사이드 메뉴 같은 겹친 화면은 뒤로로 닫혀야 한다.
  - iOS 홈 화면 앱(standalone)에는 브라우저 뒤로 버튼이 없다. 그래서 앱이 자기 [뒤로]를 보여야 한다.
- 지금의 조각 오류 처리를 갖춘 **지연 로딩 화면**.
- **틀을 숨기는 화면("chromeless" 경로):** 지도는 화면 전체를 덮고 위 띠·하단 탭을 숨긴다. 지도 엔진을 들르는 사이에도 띄워 두면 도움이 된다. S1 목표가 다시 들어가기 ≤ 1초라서다(Assumed 설계 요구).
- **타입 있는 매개변수**, 예: `/units/:unitId`, `/inbox/:kind/:itemId`.
- **대시보드 템플릿 시안 바꾸기**(D-6005), 예: 검색어 매개변수.

### 1.2 잰 크기 (Verified: rolldown 1.2.15 + oxc 줄이기, gzip -9)
묶음마다 React와 react-dom은 뺐다. 표본마다 경로가 4개이고 그중 1개는 지연 로딩이다. 작은 표본 앱 코드(gzip 약 0.3–0.5 kB)가 들어 있다.

| 선택지 (판) | 줄인 크기(min) | gzip | 지금 첫 화면(115.4 kB) 대비 gzip |
|---|---:|---:|---:|
| React 19.3.1 + ReactDOM (견줌용) | 220.8 kB | 67.9 kB | — |
| TanStack Router 1.170.46, 코드로 쓴 경로, `scrollRestoration: true` | 77.6 kB | **26.9 kB** | +23% |
| TanStack Router, 경로 하나 (바닥값) | 75.4 kB | 26.4 kB | +23% |
| React Router 8.5.1 데이터 모드(`createBrowserRouter` + `react-router/dom`의 `RouterProvider` + `ScrollRestoration`) | 104.2 kB | **32.0 kB** | +28% |
| React Router 8.5.1 선언 모드(`BrowserRouter`/`Routes`) | 41.5 kB | 13.4 kB | +12% |
| wouter 3.13.0 + `React.lazy` | 6.5 kB | **3.0 kB** | +2.6% |
| 자체 History API 라우터 스케치(83줄, 실행한 적 없음. 아래 참고) | 3.3 kB | **1.5 kB** | +1.3% |

자체 스케치에는 popstate, 링크 가로채기, 기록 칸마다 열쇠를 둔 스크롤 되돌리기, 초점, 기준 경로, 뒤로 기록 미리 넣기가 들어 있다.

TanStack 묶음 안 (Verified, 모듈별로 나눠 봄):
- router-core가 약 75%다. 가장 큰 파일은 `load-client.js`와 `router.js`다.
- `use-sync-external-store` 대체 코드(shim)가 `@tanstack/react-store`를 거쳐 들어온다. React 19에는 그 훅이 이미 있는데도 그렇다.
- `isbot`과 `seroval`은 쓰이지 않아 묶음에서 빠진다(tree-shaking).

### 1.3 선택지

| | 자체(History API) | TanStack Router | React Router | wouter |
|---|---|---|---|---|
| 판 / 날짜 (npm) | — | 1.170.46 / 2026-10-22 | 8.5.1 / 2026-10-27 (v8.0.0은 2026-06-17) | 3.13.0 / 2026-09-30 |
| 라이선스 | 우리 것 | MIT | MIT | **Unlicense** (OSI 승인 2020-06-12, "special purpose" [OLD 사실, 바뀌지 않음]) |
| 실행 의존성 | 없음 | router-core 1.171.39, history 1.162.5, react-store ^0.11.2 (→ use-sync-external-store), isbot | cookie-es, @remix-run/route-pattern | regexparam ^3.0.0 (2023-12 [OLD]), use-sync-external-store |
| React 19 | ✔ (`useSyncExternalStore`) | peer `>=18 \|\| >=19`. 문서는 "react v18 or later" | peer **`>=19.2.7`**. engines Node ≥22.22. ESM 전용. Vite ≥7 | peer `>=16.8` |
| 타입 있는 매개변수 (TS 7.0.2, strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`로 확인) | ✔ 템플릿 리터럴 주소 표: 빠졌거나 잘못 쓴 매개변수, 모르는 매개변수는 컴파일에 실패한다 | ✔ 모두 추론한다: `<Link>`의 틀린 `to`나 빠진 `params`는 실패한다 | ✘ 데이터·선언 모드에서 `useParams()`는 `string \| undefined`다. 타입은 **프레임워크 모드**(Vite 플러그인 + `+types` 타입 생성)에서만 있다 | ✔ `useRoute("/units/:unitId")`가 `{unitId: string}`을 추론한다. `<Link href>`와 `useParams()`는 타입이 없다 |
| 스크롤 되돌리기 | 직접 쓴다(약 25줄) | ✔ `scrollRestoration: true`, 안쪽 스크롤 영역용 `scrollToTopSelectors`. `<ScrollRestoration/>`는 사용 중단 | `<ScrollRestoration/>`, 데이터·프레임워크 모드에서만 | ✘ (README에 없음) |
| 초점 관리 | 직접 쓴다(`useMountFocus` 생각을 다시 씀) | 읽은 문서에 없음 | 읽은 문서·변경 기록에 없음 | 없음 |
| 지연 로딩 화면 | `React.lazy` | `createLazyRoute` / `lazyRouteComponent`. `autoCodeSplitting`은 파일 기반 플러그인이 필요하다(babel이 딸린 개발 의존성) | `route.lazy` | `React.lazy` |
| 기준 경로 | `import.meta.env.BASE_URL` | `basepath` 옵션 | `basename` | `<Router base>` |
| 그 밖 | — | `useBlocker`, 타입 있는 검색어, 누르려 할 때 미리 받기(preload on intent), 주소 `rewrite`(Paraglide 예) | loaders/actions/fetchers(데이터 모드), `useBlocker` | `nest`, `useSearchParams`, hash/memory 위치 |
| 관리 (최근 365일의 안정판 수; GitHub는 2026-10-29 기준) | — | **228**(주 약 4개). 열린 이슈 347, 열린 PR 465, 별 15.3k | 36. 해마다 메이저 1개(v9는 2027년 중반쯤) | 8. 이슈 18, PR 5, 별 7.9k |

### 1.4 어느 쪽을 고르든 다뤄야 하는 플랫폼 사실
- **Navigation API는 우리 하한에서 못 쓴다.** BCD 8.1.7: Chrome 102, Firefox 147, Safari/iOS **26.2**. 하한인 iOS 16.4에서는 History API만 쓸 수 있다.
- **`history.scrollRestoration`**은 iOS 11+, Chrome 46+에 있다(BCD). 틀이 안쪽 칸을 스크롤하면 `"manual"`로 두고 스크롤 위치를 직접 저장한다.
- **안드로이드 뒤로와 겹친 화면.**
  - Chrome 120부터 `<dialog>`와 popover가 "닫기 요청(close request)"으로 안드로이드 뒤로 버튼에 반응한다(Chrome 120 출시 블로그, 2023-12 [OLD], 검색으로).
  - BCD는 `CloseWatcher` API를 Chrome 126, Firefox 안드로이드 149, 삼성 인터넷 28부터로 적는다. Safari에는 없다.
  - Blink 출시 의향(intent-to-ship) 글타래는 이 동작이 사용자 활성화(user activation)가 있어야 된다고 한다(검색으로).
  - ⇒ **좁은 폭의 ☰ 사이드 메뉴를 모달 `<dialog>`로** 만들면 기록 꼼수 없이 "뒤로하면 메뉴가 닫힌다"(Assumed: 기기에서 시험하지 않음).
- **Chromium의 기록 조작 개입(history manipulation intervention):** 페이지가 사용자 활성화 없이 넣은 기록 칸은 브라우저 뒤로 버튼이 건너뛴다(Chromium `docs/history_manipulation_intervention.md`, 검색으로 읽음 [OLD 설계, 지금도 유효]).
  - 알림에서 앱을 처음 켜며 연 깊은 주소는 부모 칸을 "미리 넣을" 수 있다(`replaceState('/')` + `pushState(target)`). 그러면 뒤로가 앱을 닫지 않고 대시보드로 간다.
  - 다만 사용자가 페이지에서 무언가를 한 번 누른 뒤에만 믿을 만하다(그 규칙에서 Assumed).
- **iOS 홈 화면 웹앱에는 뒤로 버튼이 없다.** 가장자리를 밀어 뒤로 가는 동작은 믿을 수 없다는 사용자 보고가 있다(W3C public-webapps 목록 2025-05, Discourse·Lemmy 글타래). ⇒ 첫 화면이 아닌 모든 화면에 앱 안 뒤로 버튼이 필요하다. 앱 안 기록이 있으면 `history.back()`, 없으면 부모 경로로 간다.
- **서비스 워커의 깊은 주소 흐름(푸시를 누를 때).**
  - `notificationclick`에서 `clients.matchAll({type:"window", includeUncontrolled:true})`. 창이 있으면 `focus()`하고 `postMessage({type:"navigate", url})`를 보낸다. 앱이 페이지 안에서 옮기고 WebSocket을 그대로 둔다. 창이 없으면 `clients.openWindow(url)`.
  - `WindowClient.navigate`는 iOS **16+**에서 된다. 그 전에는 `NotSupportedError`를 던졌다(BCD).
  - **iOS 처음 켜기 버그:** WebKit 버그 263687 "notificationClick openWindow goes to PWA root instead of url given". 2023-10-25에 올라왔고 2024-03-04에 회귀로 불렸다 [OLD]. 지금 상태는 Unknown(검색 요약). 대안은 앱이 켜질 때 기다리는 목표 주소를 워커에 묻는 것이다(Assumed 우회).
  - **BCD 8.1.7은 safari_ios에서 `notificationclick`을 지원 안 함으로 표시한다.** 그런데 WebKit 버그 보고에는 iOS에서 처리기가 도는 모습이 있다. **Unknown: 아이폰에서 시험한다.**
- **오프라인·온라인 깊은 주소는 주소 수준에서 이미 된다.** Workbox `navigateFallback`과 서버의 화면 경로 대체가 둘 다 `index.html`을 준다(0장의 경로 규칙 안에서).

### 1.5 자체 라우터가 다룰 것 (고르면)
- **링크:** 보조 키 없는 왼쪽 누르기만 가로챈다. 이런 것은 그대로 보낸다: 보조 키, 가운데 버튼, `target="_blank"`, `download`, 다른 출처, 해시만 있는 링크.
- **기록:** `pushState`/`replaceState`, `history.state`에 칸마다 열쇠. 자기 `pushState`에는 `popstate`가 오지 않는다는 점을 기억한다.
- **스크롤:** 떠날 때 저장하고, 지연 로딩 화면이 그려진 뒤 되돌린다. 곧 Suspense가 풀린 뒤이고, 그 전이 아니다.
- **초점:** 앱 안에서 옮길 때 새 화면 제목에 초점을 둔다(`tabIndex=-1`, `preventScroll`). 처음 켤 때는 두지 않는다. `document.title`은 메시지 키로 바꾼다.
- **겹친 화면:** dialog로 만든 사이드 메뉴, 그리고 처음 켜며 연 깊은 주소용 뒤로 기록 미리 넣기.
- **푸시와 로그인:** 워커가 `postMessage`로 보내는 이동을 듣는다. 로그인 안 된 채 돌려보낼 때는 요청한 주소를 `returnTo`로 간직한다.
- **읽기:** 모르는 경로는 거절하고, 검색어는 zod로 읽는다.
- **기준 경로:** `BASE_URL`을 떼어 낸다.
- **지도 경로:** 틀을 숨기는 경로, 그리고 원하면 지도를 숨긴 채 띄워 둔다.
- **시험:** 경로 맞추기와 주소 만들기는 Vitest 단위 시험, 뒤로/앞으로·깊은 주소·새로고침·스크롤은 Playwright(Chromium).

### 1.6 Paraglide와 언어별 경로
**권고: 경로에 언어를 넣지 않는다.**
- **이득이 없다:** 홈 화면 앱 모드는 주소창을 숨기고, 로그인한 게임 화면은 검색 노출 가치가 없다.
- **앱이 쓰지 않는다:** 지금 방식은 `["localStorage","preferredLanguage","baseLocale"]`이고 `url`이 없다. 그래서 지금 설정이 지금처럼 움직인다.
- **옛 iOS에서 바이트가 는다:** Paraglide의 `url` 방식은 URLPattern을 쓴다(문서 `opral/paraglide-js/docs/strategy.md`). BCD에서 URLPattern은 **Safari/iOS 26**부터다. 그래서 iOS 16.4–25에는 함께 묶이는 `urlpattern-polyfill`(paraglide-js 2.29.2의 의존성)이 필요하다.
- **푸시 주소가 유저 언어에 따라 달라지면 안 된다.**
- 경로는 영어 식별자로 둔다. 화면 이름은 메시지 키로 둔다. (TanStack 다국어 안내에 Paraglide `rewrite` 예가 있다. 나중에 원하면 본다.)

### 1.7 권고 (화면 주소)
**`apps/game`에 작은 자체 History API 라우터(시험 포함 약 150–250줄)를 쓰고, 프레임워크와 무관한 타입 있는 주소 표를 `packages/shared`에 둔다.**
- **이유:**
  - gzip 약 1.5 kB다. TanStack Router는 26.9 kB(첫 화면 JS의 +23%)다.
  - 새 실행 의존성이 없고 ADR을 자주 고칠 일도 없다. TanStack은 주에 안정판을 약 4개 낸다. 곧 Dependabot 라우터 PR이 매주 생긴다.
  - 자료는 이미 WebSocket과 tRPC로 오므로 경로별 미리 받기(loader)의 보탬이 작다.
  - 어려운 부분은 어차피 이 앱에만 있는 것이다: 안쪽 칸 스크롤, 초점, 틀을 숨기거나 띄워 둔 지도, 푸시 깊은 주소, 겹친 화면의 안드로이드 뒤로.
  - 서버가 같은 표를 가져와 푸시·처리함 주소를 만들 수 있다. TanStack 경로 트리는 `apps/game`의 React 코드에 있어 서버가 가져올 수 없다.
- **감수할 점:**
  - 가장자리 경우를 우리가 맡는다(링크 뜻, 지연 로딩 중 popstate, 스크롤 시점).
  - 개발 도구가 없고, 검색어 검사가 들어 있지 않다.
  - ADR이 PLAN 3장 "TanStack Router" 줄을 바꿔야 한다.
- **대안:** TanStack Router 1.170.x. TS 7.0.2에서 타입 검사를 통과한다(Verified). 타입 있는 검색어·loader·미리 받기가 중심이 되면(예: 거래창) ADR과 사용자 승인을 거쳐 고른다.
- **권하지 않음:**
  - React Router v8 데이터 모드: 32 kB로 가장 크다. 매개변수 타입은 프레임워크 모드에서만 있어, 그러려면 앱을 그 Vite 플러그인 중심으로 다시 짜야 한다.
  - wouter: 3 kB라 받아들일 만하다. 하지만 스크롤·초점 코드를 어차피 써야 해서 자체 라우터보다 나은 점이 적고, Unlicense라 ADR에 적어 둘 것이 생긴다.

---

## 2. 끌어 옮기기 (대시보드 카드, 탭 항목; 터치와 데스크톱)

### 2.1 요구
- **DT-GRID**(D-6005): 1×1·2×1·2×2 크기 카드를 끌어서 배치한다. **탭·사이드 메뉴 항목**(D-6008): 순서를 바꾸고 두 목록 사이로 옮긴다. **계정에 저장**(D-6001).
- **WCAG 2.2 SC 2.5.7 "Dragging Movements"(AA):** "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging…" (w3c/wcag `guidelines/sc/22/dragging-movements.html`, main 가지, 2026-10-29에 받음. WCAG 2.2는 2023-10에 W3C 권고가 됐다 [OLD, 지금 표준]). ⇒ 어떤 라이브러리를 쓰든 **↑·↓나 "…로 옮기기" 버튼이 필요하다**.
- **저장한 순서를 DOM 순서와 같게 둔다.** CSS Grid L1 명세의 "Reordering and Accessibility" 절은 격자 배치가 "must not be used as a substitute for correct source ordering"이라고 한다(w3c/csswg-drafts `css-grid-1/Overview.bs`). 순서 있는 `{cardId, size}` 목록을 저장하고 CSS Grid가 배치하게 하면 이것에 맞는다. `grid-auto-flow: dense`는 보이는 순서와 초점 순서를 다르게 만든다. 그래서 쓰지 않거나 작은 빈칸을 감수한다(Assumed 설계).
- **편집 상태는 지연 조각으로 둘 수 있다.** 그러면 끌기 코드가 첫 화면 JS에 들어가지 않는다.

### 2.2 잰 크기 (Verified, 같은 방법; 최소 정렬 목록 표본)

| 선택지 (판, 날짜) | 라이선스 | 줄인 크기(min) | gzip | 키보드·ARIA 기본 제공 | 상태 |
|---|---|---:|---:|---|---|
| 자체 Pointer Events 훅(스케치, 실행한 적 없음. 아래 참고) | 우리 것 | 2.5 kB | **1.2 kB** | 버튼 + 알림 영역(우리 것) | — |
| @atlaskit/pragmatic-drag-and-drop 4.0.0 core (2026-09-24) | Apache-2.0 | 21.4 kB | 6.5 kB | ✘ 설계상 없음: 문서는 core가 "does not enable accessible controls automatically"라고 하고, "move to top" 같은 메뉴를 권한다 | 안정판 연 11개. Atlassian 모노레포를 한쪽으로만 비추는 사본(미러), 이슈 96 |
| … + hitbox 3.0.0 + live-region 2.1.0 + auto-scroll 3.2.1 | Apache-2.0 | 33.2 kB | 9.5 kB | 알림(announcement)만 | react-accessibility 꾸러미가 Atlassian 디자인 시스템(`@emotion/react`, `@atlaskit/tokens`, 아이콘)을 끌어온다. 여기서는 못 쓴다 |
| @formkit/drag-and-drop 0.6.1 (2026-06-15) | MIT | 30.6 kB | 8.9 kB | 일부(확인 안 함) | 연 3개 판, 0.x |
| SortableJS 1.15.7 core (2026-02-11) | MIT | 33.9 kB | 11.9 kB | ✘ | 연 1개 판. DOM 노드를 스스로 옮겨서 React와 부딪친다(Assumed) |
| @dnd-kit/core 6.3.1 + sortable 10.0.0 + utilities 3.2.2 ("legacy") | MIT | 43.3 kB | 14.4 kB | ✔ 키보드 센서, 읽기 프로그램 안내, 알림 영역 | **2024-12-05 뒤로 판이 없다**. 문서: "There's a new version of @dnd-kit available. We recommend you use the latest version instead." (`apps/docs/docs/legacy/introduction/installation.mdx`) |
| @dnd-kit/react 0.5.1 (+dom/abstract/state/geometry/collision/helpers; 2026-10-15) | MIT | 117.7 kB | **36.7 kB** | ✔ 기본으로 `PointerSensor`와 `KeyboardSensor`(Space/Enter, 화살표, Escape). Accessibility 플러그인이 기본으로 켜짐(ARIA, 안내, 알림 영역) | 매우 활발. peer React `^18 \|\| ^19`. **1.0 전이라 작은 판(minor)에서도 깨지는 변경이 있다**(v0.4.0, 2026년 4월: 이벤트 타입 다시 설계, `feedback` 옵션 옮김. v0.5.0은 2026년 6월). `@preact/signals-core`에 의존 |
| react-aria-components 1.22.1 (GridList + `useDragAndDrop`) | Apache-2.0 | 290.7 kB | **73.7 kB** | ✔ 가장 좋음 | 부품 체계 전체를 가져온다 |
| @hello-pangea/dnd 18.0.1 (2025-02-09) | Apache-2.0 | 재지 않음 | — | ✔ | 연 0개 판. redux·react-redux에 의존 |
| swapy 1.0.5 | **GPL-3.0** | — | — | — | 라이선스로 제외 |
| react-grid-layout 2.3.0 / gridstack 14.0.0 | MIT | 재지 않음 | — | — | 크기 조절 엔진이 있는 자유 2D 배치. 순서 목록 + 크기 모델이면 필요 없다 |

참고:
- **Pragmatic은 브라우저 기본 HTML5 끌어 놓기를 쓴다.** 문서는 "Full feature support in Firefox, Safari, and Chrome, iOS and Android"라고 한다. 터치 화면에서 기본 끌기는 길게 누른 뒤 플랫폼의 끌기 미리보기와 함께 시작한다(Assumed). 게임 화면 느낌과 다르다. BCD에는 Firefox 안드로이드의 `drag` 이벤트 좌표가 늘 0이라는 메모도 있다.
- **새 dnd-kit의 v0.3.0 변경 기록**에 "Fixed PointerSensor crash on Android caused by unhandled `pointercancel` events"가 있다. 자체 구현도 다뤄야 할 가장자리 경우를 일깨운다.

### 2.3 자체 Pointer Events 구현에 필요한 것
플랫폼 지원(BCD): `PointerEvent`, `setPointerCapture`, `releasePointerCapture`, `touch-action`은 모두 iOS 13+, Chrome 55+에 있다.

1. **끌기는 편집 상태에서만 된다.**
   - 손잡이를 둔다. `touch-action: none`, 44px 이상. 카드의 나머지는 그대로 화면을 스크롤한다.
   - 손잡이에 `-webkit-user-select: none`(BCD에 따르면 iOS는 접두어가 필요하다)과 `-webkit-touch-callout: none`을 쓴다.
2. **포인터 처리.**
   - `pointerdown`: `setPointerCapture`.
   - `pointermove`: `requestAnimationFrame`으로 묶는다. 목표 순번은 이웃의 가운데점이나, 2D 읽기 순서에서 가장 가까운 카드 중심으로 구한다. 항목은 `transform`으로 옮긴다(FLIP 움직임, `prefers-reduced-motion`을 따른다).
   - `pointerup`: 확정. `pointercancel`: 되돌림.
   - 칸 가장자리 근처에서는 저절로 스크롤한다.
3. **자료가 바뀌어도 끌기를 이어 간다.** 끌기 상태를 React 상태가 아니라 ref에 둔다. 그래야 WebSocket으로 카드 내용이 바뀌어도 끌기가 다시 시작되지 않는다.
4. **늘 보이는 대안**(WCAG 2.5.7): ↑/↓나 "…로 옮기기" 메뉴, 크기 바꾸기, "탭 ↔ 메뉴" 버튼.
5. **키보드:** 버튼으로 충분하다. Space로 잡기 / 화살표 / Esc 방식은 나중에 더해도 된다(선택).
6. **알림:** ko+en 메시지 키를 쓰는 polite 알림 영역(예: "3번째로 옮김 / Moved to position 3 of 7").
7. **시험:** 순번 계산은 Vitest 단위 시험, Chromium 터치 흉내로 Playwright, 아이폰은 손으로 본다.

### 2.4 권고 (끌어 옮기기)
**지연 로딩하는 편집 상태에 자체 Pointer Events 순서 바꾸기를 쓰고, 버튼 대안과 알림 영역을 둔다. 의존성은 더하지 않는다.**
- **이유:**
  - 코드가 적다(약 1–2 kB, 약 200줄).
  - 디자인 토큰 규칙과 WCAG 2.5.7 요구에 맞는다.
  - 목록이 짧다(탭 항목 ≤ 6개, 카드 약 10개).
- 나중에 컨테이너 사이 끌기, 가상 목록, 자유 2D 배치가 필요해지면 **@dnd-kit/react를 1.0 뒤에 다시 본다.** 접근성 있는 선택지 중 할 수 있는 것이 가장 많지만, 36.7 kB이고 아직 1.0 전이다.
- **피한다:**
  - 옛 dnd-kit(멈춤)
  - pragmatic(터치에서 기본 끌기, 접근성 꾸러미가 Atlassian 디자인 시스템을 끌어옴)
  - react-aria-components(73.7 kB)
  - swapy(GPL)

---

## 3. Node 서버의 웹 푸시

### 3.1 선택지

| | web-push 3.6.7 | `node:crypto`로 직접 구현(RFC 8291 + RFC 8292) | 작은 라이브러리 |
|---|---|---|---|
| 날짜 / 관리 | 마지막 npm 판 **2024-01-16**(365일 동안 0개). GitHub `master`는 활발하다: 2026-09-11까지 커밋(의존성 올림, Firefox CI, localhost VAPID subject 경고 문서). master의 package.json은 여전히 3.6.7이고 의존성만 더 새것이다(공개 안 됨). CI는 Node 22와 최신 LTS로 돈다. 이슈 36, PR 12. | 우리 것 | @pushforge/builder 2.0.5(MIT, 의존성 없음, 2026-04. README가 **TTL 최대 24시간**이라고 해서 제외). @block65/webcrypto-web-push 2.0.0(MIT, Node ≥22, 의존성 1개, 2026-09). 둘 다 관리자가 한 명이다. |
| 라이선스 | **MPL-2.0**: 파일 단위 카피레프트. 고치지 않고 쓰면 괜찮다 | 없음 | MIT |
| 실행 의존성(공개된 판 기준) | asn1.js ^5.3.0(5.4.1, 2020 [OLD], bn.js 4를 끌어옴), http_ece **1.2.0 정확히 고정**, https-proxy-agent **^7**(최신은 9.1.0), jws ^4, minimist | 없음(`crypto.diffieHellman`, `hkdfSync`, `aes-128-gcm`, `crypto.sign(..., {dsaEncoding:"ieee-p1363"})`, 전역 `fetch`) | 0–1 |
| Node 24 | 된다(**Verified**). 옛 `url.parse()`(DEP0169)를 쓰는데, Node 24.22.1에서는 `--pending-deprecation`일 때만 경고한다(**Verified**). | ✔ | — |
| VAPID JWT 다시 쓰기 | **요청마다 새 JWT에 서명한다**(**Verified**: 두 번 부르면 `Authorization`이 다르다). VAPID 초안은 다시 쓰기를 권하고, Apple은 "Don't refresh your JWT more frequently than once per hour"라고 한다. Apple이 실제로 이것을 거절하는지는 **Unknown**. | 푸시 서비스 출처(`aud`)마다 캐시, `exp` ≤ 24시간, 갱신은 많아야 1시간에 한 번 | — |
| 기본값 | TTL 2,419,200초(4주), JWT `exp` 12시간, `aes128gcm`, Urgency `normal`. `timeout` 옵션은 소켓 시간 제한이다 | 우리가 고른다 | — |

**Verified 실험**(임시 폴더의 `scripts/webpush-selfimpl.mjs`, 끝의 목록):
- **RFC 예시와 같다.** `node:crypto` 코드 약 45줄로 RFC 8291 예시("When I grow up, I want to be a watermelon")를 암호화하면 예시 본문이 **바이트까지 같게** 나온다: 144바이트. 예시의 `Content-Length: 145` 머리글은 하나 어긋난 것으로 보인다.
- `dsaEncoding: "ieee-p1363"`로 서명한 **VAPID JWT**가 공개 키로 검증된다.
- **web-push와 맞는다.** web-push 3.6.7이 만든 결과를 따로 만든 복호기로 풀 수 있다. 그 머리글은 `TTL`, `Content-Encoding: aes128gcm`, `Content-Type: application/octet-stream`, `Urgency`, `Topic`, `Authorization: vapid t=…, k=…`이다.

### 3.2 프로토콜 사실 (GitHub의 1차 초안과 Apple 문서)
RFC 8030은 2016-12, RFC 8291/8292는 2017-11에 나왔다 [OLD, 지금도 표준].
- **RFC 8030 (webpush-wg `draft-ietf-webpush-protocol.xml`):**
  - 응용 서버는 `TTL` 머리글을 반드시 보낸다(**MUST**). 푸시 서비스는 그 값을 줄일 수 있다(MAY).
  - `Urgency` 값: very-low(전원·와이파이) / low / normal / **high**(배터리 적음, "incoming phone call or time-sensitive alert").
  - `Topic`: "A push message with a topic replaces any outstanding push message with an identical topic". base64url 32자로 제한된다. *아직 전달되지 않은* 메시지만 합친다.
  - 푸시 서비스는 4096바이트 이하 본문에 "MUST NOT return a 413 status code"이고, 만료된 구독에는 404를 준다.
- **RFC 8291:** 기록(record) 하나. 머리 86바이트 + 구분자 1바이트 + 태그 16바이트라서 4096바이트 본문에 **평문은 3993바이트 이하**다.
- **RFC 8292:** `exp` ≤ 24시간. `sub`는 `mailto:`나 `https:` 연락처여야 한다(SHOULD). "Application servers are therefore encouraged to reuse tokens".
- **Apple**, "Sending web push notifications in web apps and browsers"(developer.apple.com, 날짜 없음, 2026-10-29에 읽음):
  - TTL에 따라 푸시를 최대 30일 보관한다.
  - JWT 키는 구독할 때 쓴 `applicationServerKey`와 맞아야 한다.
  - `Topic`은 base64url 32자 이하. `Urgency`는 값 4개를 받는다.
  - HTTP/1.1에서는 응답받지 않은 요청을 100개 넘게 보내지 않는다.
  - `https://*.push.apple.com`으로 나가는 연결을 허용한다.
  - 상태 코드: 201 성공, 400, 403 인증 오류, 404, 410 "device token has expired", 413 너무 큼, 429, 500, 503.
  - "Safari doesn't support invisible push notifications… If you don't [show one], Safari revokes the push notification permission."
  - 권한은 사용자 동작에서 요청해야 한다.
  - web-push README는 `https://localhost` VAPID subject를 Safari가 `BadJwtToken`으로 거절한다고 덧붙인다.
- **Mozilla autopush-rs** (`docs/src/http.md`):
  - 201 성공, 404 잘못됨, 410 "no longer available".
  - Topic은 32바이트 영숫자 문자열이고 `_`와 `-`를 허용한다.
  - **FCM 다리를 거치면 "data may be limited to only 2744 bytes instead of the normal 4096"**. Firefox 안드로이드가 그 다리를 쓴다(Assumed).
  - 옛 Python autopush 문서는 TTL을 0–2,592,000초(약 30일)로 적는다 [지난 내용일 수 있음].
- **FCM**(Chrome, 삼성): 정확한 본문·TTL 상한은 firebase.google.com이 막혀 **Unknown**. 라이브러리 기본값(4주)으로 보아 4주로 본다(Assumed).
- **실제 예산:** JSON 본문은 **약 2 KB 이하**로 둔다.

### 3.3 브라우저 지원 (따로 적지 않으면 BCD 8.1.7)
- **Chrome 안드로이드:** `PushManager` 42. Chrome 51부터 `openWindow`가 설치된 앱 안에서 연다. `pushsubscriptionchange`는 **138**부터. 알림 `actions`/`badge`/`image`/`tag`는 되고 `navigate`는 안 된다.
  - Chrome(2025-10)은 참여가 낮고 알림이 많은 사이트의 알림 권한을 저절로 없앤다. **설치한 웹앱은 빠진다**(Chromium 블로그를 다룬 9to5google·betanews, 2025-10-11, 2차 출처).
- **삼성 인터넷:** 푸시 4.0, actions 6.0, `pushsubscriptionchange` 30.0.
- **Firefox 안드로이드:** 푸시 48. 구독에 사용자 동작이 필요하다(79+). `pushsubscriptionchange`는 일부만 된다(이벤트에 옛 구독·새 구독이 없음). actions 152. `navigate` 158. 다리를 거치면 본문이 약 2.7 KB로 줄 수 있다.
- **웨일:** **Unknown.** Chromium 기반이다. 데스크톱 웨일에는 사이트별 알림 설정이 있다(제3자 블로그). 모바일 웨일 웹 푸시 출처는 찾지 못했다. 기기에서 시험한다. 2026-10-28 조사에 따르면 웨일은 한국 모바일 사용량의 15.3%다.
- **iOS / iPadOS** (iOS 브라우저는 모두 WebKit):
  - 푸시는 **16.4+이고 홈 화면에 추가한 웹앱**이어야 한다(기본값이 아닌 `display`). 그 밖에서는 `Notification`이 없다(undefined).
  - Safari 16.4 노트: "Added support for Web Push in web apps saved to the home screen on iOS", 그리고 Badging API와 "third-party browsers to offer Add to Home Screen" [OLD, 2023-03-27].
  - iOS에 없는 것: `actions`, `tag`("can be set, but has no effect"), `image`, `requireInteraction`, `renotify`, `pushsubscriptionchange`.
  - `setAppBadge`는 16.4부터 된다.
- **앱 안 브라우저**(카카오톡 등): `webview_android`에 `PushManager`가 없다(BCD). 그래서 거기서는 푸시가 없고 처리함만 쓴다.

### 3.4 선언형 웹 푸시(Declarative Web Push, iOS 18.4) — 왜 중요한가
- **어디에 있나:** Safari 18.4 출시 노트: "Added support for Declarative Web Push"(iOS·iPadOS 18.4, 홈 화면 웹앱, 2025-03-31). macOS는 Safari 18.5부터다(WebKit "Meet Declarative Web Push", 검색에 따르면 2025-03-25쯤). BCD: `Window.pushManager`와 `PushEvent.notification`은 **Safari 18.4에만** 있다. Chrome에는 `navigate` 옵션이 없다. Firefox 158은 알림 옵션 `navigate`를 지원한다.
- **형식은 W3C Push API 편집자 초안에 있다**(w3c/push-api gh-pages): `{"web_push": 8030, "notification": {"title": …, "navigate": <URL, required>, "body", "lang", "dir", "tag", "icon", "badge", "data", "actions", …}, "mutable": bool}`. 서비스 워커 없이도 보인다. 명세는 이것을 "a backup in case the service worker was evicted"라고 부른다.
- **누르면 브라우저가 하는 일:** WHATWG Notifications 명세에서 알림에 이동 주소가 있으면 브라우저가 스스로 있는 창을 옮기거나 새 창을 연다. 그리고 **`notificationclick`을 보내지 않는다**.
- ⇒ **첫날부터 선언형 JSON을 우리의 단 하나뿐인 본문 형식으로 쓴다.**
  - iOS ≥18.4는 브라우저가 직접 보인다.
  - iOS 16.4–18.3, Chrome, Firefox, 삼성은 `push` 이벤트를 받고, 우리 워커가 같은 JSON을 `showNotification`으로 보인다. WebKit 설명서(`WebKit/explainers` DeclarativeWebPush)는 이 형식이 뒤로 호환된다고 한다.
  - `mutable`은 false로 둔다.
  - 선언형 `navigate`가 iOS 처음 켜기 깊은 주소 버그를 피하는지는 **Unknown**.
- **그 결과:** 푸시 문구가 본문 안에서 완성돼야 한다. 서버가 계정 언어로 ko/en 문장을 만들어야 한다.
  - 이것은 "서버는 문장 대신 코드를 보낸다" 규칙의 예외라서 ADR에서 정해야 한다.
  - 서버는 `apps/game/messages`를 가져올 수 없으므로 푸시 문구 목록이 따로 필요하다. 예: `packages/shared`나 콘텐츠 팩.

### 3.5 구독의 생애와 만료
- **버튼을 누른 뒤에만 구독한다:** `Notification.requestPermission()` → `registration.pushManager.subscribe({userVisibleOnly: true, applicationServerKey})`.
- **iOS:** 홈 화면 앱 모드에서만 구독한다. 아니면 "홈 화면에 추가" 안내를 보인다(D-6011).
- **앱을 켤 때마다 다시 맞춘다:** `getSubscription()` → tRPC로 서버에 넣거나 바꾼다(upsert). 구독은 실시간이 아닌 계정 기능이라 tRPC가 맞는 통로다.
- **`pushsubscriptionchange`는 믿을 수 없다:** Chrome 138+에만 있고, Firefox는 일부, iOS는 없다. 다시 구독하고 새 구독을 올리는 덤으로만 쓴다.
- **`expirationTime`**은 있지만 대개 `null`이다. 2017년 Chromium 리뷰는 Chrome이 "always returns NULL"이라고 한다 [OLD]. 힌트로만 본다.
- **만료의 기준은 서버다:**
  - 404/410 → 구독을 지운다.
  - 413 → 우리 본문의 버그다.
  - 429/5xx → `Retry-After`를 따르며 간격을 늘려 다시 보낸다.
  - 400/403 → 경보를 남긴다(403은 대개 VAPID 키가 맞지 않거나 JWT가 잘못됐다는 뜻).
  - `last_success_at`을 저장한다.
- **VAPID 키 쌍은 바뀌면 안 된다**(NAS 비밀값, PLAN 9.6). 바꾸면 모든 유저가 다시 구독해야 한다.

### 3.6 서비스 워커에 필요한 것, generateSW와 injectManifest (Verified 시험 빌드, Vite 8.3.5 + vite-plugin-pwa 2.0.0)
- **처리기:**
  - `push`: 선언형 JSON을 읽고 `event.waitUntil(showNotification(title, {body, lang, dir, tag, icon, badge, data:{url, kind, id}}))`를 부른다. 늘 알림을 보인다(Safari, 그리고 Chrome의 `userVisibleOnly`).
  - `notificationclick`: 알림을 닫은 뒤 초점 + 메시지, 또는 창 열기(1.4).
  - `pushsubscriptionchange`.
  - 원하면 `notificationclose`.
- **generateSW + `workbox.importScripts: ["sw-push.js"]`** (Verified 빌드):
  - 만들어진 `sw.js`(1.2 kB, 그리고 `workbox-<hash>.js` 15.1 kB)는 틀의 `SKIP_WAITING` 처리기보다 먼저 `importScripts("sw-push.js")`를 부른다.
  - `public/`의 그 파일도 **판 표시(revision)와 함께 미리 캐시된다**. 그래서 그 파일을 바꾸면 워커가 새 버전이 된다.
  - workbox-build 7.4.1의 이 옵션 문서: "useful when you want to let Workbox create your top-level service worker file, but want to include some additional code, such as a push event listener."
  - 좋은 점: 지금의 새 버전 정책, 제외 목록, `pwa-build.mjs` 검사가 모두 그대로다.
  - 나쁜 점: 이 파일은 Vite가 처리하지 않는 맨 JS다. 작은 자체 플러그인이 TS 원본을 정해진 이름 `sw-push.js`로 컴파일할 수 있다. vite-plugin-pwa는 Vite가 묶음을 쓴 뒤인 `closeBundle`에서 돈다(Assumed).
  - 처리기는 Workbox가 약속(promise)으로 이어 붙인 `define()` 콜백 안에서 돈다. Workbox가 자기 install·fetch 처리기를 등록하는 곳과 같다(Assumed 안전).
- **injectManifest** (Verified: `workbox-precaching`·`-routing`을 쓰는 TS 워커로 빌드):
  - 된다. 결과 `sw.js`는 17.1 kB(gzip 5.8 kB), 클래식 스크립트 하나다.
  - 빌드에 경고가 하나 나왔다: "inlineDynamicImports option is deprecated, please use codeSplitting: false instead".
  - 플러그인의 안쪽 빌드는 아직 `build.rollupOptions`와 `esbuild`를 넘긴다. Vite 8.3.5 타입은 둘을 사용 중단으로 표시한다("Use `rolldownOptions`" / "Use `oxc`"). 앞으로 Vite 메이저 판에서 위험하다.
  - 미리 캐시, `cleanupOutdatedCaches`, `NavigationRoute` + 제외 목록, `SKIP_WAITING` 처리기를 우리가 다시 만들어야 한다.
  - vite-pwa 문서는 `workbox-*`를 개발 의존성으로 설치하라고 한다. 이 저장소에서는 기기로 가는 코드는 `dependencies`에 두고 ADR이 필요하다(MIT 라이선스).

### 3.7 서버 설계 메모 (Assumed 모범 사례, 출처는 적은 대로)
- **SSRF를 막는다**(SSRF: 서버가 남이 정한 주소로 요청을 보내게 만드는 공격). 구독 주소(endpoint)는 기기가 준다. https를 요구하고, 호스트를 알려진 푸시 서비스 목록과 대 보고, 넘겨주기(redirect)를 거절하고(`fetch(..., {redirect:"error"})`), `AbortSignal.timeout`을 쓴다(OWASP SSRF Prevention Cheat Sheet).
  - 알려진 호스트: `fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`(Assumed 목록).
  - 모르는 호스트는 조용히 버리지 말고 기록한다. 웨일의 구독 주소 호스트는 Unknown이다.
- **묶기**(D-6012):
  - 계정·분류마다 사건을 Step 5에서 정할 길이의 간격 안에서 합친다.
  - (계정, 분류)마다 `Topic` 하나, `[A-Za-z0-9_-]` 32자 이하. Apple과 Mozilla 규칙을 둘 다 통과한다. 아직 전달되지 않은 푸시를 바꾼다.
  - 알림 `tag`에 같은 키를 써서 Chrome·삼성·Firefox가 화면에 이미 있는 알림을 바꾸게 한다. Safari는 `tag`를 무시하므로 iOS에서는 서버 쪽 묶기가 중요하다.
- **방해 금지 시간:** 계정의 시간대를 저장한다(기기에서 `Intl…resolvedOptions().timeZone`으로 얻음). 방해 금지가 끝나면 미뤄 둔 것을 모두 보낸다.
- **오프라인 24시간**(D-6013): 마지막 연결 끊김 + 24시간에 예약 사건을 둔다. 계정이 다시 연결되면 취소한다.
- **분류별 TTL:** 위협 → 사건 시각까지(상한 있음). 돈·생존 → 몇 시간. 그 밖 → 약 1–3일. **Urgency:** 위협은 `high`, 돈은 `normal`, 그 밖은 `low`.
- **저장:** 새 `push_subscriptions` 표(Drizzle 마이그레이션), 그리고 VAPID 공개 키·구독·구독 해지·설정용 tRPC 프로시저.

### 3.8 권고 (웹 푸시)
**`apps/server`에 `node:crypto` + `fetch`로 발송 코드를 직접 쓴다: 약 150줄, RFC 8291 예시로 만든 시험과 함께.**
- 원하면 web-push를 시험 전용 개발 의존성으로 넣어 우리 결과와 대 본다. 개발 도구는 ADR 규칙에서 빠진다.
- **이유:**
  - MPL-2.0 의존성이 없고, 오래된 공개 의존성(2020년 asn1.js, https-proxy-agent ^7, `url.parse`)도 없다.
  - RFC가 권하고 Apple이 바라는 대로 JWT를 캐시할 수 있다.
  - SSRF 막기, 시간 제한, 오류 처리를 우리가 쥔다.
  - 암호 핵심이 작고, RFC 예시로 확인했다.
- **감수할 점:** 보안에 민감한 코드를 우리가 가진다. RFC 예시 시험과 왕복 복호 시험으로 위험을 줄인다.
- **ADR이 라이브러리를 고른다면** web-push 3.6.7이 받아들일 만한 두 번째 선택이다. Node 24에서 되고(Verified), 고치지 않고 쓴다.
- **서비스 워커:** **generateSW**를 그대로 쓰고 `workbox.importScripts`로 작은 푸시 처리기를 더한다. 워커에 자체 로직이 더 필요할 때만 injectManifest로 옮긴다.
- **본문:** 선언형 JSON(`web_push: 8030`), 약 2 KB 이하, 서버가 만든 ko/en 문구, 절대 주소 `navigate` 깊은 주소.
- **기기에서 손으로 시험한다:**
  - iOS 16.4–18.3(옛 방식 푸시)과 ≥18.4(선언형) 아이폰
  - 안드로이드 Chrome, 삼성 인터넷, **웨일**, Firefox 안드로이드(다리의 2.7 KB 상한)

### 3.9 아직 Unknown
- iOS에서 `notificationclick`이 오는지(BCD는 아니라고 하고 버그 보고는 온다고 한다), WebKit 버그 263687이 고쳐졌는지.
- FCM의 정확한 본문·TTL 상한.
- 모바일 웨일 푸시.
- 요청마다 다시 서명한 웹 푸시 JWT를 Apple이 정말 제한하는지.
- 선언형 `navigate`가 iOS 처음 켜기 버그를 피하는지.
- EU에 아직 홈 화면 웹앱이 있는지. 다시 확인하지 않았고, 한국과는 관련이 적다.

---

## 출처 (날짜를 따로 적지 않은 것은 2026-10-29에 받음)
**꾸러미 자료**
- npm 레지스트리(`registry.npmjs.org`): @tanstack/react-router, router-core, history, react-store, router-plugin, react-router, wouter, regexparam, @dnd-kit/*, @atlaskit/pragmatic-drag-and-drop*, @formkit/drag-and-drop, sortablejs, @hello-pangea/dnd, react-aria-components, @react-aria/dnd, motion, swapy, react-grid-layout, gridstack, web-push, http_ece, asn1.js, jws, https-proxy-agent, @pushforge/builder, @block65/webcrypto-web-push, vite-plugin-pwa, workbox-*, @mdn/browser-compat-data 8.1.7 (2026-10-22).

**화면 주소**
- TanStack Router 문서, raw.githubusercontent.com/TanStack/router/main/docs/router/: `guide/scroll-restoration.md`, `guide/internationalization-i18n.md`, `guide/url-rewrites.md`, `guide/code-splitting.md`, `guide/navigation-blocking.md`, `guide/type-safety.md`, `quick-start.md`, `config.json`.
- React Router, raw.githubusercontent.com/remix-run/react-router/main/: `docs/start/modes.md`, `docs/explanation/type-safety.md`, `docs/api/components/ScrollRestoration.md`, `CHANGELOG.md`(v8.0.0 날짜 2026-06-17).
- wouter: raw.githubusercontent.com/molefrog/wouter/main/README.md.
- GitHub 저장소 페이지: TanStack/router, molefrog/wouter, clauderic/dnd-kit, atlassian/pragmatic-drag-and-drop, web-push-libs/web-push(그리고 `/commits/master` 페이지). 수는 2026-10-29 기준.
- Paraglide: raw.githubusercontent.com/opral/paraglide-js/main/docs/strategy.md.
- OSI Unlicense 승인, 2020-06-12 [OLD]: https://opensource.org/license/unlicense (검색으로).
- Chromium 기록 조작 개입 [OLD]: https://chromium.googlesource.com/chromium/src/+/127.0.6533.99/docs/history_manipulation_intervention.md (검색으로).
- Chrome 120 닫기 요청, 2023-12 [OLD]: https://developer.chrome.com/blog/new-in-chrome-120 (검색으로).
- Blink 출시 의향: https://groups.google.com/a/chromium.org/g/blink-dev/c/jM5au7yYzHM/m/5SWuXPMdAgAJ (검색으로).
- iOS 밀어서 뒤로 가기 보고: https://lists.w3.org/Archives/Public/public-webapps-github/2025May/0270.html (2025-05), https://meta.discourse.org/t/back-button-in-ios-pwa/93909 (검색으로).

**끌어 옮기기**
- dnd-kit 문서, raw.githubusercontent.com/clauderic/dnd-kit/main/apps/docs/docs/: `changelog.mdx`(v0.5.0 2026년 6월, v0.4.0 2026년 4월), `legacy/introduction/installation.mdx`, `extend/plugins/accessibility.mdx`, `react/guides/sensors.mdx`, `extend/sensors/keyboard-sensor.mdx`. dnd-kit README(master·main 가지)도 읽었다.
- Pragmatic 문서, raw.githubusercontent.com/atlassian/pragmatic-drag-and-drop/main/packages/documentation/constellation/: `index/about.mdx`, `09-accessibility-guidelines/index.mdx`. 꾸러미 CHANGELOG(4.0.0)도 읽었다.
- WCAG 2.2: raw.githubusercontent.com/w3c/wcag/main/guidelines/sc/22/dragging-movements.html, `understanding/22/dragging-movements.html`.
- CSS Grid: raw.githubusercontent.com/w3c/csswg-drafts/main/css-grid-1/Overview.bs.

**웹 푸시**
- Push API 편집자 초안: raw.githubusercontent.com/w3c/push-api/gh-pages/index.html.
- WHATWG Notifications: raw.githubusercontent.com/whatwg/notifications/main/notifications.bs.
- Declarative Web Push 설명서: raw.githubusercontent.com/WebKit/explainers/main/DeclarativeWebPush/README.md.
- Apple: developer.apple.com/tutorials/data/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers.json. Safari 18.4 출시 노트(2025-03-31). Safari 16.4 출시 노트(2023-03-27 [OLD]).
- WebKit "Meet Declarative Web Push"(2025-03-25쯤): https://webkit.org/?p=16535 (검색으로; 호스트 막힘).
- WebKit 버그(검색으로) [OLD]: https://bugs.webkit.org/show_bug.cgi?id=263687 (2023-10-25), https://bugs.webkit.org/show_bug.cgi?id=252544.
- Apple 포럼 보고(검색으로; 봇 검사 뒤): https://developer.apple.com/forums/thread/768448, https://developer.apple.com/forums/thread/728436, https://developer.apple.com/forums/thread/733604.
- GitHub의 RFC 초안 [OLD, 지금도 표준]: raw.githubusercontent.com/webpush-wg/webpush-protocol/master/draft-ietf-webpush-protocol.xml (RFC 8030), raw.githubusercontent.com/webpush-wg/webpush-encryption/master/draft-ietf-webpush-encryption.md (RFC 8291), raw.githubusercontent.com/webpush-wg/webpush-vapid/master/draft-ietf-webpush-vapid.md (RFC 8292).
- Mozilla: raw.githubusercontent.com/mozilla-services/autopush-rs/master/docs/src/http.md, 그리고 raw.githubusercontent.com/mozilla-services/autopush/master/docs/http.rst [더 옛것].
- web-push: raw.githubusercontent.com/web-push-libs/web-push/master/README.md, package.json, `.github/workflows/ci.yml`.
- `expirationTime` 동작 [OLD]: https://codereview.chromium.org/2864603003 (2017, 검색으로).
- Chrome 알림 권한 자동 회수, 2025-10, 2차 출처: https://9to5google.com/?p=691969, https://betanews.com/2025/10/11/google-is-cutting-off-noisy-websites-in-chrome-heres-how-it-works/.
- 홈 화면 저장소 정책 [OLD 2020–22]: https://bugs.webkit.org/show_bug.cgi?id=237350 (검색으로).
- OWASP: raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.md.
- vite-plugin-pwa 문서: raw.githubusercontent.com/vite-pwa/docs/main/guide/inject-manifest.md.

**로컬 꾸러미 코드**
- vite-plugin-pwa 2.0.0 `dist/vite-build-*.js`; Vite 8.3.5 `dist/node/index.d.ts`(사용 중단 표시); workbox-build 7.4.1 `build/types.d.ts`와 `templates/sw-template.js`; web-push 3.6.7 `src/*.js`.

## 임시 파일 (저장소 밖)
모두 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/` 아래에 있다. 세션 임시 폴더라 나중에는 없을 수 있다.
- **묶음 크기 재기:** `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/scripts/measure.mjs`, 진입 파일은 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/scripts/entries/`. 그 안의 자체 라우터·순서 바꾸기 스케치는 크기만 재려는 것이고 실행한 적 없다.
- **웹 푸시 암호 시험:** `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/scripts/webpush-selfimpl.mjs`
- **TS 7 타입 검사:** `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/scripts/typecheck/`
- **워커 시험 빌드:** `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/scripts/sw-trial/injm/`, `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/scripts/sw-trial/gensw/`
- **자료 도우미 스크립트:** `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/scripts/`의 `bcd.mjs`, `npm-meta.mjs`, `npm-cadence.mjs`
- **받은 문서:** `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/fetched/`
- **npm 꾸러미(믿을 수 없는 내려받기):** `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/app-shell/tech-research/deps/`
