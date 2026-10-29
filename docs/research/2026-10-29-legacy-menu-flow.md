> 조사 보고서 원본 (작성: Claude Code 조사 에이전트, 2026-10-29). 옛 프로젝트 AntiGravt01의 `terra-client`·`terra-lite` 화면·메뉴 코드와 옛 문서, 이 저장소의 기획 `60_UX_FTUE.md`·결정 로그(D-6001~D-6016)·게임 앱 파일을 읽었다(목록은 11장). 코드는 읽기만 했고 옛 앱은 실행하지 않았다(미실행). 결정은 ADR `docs/adr/2026-10-29-app-shell.md`(앱 뼈대, 제안)에 있다.

# 옛 프로젝트(AntiGravt01) 화면 흐름: 새 앱 뼈대용 참고 정리 (2026-10-29, 읽기만 함)

## 0. 결론
1. 옛 앱도 로그인한 뒤 첫 화면이 대시보드였다(`app/login/page.tsx:147`). 사용자 요구와 같다. 새 유저는 예외였다. 캐릭터 만들기 → 튜토리얼 → 2차맵으로 끝났다(`app/tutorial/page.tsx:172`).
2. 옛 대시보드 구성: 같은 크기 카드 7개, 관리자 칸 1개, 맨 위 경고 줄(`app/dashboard/page.tsx:312-767`). 유저가 카드를 고르거나 순서를 바꿀 수 없었다. 사용자가 말한 4가지(사이보그·유닛·자산·세력) 가운데 **세력 카드는 없었다**.
3. 경고 줄(`components/StatusAlertBanner.tsx`)이 새 "처리할 일"의 씨앗이다. 한 줄, "+N", 펼치기, 항목마다 이동 버튼으로 이루어진다. 한계도 있다. 목록을 기기에서 만들었고 종류가 4개뿐이며 심각도 순으로 정렬하지 않았다. 휴대폰에서는 처리 버튼이 숨었다.
4. 플레이어 화면에는 화면 틀(셸: 모든 화면이 같이 쓰는 위 띠·탭·메뉴)이 없었다. 화면 13곳이 각자 `SystemMenu`를 그렸고 자리도 제각각이었다. 메인인 2차맵 화면에는 메뉴가 아예 없었다.
5. 메뉴는 26줄(관리자 28줄)짜리 펼침 판이었다. 그중 12줄이 건물 분류였다. 한 기능이 여러 메뉴에 흩어져 있었다. 직무 배정은 경제에, 유닛은 유닛 화면에 있었고, 거래는 경제와 시장 두 곳에 있었다.
6. 같은 게임에 클라이언트가 둘 있었다. `terra-client`는 펼침 메뉴, `terra-lite`는 하단 탭 5개였다. 메뉴 목록이 둘이어서 서로 어긋났다.
7. 새 기획 메뉴(홈·지도·유닛·경제·세력·사이보그)는 옛 화면들을 6개로 모은 모양이다. 옛 화면은 거의 다 이 6개 중 하나에 들어간다(5장). 아래 내용은 아이디어로만 쓴다(사용자: "그대로 사용하지는 말고").

## 1. 확인 범위
- 옛 경로의 기준은 `/home/user/AntiGravt01/terra-client/src/`이다(따로 적은 것은 예외). `terra-lite/…`는 `/home/user/AntiGravt01/terra-lite/` 기준이다. 새 경로의 기준은 `/home/user/terra-in-cognita/`이다. 절대 경로 목록은 11장에 있다.
- 옛 작업 폴더는 `claude/peaceful-lamport-yj4zci` 가지에 있다. `git diff --stat main HEAD -- terra-client terra-lite docs/GDD docs/Projects`의 결과가 비어 있으므로 읽은 파일은 `main`과 같다(Verified).
- 코드만 읽었다. 옛 앱은 실행하지 않았다(미실행). 동작을 짐작한 부분에는 Assumed를 붙였다.
- 새 저장소 확인 결과: S2 통합은 이미 `main`에 들어갔다. `main` 523f373이 `worktree-wf_cf86e8da-f84-1`(856c161)을 합쳤고, 두 가지의 `apps/game` 사이에 차이가 없다(Verified). 그래서 새 앱 파일은 `main`에서 읽었다.

## 2. 화면 목록과 이동 구조

### 2.1 플레이어 경로
| 경로 | 하는 일 | 메뉴 진입 | 근거 |
|---|---|---|---|
| `/` | 소개 화면. [Gamestart (Login)] → `/dashboard` | 없음 | `app/page.tsx:36-42` |
| `/login` | 로그인. 저장소에 id·역할·토큰·시각을 둔다. 사이보그가 없으면 `/create-character`, 있으면 `/dashboard` | — | `app/login/page.tsx:124-147` |
| `/create-character` | 이름, 스탯 굴림, 원소 배분 → `/tutorial`. 이미 만들었으면 `/character` | 이 화면에도 메뉴가 보인다 | `app/create-character/page.tsx:141-144, 184, 197-198` |
| `/tutorial` | 4단계(각성 → 세계맵 입장 → 첫 채집 → 끝) → `/pixi-map`. 이미 끝낸 유저는 `/dashboard` | 없음 | `app/tutorial/page.tsx:133, 172` |
| `/dashboard` | 중심 화면(3장) | 내비게이션 | `app/dashboard/page.tsx` |
| `/pixi-map` | 메인 지도. 들어가면 바로 2차맵(2.3) | 내비게이션 | `app/pixi-map/page.tsx` |
| `/character` | 사이보그·스킬·소지품 3탭 | 내비게이션 | `app/character/page.tsx:261-264` |
| `/units` | 유닛 요약, 일괄 명령, 목록 | 내비게이션 | `app/units/page.tsx:215-279` |
| `/party` | 전투 부대(파티) 편성. 파티에 든 유닛은 채집·생산을 못 한다 | 내비게이션 | `app/party/page.tsx:428-433` |
| `/faction` | 세력 7탭(개요·소속 도시·구성원과 직위·외교와 관세·내정과 재무·공방 블루프린트·전쟁) | 핵심 기능 | `app/faction/page.tsx:45-47`, `components/faction/FactionPanel.tsx:54-60` |
| `/shop` | 프리미엄 상점 | 핵심 기능, 도시화폐 칩 | `app/shop/page.tsx` |
| `/economy` | 경제 7탭(대시보드·창고·직무 배정·중앙은행·금고·경매소·주식거래소) | 핵심 기능 | `app/economy/page.tsx:24-32` |
| `/market` | 시장 4탭(교역소·NPC 상점·종합 거래소·시세와 거래) | 핵심 기능 | `app/market/page.tsx:142-147` |
| `/buildings`, `/buildings/[id]` | 건물 목록(분류로 거름)과 상세 | 건물 관련 13줄 | `app/buildings/page.tsx:116-127` |
| `/battle/[sessionId]` | 조우 전투. 끝나면 `/pixi-map` | 없음(2차맵에서만 들어감) | `app/battle/[sessionId]/page.tsx:215, 268` |
| `/settings` | 테마·일반·화면 설정 | 시스템, 테마 | `app/settings/page.tsx:88, 204, 257` |
| `/admin/*` | 관리자(2.5) | 관리자만 | `app/admin/layout.tsx` |
- 모든 경로에 `loading.tsx`와 `error.tsx`가 있다(`git ls-tree` 목록).
- 뿌리 틀(`app/layout.tsx:42-49`)에는 메뉴가 없고 알림·튜토리얼·`fetch` 가로채기만 있다.

### 2.2 처음 들어올 때
`/` → `/dashboard`(로그인 안 했으면 `/login`) → `/login` → (사이보그 없음) `/create-character` → `/tutorial` → `/pixi-map`(첫 채집) → 장비 고르기 → `/pixi-map`.
다시 오는 유저는 `/login` → `/dashboard`로 간다.
- 사이보그가 있는지를 세 가지 방법으로 따로 확인했다. 로그인 화면은 `/api/character/:id/cyborg`의 404(login 134-140), 대시보드는 `cyborg_model`(dashboard 100), 캐릭터 만들기는 `stats`가 비었는지(create-character 141-144)를 본다.

### 2.3 지도와 전투
- `/pixi-map`은 주소 하나 안에서 상태 값으로 2차맵과 1차맵을 바꾼다(`app/pixi-map/page.tsx:62`). 들어가면 바로 2차맵이 나온다.
- 2차맵(`SecondaryMapView`, 4,426줄)은 화면 전체를 덮는다(`components/SecondaryMap/SecondaryMapView.tsx:2853`). 메뉴, 우편, 상태 칩이 없다. 왼쪽 위의 [← 월드맵] 버튼 하나뿐이다(2868-2871).
- 메뉴는 1차맵(`PixiMapViewer`)에만 떠 있다(`components/WorldMap/viewer/PixiMapViewer.tsx:859-862`). 화면 안 버튼으로 2차맵에서 대시보드에 가려면 1차맵 → [SYSTEM ACCESS] → 대시보드를 거쳐야 한다. 브라우저 뒤로 가기는 따로 쓸 수 있다.
- WebGL 오류 화면에는 [🏠 대시보드로] 버튼이 있지만, 실제로는 1차맵을 연다(`SecondaryMapView.tsx:2841-2846`, `app/pixi-map/page.tsx:219-222`).
- 조우가 생기면 카운트다운 뒤 `/battle/:id`로 넘어간다(`SecondaryMapView.tsx:430-435`). 전투가 끝나면 `/pixi-map`으로 돌아온다.
- 지도 주소로 위치와 할 일을 넘길 수 있었다. `?x=&y=`, `?targetX=&targetY=&action=`(`app/pixi-map/page.tsx:131-138, 193-202`)이다.

### 2.4 화면 안 탭의 주소 (화면마다 방식이 다름)
| 화면 | 방식 | 근거 |
|---|---|---|
| `/economy` | `#bank` 같은 해시. 탭을 바꾸면 주소도 바뀐다 | economy 37-44, 88-95 |
| `/character` | `?tab=inventory`. 처음 값만 읽고, 탭을 바꿔도 주소는 그대로다 | character 83-86 |
| `/buildings` | `?category=PRIMARY` | buildings 116, 125-127 |
| `/market`, `/faction` | 주소 없음(상태 값만) | market 142, FactionPanel 54 |

### 2.5 관리자
- `/admin` 허브에서 `/admin/manage/*`(15개, `components/admin/ManageSidebar.tsx:18-34`)와 `/admin/editor/*`(15개, `EditorSidebar.tsx:23-57`)로 나뉜다. 옛 주소 14개는 새 주소로 넘긴다(`app/admin/items/page.tsx` 등).
- 화면 틀은 관리자 쪽에만 있었다. `app/admin/manage/layout.tsx:10-19`가 사이드 메뉴를 한 번만 그린다. 플레이어 화면과 반대다.

### 2.6 두 번째 클라이언트 `terra-lite` (Vite 단일 페이지 앱, `/lite`)
- `main`에 있다(`package.json`의 `dev:lite`·`build:lite`). 옛 CLAUDE.md 화면 표에는 빠져 있다.
- 화면 틀을 한 곳에서 그린다. `AppLayout`이 로그인 화면을 빼고 늘 하단 탭을 붙인다(`terra-lite/src/App.tsx:45-56`).
- 하단 탭은 홈·캐릭터·맵·시장·더보기 5개다(`src/components/layout/BottomNav.tsx:69-75`). 위 줄 `TopBar`는 뒤로·제목·오른쪽 버튼으로 이루어지며(`TopBar.tsx:18-53`) 화면마다 직접 넣는다.
- 홈 카드는 4개다(`src/pages/HomePage.tsx:147-311`).
  - 캐릭터 요약: Lv, 피로도 배지, HP·피로 막대, 6스탯.
  - 내 자산: 골드, 첫 도시의 도시화폐, 테라코인.
  - 빠른 메뉴 6칸.
  - 새 알림: 안 읽은 우편 3개.
- 더보기는 4묶음 15항목이다(`src/pages/MorePage.tsx:35-71`). 그중 4개(크리쳐 도감·종교·물류·프리미엄 상점)는 경로가 없다. 그래서 `*` 규칙에 걸려 홈으로 튕긴다(`App.tsx:85-111`, Verified).
- 빠른 메뉴의 [유닛]은 `/character`로 간다(`HomePage.tsx:26`).
- 화면 방향을 세로로 고정했다(`terra-lite/public/manifest.json:9`).

### 2.7 옛 CLAUDE.md 화면 표와 실제의 차이
- `/dashboard`를 "6카드"라고 적었다(CLAUDE.md:74). 실제로는 7카드와 관리자 칸이다. 파일 머리 주석도 "6카드"다(dashboard 4, 330).
- `/character`를 "미니언 관리"라고 적었다(75). 유닛 관리는 이미 `/units`로 옮겼다(character 6, 14).
- `/terrain-map`(79)은 `app/` 아래에 없고, `main` 기록에도 없다.
- 표에서 빠진 화면: `/units`, `/party`, `/faction`, `/buildings`, `/shop`, `/settings`, `/tutorial`, `/create-character`, `/battle`, 그리고 `terra-lite` 전체.
- `/economy` 머리 주석은 "5탭"이라고 한다(economy 4). 실제로는 7탭이다.

## 3. 대시보드 `/dashboard` (`app/dashboard/page.tsx`, 797줄)

### 3.1 배치
- 맨 위: 제목 "Command Center"와 금액 알약 2개(GOLD는 금 g 환산값, 그리고 테라코인)(301-310).
- 그 아래 경고 줄(312-328). 과적 정보를 받은 뒤에만 그린다(313). 그래서 과적 요청이 실패하면 유지비 경고도 나오지 않는다(Assumed, 코드로 판단).
- 카드 격자는 폭에 따라 1열 → 2열(sm) → 3열(lg)이 된다(331). 카드는 모두 1칸이고 관리자 칸만 2칸이다(751).

### 3.2 카드
| # | 카드 | 보여 준 것 | 데이터(요청) | 링크·버튼 | 줄 |
|---|---|---|---|---|---|
| ① | 캐릭터·스탯 | 이름, Lv, EXP 막대, 클래스(기기에서 추정), HP/MP 막대(폭이 늘 100%), 6스탯 막대(기본·레벨·투자·장비 4단) | `/api/user/:id` | 없음 | 333-417 (HP/MP 375, 382) |
| ② | 경제 요약 | 보유 자금(금 g 환산), 도시화폐 합산(≈G, 도시 수), 일일 유지비, 보증금이 7일치 미만이면 경고 아이콘 | `/api/user/:id`, `/api/user/:id/smelter-assets`, `/api/user/:id/minions` | [상세] → `/economy` | 419-463 |
| ③ | 시장 시세 | 자원 6개의 현재가와 기준가 대비 % | `/api/market/prices` | [시장] → `/market` | 465-519 |
| ④ | 생산 | 생산 건물 수, 가동 중인 수, 받을 것 N개, [COLLECT ALL], "엔진 대기" 배지 | `/api/system/config`, `/api/production/pending`(5초마다), 건물 목록 | [COLLECT ALL] → `POST /api/production/collect` | 521-577, 222-236 |
| ⑤ | 직무 배정 | 배치된 유닛 수, 일일 비용, 보증금이 버틸 날 수, "보증금 7일 미만!" | `/api/user/:id/minions`(기기에서 계산) | [관리] → `/economy` | 579-621, 193-204 |
| ⑥ | 창고 | 용량 막대(70%와 90%에서 색이 바뀜), 자원 6개 | `/api/warehouse/:id` | [상세] → `/economy` | 623-685 |
| ⑦ | 건물 관리 | 소유 건물 수, 분류별 건물 수와 가동 수(4분류까지, 나머지는 "+N") | `/api/user/:id/buildings` | 카드 전체와 [전체보기] → `/buildings` | 687-746 |
| 관리자 | 단축 버튼 8개 | 플래닝·아이템·밸런스·유저·NPC AI·메일·DB·시스템 | — | 옛 관리자 주소(새 주소로 넘김) | 748-767 |
- 빈 상태 문구:
  - "시세 데이터 없음"(483)
  - "생산 건물을 건설하세요"(571)
  - "소유 건물 없음 / Pixi 맵에서 건설하세요"(741-743)
  - "자원 없음"(662)
- 세력 정보는 메뉴의 영토 건물 수 배지(숫자 표시)뿐이었다(`components/SystemMenu.tsx:197`).

### 3.3 경고 줄 (`components/StatusAlertBanner.tsx`, 242줄)
- 항목 모양: `{id, type(error|warning|info|success), icon, title, description, action{label, href}}`(17-24).
- 종류는 4가지다(64-135).
  - 과적(이동 속도 −%)과 무게 주의
  - 슬롯 초과와 슬롯 부족
  - 유지비 위험(3일 미만)과 유지비 부족(7일 미만)
  - 생산 완료 N건 대기
- 보여 주는 방식: 첫 항목을 한 줄로 보이고, "+N" 배지와 펼치기 버튼을 붙인다(154-238). 문제가 없으면 초록 줄 "모든 시스템 정상"을 보인다(142-151).
- 문제점:
  - 목록을 기기에서 만든다.
  - 넣은 순서가 곧 보이는 순서다. 주석은 첫 항목이 "가장 심각한" 것이라고 하지만(154) 실제로는 정렬하지 않는다. 그래서 무게 주의(경고)가 유지비 위험(오류)보다 위에 올 수 있다.
  - 휴대폰 폭에서는 설명(166, `hidden md:inline`)과 이동 버튼(181, `hidden sm:flex`)이 숨는다. 휴대폰에서는 맨 위 항목을 처리할 버튼이 없다.
  - 이동할 곳이 모두 그냥 `/economy`다(79, 99, 122). 어느 탭인지 고르지 않는다. 링크가 `<a href>`라서 화면 전체를 다시 불러온다(177-184).

### 3.4 데이터 요청 (코드로 센 값, 미실행)
- 대시보드 자체는 9곳에 요청한다. 위 표의 8곳에 과적(212)을 더한 값이다. 이 중 2개는 주기 요청이다(생산 5초 137, 과적 30초 218).
- 메뉴와 뿌리 틀이 7번 더 요청한다.
  - 건물 요약: `hooks/useBuildingSummary.ts:30`
  - 우편: `components/Mailbox.tsx:111`
  - 서버·DB 상태(30초마다): `components/DbStatusBadge.tsx:57`
  - 과적과 도시화폐(10초마다): `components/GlobalStatusBar.tsx:111, 119, 134`
  - 튜토리얼: `components/tutorial/InGameTutorial.tsx:21`
  - 화면 이동 기록: `hooks/useNavigationLog.ts:36`
- 합치면 첫 화면에 요청 16번(서로 다른 주소 15곳)이 나가고, 주기 요청 타이머가 4개(5초·10초·30초·30초) 돈다.
- 같은 정보를 겹쳐서 묻는다. 과적은 두 곳에서 따로 묻는다(dashboard 212, GlobalStatusBar 111). 건물은 서로 다른 두 주소로 묻는다(dashboard 148, useBuildingSummary 30).
- 경제 화면의 "대시보드" 탭도 시세·금·유닛을 다시 부른다(`components/economy/EconomyDashboard.tsx:106-111`).

## 4. 메뉴 (`components/SystemMenu.tsx`, 697줄)

### 4.1 위 줄 (메뉴가 있는 화면의 맨 위)
- 구성: [SYSTEM ACCESS] 버튼, 우편함(안 읽은 수 배지, 99+), 서버·DB 상태 배지, 상태 칩 3개(102-118).
- 상태 칩 3개: 도시화폐 CC → 상점, 무게 → 소지품, 슬롯 → 소지품(`components/GlobalStatusBar.tsx:367-460`).
- 도시화폐 칩은 도시 `VND`를 코드에 박아 두었다(119). 설명 글은 "테라코인(프리미엄 재화)"이라 하고(210-213) 누르면 상점으로 간다(98-100). 이름, 값, 이동할 곳이 서로 맞지 않는다.
- 우편함은 아이템을 받는 상자도 겸했다. 그래서 "안 읽음"이 실제로는 "아직 안 받음"을 뜻했다(`Mailbox.tsx:125`).

### 4.2 펼침 메뉴 (폭 `w-full sm:w-80 md:w-72`(138), 최대 높이 85vh, 넘치면 스크롤)
| 묶음 | 항목 → 이동 | 줄 |
|---|---|---|
| 내비게이션 | 대시보드 → `/dashboard`, Pixi 맵 → `/pixi-map`, 캐릭터 → `/character`, 유닛 → `/units`("관리·재산·작업 현황"), 파티 → `/party` | 147-183 |
| 핵심 기능 | 세력 → `/faction`(영토 건물 수 배지), 프리미엄 상점 → `/shop`, 경제 → `/economy`("대시보드 · 창고 · 은행"), 시장 → `/market`("NPC 상점 · 거래소") | 188-232 |
| 산업·생산 | 1차 생산, 2차 가공, 2차 조립, 연구, 유닛 생산 → `/buildings?category=…`. 건물이 없으면 흐리게 보이고 필요한 건물을 알려 준다 | 237-297 |
| 사회 기반 | 영토 거점, 군사, 주거, 종교, 물자 보관, 운송 물류, 공공 시설. 방식은 위와 같다 | 302-386 |
| 건물 관리 | [내 건물] 펼치기: 전체 건물 관리 → `/buildings`, 분류마다 건물 3개 → `/buildings/:id`, "+N개 더보기"(누를 수 없음) | 391-466 |
| 시스템 | 피드백 리포트(창), 설정 → `/settings`, (관리자만) 관리자 → `/admin`, 월드 에디터 | 471-508 |
| 테마 | 테마 고르기 격자, 설정(두 번째) | 513-564 |
| — | 로그아웃(저장소만 지움) | 566-577 |
- 줄 수: 일반 항목 14개(관리자 전용 2개와 중복된 설정 1개 포함), 건물 분류 12개, 펼치기 1개, 로그아웃 1개. 일반 유저는 26줄, 관리자는 28줄이다. 묶음 머리글은 7개다.
- 건물 분류 메뉴는 옛 설계의 원칙 "기능은 건물에서 태어난다"를 따랐다(`docs/GDD/Building/archive/BLD-1_BuildingGated_Navigation.md:3-6`). 설계는 "건물이 있을 때만 보인다"였지만, 구현은 늘 보이게 하고 흐리게만 처리했다(`SystemMenu.tsx:657-693`).
- 지금 어느 화면인지는 각 화면이 `activePage` 값으로 넘겨 준다(18). 현재 항목 옆에는 글자 "(ACTIVE)"를 붙인다(631).

### 4.3 접는 사이드 메뉴는 관리자 쪽에만 있었다
- `components/admin/ManageSidebar.tsx`
  - 폭 768px 이상: 붙박이 메뉴. 접으면 넓은 판(`w-64`)이 아이콘 줄(`w-16`)이 된다(184-195).
  - 768px 미만: 왼쪽 위 ☰, 덮는 판과 어두운 배경, 화면을 옮기면 저절로 닫힘(136-180, 54-56).
- D-6004의 "태블릿은 기존처럼 접었다 편다"에 맞는 옛 모습은 이 관리자 메뉴다. 플레이어용 `SystemMenu`는 폭과 상관없이 왼쪽 위 버튼으로 여닫는 펼침 판이었다. 기획의 해석("폭에 따라", 02_Decision_Log.md:4478)과는 부딪치지 않는다.
- 약점 두 가지:
  - 폭을 JS로 잰다(46-51). 그래서 첫 그림에서 휴대폰에도 데스크톱 모양이 잠깐 보일 수 있다(Assumed).
  - 접은 상태를 저장하지 않는다(39).

## 5. 새 기획 메뉴와의 대응

### 5.1 메뉴 항목 (D-6004, D-6008, D-6010)
| 새 항목 | 옛 `terra-client` | 옛 `terra-lite` | 메모 |
|---|---|---|---|
| 홈 | `/dashboard`(카드 7개 + 경고 줄) | `/` 홈(카드 4개) | 경고 줄은 처리함 맨 위로 간다. 세력 카드는 새로 만든다 |
| 지도 | `/pixi-map`(2차맵 ↔ 1차맵), `/battle/[id]` | `/map`, `/explore` | 옛 2차맵에는 메뉴가 없었다. 새 C 배치에서는 가운데 큰 버튼이다 |
| 유닛(직무·파티) | `/units`, `/party`, 경제의 [직무 배정] 탭, 메뉴의 [유닛 생산] | `/character`(유닛 목록이 여기 있음) | 세 곳을 한 곳으로 모은다 |
| 경제(창고·거래·운송) | `/economy`(창고·은행·금고·경매·주식), `/market`(교역소·상점·거래소·시세), 메뉴의 [물자 보관]·[운송 물류] | `/market`, `/more/trade`, `/more/logistics`(경로 없음) | 두 곳에 나뉜 거래를 하나로 모은다. 직무 배정은 유닛으로 옮긴다 |
| 세력(도시·외교·전쟁) | `/faction`(7탭, 영토 건물이 없으면 통째로 잠김), 메뉴의 [영토 거점]·[군사]·[주거]·[종교]·[공공] | `/faction` | 잠그지 않는다. 도시 없는 세력과 가문이 있다(60_UX_FTUE.md:193) |
| 사이보그(내 본체) | `/character`(사이보그·스킬·소지품), 무게·슬롯 칩 → 소지품 | `/character`, `/inventory`, `/craft` | 위 띠의 얼굴을 눌러 연다(D-6010) |
| 위 띠: 알림(종) | 없음. 경고 줄은 대시보드에만 있었고, 알림 수단이 3가지였으며, `NotificationCenter`는 쓰이지 않았다 | 실시간 사건 → 잠깐 뜨는 알림 | 처리함 + 푸시(D-6011) |
| 위 띠: 우편 | 위 줄의 우편함 버튼과 배지 | `/more/mail` | 옛날과 자리가 같다 |
| ☰ 사이드 메뉴 | [SYSTEM ACCESS] 펼침 메뉴 26줄. 버튼은 대부분 왼쪽 위에 있었다 | `/more` 15줄 | 항목 목록 하나에서 만든다. C 배치의 ☰ 자리(왼쪽 위)와 옛 습관이 같다(Assumed) |
| (메뉴 밖) 건물 | `/buildings`, `/buildings/[id]`, 메뉴 13줄, 카드 ⑦ | `/buildings` | 새 메뉴에 건물 항목이 없다. 세력(도시)이나 지도(거점) 안에 들어갈 것으로 보인다(Assumed, 기획 확인 거리) |
| (메뉴 밖) 상점 | `/shop`, 도시화폐 칩 | `/more/shop`(경로 없음) | BM은 Step 7에서 다룬다 |
| (메뉴 밖) 랭킹·연대기 | 없음 | `/more/ranking` | D-6010: 랭킹은 사이보그·세력 화면 안, 연대기는 대시보드 위젯이나 처리함 안 |
| (메뉴 밖) 설정·로그아웃 | 메뉴의 [설정] 두 줄, 테마 격자, 로그아웃 | `/settings`, 더보기의 로그아웃 | 새 앱에는 설정 화면이 이미 있다 |
| (메뉴 밖) 관리자 | `/admin`(사이드 메뉴 2개), 대시보드의 관리자 칸 | — | 새 앱: 따로 불러오는 관리자 화면, 권한은 서버가 확인 |
| (메뉴 밖) 피드백 | 메뉴의 [피드백 리포트] 창 | — | D-6010 항목에 없다. 설정 안 같은 곳에 둘 수 있다(Assumed) |

### 5.2 처리할 일(D-6006) ↔ 옛 경고
| 새 분류 | 새 항목 | 옛 것 | 근거 |
|---|---|---|---|
| 위협 | 웨이브·공성·습격 | 없음 | — |
| 돈·생존 | 유지비 부족 | 경고 줄의 "유지비 위험·부족"(3일·7일), 카드 ⑤의 "보증금 7일 미만!" | StatusAlertBanner 111-124, dashboard 614-619 |
| 돈·생존 | 부상 유닛 | 유닛 화면의 "부상 유닛" 수와 경고 | `components/units/UnitsOverviewDashboard.tsx:166, 355` |
| 돈·생존 | 곧 썩는 물건, 대출 만기 | 없음 | — |
| 멈춤 | 직무 없는 유닛 | 유닛 화면의 "대기 유닛 일괄 배치 (N)"(대기가 있으면 강조) | units 261-268 |
| 멈춤 | 가득 찬 창고 | 카드 ⑥ 막대가 90%를 넘으면 빨강 | dashboard 646-649 |
| 멈춤 | 멈춘 건물·도로, 재료 없는 시설, 오프라인 24시간 | 없음(카드 ⑦은 가동 수만 보임) | — |
| 제안·결정 | 주문 체결·만료 | `terra-lite`의 실시간 알림 "주문 체결"(잠깐 뜨는 알림뿐) | `terra-lite/src/pages/HomePage.tsx:106-108` |
| 완료 | 생산·제작 완료 | 경고 줄의 "생산 완료 N건 대기", 카드 ④의 [COLLECT ALL] | StatusAlertBanner 126-135, dashboard 554-566 |
| (새 목록에 없음) | — | 과적·슬롯, 안드로이드 배터리, 수명 임박 | StatusAlertBanner 70-109, UnitsOverviewDashboard 339-347 |

### 5.3 대시보드 카드 ↔ D-6001의 요약 대상
| D-6001 | 옛 카드 |
|---|---|
| 내 사이보그 | ① |
| 보유 유닛 | ⑤와 유닛 화면 요약(총·가동·대기·부상, UnitsOverviewDashboard 163-166) |
| 자산 | ②, ⑥, 맨 위 금액 알약 |
| 세력 | 없음. 새로 만든다(내용은 Step 4-6 뒤, 60_UX_FTUE.md:193) |
| 그 밖의 카드 후보 | ③ 시세, ④ 생산, ⑦ 건물 |

## 6. 살릴 아이디어 (생각만 가져오고 코드는 쓰지 않는다)
1. **로그인 → 홈.** 옛 앱도 다시 오는 유저를 대시보드로 보냈다(login 147, tutorial 133). 사용자 요구와 같다. 새 유저 흐름의 끝은 6-6에서 정한다.
2. **경고 줄의 접은 모양을 처리함에 쓴다.** 한 줄, "+N", 펼치기, 항목마다 이동 버튼(StatusAlertBanner 154-238)이다. 항목 모양 `{id, 종류, 제목, 설명, 이동}`(17-24)은 D-6006의 데이터(분류·순위·문구 키·이동할 화면)와 거의 같다. 바꿀 점은 세 가지다. 서버가 목록을 만들고, 문구는 메시지 키로 쓰고, (분류, 마감) 순으로 정렬한다.
3. **처리함이 비었을 때 한 줄로 알린다.** 옛 "모든 시스템 정상"(142-151)이 그 예다. D-6006은 빈 목록의 모습을 정하지 않았다.
4. **카드 하나 = 요약 + 바로 처리 1개 + 상세 링크.** 카드 ④의 [COLLECT ALL](560-565)과 카드마다 붙은 [상세]·[관리]·[시장]·[전체보기](429, 475, 589, 633, 698)가 그 예다. D-6015(바로 처리 버튼 + 상세는 해당 화면)와 같다.
5. **카드 안의 기준선 경고.** 보증금 7일 미만(457-459, 614-619), 창고 70%·90% 색(646-649)이 그 예다. 서버가 처리할 일을 만드는 규칙의 후보가 된다. 수치는 기획에서 정한 것만 쓴다.
6. **빈 카드에는 할 일과 갈 곳을 적는다.** "생산 건물을 건설하세요"(571), "Pixi 맵에서 건설하세요"(743)가 그 예다.
7. **유닛 화면의 요약 한 줄과 일괄 명령.** "N유닛 등록 · M가동 · K대기"(units 215)와 [전체 휴식], [대기 유닛 일괄 배치 (N)](228-270, 대기 유닛이 있으면 강조)가 있었다. D-6016의 다중 선택, D-6015의 자동 배치와 맞는다.
8. **메뉴 항목 아래 한 줄 설명과 숫자 배지.** "대시보드 · 창고 · 은행"(219), "NPC 상점 · 거래소"(231), 세력 배지(197)가 그 예다. 새 메뉴에서는 "유닛 — 직무·파티"처럼 하위 영역을 보여 줄 수 있다. 배지는 그 메뉴에 걸린 처리할 일 수로 쓸 수 있다(Assumed).
9. **잠긴 기능은 숨기지 않고 안내한다.** 필요한 건물 이름과 [건물 관리로 이동] 버튼을 보여 주었다(SystemMenu 689, `components/BuildingRequiredCard.tsx:65`). 무엇이 필요하고 어디로 가면 되는지 알려 주는 방식이다. 열지 말지는 서버가 판단한다.
10. **우편은 위 줄에 둔다.** 버튼과 안 읽은 수 배지(99+)(Mailbox 282-297)다. D-6010의 위 띠와 같다.
11. **바로 가는 주소.** `/pixi-map?x&y&targetX&targetY&action`, `/economy#탭`, `/character?tab=`, `/buildings?category=`, `/battle/:id`가 있었다. 처리할 일을 눌러 해당 화면으로 갈 때와 푸시를 눌러 화면을 열 때 필요하다(9장).
12. **관리자 사이드 메뉴의 폭별 동작**(4.3). D-6004와 같은 층 구조다. 폭 판정은 CSS로 하고, 접은 상태는 저장하면 된다.
13. **화면마다 로딩·오류 자리를 둔다.** 옛 경로마다 `loading.tsx`·`error.tsx`가 있었다. 새 앱의 `LazyView`(`apps/game/src/App.tsx:66-80`)가 같은 일을 하니 새 탭 화면에도 쓴다.
14. **화면 이동 기록.** `useNavigationLog`(14-40)가 있었다. D-6005(템플릿을 보며 바꿔 감)를 판단할 자료로, 화면 열림과 바로 처리 버튼 사용을 원격 측정에 남길 수 있다(Assumed).
15. **비교 화면.** 관리자 화면에 "UI 프리셋 비교"가 있었다(디자인 9개 × 화면 3개 × PC·휴대폰, `app/admin/manage/ui-presets/page.tsx:7-36`). D-6005의 "프로토타입에서 템플릿 바꿔 보기"의 선례다.
16. **`terra-lite`에서 가져올 것.**
    - 화면 틀을 한 곳에서 그렸다(App 45-56).
    - 저장해 둔 값을 먼저 보이고 새로 받았다(HomePage 45-53).
    - 실시간 사건이 오면 알림을 띄우고 다시 받았다(98-113).
    - 더보기를 묶음으로 나눴다(MorePage 35-71).
    - Lite의 5탭(홈·캐릭터·맵·시장·더보기)은 새 A 배치(홈·지도·유닛·경제·☰)와 꼴이 같다.

## 7. 피할 것
1. **화면 틀이 없었다.** 화면 13곳이 메뉴를 직접 그렸고 자리가 제각각이었다.
   - 대시보드: 맨 위 줄(dashboard 292)
   - 캐릭터·시장·파티·상점·건물: `absolute top-4 left-4`(character 186, market 648, party 416, shop 62, buildings 231, buildings/[id] 328)
   - 유닛: 고정 머리 안(units 201-204)
   - 경제·세력: 맨 위(economy 120, faction 36)
   - 2차맵: 없음

   결과: 화면을 옮길 때마다 메뉴가 새로 만들어졌다. 그때마다 건물·우편·상태를 다시 불렀다(useBuildingSummary 44-46, Mailbox 166-171). 안 읽은 우편이 있으면 "환영합니다" 알림도 매번 다시 떴다(Mailbox 48, 126-139, Assumed). 새 앱에서는 `App` 한 곳에 위 띠·하단 탭·사이드 메뉴를 두고, 지금 화면은 화면 상태에서 정한다.
2. **메뉴가 너무 길었다.** 26줄에 테마 격자와 건물 목록까지 들어 있었다. 설정이 두 번 나오고(483-489, 559-564), 관리자·개발 항목이 섞였다(491-508). 새 기획의 6항목(D-6008)으로 충분하다. 건물 분류는 메뉴가 아니라 화면 안에 둔다.
3. **메뉴 목록이 둘이었다.** `terra-client`의 펼침 메뉴와 `terra-lite`의 하단 탭·더보기가 따로 있었다. 안 읽은 우편의 기준도 달랐다(`is_claimed`, Mailbox 125 / `is_read`, lite HomePage 84). Lite에는 경로 없는 링크가 4개 있었다(2.6). 새 앱은 항목 목록 하나만 둔다(D-6004 기술 전달). 각 항목을 실제 화면 ID와 묶으면, 없는 화면을 가리킬 때 타입 검사에서 걸러 낼 수 있다(Assumed).
4. **같은 기능이 여러 곳에 있었다.**
   - 직무 배정은 경제 탭(economy 27), 유닛은 `/units`, 파티는 `/party`에 있었다.
   - 거래는 시장(교역소·NPC 상점·종합 거래소)과 경제(경매소·주식) 두 곳에 있었다(market 142-147, economy 30-31).
   - 경제 안 "대시보드" 탭이 대시보드 데이터를 다시 불렀다(EconomyDashboard 106-111).
   - 카드 3개와 경고 3종이 모두 그냥 `/economy`로 갔다.
   - 창고 탭은 보관 건물이 있어야 열리는데(economy 160), 카드 ⑥은 조건 없이 보였다.

   새 기획에서는 유닛이 직무·파티를, 경제가 창고·거래·운송을 맡는다.
5. **게임 사실을 기기에서 계산했다.** 새 규칙(서버 권위, 금액은 최소 단위 정수)과 어긋난다.
   - 금액을 실수로 g 환산(dashboard 277-278)
   - 도시화폐 합산 추정(271)
   - 보증금이 버틸 날 수(321-325, 607)
   - 배치된 유닛 수(196-198)
   - 경고 목록(StatusAlertBanner 64-135)
   - 장비 값 추정(UnitsOverviewDashboard 17-25)
   - 시작 위치를 `Math.random`으로 정하고 이동 명령을 보냄(pixi-map 143-190)
   - 첫 스탯 굴림(create-character 16-17, 48)
   - 게임 시각을 벽시계로 셈(pixi-map 103-105)
   - 기능 잠금 판단(BuildingRequiredCard 79-117)
6. **요청이 많고 주기 요청이 겹쳤다**(3.4). 새 앱은 서버가 계정마다 만든 처리할 일과 요약을 한 번에 받고, 바뀐 것은 WebSocket으로 받는 쪽이 맞다(D-6006, D-6014).
7. **데스크톱을 먼저 생각한 부분이 많았다.**
   - 마우스를 올려야 뜨는 설명(GlobalStatusBar 375-376, 399-400). 늘 그리게 만든 `(isVisible || true)`(43)도 남아 있다.
   - 휴대폰에서 숨는 경고 버튼과 설명(StatusAlertBanner 166, 181)
   - 휴대폰에서 아이콘만 남는 7탭(economy 145)
   - `max-w-[1600px] px-6`(units 202, 223)
   - 튜토리얼 문구 "마우스로 클릭"(SecondaryMapView 2858)
   - 카드를 3D로 기울이는 효과(lite HomePage 152, 227)
   - 8~10px 글자(대시보드에만 39번)

   다만 대시보드 격자 자체는 1열에서 시작해 휴대폰에 맞았다(331).
8. **글자와 색을 코드에 직접 썼다.** 한국어·영어를 섞은 문구("대시보드 (OVERVIEW)" 151, "COLLECT ALL" 564), 이모지 아이콘(dashboard 64-67, SystemMenu 23-37), 색 이름 클래스와 rgba 값(GlobalStatusBar 56-69)이 그 예다. 새 규칙은 메시지 키와 디자인 토큰이다.
9. **개발용 정보가 플레이어 화면에 있었다.** 운영·시험 DB 상태 배지(SystemMenu 115-116), 플레이어 대시보드의 관리자 단축(748-767), Lite의 서버 고르기(MorePage 67)가 그 예다. 새 앱은 성능 표시와 관리자 화면을 따로 둔다.
10. **로그인 확인을 화면마다 따로 했다.**
    - 저장소 값 `terra_user_id`를 55곳에서 직접 읽었다.
    - 3시간 만료는 대시보드와 상점에만 있었다(dashboard 90-95, shop 24-38).
    - 경제·세력은 로그인 화면으로 보내지 않고 "로그인이 필요합니다"만 보였다(economy 112, faction 28).
    - 역할도 저장소에서 읽었다(SystemMenu 59, admin/layout 16-21).
    - `fetch`를 두 번 덮어썼다(`components/FetchInterceptor.tsx:11-41`, admin/layout 27-46).
    - 토큰이 없으면 `x-user-id` 머리글로 대신했다(admin/layout 40).
    - 서버 주소를 코드에 박았다(FetchInterceptor 23).
    - 로그아웃은 저장소만 지웠다(SystemMenu 571).

    새 앱은 세션 상태 하나(`apps/game/src/App.tsx:84, 128-137`)를 그대로 쓴다.
11. **화면을 통째로 잠갔다.** 영토 건물이 없으면 세력 화면 전체가 잠겼다(faction 45-47). 새 기획에는 도시 없는 세력과 가문이 있으므로 세력 탭을 잠그지 않는다.
12. **지도에서 길을 잃기 쉬웠다.** 1차맵·2차맵 전환이 주소에 남지 않았고(pixi-map 62), 2차맵에 메뉴가 없었다. "대시보드로" 버튼은 1차맵을 열었다(2.3). 새 앱도 지금은 지도가 화면 전체를 덮고 계정 줄을 내린다(`apps/game/src/App.tsx:169-178`). 지도 탭에서도 홈과 다른 탭으로 가는 길을 남겨야 한다.
13. **한 파일에 몰아넣었다(거대 컴포넌트).** 2차맵 4,426줄, 시장 1,374줄, 1차맵 1,265줄, 파티 1,014줄, 대시보드 797줄(데이터 9곳 + 카드 8개), 메뉴 697줄이다. 1,000줄이 넘는 파일이 22개였다. 새 규칙은 600줄에서 경고, 1,000줄에서 실패다(AGENTS.md 4장). 카드는 카드 ID로 등록하는 모듈로 나누고, 화면 틀의 부품도 따로 둔다.
14. **알림 수단이 셋이었다.** `ToastContext`·`ToastSystem`, `react-hot-toast`(layout 22-29, 43-48), 유닛 화면 전용 알림(units 286-297)이다. 새 앱은 `LiveMessage` 하나로 통일한다.
15. **문서와 코드가 어긋났다**(2.7). 계획 문서에는 "완료"로 적었지만 실제로는 없는 푸시도 있었다(9장). 새 앱은 메뉴 항목과 카드 목록을 데이터로 두고, 문서는 그 데이터를 가리키게 한다.
16. **첫 접속 중에도 전체 메뉴가 보였다.** 캐릭터 만들기 화면에 메뉴가 있었다(create-character 197-198). 첫 단계가 끝날 때까지 화면 틀을 줄일지는 6-6에서 정할 거리다(Assumed).
17. **화면 방향을 세로로 고정했다**(Lite manifest 9). D-6002는 지도·전투를 가로로 권장할 뿐 강제하지 않는다. 새 PWA ADR도 `orientation: any`다(`docs/adr/2026-10-28-pwa-and-browser-baseline.md:51`). 고정하지 않는다.

## 8. 새 기술 전달 항목(60_UX_FTUE.md:175-184)과 옛 선례
| 전달 항목 | 옛 선례 | 차이 |
|---|---|---|
| 대시보드 카드 = 데이터 목록, 유저별 선택·순서 저장 (D-6001) | 카드 7개를 `JSX`에 박아 둠(dashboard 333-746). 저장 없음 | 새로 만든다 |
| 템플릿을 ID로 바꿔 보기 (D-6005) | 관리자의 UI 프리셋 비교 화면 | 대시보드 템플릿 비교는 없었다 |
| 처리할 일 = 서버가 만든 목록, (분류, 마감) 정렬 (D-6006, D-6009) | 기기에서 만든 경고 4종, 넣은 순서대로 | 서버로 옮기고 정렬한다 |
| 메뉴 항목 목록 하나 → 사이드 메뉴와 하단 탭, 폭별 동작, 유저 설정 (D-6004, D-6007, D-6008) | 펼침 메뉴(`terra-client`)와 하단 탭(`terra-lite`)이 따로 있었다. 폭별 동작은 관리자 사이드 메뉴에만 | 하나로 합친다 |
| 위 띠 = 사이보그 얼굴·알림·우편 (D-6010) | 위 줄 = 메뉴 버튼·우편·DB 배지·칩 3개 | 우편만 이어진다. 얼굴과 종은 새로 |
| 웹 푸시, 분류별 설정, 묶기, 방해 금지 (D-6011, D-6012) | 진짜 웹 푸시가 없었다(9장) | 새로 만든다 |
| 오프라인 24시간 끝 푸시, 복귀 요약 API (D-6013, D-6014) | 없음(생산물 받기만 있었다) | 새로 만든다 |
| 처리할 일마다 바로 처리 + 이동할 화면 (D-6015) | [COLLECT ALL] 하나. 이동은 모두 `/economy` | 종류마다 정한다 |
| 유닛 자동화 (D-6016) | 일괄 휴식·충전·먹이·배치(units 228-270), 서버 `WorkerBrain`·`FatigueEngine`(60_UX_FTUE.md:133) | 프리셋, 반복 예약, 관리인은 없었다 |
| 화면 방향 (D-6002) | `terra-client`에서는 방향 안내를 찾지 못함. `terra-lite`는 세로 고정 | 고정하지 않고 안내만 |

## 9. 새 앱의 지금 상태와 연결점 (S2 반영)
- `apps/game/src/App.tsx`는 주소나 라우터 없이 상태 값으로 화면을 바꾼다(1-5, 29-33, 117-165).
- 계정 줄(`apps/game/src/auth/AccountBar.tsx:36-77`)의 구성: 로그인 아이디, [1차맵], [2차맵], [관리자], [설정], [로그아웃]. 지도 버튼 둘은 임시이며, "지도" 탭이 생기면 지운다고 적혀 있다(App.tsx:24, AccountBar.tsx:15-18, 44).
- 설정 저장: 테마·언어를 기기와 계정에 맞추는 장치가 이미 있다(`apps/game/src/settings/settings.ts:1-7`, `accountSync.ts:1-3`, tRPC `settings.get`·`settings.set`). D-6007의 탭 배치 저장("테마·언어 저장 방식과 같게")에 그대로 쓸 수 있다(Assumed).
- 화면 주소:
  - PLAN 기술표에 TanStack Router 1.170.x가 있다(`docs/PLAN.md:74`). 게임 앱 `package.json`에는 아직 없다(Verified).
  - 주소가 필요한 곳: 처리할 일의 "이동할 화면"(D-6006), 푸시를 눌렀을 때 여는 화면(D-6011).
  - 라우터를 넣으면 새 런타임 의존성이므로 ADR과 사용자 승인이 필요하다. 의존성 없이 옛 `/economy#탭`처럼 해시 주소로 시작하는 길도 있다.
- 웹 푸시:
  - PWA ADR은 웹 푸시를 넣을 때 서비스 워커 방식을 다시 본다고 적었다(`docs/adr/2026-10-28-pwa-and-browser-baseline.md:61, 80`).
  - 옛 프로젝트에는 진짜 웹 푸시가 없었다(Verified). `lib/pushManager.ts`에는 권한 요청과 화면 알림만 있다(16행 "실제 구현 시…"). `components/common/NotificationCenter.tsx`는 어디서도 불러 쓰지 않는다. `terra-lite/public/sw.js`에는 `install`·`activate`·`fetch` 처리만 있다.
  - 그런데도 Lite 계획 문서는 푸시를 "✅ 완료"로 적었다(`docs/Projects/terra-lite/TERRA_LITE_PLAN.md:341`).

## 10. 확인하지 못한 것
- 옛 앱을 띄워 보지 않았다(미실행). 390px 폭에서 위 줄(메뉴 버튼, 우편, DB 배지, 칩 3개)이 넘치는지는 모른다(Unknown). `SystemMenu.tsx:102`가 줄바꿈 없는 가로 줄이어서 넘칠 수는 있다(Assumed).
- 화면을 옮길 때 "환영합니다" 알림이 다시 뜨는지, 과적 요청 실패 때 경고 줄이 사라지는지는 코드로만 짐작했다(Assumed).
- 기기가 한 판단(건물 잠금, 스탯 굴림, 시작 위치)을 옛 서버가 다시 검사했는지는 읽지 않았다(Unknown).
- `EconomyDashboard`, `FactionPanel` 하위 패널, `MinionGallery`는 머리글과 요청만 보고 내용은 자세히 보지 않았다.

## 11. 읽은 파일 (절대 경로)
옛 `terra-client`:
- /home/user/AntiGravt01/CLAUDE.md
- /home/user/AntiGravt01/terra-client/src/app/layout.tsx
- /home/user/AntiGravt01/terra-client/src/app/page.tsx
- /home/user/AntiGravt01/terra-client/src/proxy.ts
- /home/user/AntiGravt01/terra-client/src/app/login/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/create-character/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/tutorial/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/dashboard/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/character/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/units/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/party/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/economy/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/market/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/faction/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/buildings/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/pixi-map/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/battle/[sessionId]/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/shop/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/settings/page.tsx
- /home/user/AntiGravt01/terra-client/src/app/admin/layout.tsx
- /home/user/AntiGravt01/terra-client/src/app/admin/manage/layout.tsx
- /home/user/AntiGravt01/terra-client/src/app/admin/manage/ui-presets/page.tsx
- /home/user/AntiGravt01/terra-client/src/components/SystemMenu.tsx
- /home/user/AntiGravt01/terra-client/src/components/StatusAlertBanner.tsx
- /home/user/AntiGravt01/terra-client/src/components/GlobalStatusBar.tsx
- /home/user/AntiGravt01/terra-client/src/components/Mailbox.tsx
- /home/user/AntiGravt01/terra-client/src/components/DbStatusBadge.tsx
- /home/user/AntiGravt01/terra-client/src/components/BuildingRequiredCard.tsx
- /home/user/AntiGravt01/terra-client/src/components/FetchInterceptor.tsx
- /home/user/AntiGravt01/terra-client/src/components/NavigationLogger.tsx
- /home/user/AntiGravt01/terra-client/src/components/tutorial/InGameTutorial.tsx
- /home/user/AntiGravt01/terra-client/src/components/admin/ManageSidebar.tsx
- /home/user/AntiGravt01/terra-client/src/components/admin/EditorSidebar.tsx
- /home/user/AntiGravt01/terra-client/src/components/units/UnitsOverviewDashboard.tsx
- /home/user/AntiGravt01/terra-client/src/components/faction/FactionPanel.tsx
- /home/user/AntiGravt01/terra-client/src/components/economy/EconomyDashboard.tsx
- /home/user/AntiGravt01/terra-client/src/components/SecondaryMap/SecondaryMapView.tsx
- /home/user/AntiGravt01/terra-client/src/components/WorldMap/viewer/PixiMapViewer.tsx
- /home/user/AntiGravt01/terra-client/src/components/common/NotificationCenter.tsx
- /home/user/AntiGravt01/terra-client/src/lib/pushManager.ts
- /home/user/AntiGravt01/terra-client/src/hooks/useBuildingSummary.ts
- /home/user/AntiGravt01/terra-client/src/hooks/useNavigationLog.ts

옛 `terra-lite`와 문서:
- /home/user/AntiGravt01/terra-lite/src/App.tsx
- /home/user/AntiGravt01/terra-lite/src/components/layout/BottomNav.tsx
- /home/user/AntiGravt01/terra-lite/src/components/layout/TopBar.tsx
- /home/user/AntiGravt01/terra-lite/src/pages/HomePage.tsx
- /home/user/AntiGravt01/terra-lite/src/pages/MorePage.tsx
- /home/user/AntiGravt01/terra-lite/public/manifest.json
- /home/user/AntiGravt01/terra-lite/public/sw.js
- /home/user/AntiGravt01/docs/Projects/terra-lite/TERRA_LITE_PLAN.md
- /home/user/AntiGravt01/docs/GDD/Building/archive/BLD-1_BuildingGated_Navigation.md

새 저장소:
- /home/user/terra-in-cognita/docs/design/60_UX_FTUE.md
- /home/user/terra-in-cognita/docs/design/02_Decision_Log.md (4416-4645행, D-6001~D-6016)
- /home/user/terra-in-cognita/docs/PLAN.md
- /home/user/terra-in-cognita/docs/adr/2026-10-28-pwa-and-browser-baseline.md
- /home/user/terra-in-cognita/apps/game/src/App.tsx
- /home/user/terra-in-cognita/apps/game/src/auth/AccountBar.tsx
- /home/user/terra-in-cognita/apps/game/src/settings/settings.ts
- /home/user/terra-in-cognita/apps/game/src/settings/accountSync.ts

조사하며 옛·새 저장소의 파일은 고치지 않았다.
