# PWA(설치형 웹앱)와 지원 브라우저 하한

- 상태: 확정 (일부 대체됨: `2026-10-28-design-system.md` — manifest 색)
- 날짜: 2026-10-28
- 관련: docs/PLAN.md 1.2·3장·9.8, 조사 `docs/research/2026-10-28-pwa-and-browser-baseline.md`, `2026-10-28-time-and-session-protocol.md`(재접속·버전 거절), 작업 기록 `2026/10/28-1935-proxy-trust-static-404.md`(없는 파일은 404)·`2026/10/28-2040-pwa.md`(구현·확인)·`2026/10/28-2043-favicon.md`(파비콘)

## 배경
- 모바일 웹이 1순위, 데스크톱이 2순위다(PWA). 홈 화면에 설치할 수 있어야 하고, 배포하면 새 버전으로 바뀌어야 한다.
- 서비스 워커(SW)를 넣으면 옛 화면이 캐시에서 계속 뜰 수 있다. 새 버전을 언제 적용할지 정해야 한다.
- 기기 번들은 이미 ES2023 함수(`toSorted`, 공용 시계 코드)를 쓴다. 지원 하한이 없어서 iOS 16 미만에서는 시계 맞춤이 조용히 실패한다(Verified: 조사).
- 사용자 결정(2026-10-28)
  - 지원 하한: "iOS 16.4 이상".
  - 업데이트: "켤 때 자동 + 쓰는 중엔 안내".

## 선택지
SW 만드는 방법:
1. vite-plugin-pwa `generateSW`: Workbox가 SW를 만든다.
2. vite-plugin-pwa `injectManifest`: SW 코드를 직접 쓴다.
3. 플러그인 없이 직접 만든다.

새 버전 적용:
1. `autoUpdate`: 새 SW가 바로 넘겨받고 열린 화면을 모두 새로고침한다.
2. `prompt` + 자체 규칙: 켤 때는 자동, 쓰는 중에는 안내.

지원 하한: iOS 16.4 / iOS 17.

## 결정
- 의존성(모두 MIT, Verified: npm 2026-10-28)
  - `vite-plugin-pwa` 2.0.0(2026-10-03 공개): 게임 앱 `devDependencies`. 빌드 도구다.
  - `workbox-window` 7.4.1(2026-05-04 공개): 게임 앱 `dependencies`. 기기로 가는 코드다(gzip 약 2.3KB). pnpm은 공개 호이스팅이 없어서, 플러그인이 만드는 `import("workbox-window")`가 풀리려면 직접 의존성이어야 한다.
- SW는 `generateSW`로 만든다.
  - 캐시는 앱 껍데기만: 빌드된 JS·CSS·HTML, 아이콘, manifest.
  - `/api`·`/ws`·`/health`는 캐시하지 않는다. 화면 이동 대체(`navigateFallback`)에서도 뺀다. 소셜 로그인 콜백(`/api/auth/callback/*`)이 화면 이동이기 때문이다.
- 새 버전 적용은 `registerType: "prompt"`에 자체 규칙을 붙인다. 등록은 코드에서 직접 한다(`injectRegister: false`).
  - 켤 때(자동): 앱을 새로 열었을 때, 또는 30분 넘게 숨겨졌다가 다시 열었을 때다. 그 뒤 15초 안, 첫 터치·키 입력 전에 새 버전이 준비되면 바로 적용한다.
  - 쓰는 중(안내): 그 밖에는 배너로 알린다(지금 업데이트 / 나중에). "나중에"를 누른 버전은 다시 알리지 않고, 다음에 켤 때 바로 적용한다.
  - 강제: 서버가 버전을 거절하거나(`protocol_unsupported`) 지연 로딩 파일을 못 찾으면(`vite:preloadError`), 새 버전을 찾아 적용한다. 새 버전이 없으면 그냥 새로고침한다. 되돌림 배포로 기기가 서버보다 새 버전일 때도 이 길로 맞춘다.
  - 새 버전 확인: 서버의 `welcome`을 받을 때마다 확인한다. 배포하면 서버가 다시 시작되고 모든 기기가 다시 접속하기 때문이다. 화면이 다시 보일 때도 확인한다(10분에 1번까지).
  - 적용 순서: WebSocket을 정상 종료(1000)한 뒤 새로고침한다. 게임 명령이 생기면 보내기를 멈추고 응답을 잠깐(최대 2초) 기다린다.
  - 구현하며 더한 장치(Verified: 패키지 코드·Playwright)
    - 자동 새로고침은 탭마다 1분에 1번까지다(`sessionStorage`). 막히면 배너나 버튼으로 사람이 한다. 사람이 누른 것은 막지 않는다. 새로고침이 끝없이 반복되는 것을 막는다.
    - SKIP_WAITING은 기다리는 SW에 직접 보낸다. 플러그인의 `updateServiceWorker()`는 자기 등록(페이지 `load` 뒤)이 끝나야 보내서, 그보다 이른 강제 적용에 못 쓴다.
    - 새 버전 설치(`updatefound`)는 등록 객체에서 직접 본다. workbox-window 7.4.1은 밖에서 생긴 첫 새 버전 뒤로는 알려 주지 않아, 한 번 켠 채로 두 번째 배포를 놓친다.
    - 화면을 맡은 SW가 바뀌면(`controllerchange`, 다른 탭에서 적용한 경우 포함) 새로고침한다. 옛 캐시는 새 SW가 지우기 때문이다. 넘겨받지 않으면 5초 뒤 그냥 새로고침한다.
- 지원 하한: iOS 16.4+, Chrome·Edge 111+, 삼성 인터넷 22+, Firefox 115+.
  - 빌드 대상은 Vite 8.3.5의 내장 대상 `baseline-widely-available`이다(chrome111·edge111·firefox114·safari16.4·ios16.4, Verified: Vite 코드).
  - Firefox만 115로 한 칸 높다. 공용 시계 코드(`packages/shared/src/clock.ts`)의 `toSorted`가 115부터 있어서다(Verified: core-js-compat 3.51.0 자료).
  - 게임 앱 `build.target: "baseline-widely-available"`, tsconfig `lib`는 ES2023으로 낮춘다(지금 ES2024).
  - 하한보다 새 기능은 기능 확인 뒤에만 쓴다. 예: `Object.groupBy`, `Promise.withResolvers`, Set 메서드, 반복자 도우미, OffscreenCanvas WebGL2, WebGPU.
- manifest
  - `id`·`start_url`·`scope`는 `/`. `display: standalone`, `orientation: any`, `lang: ko`.
  - 이름은 `apps/game/messages/ko.json`에서 읽는다. 휴대폰 브라우저는 manifest를 언어별로 바꾸지 못한다.
  - 이름·색(`#0b1020`)·아이콘은 임시값이다. 디자인 시스템 ADR 때 바꾼다.
- 아이콘: `apps/game/public/`에 두고 git에 넣는다.
  - 파비콘 `favicon.ico`(16·32·48)·`favicon.svg`: 사용자 요청으로 다른 세션이 그렸다(행성 + 궤도 정거장 고리).
  - 앱 아이콘 PNG 4개(192, 512, maskable 512, apple-touch 180): `favicon.svg`에서 그렸다. 만드는 법은 작업 기록 `28-2040-pwa.md`.
  - PLAN 9.8(이미지 원본은 git에 넣지 않음)의 예외다. 앱 주소에서 바로 내려줘야 하고, 파일이 수 KB라서다.
- 비상 해제: SW를 걷어내야 하면 플러그인 `selfDestroying: true`로 배포한다. 서버가 없는 파일에 404를 주므로 옛 SW도 걷어낼 수 있다.

## 이유
- `generateSW`: SW 코드를 직접 쓸 일이 없다. `injectManifest`는 Vite 8이 사용 중단으로 표시한 옵션으로 SW를 빌드한다(Verified: 조사). 웹 푸시를 넣을 때 다시 본다.
- `autoUpdate`를 고르지 않은 이유: 쓰는 중에도 옛 캐시를 지우고 모든 화면을 새로고침한다. 나중에 바꾸기 어렵다고 플러그인 문서가 경고한다(Verified: 조사).
- `welcome`마다 확인하는 이유: 브라우저는 화면 이동 때나 24시간에 한 번만 새 SW를 찾는다(Verified: SW 명세). 홈 화면 앱은 화면 이동이 드물다(Assumed).
- iOS 16.4: 한국 iOS 사파리 사용의 97.3%다(17 이상이면 95.3%). 웹 푸시와 class static block을 쓸 수 있는 하한이기도 하다(Verified: caniuse-lite 1.0.30001819, 2026-10-22).
- 플러그인의 "Vite 8 지원"은 peer 범위만 넓힌 것이다(Verified: 조사). 우리 빌드와 시험이 실제 확인이다.
- 확인(Verified: 2026-10-28, Chromium 153, 빌드 2개를 실제 서버로 띄워 26개 시험)
  - 설치 조건 오류 0개(CDP `Page.getInstallabilityErrors`).
  - 오프라인에서 껍데기가 뜬다.
  - 켤 때는 자동으로, 쓰는 중에는 배너로, 버전 거절 때는 강제로 적용된다.
  - 30분 복귀 규칙이 맞게 동작한다.

## 결과
- 좋은 점: 홈 화면에 설치된다. 껍데기는 오프라인에서도 뜬다. 배포 뒤 수 초 안에 기기가 새 버전을 찾는다.
- 감수할 점
  - 기기로 가는 코드가 약 5KB 늘어난다(등록 코드 + workbox-window).
  - iOS 사파리는 7일 동안 사이트를 쓰지 않으면 스크립트가 쓴 저장소(SW, 캐시, 언어 선택)를 지운다. 서버가 쓴 쿠키는 남는다(Verified: 조사).
  - 카카오톡 같은 앱 안 브라우저에는 SW가 없다. SW 없이도 앱이 돌아야 한다.
  - iOS 시작 화면(splash)은 기기별 이미지가 필요해 미룬다.
  - SW 자동 시험은 Chromium에서만 된다(Playwright). 아이폰·웨일은 손으로 확인한다.
- 다시 볼 조건: 웹 푸시(SW 코드가 필요해짐), 디자인 시스템 확정(이름·색·아이콘), 오프라인 플레이 요구.
