# 앱 뼈대 W1 검토 고침: 겹침·다시 고름을 화면 이동과 나눔, 처음 켤 때 초점, C 지도 버튼 여백, 화면 시험 e2e/shell.spec.ts

- 일시: 2026-10-30 01:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 1·2·3·10·13절, 작업 기록 `29-2310-app-shell-w1.md`(검토한 W1), W2 `29-2220-app-shell-w2.md`·`30-0020-app-shell-w2-review.md`(꽂는 줄), W5 `29-2300-app-shell-w5.md`(시험 틀), 기획 `docs/design/60_UX_FTUE.md`·D-6001~D-6049·D-265·D-266
- 작업 자리: W1과 같은 작업 트리·가지(`.claude/worktrees/app-shell-w1`, `work/app-shell-w1`). W1 끝 커밋 `571d8a9` 위에서 고쳤다. 가지의 바탕은 그대로 main `507e645`다(main 위로 옮기지 않았다). 푸시·합치기는 하지 않았다.

## 한 일
- W1 검토 지적 12개를 다시 확인했다. 고치기 전 빌드(`571d8a9`)를 빌드한 서버(포트 4481, 시험 DB `terra_w1_fix`, 가짜 계정 `fixplayer`·`fixdev`·`fixadmin`)에 올리고, 검토 스크립트(rv4·rv5·rv6)를 이 서버에 맞춰 돌리고, 나머지 지적을 재는 탐침(`fx-extra.cjs`)을 새로 썼다(모두 저장소 밖). 지적 12개 모두 그대로 재현했다(Verified). 모두 고쳤다.
- 검토 밖에서 하나를 더 찾아 고쳤다: 문서 뿌리의 `scroll-padding-top` 때문에 sticky인 위 띠 단추에 초점이 가면 문서가 튀었다(아래 "검토 밖에서 찾은 것"). 지적 1의 화면 확인(키보드로 ☰를 눌러 서랍 열기)이 이것 때문에 400 → 22로 실패해서 찾았다.
- 화면 시험 `e2e/shell.spec.ts`(15개)를 더했다(계획 W1 기준 10). W5 시험 틀을 쓰므로 W2·W5·W1을 합친 저장소 밖 나무에서 돌렸다.
- W1을 main 위로 옮길 때 할 `shell/shellPrefs.ts`의 W2 전환을 그 나무에서 만들어 돌려 봤다(아래 "W1을 main 위로 옮길 때"). 패치는 저장소 밖에 두었다.

## 지적별 처리
| # | 지적(무게) | 다시 확인(고치기 전) | 처리 | 고친 뒤(Verified) | 커밋 |
|---|---|---|---|---|---|
| 1 | 겹침 열고 닫기를 화면 이동으로 처리(major) | rv5 4/12: 네 가지 닫기 모두 연 동안 400 → 0, 닫은 뒤 초점 h1. rv6 551 → 0. rv4 Esc 뒤 초점 h1 | 라우터가 겹침만 바뀐 상태를 따로 낸다: version·via 그대로, overlay만. 겹침 칸에 아래 칸 열쇠 `base`. 틀은 겹침이 열린 동안·새 화면이 그려지기 전 스크롤을 기억하지 않는다 | rv5 12/12(연 동안·닫은 뒤 400, 초점 ☰), rv6 623 → 623, rv4 8/8. 라우터 시험 새 3개·고친 3개(새로고침·앞으로 가기·뒤로), 화면 시험 3개 | `40869f3` |
| 2 | 탭으로 홈에 가면 늘 맨 위로(minor) | 390×300 홈 60 → [유닛] → [홈] = 0 | 홈 갈래의 돌아간 뒤 할 일이 주소가 같으면 null(그대로 도착). 다시 고름은 겹침 갈래에서 지금 화면을 고를 때만 | 60 → 60, 기록 순번 0. 라우터 시험 +1, 화면 시험 1개 | `40869f3` |
| 3 | /settings에서 넓은 폭 [메뉴 편집]이 맨 위로만(minor) | 1440×560: 초점 `a.side-edit` 그대로, 메뉴 칸 top 676 | 지금 화면 다시 고름(`scrollTopRequests` → `reselects`)에 `focusId`를 싣는다. 틀은 그 칸에 초점을 두고 보이게 스크롤한다 | 초점 `section#nav-settings`, top 68. 좁은 폭 서랍에서도 같다. 라우터 시험 +1(서랍 갈래는 1의 새 시험에), 화면 시험 1개 | `40869f3` |
| 4 | 새 버전 배너가 C 지도 버튼을 약 7px 덮음(minor) | 배너 아래 끝 768 > 버튼 위 끝 760.8, 본문 아래 여백 76 < 버튼 높이 83.2 | `<html data-tabbar="c\|a">`. C는 배너 bottom과 본문 아래 여백에 `--space-6`(버튼의 음수 위 여백)을 더한다. 배너를 탭 위로 올리는 규칙은 `shell.css`로 옮겼다 | 배너 아래 끝 744 ≤ 760.8, 본문 요소 아래 여백 100 ≥ 83.2. A는 768 ≤ 778(띠 위), 76px. `layout.test.ts` +1, 화면 시험 1개 | `ec60cdb` |
| 5 | 주소로 바로 열면 /settings·/admin·/map·/map/planet이 제목에 초점(minor) | rv4: 넷 모두 h1 | `ui/useMountFocus.ts`가 `MountFocusContext`(기본 true)를 본다. 틀의 `RouteView`가 "앱 안에서 옮겨 연 화면"(via ≠ initial)을 준다. admin/*·map/*·settings 파일은 고치지 않았다 | 여섯 주소 모두 body(새로고침도). 앱 안 이동은 전처럼 h1. 로그인 화면들은 틀 밖이라 그대로 | `3bbcd76` |
| 6a | 기준 7 "충족"이 배너를 탭 띠와만 비교 | 위 4와 같음 | 4를 고치고 `.tab-map-button`과 다시 쟀다. W1 작업 기록 표를 고쳤다 | 위 4 | `ec60cdb`, 이 기록 |
| 6b | "지금 화면을 다시 고름 → 맨 위로" 확인이 늘 통과 | 1 때문에 서랍을 여는 순간 0 | 1을 고친 뒤 연 동안 400 그대로인 것까지 본다 | `fx-more.cjs` 1번, 화면 시험 "다시 고르면 맨 위로" | 이 기록 |
| 6c | 기준 8 "W5 검사는 못 돌림" | W5 `scripts/check-bundle.mjs`로 잴 수 있다 | 쟀다(아래 "잰 값") | W1만 122,859 B, 합친 나무 123,416 B | 이 기록 |
| 6d | W2 전환을 "다른 줄기의 꽂는 줄"로 적음 | 합치는 순서상 W1이 할 일(W2 기록 103~105줄도 같다) | W1 작업 기록을 고치고 옮기는 절차를 이 기록에 적었다. 미리 할 수 있는 것은 이 가지에서 했다: `changeNavigation`이 저장했는지를 돌려주고, 설정 "메뉴" 칸은 false면 아무것도 바꾸지 않고 오류를 알린다(`settings_menu_save_failed`). 화면 시험 2개가 전환을 빠뜨리면 실패한다 | 합친 나무에서 전환 후 두 시험 통과, 전환을 되돌리면 "배치 A가 새로고침에 남는다"가 실패(받은 값 `c`) | `551de49`, `6f4dde0`, 이 기록 |
| 6e | ADR 3절 "가장 좁은 칸이 4.5em 이상" | 시작 폭의 칸은 약 70.7px(띠 안쪽 여백 0.5em 뺌) | ADR 문장과 `layout.ts` 주석을 실제 셈으로 고쳤다 | — | `cf1b7b9`, `316a98a` |
| 7 | C 5칸에서 "경제"가 지도 왼쪽으로(nit) | 508px: [홈, 유닛, 경제] \| [세력, 사이보그] | 홀수면 남는 칸을 오른쪽에(`layout.ts` `splitCenterTabs`, 하단 탭·설정 미리 보기가 같이 씀). 계단 셈은 그대로 | [홈, 유닛] \| [경제, 세력, 사이보그]. `layout.test.ts` +1, 화면 시험 1개 | `316a98a` |
| 8 | 중간 폭 ☰가 이름과 aria-expanded를 함께 바꿈(nit) | 820px: "메뉴 펼치기"/"메뉴 접기", aria-controls 없음 | 중간 폭은 이름 "메뉴" + aria-expanded + aria-controls(레일 `nav#side-nav`). `shell_rail_expand`·`shell_rail_collapse` 키를 지웠다 | 이름 그대로 "메뉴", false ↔ true, 가리키는 것 NAV. 화면 시험 1개 | `681c245` |
| 9 | resetToHome이 홈을 두 칸 남김(nit) | 홈 → 유닛 → 관리자 → 로그아웃 → 다른 계정: 기록 순번 1(홈 두 칸) | 사슬 안 앱 홈 칸(없으면 첫 칸)까지 돌아가 새 열쇠의 홈으로 바꾼다. 겹침 칸도 함께 빠진다 | 순번 0. 라우터 시험 고침(앱 홈 칸·겹침 칸·바로 연 주소 + 이미 홈·?template=), 화면 시험 1개 | `40869f3` |
| 10 | 사이드 메뉴가 역할 목록을 직접 봄(nit) | 코드 확인 | `canOpenRoute("dev"·"admin", roles)` | 보이는 항목은 그대로(flows 역할별 6개 통과) | `1ce5010` |
| 11 | 방향 안내가 알림 영역을 글과 함께 새로 그림(nit) | 코드 확인 | 고침 안 1: 영역은 지도 화면 동안 늘 두고 안내는 다음 프레임에(ui/LiveMessage.tsx와 같은 규칙) | MutationObserver: 빈 영역이 먼저 생기고 안내가 그 안에 나중에 들어감, 4초 뒤 사라짐. 읽기 프로그램으로는 듣지 않았다(Unknown) | `a0a1475` |
| 12 | 쓰지 않는 아이콘 collapse·expand(nit) | grep: 쓰는 곳 없음 | 지움. 처리할 일 분류 아이콘 5개는 W3 몫이라 둔다 | — | `af8d210` |

## 검토 밖에서 찾은 것
- 문서 뿌리의 `scroll-padding-top`(위 띠 높이 + 12px)이 sticky인 위 띠 단추(☰·얼굴·종·우편)에 초점이 가면 문서를 튀게 했다. /settings 400에서 JS `focus()`·Playwright `focus()`·`hover()`·Shift+Tab 모두 → 22(Verified). `scroll-padding`을 0으로 두면 400 그대로(Verified). Chrome이 띠 밑 여백 안의 요소로 보고 스크롤한 것으로 보인다(Assumed). 중간·넓음 폭의 sticky 레일도 같은 종류다.
- 고침(`ec60cdb`): 여백을 본문 요소의 `scroll-margin`으로 옮겼다(`:where(:root[data-topbar] .frame-main *)`, 아래는 `[data-tabbar]`·`[data-tabbar="c"]`). 본문 요소에 초점을 둘 때 놓이는 자리는 같다(위 띠 밑에 반쯤 가린 단추 → 168px, 두 방식 같음, Verified). 설정 메뉴 칸의 따로 둔 `scroll-margin-top`(뿌리 여백과 더해져 140px에 놓였다)은 지웠다. 이제 [메뉴 편집]은 68px에 놓는다.
- 남긴 것: `styles.css`의 `:root[data-update-banner] { scroll-padding-bottom }`(PWA 규칙)은 그대로다. 새 버전 배너가 뜬 동안 중간·넓음 폭 레일 아래쪽 항목에 초점이 가면 같은 일이 생길 수 있다(Assumed, 재지 않음).

## 고침 안과 다르게 한 것
- 지적 1: `via "overlay"` 대신 version을 "화면 version"으로 두고(겹침만 바뀌면 그대로), 겹침 칸에 아래 칸 열쇠 `base`를 실었다. 새로고침·앞으로 가기로 겹침 칸을 뺄 때도 같은 화면으로 본다(새로고침 뒤 via는 initial 그대로라 초점을 옮기지 않는다). 스크롤 기억은 겹침 동안만이 아니라 화면이 바뀌어 새로 그려지기 전에도 멈춘다(짧은 새 화면이 줄인 스크롤이 그 화면 몫으로 적히지 않게).
- 지적 5: `SettingsPage`만 `useMountFocus(getRoute().via !== "initial")`로 바꾸는 대신, 틀이 모든 화면에 문맥으로 준다(admin/*·map/*를 고치지 않고 함께 고침, W3·W4 화면도 저절로 따른다).
- 지적 4: 새 디자인 값 없이 지도 버튼의 음수 위 여백과 같은 `--space-6`을 쓴다. 실제로 솟는 높이(약 17~19px)보다 조금 커서 배너와 버튼 사이가 약 17px다(A는 탭 띠와 약 10px).
- 지적 6d: 적는 것에 더해, 옮길 때 `shellPrefs.ts` 안만 바꾸면 되게 저장 실패 처리를 미리 넣고 화면 시험으로 지켰다.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, 헤드리스 Chromium 1243(Playwright 1.63), PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`, 가짜 계정만)
| 명령 | 결과 |
|---|---|
| 고치기 전 빌드(`571d8a9`)에서 rv5·rv6·rv4·`fx-extra.cjs` | 4/12, 0/1, 3/8, 0/7 — 지적 1~5·7~9 재현 |
| 고친 빌드에서 같은 스크립트 | 12/12, 1/1, 8/8, 7/7 |
| `fx-more.cjs`(서랍에서 다시 고름·좁은 폭 [메뉴 편집]·서랍 연 채 새로고침·앞으로 가기·Shift+Tab·방향 안내 영역·로그인 직후 초점·배치 A 배너) | 8/8 |
| W1 작업 기록의 `flows.cjs` 72개(이 서버·계정에 맞춤) | 72/72(1분 12초) |
| `pnpm exec vitest run apps/game/src/shell apps/game/src/net` | 6파일 65개 통과(라우터 34, 폭·칸 9) |
| `pnpm check`(코드 커밋 전 트리, 부하 평균 약 4~6.5) | 통과: 다국어 376개 키(−2 +1), 대비 136쌍(화면 CSS 13개), 콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 135개 통과·6개 건너뜀(DB), 시험 1,288개 통과·40개 건너뜀(W1 기록의 1,281 + 7) |
| `TEST_DATABASE_URL=… pnpm check`(마지막 트리 = 이 기록·목차까지, 01:24 KST 시작, 부하 평균 2.6→5.2, 1분 11초) | 통과: 포맷·린트·타입·경계·크기·다국어 376개 키·대비 136쌍·콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 141개·시험 1,328개 모두 통과(DB 포함, 건너뜀 없음) |
| 합친 나무: main `dbe87c2` + W2 `4936097` + W5 `d791857` + 이 가지 `cf1b7b9` + `shellPrefs.ts` 전환 + `e2e/shell.spec.ts`(저장소 밖 `git clone --shared`) | 겹친 파일은 `docs/WORKLOG.md` 하나(목차를 다시 만들어 풂). `packages/shared/src/index.ts`는 저절로 합쳐짐. `pnpm install --frozen-lockfile` 5초 |
| 합친 나무 `pnpm check` | 통과: 다국어 377개 키, 콘텐츠 `core@3 (ca75451a06b5)`, 시험 파일 149개 통과·9개 건너뜀, 시험 1,522개 통과·74개 건너뜀(`TEST_DATABASE_URL` 없이) |
| 합친 나무 `TEST_DATABASE_URL=… pnpm e2e` | 17개 통과(shell 15 + smoke 2), 31~33초, 두 번 연달아. 처음에는 두 시험이 시험 쪽 문제로 실패해 고쳤다: 홈 화면이 짧아 60까지 못 내림(내릴 수 있는 만큼으로), [메뉴 편집] 뒤 부드러운 스크롤을 기다리지 않음(멈출 때까지 기다림) |
| 합친 나무에서 `shellPrefs.ts` 전환만 되돌려 "배치를 A로 바꾸면 … 남는다" | 실패(새로고침 뒤 `data-layout` = `c`) → 전환을 빠뜨리면 시험이 잡는다. 전환을 되살려 다시 빌드했다 |

## 잰 값 (첫 화면 JS — W5 `scripts/check-bundle.mjs`: 빌드한 `index.html`의 모듈 + modulepreload, 파일마다 Node zlib 9단계)
- 이 가지(고친 뒤): 122,859 B(파일 2개: `index` 306,252 → 95,291 B, `device` 95,682 → 27,568 B, 원본 401,934 B). 고치기 전 W1 기록 122,576 B보다 +283 B.
- 합친 나무(main `dbe87c2` + W2 + W5 + W1 + 전환): 123,416 B(원본 403,545 B), 상한 136,000 B.
- 그래서 통합 세션이 정할 상한(ADR 37 11절 "W1을 합친 뒤 잰 값 + 8,000"): 합친 뒤 `pnpm check:bundle` 값 + 8,000. 이 나무 기준 131,416 B.

## 사진 (저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/shell-w1/fix/shots/`, 파스텔·다크 × ko·en, 20가지 30장)
- `fx-390-{테마}-{언어}-banner-c`·`-banner-c-crop`: C 배너가 지도 버튼 위로 뜬다.
- `fx-390-{테마}-{언어}-settings-scrolled`·`-settings-drawer-open`: 설정을 메뉴 칸까지 내린 뒤 서랍을 열어도 뒤 화면이 그대로다.
- `fx-508-{테마}-{언어}-settings-preview-c5`: 508px C 5칸(홈·유닛 | 지도 | 경제·세력·사이보그)과 설정 미리 보기.
- `fx-1440-{테마}-{언어}-menu-edit-focus`: 설정에서 [메뉴 편집]을 누른 뒤 메뉴 칸이 위 띠 밑에 온다.
- `fx-390-{테마}-{언어}-menu-save-failed`: 메뉴 값이 4KB를 넘는 기기에서 ↓를 누른 뒤의 오류 알림(합친 나무, 임시 시험 파일로 찍고 지움). 순서는 그대로, 가로 넘침 없음(W5 `horizontalOverflow`).
- 고치기 전 검토 사진은 `…/scratchpad/shell-w1-review/shots/`에 있다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/shell/router.ts`·`router.test.ts` | 지적 1·2·3·9: 화면 version과 겹침, `base`, `reselects`·`focusId`, 홈 갈래 null, resetToHome |
| `apps/game/src/shell/Shell.tsx` | 지적 1·3(다시 고름 효과, 스크롤 기억 멈춤), 4(`data-tabbar` 값), 5(`openedInApp`), 8(`nav#side-nav`) |
| `apps/game/src/shell/routeViews.tsx`, `apps/game/src/ui/useMountFocus.ts` | 지적 5: `MountFocusContext` |
| `apps/game/src/shell/shell.css`·`navigationSettings.css`, `apps/game/src/styles.css` | 지적 4와 검토 밖 하나: 본문 `scroll-margin`, C 여유, 배너 규칙 옮김 |
| `apps/game/src/shell/layout.ts`·`layout.test.ts`·`TabBar.tsx`·`tabbar.css` | 지적 7(`splitCenterTabs`), 6e(계단 셈 주석), 4(CSS 대조 시험) |
| `apps/game/src/shell/TopBar.tsx`·`SideMenu.tsx` | 지적 8(☰ 이름·aria-controls), 10(canOpenRoute) |
| `apps/game/src/shell/OrientationHint.tsx` | 지적 11 |
| `apps/game/src/ui/icons.tsx` | 지적 12 |
| `apps/game/src/shell/shellPrefs.ts`·`NavigationSettings.tsx` | 지적 6d: 저장했는지 돌려주기, 실패 알림, C 미리 보기 나누기(7) |
| `apps/game/messages/ko.json`·`en.json` | `shell_rail_expand`·`shell_rail_collapse` 지움, `settings_menu_save_failed` 더함(W1 자리) |
| 새 `e2e/shell.spec.ts` | 계획 W1 기준 10과 지적 확인 15개(W5 시험 틀 위) |
| `docs/adr/2026-10-29-app-shell.md` | 3절: 계단 셈, C 홀수 칸, C 배너 여유 |
| `docs/worklog/2026/10/29-2310-app-shell-w1.md` | 기준 7·8·10 줄, 정한 것(칸 상태 `base`, 다시 고름, scroll-margin, C 나누기, ☰ 이름), W2 줄 → W1이 옮길 때 할 일 |
| 이 기록, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## W1을 main 위로 옮길 때 (통합 세션, 합치는 순서 0 → W2 → W5 → W1)
1. W2·W5가 main에 들어간 뒤 이 가지를 main 위로 옮긴다. 합친 나무에서 겹친 파일은 `docs/WORKLOG.md`뿐이었다(`pnpm docs:index`로 다시 만든다). `packages/shared/src/index.ts`(W1 메뉴 내보내기 + W2 설정 내보내기)는 저절로 합쳐졌다. main이 더 움직였으면 다시 본다.
2. `apps/game/src/shell/shellPrefs.ts`를 W2로 바꾼다(이 파일 안에서만, 합친 나무에서 돌려 본 것):
   - 읽기 `useNavigation()`: `const raw = useSettings().device.nav; return useMemo(() => parseNavigation(raw), [raw]);`
   - 쓰기 `changeNavigation(patch)`: `return chooseNavigation(mergeNavigation(getSettingsSnapshot().device.nav, patch));`(가져오기: `../settings/settings.ts`의 `chooseNavigation`·`getSettingsSnapshot`·`useSettings`).
   - 이 파일의 실행 중 메뉴 기억(`rawNav`·`nav` 상태)은 지우고 레일 접힘(`terra.shell`)만 남긴다.
   - false(4KB 넘음·JSON으로 못 바꿈·계정에 저장할 수 없는 글자)는 설정 "메뉴" 칸이 이미 처리한다(아무것도 바꾸지 않고 `settings_menu_save_failed`).
   - 저장소 밖 패치: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/shell-w1/fix/w1-rebase-shellPrefs-w2.patch`(103줄). 없으면 위 세 줄대로 고친다.
3. `pnpm check`, `TEST_DATABASE_URL=… pnpm e2e`(17개). "배치를 A로 바꾸면 새로고침과 다른 기기에도 남는다"·"메뉴 값이 계정 상한(4KB)을 넘는 기기"는 2를 해야 통과한다.
4. `apps/game/bundle-budget.json`: 합친 뒤 `pnpm check:bundle` 값 + 8,000(합친 나무 123,416 → 131,416 B).
5. W1에는 DB 마이그레이션이 없다. W2 마이그레이션은 W2 검토 기록대로 다시 만들지 않는다.
6. ADR 37 끝 "구현하며 정한 것 (W1)": W1 작업 기록 "정한 것"(이 고침으로 고친 모양) + 이 기록의 "고침 안과 다르게 한 것"·"검토 밖에서 찾은 것".

## 함께 바꿔야 하는 파일 (다른 줄기에 바뀐 것)
- W4 편집 시트: `openOverlay("sheet")`·`closeOverlay()`·`useRoute().overlay`는 그대로다. 시트를 열고 닫아도 version·via가 바뀌지 않아 틀이 초점·스크롤을 건드리지 않는다 → 닫으면 `<dialog>`가 [편집] 단추로 초점을 돌려준다.
- 라우터 상태 이름 `scrollTopRequests` → `reselects`(+ `focusId`). 다른 줄기는 쓰지 않았다(W3·W4 작업 트리 grep).
- 틀 안 화면의 `useMountFocus(true)`는 주소로 바로 열면 초점을 옮기지 않는다(문맥). W3 처리함·W4 홈 화면도 그대로 쓰면 된다.
- `<html data-tabbar>`에 값(`c`·`a`)이 생겼다. `:root[data-tabbar]` 선택자는 그대로 맞는다.
- `e2e/shell.spec.ts`는 W1 파일이다. W3·W4는 자기 `e2e/<줄기>.spec.ts`를 더한다.

## 건드리지 말 것
- 본문 여백을 문서 뿌리 `scroll-padding`으로 되돌리지 않는다(sticky 위 띠·레일 단추 초점에 문서가 튄다, `layout.test.ts`가 막는다).
- `shell/router.ts`는 React·DOM을 가져오지 않는다. 겹침 칸의 `base`는 기록 칸 모양이다(앞 판 겹침 칸은 `base` 없이 읽는다).
- W1 작업 기록의 "건드리지 말 것" 그대로.

## 미검증·TODO·알려진 문제
- 실제 휴대폰·Safari는 이번에도 보지 않았다(Unknown). `<dialog>`가 닫힐 때 연 단추로 초점을 돌려주는 것은 Chromium에서만 봤다.
- 읽기 프로그램(aria-controls, 방향 안내 알림 영역)으로 듣지 않았다(Unknown).
- `e2e/shell.spec.ts`는 이 가지만으로는 돌지 않는다(시험 틀이 W5). W5 검토 고침이 시험 틀을 바꾸는 중이었다(`14f2439` → `d791857`). 합친 나무는 `d791857`로 돌렸다. 그 뒤 W5가 더 바뀌면 옮긴 뒤 다시 돌린다.
- 로그인 직후 첫 화면도 처음 켠 것으로 보아 초점을 옮기지 않는다(전과 같다, 화면 시험 `fx-more.cjs` 8번).
- `styles.css` 배너 `scroll-padding-bottom`과 레일(위 "남긴 것").
- 저장소 밖에 남긴 것: 시험 DB `terra_w1_fix`와 가짜 계정 3개, 합친 나무 `…/shell-w1/fix/sim`. 지워도 된다. 서버(포트 4481)는 껐다.

## 사용자 결정 대기
- 없음.
