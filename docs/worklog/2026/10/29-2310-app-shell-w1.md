# 앱 뼈대 W1: 화면 길·틀(라우터·위 띠·하단 탭·사이드 메뉴), 메뉴 순서 하나(D-265)

- 일시: 2026-10-29 23:10 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 1~4·8·10~12절과 "구현하며 정한 것 (0단계)"의 메뉴 줄, ADR `2026-10-29-planet-editor-stage1.md`(38) 1절(개발자 영역), 기획 `docs/design/60_UX_FTUE.md`·D-6001~D-6049·D-265·D-266, 기획 질문 `docs/questions/2026-10-29-app-shell.md`, 작업 기록 `29-2015-app-shell-stage0.md`·`29-2100-app-shell-stage0-review.md`, main의 `29-2140-planning-f0e0e71.md`(앱 뼈대 가지에 넘긴 일)
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-w1`, 가지 `work/app-shell-w1`, main `507e645`에서 시작했다. main은 그 뒤 `8c86dd7`로 움직였다(문서만: PLAN·ADR 35·36·38·특수 지형 질문·작업 기록·목차).
- 검토 고침(2026-10-30, 작업 기록 `30-0120-app-shell-w1-review.md`): 지적 12개를 고쳤다. 아래 "정한 것"·통과 기준 표·"함께 바꿔야 하는 파일"의 틀린 줄을 그 고침에 맞춰 고쳤다(고친 줄에 "검토 고침" 표시).

## 한 일
- 계획 W1(화면 길·틀)을 만들었다. 로그인한 뒤의 모든 화면이 이 틀 안에서 뜬다.
  - 라우터: `shell/router.ts`(React·DOM 없음)와 `shell/routerStore.ts`(브라우저에 붙임). ADR 37 2절 표대로 기록 칸을 쌓거나 바꾼다. 칸 상태는 `history.state`에 둬서 새로고침해도 남는다.
  - 틀 `shell/Shell.tsx`: 위 띠(`TopBar`), 하단 탭(`TabBar`, 좁은 폭만), 사이드 메뉴(`SideMenu`: ☰ 서랍·접는 레일·늘 펼침), 본문. 폭 3단계는 CSS 미디어 쿼리(`shell.css`·`tabbar.css`)가 정하고, JS는 같은 값을 쓴다(`layout.ts`·`useLayout.ts`).
  - 주소 → 화면 표 `shell/routeViews.tsx`: 화면은 모두 지연 조각이다. 없는 주소는 `NotFound`, 권한 없는 주소는 `NoPermission`.
  - 준비 중 화면 `sections/ComingSoon.tsx`: 유닛·경제·세력·사이보그·처리할 일·우편, 개발자 영역 3개(`/dev`·`/dev/planet-editor`·`/dev/gpu-bench`). 개발자 영역은 dev·admin만 열고, 다른 역할은 권한 없음 화면이다.
  - 임시 홈 `sections/HomeStatus.tsx`: 연결·성능 진단(`ui/DiagnosticsPanel.tsx`)을 틀 안에 그린다(W4 전까지).
  - 지도 2개는 틀을 숨긴다. 틀이 그 위에 연결 줄, 1차맵·2차맵 전환 단추(`MapSwitch`), 휴대폰 세로 방향 안내(`OrientationHint`)를 띄운다. `map/*`는 고치지 않았다.
  - 연결 상태 저장소 `net/connectionStatus.ts`(`useConnectionStatus()`): `App.tsx`에 있던 연결 상태를 화면 밖으로 옮겼다.
  - 원격 측정의 page는 주소 표의 경로 패턴이다(예: `/units/:unitId`, 모르는 주소는 `/*`). 지도의 `#second-map`·`#planet-map`은 전처럼 붙는다.
  - 아이디·로그아웃은 사이드 메뉴(머리·시스템 묶음)로 옮겼다. `auth/AccountBar.tsx`를 지웠다. `StatusPanel.tsx`는 `shell/ConnectionNotice.tsx`·`ui/DiagnosticsPanel.tsx`로 나누고 지웠다.
  - 아이콘 `ui/icons.tsx`: 틀 아이콘과 처리할 일 분류 아이콘 5개(인라인 SVG, 꾸러미 없음).
- D-265(메뉴 순서 하나)를 반영했다.
  - `packages/shared/src/navigation.ts`: `nav` = `{ layout, menu }`. 0단계의 배치별 탭 목록(`tabs`)과 `NAV_TAB_SLOTS`·`DEFAULT_NAV_TABS`·`NAV_LAYOUT_FIXED_ITEM`을 없앴다. 새 함수 `visibleTabs(설정, 칸 수)`·`navMenuItems`·`moveNavItem`·`resetNavMenu`, 상수 `NAV_LAYOUT_CENTER_ITEM`. 시험 23개.
  - 하단 탭은 메뉴 순서의 앞에서부터 칸 수만큼이다. 칸 수는 폭과 배치로 정한다(아래 "정한 것"). 사이드 메뉴는 늘 6개 모두 같은 순서다.
  - 설정 "메뉴" 칸 `shell/NavigationSettings.tsx`: 배치 고르기(그림 카드 2개), 메뉴 순서 하나(↑·↓), 지금 폭의 하단 탭 미리 보기, [기본값으로]와 바로 뒤 [되돌리기]. W2 전에는 이번 실행 동안만 기억한다(`shell/shellPrefs.ts`, 계획대로).
- D-266: 복귀 요약 [확인]은 요약만 닫는다. ADR 37 8절에 적었다. 요약 화면은 W3이다(꽂는 줄만 뒀다).
- 문서
  - ADR 37: 관련 줄(D-265·D-266), 3절 하단 탭·사이드 메뉴(칸 수 계단은 기술 해석으로 표시), 4절 `nav`, 5절 목록 상한, 8절 [확인], 10절, 12절 영어 탭 이름, 결과·사용자 결정 끝 줄, 0단계 "구현하며 정한 것"의 메뉴 절(D-265로 고침).
  - 기획 질문 파일: 상태를 "답 받음"으로, Q1 = D-265, Q2 = D-266.
- 큰 새 화면이라 스킬 4개로 검토하고 고쳤다(아래 "스킬 검토").

## 정한 것 (ADR 37·계획서가 정하지 않은 것. 통합 세션이 ADR 37 끝 "구현하며 정한 것 (W1)"에 옮긴다)
- 라우터
  - 칸 상태는 `{ terra: 1, key, index, root, home, top, overlay?, base? }`다(`base` = 겹침 칸의 아래 칸 열쇠, 검토 고침). `index`는 사슬 안 순번, `root`는 앱을 연 칸, `home`은 사슬 안 앱 홈 칸(없으면 null), `top`은 홈이 아닌 첫 단계 화면 칸이다. `terra`가 없거나 모양이 다른 칸은 앱이 쓴 칸이 아니라고 보고 새 사슬을 시작한다.
  - 화면 종류는 셋이다: 홈, 첫 단계(부모가 홈이고 틀을 보이는 화면), 쌓는 화면(지도·상세).
  - `history.go` 뒤의 다음 걸음(서랍에서 고름 등)은 popstate를 받은 뒤 한다. 중간 칸은 화면에 내보내지 않는다. 기다리는 동안(최대 1초, `PENDING_TIMEOUT_MS`) 들어온 옮기기는 무시한다.
  - 새로고침했는데 지금 칸이 겹침 칸이면 바로 뺀다. 앞으로 가기로 겹침 칸에 오면 다시 뺀다(겹침은 사람이 누를 때만 연다).
  - 지금 화면을 다시 고르면(탭·사이드 메뉴·서랍) 맨 위로 스크롤한다. 동작 줄이기 설정이면 바로 옮긴다. 고를 때 초점 칸 id가 있으면 그 칸에 초점을 두고 보이게 한다(라우터 `reselects`·`focusId`, 검토 고침).
  - 겹침만 열고 닫는 것은 화면 이동이 아니다: version·via가 그대로라 틀이 스크롤·제목·초점을 건드리지 않는다. 탭·메뉴로 홈에 가면(앞 칸이 앱 홈) 홈 칸으로 돌아가 보던 곳이다. 로그아웃·다른 계정은 사슬 안 앱 홈 칸까지 돌아가 바꾼다(검토 고침).
  - 겹침 종류는 `drawer`·`sheet`다(`sheet`는 W4 편집 시트 자리).
- 스크롤·초점·제목
  - `history.scrollRestoration = "manual"`. 칸 열쇠마다(뒤로·앞으로)와 첫 단계 화면 ID마다(탭끼리 바꾸기) 위치를 기억한다. 쌓을 때는 맨 위다. 겹침이 열린 동안과 새 화면이 그려지기 전에는 기억하지 않는다(검토 고침).
  - 앱 안에서 옮기면 새 화면 h1에 초점을 둔다(다음 그림 뒤). 처음 켤 때는 옮기지 않는다 — 화면 안 `useMountFocus`도(틀의 `MountFocusContext`, 검토 고침). [메뉴 편집]은 설정의 메뉴 칸(`#nav-settings`)에 초점을 둔다.
  - 문서 제목은 "{화면 이름} · 테라 인코그니타"(`shell_document_title`)다.
  - 위 띠·하단 탭 높이만큼 본문 요소의 `scroll-margin`을 둔다(`<html data-topbar data-tabbar="c|a">`, 배치 C는 지도 버튼이 솟는 `--space-6`만큼 더). 새 버전 배너는 하단 탭 위로 올린다(C는 같은 만큼 더). 처음에는 뿌리 `scroll-padding`이었다 — sticky 위 띠 단추에 초점이 가면 문서가 튀어 바꿨다(검토 고침).
  - 본문으로 건너뛰기 링크는 주소에 `#main`을 남기지 않는다(기록 칸이 생기지 않는다).
- 하단 탭 칸 수(D-265 해석, `shell/layout.ts`)
  - 폭 전체를 칸으로 나눈 가장 좁은 칸이 4.5em(72px)이 되는 폭부터 한 칸씩 는다. 첫 계단은 늘 4칸이다. 띠 안쪽 여백 0.5em을 셈에 넣지 않아 시작 폭의 실제 칸은 약 70.7px다(검토 고침: 전에는 "4.5em 이상"이라 적었다).
  - A: 5칸 27em(432px), 6칸 31.5em(504px).
  - C: 5칸 31.75em(508px). 지도를 늘 가운데 두므로 칸이 홀수면 오른쪽이 하나 더 많고 그쪽 칸이 좁다(폭이 넓어져도 앞 4칸 자리 그대로, `splitCenterTabs`. 검토 고침: 전에는 왼쪽이라 "경제"가 지도 왼쪽으로 옮겨 갔다).
  - 처음에는 C도 A와 같은 계단이었다. 화면에서 재 보니 432~507px에서 C 왼쪽 칸이 58~70px가 되어 영어 "Economy"가 잘렸다(440px 휴대폰 포함). 그래서 C 계단을 따로 두었다.
  - 칸 수는 같은 em 값의 matchMedia로 정한다(첫 그림부터 맞다). C 지도 칸 너비 4.75em(60px + 16px)은 `layout.test.ts`가 `tokens.css`·`tabbar.css`와 대 본다.
- 서랍·레일
  - 서랍은 `<dialog>.showModal()`이다. 닫기 단추·Esc·바깥 누르기·뒤로로 닫힌다. 열린 동안 위 띠 ☰는 뒤 막에 가려서, 계획의 "☰로 닫기"는 서랍 안 닫기 단추가 맡는다.
  - 서랍 내용은 열 때만 그린다. 여는 움직임만 200ms이고 닫기는 바로다.
  - 폭이 넓어지면(가로로 돌림 등) 서랍 칸을 뺀다.
  - 레일 접힘은 기기에만 둔다(`localStorage` `terra.shell` = `{ v: 1, railExpanded }`, 기본은 접힘). 키 낮은 화면(30em 이하)에서는 접은 레일 항목을 촘촘히 둔다.
  - 중간 폭에서는 배치와 상관없이 위 띠 ☰가 레일을 펴고 접는다(A도). 넓음에는 ☰가 없다.
  - ☰의 읽는 이름은 단계마다 다르다: 좁음 "메뉴 열기"(`aria-haspopup="dialog"`), 중간 "메뉴" + `aria-expanded`·`aria-controls`(레일 `nav#side-nav`. 검토 고침: 전에는 이름도 펼치기·접기로 바꿔 두 번 읽었다).
- 배지
  - 99를 넘으면 "99+"다. 배지는 읽기 프로그램에 숨기고, 수는 링크 이름에 넣는다(`shell_alerts_count`·`shell_item_alerts`).
  - `--badge-size`를 20px에서 1.25rem으로 바꿨다(글자를 키우면 함께 커진다. 0단계 디자인 값 줄을 고친 것).
- 연결 줄
  - 연결하는 중·끊김이 2초(`LOST_NOTICE_DELAY_MS`)를 넘으면 띄운다. 알림 영역(role=status)은 늘 그려 두고 글만 바꾼다.
  - 로그인 전 화면에는 서버 거절 안내만 띄운다. 진단 패널의 연결 알약에서 role=status를 뺐다(알림 영역은 하나만).
- 지도 위 단추·방향 안내
  - 전환 단추는 오른쪽 가운데에 두고, 주소를 바꾼다(replace).
  - 방향 안내는 휴대폰 세로(좁음 + 세로 + 손가락 입력)로 지도에 들어왔을 때 앱 실행마다 한 번 띄운다(`sessionStorage` `terra.orientationHint`). 알림 영역은 지도 화면 동안 늘 두고 안내는 다음 프레임에 넣는다(검토 고침). 4초 뒤 200ms 동안 흐려지며 닫히고, 가로로 돌리면 바로 닫힌다. 위치는 화면 위쪽 1/3이다(가운데 지도 안내와 전환 단추를 가리지 않게).
- 계정이 바뀌면(로그아웃 뒤 다른 계정) 홈으로 간다(`resetToHome`). 로그인 전에 연 주소는 그대로 두었다가 로그인 뒤 그 화면을 그린다.
- 설정 "메뉴" 칸: ↑·↓는 끝에서 `aria-disabled`다(초점이 남는다). 옮긴 뒤 초점은 같은 단추에 남고, 알림 영역이 "경제: 6개 중 2번째"를 읽는다. 미리 보기는 좁은 폭이면 고른 배치의 탭, 중간·넓음이면 "하단 탭 없음" 안내다. [되돌리기]는 다른 것을 바꾸기 전까지 보인다.
- 메시지 키: `shell_` 33개(0단계 블록 뒤), `settings_menu_` 21개(`settings_follow_system_hint` 뒤). `account_map`·`account_planet`은 지웠다(다국어 377개 키). 검토 고침: `shell_rail_expand`·`shell_rail_collapse`를 지우고 `settings_menu_save_failed`를 더했다(376개 키).
- CSS 나눔: `shell.css`(틀·위 띠·사이드 메뉴·서랍·폭 단계, 504줄), `tabbar.css`(하단 탭, `TabBar.tsx`가 가져온다), `overlays.css`(연결 줄·지도 위 단추·방향 안내), `navigationSettings.css`(설정 조각), `sections/sections.css`. `shell.css`가 600줄을 넘어서 나눴다.
- `styles.css`: 로그인 쪽 감싸개 `.shell`을 `.page`로 바꿨다(틀 이름과 겹치지 않게). 계정 줄 규칙을 지웠다.
- `nav`의 순서 칸 이름은 0단계의 `menu`를 그대로 썼다. main 작업 기록 `29-2140`은 `order`로 적었지만, 0단계 코드와 W2 서버 검사가 `menu`를 쓰고 운영에 저장된 값이 없어 이름을 바꾸지 않았다.

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, 헤드리스 Chromium 1243(Playwright 1.63), PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`의 시험 DB `terra_w1`, 가짜 계정만)
| 명령 | 결과 |
|---|---|
| `pnpm check`(마지막 트리, 부하 평균 약 9~12) | 통과: 포맷·린트·타입·경계·크기(경고 없음)·다국어 377개 키·대비 136쌍(화면 CSS 13개)·콘텐츠 `core@2 (14495d30db2e)`, 시험 파일 135개 통과·6개 건너뜀(DB), 시험 1,281개 통과·40개 건너뜀 |
| 새·고친 시험 | 라우터 29개(가짜 `history`), 폭·칸 수 7개, 연결 저장소 4개, 메뉴 23개. 모두 통과 |
| `pnpm build`, `node scripts/check-pwa.mjs` | 통과(sw.js가 화면 주소 경로 예 17개를 index.html로 연다) |
| 첫 화면 JS(빌드한 `index.html`의 모듈 + modulepreload, 파일마다 Node zlib 9단계) | main `507e645`: 368,388B, gzip 114,171B(4파일). W1: 401,129B, gzip 122,576B(2파일: `index` 305,447B·95,008B, `device` 95,682B·27,568B). 차이 +32,741B, gzip +8,405B. ADR 37의 처음 상한 136,000B 아래 |
| 첫 화면 CSS | `index` 72,889B, gzip 19,801B. 설정 조각 CSS 8,944B(메뉴 칸 포함) |
| 화면 흐름 `flows.cjs`(저장소 밖, 빌드한 앱·서버, 포트 4471) | 72개 모두 통과. 주소 14개 + 새로고침, 역할별 권한 6개, 쌓기·바꾸기·홈으로·앞으로, 서랍(Esc·닫기 단추·바깥·뒤로·고름·새로고침), 배치 A와 순서 바꾸기, 초점·알림 영역, 390px 넘침·44px, 배너, 지도 2개, 레일(820×1180·844×390), 1440×900, 건너뛰기 링크, 로그인 뒤 주소 유지, 로그아웃·다른 계정, 원격 측정 page, 기기 오류 없음 |
| 탭 칸 `tabfit.cjs` | 2개 언어 × 배치 2개 × 폭 12개(320~599px) = 48경우, 잘린 이름·가로 넘침 0. 가장 좁은 칸: C 59px(320px), A 62.4px(320px), 계단 시작 폭 약 70.7px |
| `break-ui` `breakui.cjs`(배지만 바꾼 임시 빌드, 포트 4472) | 25줄 모두 가로 넘침 0·작은 누르는 곳 0. 글자 200%(390px 영어)에서만 탭 이름 "Economy"·"Faction"이 말줄임된다 |
| `impeccable detect`(바꾼 화면 파일) | 처음 1건(방향 안내의 튀는 움직임, advisory) → 고침. 마지막 트리 0건 |

사진(저장소 밖, `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/shell-w1/shots/`):
- 390×844, 파스텔·다크 × ko·en: `390-{테마}-{언어}-home`·`-drawer`·`-units`·`-settings-menu`·`-not-found`·`-map` (24장)
- 1440×900, 파스텔·다크 × ko·en: `1440-{테마}-{언어}-home`·`-settings-menu` (8장)
- 레일: `820-pastel-ko-rail`·`-rail-open`, `820-dark-en-rail`·`-rail-open`, `844-pastel-ko-rail`, `844-dark-en-rail` (6장)
- 칸 수가 느는 폭: `extra/440-pastel-en-tabbar-c`(4칸)·`-tabbar-a`(5칸), `extra/508-pastel-en-tabbar-c`(5칸)·`-tabbar-a`(6칸), `extra/440-pastel-en-settings-menu-a` (5장)
- `break-ui` 사진: `breakui/` 아래(7가지 화면 × 홈·서랍·설정·준비 중)

## 통과 기준 (계획 W1 1~10)
| 기준 | 결과 | 근거 |
|---|---|---|
| 1. 단위 시험(가짜 `history`)·폭 경계 CSS·JS 같음 | 충족 | `router.test.ts` 29개(2절 표의 줄마다, 서랍에서 고르기, 새로고침 때 겹침 칸 빼기, 부모로 바꾸기, 기다림·시간 초과, 예상 밖 도착), `layout.test.ts` 7개. 검토 고침 뒤 34개·9개(겹침 열고 닫기는 화면 version 그대로 등) |
| 2. 주소마다 화면, 새로고침, 없는 화면, 플레이어의 `/admin` → 권한 없음 | 충족 | `flows.cjs` 주소 14개, 역할별 6개(`/dev*`도) |
| 3. 390×844 기본 C, A면 홈·지도·유닛·경제·☰, 서랍 닫기·남는 칸 없음, 서랍 연 채 새로고침 | 충족 | `flows.cjs`. ☰는 열린 동안 뒤 막에 가려 서랍 안 닫기 단추·바깥 누르기·Esc·뒤로로 닫는다 |
| 4. 820×1180 레일 접기·펴기(새로고침 뒤에도), 844×390 레일, 1440×900 늘 펼침·하단 탭 없음 | 충족 | `flows.cjs`, 사진 6장 |
| 5. 지도 2개: 틀 숨김, [뒤로], `?planet-debug=cracks` 유지, 휴대폰 세로 방향 안내 한 번 | 충족 | `flows.cjs` |
| 6. 로그아웃·다른 계정 → `/`, 로그인 안 한 채 `/units` → 로그인 → `/units` | 충족 | `flows.cjs` |
| 7. 새 버전 배너가 탭을 가리지 않음, 가로 넘침 없음, 누르는 곳 44px | 검토 고침 뒤 충족 | 처음 "충족"은 틀렸다: 배너를 탭 띠 위 끝과만 비교해 C의 가운데 지도 버튼 윗부분(약 7px)을 덮는 것을 놓쳤다(배너 아래 끝 768 > 버튼 위 끝 760.8). 고친 뒤 `.tab-map-button`과 비교해 744 ≤ 760.8(검토 고침 기록, 화면 시험). 넘침·44px은 `break-ui` 25줄, `tabfit.cjs` 48경우 |
| 8. 첫 화면 JS ≤ `bundle-budget.json` 상한(W5 검사) | 충족 | 처음에는 "W5 검사는 못 돌림"이라 적었지만 `work/app-shell-w5`의 `scripts/check-bundle.mjs`로 잴 수 있었다. 검토 고침 뒤 그 검사로: 이 가지 122,859 B, W2·W5와 합친 나무 123,416 B / 136,000 B. 통합 세션은 합친 뒤 `pnpm check:bundle` 값 + 8,000으로 상한을 정한다(합친 나무 기준 131,416 B) |
| 9. 파스텔·다크 × ko·en 사진(390, 1440) | 충족 | 위 사진 목록 |
| 10. `e2e/shell.spec.ts`가 `/map`·`/map/planet`을 주소로 열어 봄 | 검토 고침 뒤 충족(W5 뒤 실행) | `e2e/shell.spec.ts` 15개를 더했다. 시험 틀은 W5라 이 가지만으로는 돌지 않는다. W2·W5와 합친 나무에서 17개(smoke 2 포함) 통과 |

## 스킬 검토
- `web-design-guidelines`(규칙 원문을 받아 봄): 위 띠·하단 탭이 초점 둔 요소를 가리지 않게 `scroll-padding`(검토 고침에서 본문 요소 `scroll-margin`으로 바꿈), 건너뛰기 링크가 기록 칸을 남기지 않게, 올림 색은 마우스 기기에서만, 링크·탭에 `touch-action: manipulation`, 서랍·레일에 `overscroll-behavior: contain`, 알림 영역은 하나만, [기본값으로] 뒤 [되돌리기], UI 문구의 ☰ 글자를 말("메뉴")로.
- `break-ui`: 긴 아이디(20자, 허용 최대), 영어, 320px, 글자 200%, 배지 128(99+)·23·7·1, 모르는 메뉴 ID. 고친 것: 배지가 아이콘을 덮음(오른쪽으로 자라게, 펼친 메뉴는 줄 끝), 200%에서 배지 글자가 넘침(rem·한 줄), 서랍 이름표가 두 줄로 꺾임(본문 크기), C 432~507px "Economy" 잘림(C 계단). 남긴 것은 아래 "알려진 문제".
- `impeccable`: 맥락 불러오기 결과 PRODUCT.md가 없어 기존 디자인 시스템을 기준으로 audit·polish만 했다. 인터뷰 단계는 묻는 도구가 없어 하지 않았다. 고친 것: 설정 메뉴 칸을 다른 칸과 떼는 위 여백·가는 선, 다크 테마에서 배치 그림의 칸이 보이지 않음(`--color-border`), 방향 안내가 전환 단추와 겹침(위쪽 1/3로), 검출기 1건(튀는 움직임 → ease-out).
- `review-animations`: 서랍·뒤 막 320ms → 200ms(여는 것만, 닫기는 바로), 레일 너비 움직임을 뺌(레이아웃 속성), 탭·지도 버튼은 누를 때 짧게 줄고 뗄 때 살짝 튀며 돌아옴, 방향 안내는 흐려지며 닫힘. 동작 줄이기 설정이면 시간 토큰이 0이다(`tokens.css`).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/navigation.ts`·`navigation.test.ts`, `index.ts` | D-265: `nav` = 배치 + 메뉴 순서 하나, 탭 계산·옮기기·되돌리기 |
| `apps/game/src/shell/router.ts`·`router.test.ts`·`routerStore.ts` | 자체 라우터(ADR 37 1·2절, [결정 1]) |
| `apps/game/src/shell/layout.ts`·`layout.test.ts`·`useLayout.ts` | 폭 3단계·하단 탭 칸 수(배치마다)·휴대폰 세로 |
| `apps/game/src/shell/Shell.tsx`·`TopBar.tsx`·`TabBar.tsx`·`SideMenu.tsx`·`menuItems.ts`·`AppLink.tsx`·`BackButton.tsx`·`CountBadge.tsx` | 틀과 메뉴 |
| `apps/game/src/shell/routeViews.tsx`·`NotFound.tsx`·`NoPermission.tsx` | 주소 → 화면, 제목, 꽂는 줄 자리 |
| `apps/game/src/shell/ConnectionNotice.tsx`·`MapSwitch.tsx`·`OrientationHint.tsx` | 연결 줄, 지도 위 단추, 방향 안내 |
| `apps/game/src/shell/NavigationSettings.tsx`·`navigationSettings.css`·`shellPrefs.ts` | 설정 "메뉴" 칸, 메뉴 설정·레일 접힘 기억 |
| `apps/game/src/shell/shell.css`·`tabbar.css`·`overlays.css` | 틀 스타일(디자인 값만) |
| `apps/game/src/net/connectionStatus.ts`·`connectionStatus.test.ts` | 연결 상태를 화면 밖 저장소로 |
| `apps/game/src/ui/DiagnosticsPanel.tsx`·`icons.tsx` | 진단 본문(W4 카드도 씀), 아이콘 |
| `apps/game/src/sections/ComingSoon.tsx`·`HomeStatus.tsx`·`sections.css` | 준비 중 화면, 임시 홈 |
| `apps/game/src/App.tsx`·`main.tsx` | 로그인 뒤 틀, 라우터·연결 저장소 시작, 스크롤 되돌리기 끔, 계정이 바뀌면 홈 |
| `apps/game/src/telemetry/reporter.ts` | 보고의 page = 경로 패턴 |
| `apps/game/src/settings/SettingsPage.tsx` | "메뉴" 칸 한 줄 |
| `apps/game/src/styles.css`·`styles/tokens.css` | 계정 줄 지움, `.shell` → `.page`, 배너를 탭 위로, `--badge-size` rem |
| `apps/game/messages/ko.json`·`en.json` | W1 키 54개, 키 2개 지움 |
| `apps/game/src/StatusPanel.tsx`·`auth/AccountBar.tsx`(지움) | 계획 W1 "나누고 지움" |
| `vitest.config.ts` | 시험이 `shell.css`·`tabbar.css` 내용을 읽게 |
| `docs/adr/2026-10-29-app-shell.md`, `docs/questions/2026-10-29-app-shell.md` | D-265·D-266 반영, 질문 답 표시 |
| `docs/worklog/2026/10/29-2310-app-shell-w1.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일 (다른 줄기의 꽂는 줄)
- W2 전환은 W1이 한다(검토 고침: 처음에는 "다른 줄기가 넣을 꽂는 줄"로 적었다. 합치는 순서가 0 → W2 → W5 → W1이라 W1을 main 위로 옮길 때 할 일이다. W2 기록 103~105줄도 같다). `apps/game/src/shell/shellPrefs.ts` 안에서만 바꾼다: 읽기 `parseNavigation(useSettings().device.nav)`, 쓰기 `chooseNavigation(mergeNavigation(getSettingsSnapshot().device.nav, 바꾼 칸))`의 결과를 그대로 돌려준다. false(4KB 넘음 등)는 설정 "메뉴" 칸이 처리한다. 절차·돌려 본 결과는 `30-0120-app-shell-w1-review.md` "W1을 main 위로 옮길 때". 빠뜨리면 메뉴 설정이 새로고침에 사라지고 `e2e/shell.spec.ts`의 두 시험이 실패한다. 서버 Zod는 `nav.layout`과 `nav.menu`(ID 모양 `SAVED_ID_PATTERN`, 최대 `NAV_MENU_MAX` 32개)를 본다. 0단계 계약의 `tabs`·`NAV_TAB_SLOTS`·`DEFAULT_NAV_TABS`는 없다.
- W3
  - `apps/game/src/shell/TopBar.tsx`의 `const useAlertCount = (): number => 0;` 한 줄을 처리할 일 저장소 훅으로.
  - `apps/game/src/shell/routeViews.tsx`의 `InboxScreen` lazy 한 줄(화면은 `{ match }`를 받는다. `?item=`은 `match.search`).
  - `apps/game/src/shell/Shell.tsx` 끝의 복귀 요약 주석 줄(어느 주소 위에도 뜨는 겹침, 기록 칸 없음, [확인]은 요약만 닫음 D-266). 메뉴 항목 배지 `NO_BADGES`(같은 파일)를 `inbox.list`의 badges로.
- W4: `routeViews.tsx`의 `HomeScreen` lazy 한 줄(`{ match, monitor }`를 받는다)을 바꾸고 `sections/HomeStatus.tsx`를 지운다. 연결·성능 카드는 `ui/DiagnosticsPanel.tsx` + `useConnectionStatus()`. 넓게 쓰는 화면은 `.screen-wide`. 편집 시트는 겹침 `sheet`(`openOverlay("sheet")`, `closeOverlay()`).
- ADR 38 WP-H·WP-D: `routeViews.tsx` `renderRoute`의 `dev`·`dev_planet_editor`·`dev_gpu_bench` 줄을 그 화면 조각으로.
- W5: 시험 틀만. `e2e/shell.spec.ts`(W1 기준 10)는 W1이 더했다(검토 고침). 저장소 밖 `flows.cjs`의 72개 중 나머지는 옮길 후보다.
- 통합 세션
  - `apps/game/bundle-budget.json` 상한 = 합친 뒤 `pnpm check:bundle` 값 + 8,000(검토 고침: 합친 나무 123,416 → 131,416 B).
  - 저장소 밖 측정 스크립트의 [1차맵]·[2차맵] 누르기를 주소 열기(`/map/planet`, `/map`)로.
  - PLAN 14장 "화면 흐름·첫 화면" 행의 "기획에 물은 것 2개" → 답함(D-265·D-266), 13장 ADR 37 줄, 기술 요구 "앱 뼈대" 행(메뉴 순서 하나). main이 PLAN을 고친 뒤라 이 가지에서는 고치지 않았다.
  - ADR 37 끝에 "구현하며 정한 것 (W1)"(위 "정한 것"). 0단계 디자인 값 줄의 `--badge-size` 20px도 1.25rem으로.
  - main `29-2140` 기록이 ADR 37에 넘긴 나머지(1절 첫 접속·성인 인증 자리, 개발자 도구 목록, `/admin` 경제 감시·`/shop`, 3절 위 띠 근거 D-6049, 7절 새 종류 후보, 9절 알림 권한 시점, "결과"의 6-6·6-4 줄)는 W1 범위 밖이라 하지 않았다.
  - `docs/WORKLOG.md`는 main과 이 가지가 함께 고친 목차다. 합친 뒤 `pnpm docs:index`로 다시 만든다.
- 폭 값을 바꾸면 `shell/layout.ts`와 `shell.css`·`tabbar.css` 미디어 쿼리를 함께 고친다(`layout.test.ts`가 본다). `--tabbar-map-size`·`--space-4`·`.tab-map` 너비를 바꾸면 `TAB_MAP_CELL_EM`과 C 계단을 함께 본다.

## 건드리지 말 것
- `apps/game/src/map/*`(화면은 `{ onClose, monitor }`만 받는다), `admin/*`, `editor/*`.
- `shell/router.ts`는 React·DOM을 가져오지 않는다(가짜 `history` 시험).
- 메뉴 항목 ID·배치 ID(`c`·`a`)는 계정에 저장되는 ID다(PROTECTED, 0단계와 같다). 기기 열쇠 `terra.shell`·`terra.orientationHint`.

## 미검증·TODO·알려진 문제
- 실제 휴대폰(웨일, iOS Safari)에서 보지 않았다(Unknown). 헤드리스 Chromium만 돌렸다.
- Safari·iOS의 `history.state`·`<dialog>`·popstate 순서, 스와이프 뒤로는 Unknown. 안드로이드 뒤로 버튼의 닫기 요청은 데스크톱 Esc로만 봤다.
- 글자 키우기는 `<html>` 글자 크기 200%로만 흉내 냈다. 브라우저의 기본 글자 크기 설정(em 미디어 쿼리가 바뀜)은 미실행이다.
- 새 버전 배너는 열린 상태를 넣어서 봤다. 실제 갱신 흐름은 미실행이다.
- 글자 200%에서 탭 이름이 말줄임되고(사이드 메뉴와 읽기 프로그램에는 전체 이름), "99+" 종 배지가 우편 아이콘 일부를 덮는다. 받아들였다.
- C 5칸(508~599px)은 양쪽 칸 너비가 다르다(왼쪽 2칸 약 106~129px, 오른쪽 3칸 70.7~85.8px — 검토 고침으로 남는 칸이 오른쪽). 지도를 가운데 두려는 값이다(Assumed: 이 폭은 작은 태블릿 세로·접는 폰뿐이라 드물다).
- W2를 합치기 전에는 메뉴 설정이 새로고침하면 기본값으로 돌아간다(계획대로). W1을 W2 위로 옮길 때 `shellPrefs.ts`를 바꾼다(위 "함께 바꿔야 하는 파일").
- `e2e/shell.spec.ts`는 검토 고침에서 더했다(W5 시험 틀 위에서 돈다).
- 저장소 밖에 시험 DB `terra_w1`(PostgreSQL 16 시험 클러스터)과 가짜 계정 4개(`w1player`·`w1dev`·`w1admin`·`Aleksandra_Wisniewsk`)를 남겼다. 지워도 된다.

## 사용자 결정 대기
- 없음.
