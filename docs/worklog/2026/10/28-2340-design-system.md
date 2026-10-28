# 디자인 시스템 구현: 후보 A(새싹 장난감), 테마 4개, 글꼴, 설정 화면(기기 + 계정)

- 일시: 2026-10-28 23:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-28-design-system.md`(30, 제안. 끝에 "구현하며 정한 것"을 덧붙임), `2026-10-28-pwa-and-browser-baseline.md`(28), `2026-10-28-i18n.md`, `2026-10-28-auth-and-accounts.md`(29), 작업 기록 `28-2150-auth-ui.md`
- 새 런타임 의존성 2개(게임 앱): `pretendard` 1.3.9, `@fontsource/jua` 5.3.0. 이유·대안·라이선스는 ADR 30.

## 한 일
- 디자인 값(`apps/game/src/styles/tokens.css`)
  - 후보 A 값을 지금 이름 규칙(`--color-*`, `--font-*`, `--space-*`, `--radius-*` 등)으로 옮겼다.
  - 테마 4개: `:root`(기본 = 파스텔), `:root[data-theme="pastel|dark|contrast|station"]`. 설정 화면 미리 보기는 같은 값을 `[data-theme-preview="…"]` 안에서 쓴다.
  - 촘촘 변형 `[data-density="compact"]`(턱 0, 모서리 10px, 조작부 44px)는 관리자 화면에 붙였다.
  - "동작 줄이기"(`prefers-reduced-motion`)면 움직임 시간이 모두 0이다. 글자 크기는 rem이다.
- 화면 다시 그리기: 로그인, 새 아이디 확인, 비밀번호 찾기, 계정 줄, 상태 화면, 관리자, 새 버전 배너, 언어 고르기, 다시 시도 화면.
  - 화면 CSS는 `var(--…)`만 쓴다. 턱 있는 버튼(누르면 턱만큼 들어간다), 흰 조약돌 판, 알약 모양 고르기.
  - 상태 알림에는 글자와 함께 그림 아이콘(`ui/StatusIcon.tsx`, SVG)이 있다. 이름표(`ui/Brand.tsx`)는 앱 아이콘 + 게임 이름이다.
  - 새 버전 배너가 떠 있으면 화면 아래를 비워 맨 아래 칸·버튼이 가려지지 않는다(`<html data-update-banner>`).
- 테마 시작 스크립트(`apps/game/public/theme-init.js`): `<head>`에서 CSS보다 먼저 도는 보통 스크립트(인라인 아님)다. 저장된 설정과 기기 설정을 읽어 `data-theme`과 주소창 색을 정한다. 저장소를 못 쓰면 기본 규칙을 따른다. 앱 껍데기로 미리 캐시한다.
- 실행 중 테마(`src/settings/settings.ts`, 규칙은 순수 함수 `theme.ts`): 기기 설정(다크·고대비)이 바뀌면 바로 다시 고른다. 다른 탭에서 바꾸면 따른다(storage 이벤트).
- 글꼴: Pretendard 400·600(제작자 부분 집합 WOFF2, `src/styles/fonts.css`의 `@font-face`), Jua(Fontsource 조각, WOFF2만). `font-display: swap`. CSS에 넣지 않고 `/assets/`에 해시 이름으로 나간다. 미리 캐시하지 않는다.
- 서버: `/assets/` 아래 파일에만 `Cache-Control: public, max-age=31536000, immutable`. 다른 파일은 그대로(`public, max-age=0`).
- `packages/shared`: `THEMES`, `DEFAULT_THEME`, `LOCALES`, `UserSettings`, `parseUserSettings`(모르는 값은 기본값). `LOCALES`가 Paraglide 언어 목록과 같은지 시험이 확인한다.
- 계정 설정: 표 `user_settings`(마이그레이션 `20261028132852_user_settings`, 추가만), tRPC `settings.get`·`settings.set`(로그인한 본인만, 부분 저장).
- 기기 ↔ 계정 맞추기: 규칙은 순수 함수(`syncRules.ts`), 요청은 로그인한 뒤에만 내려오는 조각(`accountSync.ts`). 규칙은 ADR 30 "구현하며 정한 것".
- 설정 화면(`settings/SettingsPage.tsx`, 지연 로딩): 계정 줄 [설정]으로 연다. 테마 4개(미리 보기, 라디오 단추 묶음), "기기 설정에 맞추기" 스위치, 언어. 테마를 고르면 맞추기가 꺼진다. 문구 16개(ko·en).
- 검사: `pnpm check`에 대비 검사(`check:contrast`)를 넣었다. PWA 빌드 검사에 테마 시작 스크립트·글꼴 규칙을 더했다.
- 스킬: frontend-design → ui-ux-pro-max → animate → react-best-practices → web-design-guidelines → impeccable(audit·polish) → break-ui, 문구는 korean-writing.

## 확인 (Verified: 이 컨테이너, Node 24.22.1, pnpm 11.28.9, Chromium(Playwright 1.63.0), PostgreSQL 16)
| 항목 | 결과 |
|---|---|
| `pnpm install --frozen-lockfile` | 통과(바뀐 것 없음) |
| `pnpm --filter @terra/game typecheck` | 통과 |
| `TEST_DATABASE_URL=… pnpm check` | 통과. 시험 파일 41개, 시험 345개(전 283개, 이번에 62개). 대비 136쌍(최저: 글자 5.29, 선명 본문 16.41, 초점·테두리 3.02). 다국어 키 127개 |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과. 글꼴 WOFF2 89개, 미리 캐시 안 함 |
| `pnpm check:content` | 통과 |
| 빌드 서버 + 새 DB(가짜 계정만) | `NODE_ENV` 비움, `BETTER_AUTH_URL=http://127.0.0.1:<포트>`, 무작위 64자 비밀값(저장소 밖), 마이그레이션 적용, `cli.js create-user`로 `fake_admin`·`fake_user01~22`·`fake_sync1~3`·20자 아이디 |
| Playwright 앞 작업 묶음 | 63개 모두 통과(로그인 21, 비밀번호 찾기 10, 관리자 15, 영어 9, PWA 5, 가장자리 3). 고른 요소는 그대로 |
| Playwright 새 묶음 | 화면 사진 65, 테마 16, 글꼴 6, 설정 맞추기 18, 긴 글·좁은 화면 72. 모두 통과 |

- 화면 사진: 화면 11개 × 테마 4개(한국어) + 영어 파스텔. 디자인 시안과 비교해 버튼 너비·배너 가림을 고쳤다.
- 테마: 첫 칠하기 전에 `data-theme`이 정해진다(정한 때 약 26~39ms, 첫 칠하기 약 36~100ms, 첫 화면부터 그 테마 색). 주소창 색 4개. 기기 고대비 → 선명. 맞추기 켬 + 기기 다크 → 다크. 새로고침 없이 기기 설정 변화를 따른다. 정거장은 자동으로 고르지 않는다. 동작 줄이기면 움직임 0.
- 글꼴: 로그인 화면은 6개를 받는다(Pretendard 535.8KB + Jua 4조각 91.5KB). 서비스 워커 캐시에 글꼴이 없다. 다시 열 때 글꼴 요청이 서버에 가지 않는다. `/assets/*`(JS·CSS·글꼴)만 immutable이고 `/`, `index.html`, `sw.js`, `theme-init.js`, 아이콘, manifest는 `max-age=0`이다.
- 설정 맞추기: 키보드로 라디오 고르기, 바로 바뀜, 맞추기 켜고 끄기, 기기 A에서 바꾼 값이 기기 B에 로그인하면 보임, 옛 기기 값은 계정 값에 덮임, 로그인 화면에서 바꾼 언어가 로그인 뒤 계정에 올라감, 계정 언어로 새로고침 1번, 올리기 실패 → 표시가 남고 다음에 올림, 다른 계정이 남긴 표시는 올리지 않음.
- 긴 글·좁은 화면: 390px·320px, 한국어·영어, 선명 테마, 200% 확대, 기본 글자 크기 150%·200%, 20자 아이디, 40자 검색어, 정지된 계정, 기기 시계 하루 늦음. 가로 넘침 없음, 누름 영역 44px.
- 묶음 크기(빌드 결과, gzip은 9단계로 잼)
  - 첫 화면 JS: 355.90kB → 363.32kB(gzip 107.92 → 111.82kB). rolldown이 공용 모듈을 조각 2개로 나눠 미리 불러온다(`useMountFocus-*.js`, `json-*.js`).
  - 첫 화면 CSS: 6.42kB → 58.15kB(gzip 1.65 → 17.43kB). 그중 Jua `@font-face` 87개가 41.7kB(gzip 12.9kB)다.
  - 로그인한 뒤 내려오는 조각: 계정 맞추기 0.90kB + tRPC 클라이언트 16.47kB(gzip 5.88kB, 관리자 화면과 같이 씀). 설정 화면 JS 3.61kB + CSS 4.89kB. 관리자 JS 22.94kB → 6.64kB(tRPC 클라이언트가 공용 조각으로 빠짐).
  - 미리 캐시: 13개 471.21kB → 21개(서로 다른 주소 20개) 543.13kB. 글꼴 없음.
- 시험 스크립트와 화면 사진은 저장소 밖(세션 임시 폴더)에 두었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/styles/tokens.css`, `src/styles/fonts.css`(새) | 테마 4개·촘촘 변형·움직임 줄이기 값, 본문 글꼴 `@font-face` |
| `apps/game/src/styles.css`, `src/admin/admin.css`, `src/settings/settings.css`(새) | 후보 A 모양(토큰만 사용) |
| `apps/game/src/ui/{StatusIcon,Brand}.tsx`(새), `ui/{LiveMessage,Field,LanguageSelect}.tsx` | 상태 아이콘, 이름표, 언어 고르기(설정 화면용 모양, 계정에 올리기) |
| `apps/game/src/auth/{LoginScreen,NewIdScreen,ResetScreen,AccountBar}.tsx`, `StatusPanel.tsx`, `admin/{AdminPage,UserCard}.tsx`, `pwa/UpdateBanner.tsx` | 새 모양, [설정] 버튼, 촘촘 변형, 배너 자리 비우기, 번역하지 않을 글(`translate="no"`) |
| `apps/game/src/App.tsx`, `main.tsx` | 설정 화면(지연 로딩), 다시 시도 화면, 언어 고르기 위치, 시작 때 화면 설정·Jua CSS |
| `apps/game/src/settings/{theme,storage,syncRules}.ts`(+시험), `settings.ts`, `accountSync.ts`, `SettingsPage.tsx`, `themeSources.test.ts` | 테마 규칙, 기기 저장 모양, 맞추기 규칙, 화면 설정 상태, 계정 요청, 설정 화면, 시작 스크립트와 같은지 시험 |
| `apps/game/public/theme-init.js`(새), `index.html`, `vite.config.ts` | 첫 화면 테마, 주소창 색 `#dff2fb`, WOFF2만 내보내기·글꼴 인라인 금지, 미리 캐시 목록 |
| `apps/game/messages/{ko,en}.json` | 새 문구 16개 |
| `apps/game/package.json`, `pnpm-lock.yaml` | 글꼴 의존성 2개(정확한 판) |
| `vitest.config.ts` | 시험에서 `tokens.css?raw`를 읽게(CSS 포함 설정) |
| `packages/shared/src/settings.ts`(+시험), `index.ts` | 테마·언어 목록과 설정 읽기(서버·기기 같이 씀) |
| `apps/server/src/db/schema.ts`, `drizzle/20261028132852_user_settings/` | 표 `user_settings` |
| `apps/server/src/settings/store.ts`, `trpc/{settings,router,context,createContext}.ts`, `settings/settings.db.test.ts` | 설정 읽기·쓰기, tRPC 경로, DB 시험 9개 |
| `apps/server/src/app.ts`, `app.test.ts` | `/assets/` immutable |
| `scripts/design-tokens.mjs`, `check-contrast.mjs`, `design-tokens.test.mjs`(새), `package.json` | 대비 검사와 직접 쓴 값 검사, `pnpm check`에 넣음 |
| `scripts/pwa-build.mjs`, `check-pwa.mjs`, `pwa-build.test.mjs` | 테마 시작 스크립트·글꼴 규칙 검사 |
| `docs/adr/2026-10-28-design-system.md` | "구현하며 정한 것" 덧붙임(상태는 제안 그대로) |

## 함께 바꿔야 하는 파일
- 바탕색(`--color-bg`)을 바꾸면: 주소창 색 표 `src/settings/theme.ts`(`THEME_COLORS`), `public/theme-init.js`, 파스텔이면 `index.html` theme-color와 `vite.config.ts` `THEME_COLOR`. `themeSources.test.ts`가 다르면 실패한다.
- 테마를 더하면: `@terra/shared` `THEMES`, `tokens.css` 블록(`[data-theme-preview]` 포함), `theme.ts`·`theme-init.js` 색 표, `scripts/design-tokens.mjs` `THEMES`, `SettingsPage.tsx` `THEME_TEXT`(타입 오류로 알려 준다), 문구 `theme_*`(ko·en).
- 언어를 더하면: `project.inlang/settings.json`, `@terra/shared` `LOCALES`(시험이 확인), `LanguageSelect.tsx` `LOCALE_NAMES`(타입 오류).
- 기기 저장 모양을 바꾸면: `storage.ts`의 `SETTINGS_FORMAT_VERSION`과 `theme-init.js`(판 확인).
- 본문 굵기를 늘리면: `styles/fonts.css`의 `@font-face`, `tokens.css`의 `--font-weight-*`.
- 새 화면 CSS: 색·px 값은 `tokens.css`에 두고 `var(--…)`로 쓴다(`pnpm check`가 막는다).

## 건드리지 말 것
- `theme-init.js`를 모듈·`async`·`defer`로 바꾸거나 인라인으로 옮기지 않는다. 첫 화면이 번쩍이거나 나중 CSP에 걸린다.
- 글꼴을 미리 캐시하지 않는다(`workbox.globPatterns`에 woff2를 넣지 않는다). 글꼴 파일을 고치거나 줄이지 않는다(OFL 예약 이름).
- `accountSync.ts`·`net/api.ts`를 첫 화면 코드에서 정적으로 import하지 않는다(tRPC 클라이언트가 첫 화면 묶음에 들어온다).
- 토큰을 다른 토큰의 `var()`로 묶지 않는다(테마·촘촘 변형 값을 따르지 않는다).
- Jua CSS를 `styles.css`의 `@import`로 옮기지 않는다(WOFF 줄을 지우는 빌드 변환이 돌지 않는다).
- 올라간 마이그레이션(`20261028132852_user_settings`)은 고치지 않는다.

## 미검증·TODO·알려진 문제
- 실제 휴대폰(아이폰 사파리, 삼성 인터넷), Firefox·Safari 엔진, 읽기 프로그램(VoiceOver·TalkBack)으로는 확인하지 않았다(Unknown).
- 윈도 고대비(`forced-colors`) 규칙은 넣었지만 화면으로 확인하지 않았다(미실행).
- iOS 홈 화면 앱의 상태 표시줄 색, Android 설치 앱의 주소창 색 바꾸기는 추정이다(ADR 30, Assumed).
- 글꼴 라이선스(OFL) 문구를 앱이 함께 내보내지 않는다. 고지 방식(`THIRD_PARTY_NOTICES.md`, 앱 안 안내 등)을 정해야 한다.
- 첫 화면 CSS가 Jua 규칙 때문에 gzip 약 15.8kB 늘었다. 줄이려면 쓰는 글자만 든 조각 목록을 빌드 때 고르는 방법이 있다(조사 필요).
- 처음 연 기기(서비스 워커 설치 전)는 설정 화면 조각을 네트워크에서 받아 "불러오는 중…"이 잠깐 보일 수 있다.
- 상태 화면의 시계 차이·성능 숫자는 `Intl`로 형식화하지 않는다(전부터).
- `theme-init.js`가 미리 캐시 목록에 두 번 들어간다(`includeAssets` + 빌드 파일). Workbox는 같은 주소·판을 하나로 친다(Verified: workbox-precaching 7.4.1 `PrecacheController.js` 104~106줄).
- `review-animations` 스킬은 사용자만 부를 수 있어 돌리지 못했다(`/review-animations`). `impeccable` 검출 도구는 실행 파일을 내려받아야 해서 건너뛰고 문서 규칙으로 검토했다.
- `pnpm dev:game`(Vite 개발 서버)으로는 확인하지 않았다. 빌드 결과만 확인했다.
- 테마 이름 표(`THEME_TEXT`)는 `ui/messageTable.ts`가 아니라 설정 화면 조각 안에 뒀다. 첫 화면 묶음에 들어가지 않게 하려고다. 계산한 키(`m[key]`)는 쓰지 않는다.

## 사용자 결정 대기
- ADR 30 확정 여부(확정하면 PWA ADR 상태 줄에 "일부 대체됨(manifest 색)").
- 글꼴 라이선스 고지 방식.
