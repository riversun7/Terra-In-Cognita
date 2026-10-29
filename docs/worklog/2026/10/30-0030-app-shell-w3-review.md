# 앱 뼈대 W3 검토 반영: 바로 처리 결과 자리, 모르는 분류·종 배지, 멈춘 조각 받기, 요청 묶음, 화면 이동, 마감 내림, 강조 줄 알림

- 일시: 2026-10-30 00:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 1·2·6·7·8·10·11절과 "구현하며 정한 것 (0단계)", 작업 기록 `29-2240-app-shell-w3.md`(검토한 W3, 이번에 고친 줄에 "검토 반영"을 적었다), W1 가지 `work/app-shell-w1` `571d8a9`(작업 기록 `29-2310-app-shell-w1.md`, main에 아직 없다), 기획 D-6009·D-6011·D-6014·D-6015·D-266(미러 `docs/design/02_Decision_Log.md`)
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-w3`, 가지 `work/app-shell-w3`. W3 끝 커밋 `5ea6c4c` 위에서 고쳤다. push·merge는 하지 않았다(통합 세션 몫). 화면 확인은 저장소 밖 복제본(W1 `571d8a9` + 이 가지 + 꽂는 줄 3개를 합친 것, 합치기는 그 복제본 안에서만)에서 했다.

## 한 일
- W3 검토 지적 12개(minor 9, nit 3)를 다시 확인했다(코드 읽기, 시험, W1+W3 복제본의 빌드한 앱·서버를 Playwright로 실행). 10개는 고쳤고, 1개(12)는 일부 고쳤으며(폭 경계 시험은 W1 몫), 1개(7, 시안 표시 둘)는 W3 쪽 코드가 기준이라 W4·통합 세션이 할 일로 적었다. 지적의 고침 안에서 다르게 한 곳은 아래 "고침 안과 다르게 한 것"에 적었다.
- 홈 자료 조회를 한 모듈 `net/homeQueries.ts`로 합쳤다(`inbox/inboxClient.ts`·`summary/summaryClient.ts`를 지움). 처리할 일 저장소와 복귀 요약 문이 같은 조각을 부르므로 로그인·켜기 때 `inbox.list`·`summary.get`이 한 HTTP 요청이다.
- 처리할 일 저장소: 다시 연결됐을 때 지난 5초 안에 시작한 받기가 있으면 다시 받지 않는다(로그인 직후 중복 없음). 요청 조각 받기가 멈춰도 10초에 실패로 끝낸다. 복귀 요약 문도 묻기를 10초까지만 기다린다.
- 처리할 일 목록: 모르는 분류의 줄을 "그 밖의 알림"으로 보이고 종 배지가 센다. 바로 처리 결과를 누른 줄 안에 보인다. `?item=` 강조 줄에 `aria-current`·숨은 글·초점 자리. 분류 묶음은 region이 아니다. 목록 CSS를 목록 부품이 가져온다.
- 앱 안 이동을 화면(`RouteTarget`)으로 받는다(`onNavigate`). W1 라우터의 `navigate`를 그대로 넘긴다. 쓰지 않게 된 `inbox_bell_count` 키를 지웠다(W1 `shell_alerts_count`가 맡는다).
- 마감 문구를 내림한다. 1분 안은 "1분 안에 마감".
- 시험 2개를 더했다: 홈 자료 조회 입력·출력 = 공용 타입(서버, 타입 검사), 첫 화면 모듈의 가져오기 규칙(기기, 소스 검사).
- `web-design-guidelines` 확인에서 영어 묶음 이름 "Other alerts"를 다른 분류 제목처럼 Title Case("Other Alerts")로 고쳤다.
- 작업 기록 `29-2240-app-shell-w3.md`: 메시지 키 수(37 → 35, 검토 반영 뒤 37), 꽂는 줄, W4가 쓸 것, 정한 것의 바뀐 줄, 함께 바꿀 파일(W2 겹침 없음, `summary.css` 폭 경계), 건드리지 말 것, 미검증 줄.

## 지적별 처리
| # | 지적(무게) | 처리 | 커밋 |
|---|---|---|---|
| 1 | 바로 처리 결과가 화면 밖에 생김(minor) | 고침. 맞음(Verified: 코드, 위 알림 영역). 버튼이 있는 줄마다 늘 그려 둔 알림 영역(role=status)을 버튼 아래에 두고 결과를 그 줄에 보인다. 처리함의 위 알림 영역·`onQuickAction` 칸을 지웠다. 화면 확인: 마지막 줄 [거절]의 결과가 위 띠 아래·하단 탭 위(390, 파스텔·다크, ko·en), 보낸 프레임 0 | `f9855c0` |
| 2 | 종 배지가 목록이 버린 분류를 셈(minor) | 고침(고침 안 중 권한 쪽: 목록이 보인다). 모르는 분류의 줄은 끝의 "그 밖의 알림" 하나에 그리고 배지가 센다(D-6011). 0 이하·정수가 아닌 수는 세지 않는다. 화면 확인: 바꿔치기한 `urgent_new` 줄이 보이고 배지 8 = 완료를 뺀 줄 수 | `3cb614b`, 영어 이름 `afb4d6c` |
| 3 | 멈춘 조각 받기 → 계속 불러오는 중(minor) | 고침. 맞음(Verified: 코드, 타이머가 신호만 끊음). 저장소는 끊김 신호와 load를 경주시키고, 복귀 요약 문은 10초까지만 기다린다. 신호를 듣지 않는 load 시험을 더했다. 화면 확인: `homeQueries` 조각을 멈추면 10.6~10.7초에 실패 + [다시 시도], 복귀 요약은 뜨지 않음 | `31b9e15` |
| 4 | 열 때 요청 묶음이 조각 받는 때에 달림, 로그인 뒤 `inbox.list` 두 번(minor) | 고침. `net/homeQueries.ts` 한 조각 + 다시 연결 5초 규칙. 화면 확인(로그인 admin·player, 쿠키로 켜기 admin): 세 경우 모두 `inbox.list`·`summary.get`이 한 요청, `inbox.list` 한 번 | `5908498` |
| 5 | `InboxList`가 CSS를 처리함 화면에 기댐(minor) | 고침. 맞음(Verified: 코드). `InboxList.tsx`가 `inbox.css`를 가져온다 | `caba2c2` |
| 6 | 꽂는 줄이 주소 글자 navigate, W1은 RouteTarget(minor) | 고침. 맞음(Verified: W1 `571d8a9` `routerStore.ts` `navigate(target, options)`, `AppLink to`). `onNavigate(target)`로 바꾸고 갈 화면이 없으면 `{ route: "inbox", search: { item } }`. `inbox_bell_count`를 지웠다. W1+W3 복제본에서 꽂는 줄이 타입 검사·린트·포맷·빌드를 통과했다. 분류 아이콘은 W1이 합쳐진 뒤 바꾼다(W3은 W1 파일을 못 가져온다) | `752ca0f` |
| 7 | 시안 표시가 둘(W3 localStorage, W4 sessionStorage)(minor) | 맞음(Verified: W4 `6e0e80c` `homePrefs.ts`). W3 코드는 바꾸지 않았다: 합치는 차례가 W3 → W4라 W3의 `inbox/preview.ts`(`usePreviewOn`·`setPreviewOn`, 이름·모양이 W4 것과 같다)가 기준이다. W4가 자기 표시를 지우고 이것을 쓴다. 저장 방식은 아래 "정한 것"(ADR로 옮길 것). W4 작업 트리의 커밋 전 파일(`source/standIn.ts`)이 이미 `terra.preview`를 따르고 있다(Assumed: 아직 커밋 전) | 이 기록 |
| 8 | 마감 문구가 남은 시간을 늘려 말함(minor) | 고침. 분·시간·날을 내림한다. 1분 안은 "1분 안에 마감"(새 키). 복귀 요약 길이는 지난 길이라 반올림을 두되 60분·48시간에서 다음 단위로 넘어간다. 화면 확인: 2.5일 "2일 후", 91분 "1시간 후", 59.5분 "59분 후", 30초 "1분 안에" | `38b6fec` |
| 9 | `?item=` 줄이 눈으로만 표시됨(minor) | 고침. `aria-current="true"`, 제목 앞 숨은 글 "찾는 항목:", 제목 id `inbox-highlight`. 처리함의 한 줄로 앱 안 이동하면 `focusId`로 그 제목에 초점(W1 라우터의 `focusId`). 화면 확인: 바로 연 주소의 이름 "찾는 항목: 명령 없는 유닛 6", 앱 안 이동 뒤 `document.activeElement.id` = `inbox-highlight` | `47e73a1` |
| 10 | 작업 기록의 키 수 틀림(nit) | 고침. 35개(`inbox_` 27, `summary_` 8), 검토 반영 뒤 37개(`inbox_` 29, `summary_` 8), 362개 키 | 이 기록 |
| 11 | region 표지 6개(nit) | 고침. 분류 묶음은 `div`(제목이 나눈다). 화면 확인: 처리함 region 1개 | `47e73a1` |
| 12 | 요청 타입·폭 경계·첫 화면 규칙을 시험이 안 봄(nit) | 일부 고침. 입력·출력 타입 시험(`homeInputs.test.ts`, 공용 타입이나 Zod에 칸을 더하면 실패하는 것을 확인), 첫 화면 가져오기 소스 검사(`firstScreen.test.ts`, `import { type X }`도 잡는 것을 확인). 폭 경계는 W1 `layout.test.ts`가 맡을 일이라 "함께 바꿔야 하는 파일"과 통합 메모에 적었다(W3은 W1 시험을 못 고친다) | `d32ceb8`, 이 기록 |

### 고침 안과 다르게 한 것
- 4: 고침 안 둘(한 조각, 다시 연결 건너뛰기)을 모두 했다. 건너뛰는 기준은 "받는 중이거나 데이터가 몇 초 안"이 아니라 "다시 연결된 때까지 지난 5초 안에 시작한 받기"다. 끊기기 전에 받은 목록은 끊긴 동안의 바뀜을 덮지 못하므로, 받은 시각이 아니라 요청을 시작한 시각으로 잰다(요청을 시작한 지 5초가 지난 뒤의 다시 연결은 다시 받는다, 받는 중이어도 끝난 뒤 한 번 더. 시험).
- 8: 두 단위 보기("2일 12시간") 대신 내림만 했다. 늘려 말하지 않는 것이 목적이고, 두 단위는 언어마다 문장 틀이 더 필요하다. 1분 안은 내림하면 "0분"이 되어 새 문구를 두었다.
- 1: 고침 안의 "화면에 붙은 토스트" 대신 "그 줄 안"을 골랐다. 홈(W4)의 카드에서도 같은 부품이 같게 동작하고, 앞으로 `inbox_action` 결과(성공·실패 코드)도 그 줄에 붙는다.

## 정한 것 (ADR 37·계획서가 정하지 않은 것. 통합 세션이 ADR "구현하며 정한 것"으로 옮긴다. `29-2240` 기록의 "정한 것"을 바꾼 것)
- 홈 자료 조회는 기기 모듈 하나(`apps/game/src/net/homeQueries.ts`)다. 처리할 일·복귀 요약·홈 카드(W4가 더함)가 같은 조각을 동적 `import()`로 불러, 같은 틱에 부른 조회가 HTTP 요청 하나가 된다. 첫 화면 모듈은 이 모듈에서 타입만 가져온다.
- 다시 연결됐을 때 다시 받기: 다시 연결된 때까지 지난 5초(`INBOX_RECONNECT_FRESH_MS`) 안에 시작한 받기(받는 중이거나 지금 목록을 받은 요청)가 있으면 건너뛴다. 마지막 받기가 실패였으면 다시 받는다. 받는 중인 요청이 5초보다 오래되었으면 끝난 뒤 한 번 더 받는다.
- 요청 끊기: 처리할 일은 10초(`INBOX_REQUEST_TIMEOUT_MS`, 조각 받기 포함), 복귀 요약 묻기도 10초(`SUMMARY_ASK_TIMEOUT_MS`). 넘으면 처리할 일은 실패 + [다시 시도], 복귀 요약은 이번에는 띄우지 않고 다음 물을 때 다시 묻는다.
- 모르는 분류(더 새 서버)의 줄은 분류 순서 끝의 "그 밖의 알림"(`inbox_group_other`) 한 묶음에 받은 차례로 보인다. 종 배지는 완료를 뺀 모든 분류(모르는 분류 포함)를 센다. 0 이하·정수가 아닌 수는 세지 않는다.
- 바로 처리 결과는 그 줄 안, 버튼 바로 아래의 알림 영역(role=status, 늘 그려 둠)이 보이고 읽는다. 줄마다 자기 결과다.
- 마감 문구는 내림한다: 1분 안 "1분 안에 마감", 1시간 안 분, 48시간 안 시간, 그 뒤 날. 복귀 요약 길이는 반올림하되 60분·48시간이 되면 다음 단위다.
- 앱 안 이동: 처리할 일·복귀 요약 부품은 화면(`RouteTarget`)을 `onNavigate(target, { focusId? })`로 넘긴다(W1 `navigate`와 같은 모양). 처리함의 한 줄(`/inbox?item=`)로 가면 `focusId: "inbox-highlight"`.
- `?item=` 강조 줄: 테두리 + `aria-current="true"` + 제목 앞 숨은 글 "찾는 항목:"(`inbox_item_opened`) + 제목 id `inbox-highlight`. 분류 묶음은 표지가 아니다(제목 h2·h3이 나눈다).
- 시안 자료 보기 표시는 하나다: W3 `inbox/preview.ts`, 기기 `localStorage` `terra.preview` = `{ v: 1, user }`. 켠 계정이 로그인해 있고 dev·admin일 때만 켜진다. 앱을 다시 켜도 남는다(켤 때 뜨는 복귀 요약을 시안 자료로 보려고. 세션 저장소면 홈 화면 앱을 닫았다 켜면 꺼진다). 켠 동안은 처리함에 "시험 자료를 보고 있습니다" 안내가 늘 보인다. W4의 세션 저장소 표시(`terra.home.preview`)는 쓰지 않는다.

## 꽂는 줄 (W1이 main에 합쳐진 뒤 통합 세션이 넣는다)
`29-2240` 기록의 "꽂는 줄" 절을 고친 판으로 바꿨다. 그대로 넣을 수 있는 패치(린트·포맷 통과)는 저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/shell-w3-fix/w3-plug-lines.patch`다(W1 `571d8a9` 기준, 이 세션 동안만 있다). 요약:
1. `shell/routeViews.tsx`: `InboxScreen` lazy 줄 → `../inbox/InboxScreen.tsx`, `case "inbox"` → `<InboxScreen itemId={match.search.item} onNavigate={navigate} headerEnd={<BackButton />} />`, 가져오기 `BackButton`·`navigate`.
2. `shell/TopBar.tsx`: `useAlertCount` 자리 → `useInboxBellCount()`(`../inbox/store.ts`).
3. `shell/Shell.tsx`: 끝 주석 → `<ReturnSummary onNavigate={navigate} />`, `NO_BADGES` → `const badges = useInboxMenuBadges();`(세 곳), `type MenuBadges` 가져오기 지움.

## 통합 세션 메모
- 합치기(W1 `571d8a9` + 이 가지, 복제본에서 실행): `apps/game/messages/ko.json`·`en.json`은 저절로 합쳐졌다(자리가 다르다). 겹친 것은 `docs/WORKLOG.md`뿐이다 → `pnpm docs:index`로 다시 만든다. W2(`b9b790d`)·W5(`14f2439`)와는 `docs/WORKLOG.md` 말고 겹치는 파일이 없다(Verified: `git diff --name-only`). W4(`6e0e80c`)와는 `messages`·`docs/WORKLOG.md`.
- 첫 화면 JS(빌드한 `index.html`의 모듈 + modulepreload, 파일마다 gzip -9 합, 같은 기계·같은 재는 법): W1만 122,576B(2파일, 날 401,129B), W1 + 검토 전 W3 124,766B(3파일), W1 + 이 가지 125,342B(5파일, 날 407,401B, `afb4d6c`와 같은 파일. 그 전 빌드는 125,345B). W1 기록의 상한 제안 130,576B 안이다. 파일 수가 는 것은 rolldown이 zod(`schemas`)·Paraglide 런타임(`runtime`)을 첫 화면과 지연 조각이 같이 쓰는 조각으로 뺀 것이다(소스 맵 확인, 왜 이번에 빼는지는 Unknown). 날 크기 차이는 검토 전 W3보다 +575B(저장소·복귀 요약 문의 끊기·다시 연결 코드).
- 첫 화면 소스 맵에 든 W3 모듈은 `inbox/preview.ts`·`inbox/store.ts`·`summary/summaryGate.ts`·`summary/ReturnSummary.tsx` 넷이고, `@trpc/client`·`net/api.ts`·`net/homeQueries.ts`·공용 `inbox.ts`·`dashboard.ts`·지연 조각 모듈은 없다(Verified: W1+W3 빌드).
- W4가 합쳐질 때: `homePrefs.ts`의 시안 표시를 지우고 `inbox/preview.ts`를 쓴다(이름·모양 같음). 홈 카드 조회 `loadCards(ids, preview)`를 `net/homeQueries.ts`에 더한다(같은 조각이어야 한 요청). 처리할 일 줄은 `InboxList`(`headingLevel={3}`, `onInboxScreen={false}`, `onNavigate={navigate}`)를 쓰면 마감 내림·모르는 분류·바로 처리 결과가 처리함과 같다. 고정 높이 카드 안에 `InboxList`를 두면 바로 처리 결과 상자만큼 줄이 커진다(넘침을 볼 것).
- W1의 `layout.test.ts`(폭 경계 CSS·JS 같음)에 `summary/summary.css`(37.5em)를 더한다. 루트 `vitest.config.ts` `css.include`에도 그 파일을 넣어야 `?raw`로 읽힌다.
- 통합 뒤 할 수 있는 것: `CategoryIcon` → W1 `Icon`(분류 ID와 같은 이름, "그 밖의 알림"은 `bell`), `followInApp`·`follow` → W1 `AppLink`(그때 `onNavigate` 칸을 지운다). W1 `ComingSoon.tsx`의 `inbox` 줄은 쓰이지 않게 된다.
- W5가 합쳐지면 아래 화면 확인 35개를 `e2e/inbox.spec.ts`로 옮긴다(저장소 밖 스크립트 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/shell-w3-fix/e2e/fix.cjs`).

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`)
| 명령·확인 | 결과 |
|---|---|
| `TEST_DATABASE_URL=… pnpm check`(커밋 `d32ceb8`과 같은 파일, 부하 평균 약 7~8, 1분 52초) | 포맷·린트·타입·경계·크기·다국어 362개 키·대비 136쌍(화면 CSS 10개)·콘텐츠 `core@2 (14495d30db2e)` 통과, 시험 파일 154개·시험 1,392개 통과(DB 포함). `afb4d6c`(영어 문구 한 줄) 뒤 `pnpm check:i18n` 통과, 이 기록을 커밋하기 전 트리에서 `pnpm check`를 다시 돌렸다(다음 줄 "마지막 확인") |
| 마지막 확인: `TEST_DATABASE_URL=… pnpm check`(코드 `afb4d6c` + 이 기록·목차, 부하 평균 약 5~6, 1분 22초) | 위와 같이 모두 통과(시험 파일 154개·시험 1,392개, 다국어 362개 키) |
| 코드 커밋마다(`5908498`~`d32ceb8` 9개) 게임 앱 타입 검사 + W3 기기 시험 | 모두 통과(`d32ceb8`는 서버 타입 검사도). 마지막 코드 트리는 `pnpm check`를 통과한 트리와 바이트까지 같다(파일마다 `cmp`) |
| W3 시험 파일 16개 | 118개 통과(검토 전 14개 97개): 기기 74(목록 7, 첫 화면 가져오기 7, 문구·링크·마감 12, 시안 표시 3, 바로 처리 4, 저장소 17, 조회 오류 8, 복귀 요약 문 12, 복귀 요약 문구 4), 서버 44(서버 카드 4, 홈 자료 HTTP 8, 정렬·묶기 13, 시안 자료 6, 등록부 7, 복귀 요약 3, 입력·출력 타입 3) |
| 새 시험이 어긋남을 잡는지 | 공용 `InboxListRequest`에 칸을 더함 → 타입 검사 실패, `dashboard.ts` Zod에 칸을 더함 → 실패, `store.ts`의 `import type`을 `import { type … }`로 → 첫 화면 시험 실패(되돌림) |
| 꽂는 줄(W1+W3 복제본) | 게임 앱 타입 검사·oxlint(`--deny-warnings`)·Biome 포맷·전체 빌드 통과 |
| 화면 확인(저장소 밖 Playwright 1.63.0 + Chromium, W1+W3 복제본의 빌드한 앱 + 빌드한 서버 `127.0.0.1:4731`, 가짜 계정 `fake_w3fix_*`) | 35개 모두 통과(마지막 실행은 `afb4d6c`와 같은 파일, 약 1분 10초). break-ui 8개 통과. 아래 목록 |
| 지연 조각(W1+W3 빌드) | 처리함 JS 10,728B(gzip 4,010B) + CSS 4,885B(gzip 1,064B), 복귀 요약 JS 3,450B(1,652B) + CSS 3,101B(890B), `homeQueries` 1,175B(649B), 두 조각이 같이 쓰는 `inbox_preview_tag` 문구 181B |

### 화면 확인 항목(35개, 저장소 밖 `e2e/fix.cjs`)
- 요청 묶음(4): 로그인 admin 시안 `+338ms settings.get,inbox.list,summary.get | +425ms settings.set`(앞 실행 `+451ms settings.get | +457ms inbox.list,summary.get`), 로그인 플레이어 `+279ms settings.get | +316ms settings.set | +317ms inbox.list,summary.get`(앞 실행 셋이 한 요청), 쿠키로 켜기 admin `+390ms settings.get,inbox.list,summary.get`. 세 경우 모두 `inbox.list`·`summary.get`이 한 요청, `inbox.list` 한 번. `settings.*`는 계정 설정 맞추기(따로 된 조각이라 같은 요청일 때도 아닐 때도 있다)다.
- 바로 처리 결과(1, 파스텔·ko와 다크·en): 마지막 줄 [거절]·[Decline]의 결과가 그 줄 안, 위 띠 아래·하단 탭 위(390×844, 결과 위 600~640px, 보이는 띠 58~778px), 그 줄의 role=status가 읽음, 보낸 프레임(핑 제외) 0, 줄마다 자기 결과, 넘침·44px·글자 넘침 없음, 기기 오류 없음.
- 모르는 분류(2, ko·en): 9줄 모두 보이고 끝 묶음이 `other`("그 밖의 알림" / "Other Alerts"), 종 배지 이름 "알림 8개" / "Alerts: 8".
- 멈춘 조각(3): `homeQueries-*.js`에 답하지 않으면 10,743ms(앞 실행 10,589ms)에 실패 + [다시 시도], 복귀 요약 없음.
- 강조 줄(9)·표지(11): 바로 연 `?item=unit_idle:preview_base_1`의 줄만 `aria-current`, 이름 "찾는 항목: 명령 없는 유닛 6", 처리함 안의 링크로 `?item=craft_done:preview_event_1`에 가면 초점이 `inbox-highlight`("찾는 항목: 제작 완료"), region 1개.
- 마감(8, ko·en): "2일 후 마감 / 1시간 후 마감 / 59분 후 마감 / 1분 안에 마감", "Due in 2 days / Due in 1 hour / Due in 59 minutes / Due in under a minute".
- 복귀 요약 이동(6): 숫자(`/economy`)를 누르면 요약을 닫고 앱 안에서 쌓기(기록 칸 2 → 3, 문서를 다시 읽지 않음), 뒤로 → 홈(요약 다시 안 뜸), Esc로 닫으면 기록 칸·주소 그대로.
- 플레이어: 빈 처리함, 종 이름 "알림"(수 없음), 복귀 요약 없음, preview 요청 없음, 기기 오류 없음.
- 사진 6장의 배치(390·320, 파스텔·다크, ko·en): 넘침·44px·글자 넘침 없음.
- 따로 본 것: 복귀 요약을 Esc·[확인]으로 닫으면 초점은 `body`다(다음 Tab은 W1 "본문으로 건너뛰기"). 처음 켤 때 열린 겹침이라 돌려줄 자리가 없다.

### break-ui(8개, 저장소 밖 `e2e/break.cjs`, 응답 바꿔치기)
- 넣은 값: 모르는 분류 2가지(`urgent_new`·`rumor`) 줄 3개(모르는 종류 1, 개수 1,284, 마감 지남), 긴 이름 "Aleksandra Wiśniewska-Kowalczyk의 북쪽 창고 (Northwind Industries Holdings)", 30초 남은 마감, 모르는 종류의 값 `SECRET`·모르는 주소 `guild_hall`, 강조(`?item=`)를 모르는 분류 줄에, 바로 처리 결과 상자 2개(버튼 2개 줄은 둘 다 누름).
- 320(ko·en)·390(다크 en)·390 뿌리 글자 200%(다크 ko): 넘침·44px·글자 넘침 없음, `SECRET`·`guild_hall`을 쓰지 않음, 기기 오류 없음. 11줄 모두 보이고 "그 밖의 알림" 묶음에 3줄, 종 배지 "알림 10개" / "Alerts: 10"(완료를 뺀 줄 수), 강조 줄 이름 "찾는 항목: 명령 없는 유닛 1,284", 마감 "1분 안에 마감 / 59분 후 마감 / 마감 지남".
- 버틴 것: 긴 이름은 줄을 바꾸고 결과 상자는 두 줄로 접힌다. 버튼 둘을 차례로 눌러도 결과는 그 줄에 하나(같은 문장을 다시 읽는다).
- 본 것(W1 몫, W1 기록에서 받아들인 것): 뿌리 글자 200%에서 위 띠 종 배지 "10"과 하단 탭 배지가 아이콘을 덮는다. W3 처리함 부분은 아이콘·분류 칩(px 토큰)이 글자보다 작아 보이는 것 말고는 그대로다(`29-2240` 기록의 Fragile 그대로).

### 사진(저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/shell-w3-fix/shots/`, W1 틀 안)
- 바로 처리 결과(보이는 화면): `fix-quick-action-last-pastel-ko.png`, `fix-quick-action-last-dark-en.png`
- 처리함 390(모르는 분류 줄 + `?item=` 강조 + 결과): 보이는 화면 `fix-inbox-{pastel,dark}-{ko,en}-390-view.png`, 전체 `fix-inbox-{pastel,dark}-{ko,en}-390.png`. 320: `fix-inbox-pastel-ko-320*.png`, `fix-inbox-dark-en-320*.png`
- 앱 안 이동 뒤 강조 줄: `fix-highlight-focus-pastel-ko.png`
- break-ui: `break-inbox-pastel-ko-320-100-{view,contract}.png`, `break-inbox-pastel-en-320-100-{view,contract}.png`, `break-inbox-dark-en-390-100-{view,contract}.png`, `break-inbox-dark-ko-390-200-{view,contract}.png`
- 복귀 요약(W1 틀 위): `fix-summary-in-shell-pastel-ko.png`, `fix-summary-in-shell-dark-en.png`
- 전체 페이지 사진에는 W1의 고정 띠(위 띠·하단 탭)가 찍을 때의 스크롤 자리에 한 번 더 찍힌다(사진 방식 탓, 보이는 화면 사진에는 없다).

### 검토 스킬
- `web-design-guidelines`(2026-10-30에 받은 `command.md`, 바뀐 파일 `InboxList.tsx`·`InboxScreen.tsx`·`inbox.css`·`SummaryDialog.tsx`): 고친 것 1개(영어 제목 Title Case "Other Alerts", `afb4d6c`). 그대로인 것: 결과 알림은 늘 있는 영역에 글만 넣는다(처음부터 있던 영역의 바뀜만 잘 읽힌다), 강조 줄은 색·테두리만이 아니라 글로도 알린다, 표지 수가 줄었다, 줄 링크의 초점 테두리는 `::after`가 대신 그린다. 복귀 요약 제목의 `:focus { outline: none }`은 누르는 곳이 아닌 제목(tabIndex −1)이라 그대로 둔다(`29-2240` 기록과 같다).
- `break-ui`: 위 "break-ui" 절.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/net/homeQueries.ts`(새), `apps/game/src/inbox/inboxClient.ts`·`apps/game/src/summary/summaryClient.ts`(지움) | 홈 자료 조회 한 조각(지적 4) |
| `apps/game/src/inbox/store.ts`·`store.test.ts` | 다시 연결 5초 규칙(4), 멈춘 조각 끊기(3), 종 배지가 모르는 분류를 셈(2) |
| `apps/game/src/summary/summaryGate.ts`·`summaryGate.test.ts` | 같은 조각(4), 묻기 10초(3) |
| `apps/game/src/inbox/InboxList.tsx`·`InboxList.test.ts` | 그 밖의 알림(2), `onNavigate`(6), 줄 안 결과(1), 강조 줄·표지(9·11), CSS 가져오기(5) |
| `apps/game/src/inbox/InboxScreen.tsx` | `onNavigate`(6), 위 알림 영역·`onQuickAction` 지움(1) |
| `apps/game/src/inbox/inboxText.ts`·`inboxText.test.ts` | 그 밖의 알림 이름(2), `itemTarget`(6), `isInboxItemTarget`(9), 마감 내림(8) |
| `apps/game/src/inbox/icons.tsx` | "그 밖의 알림" 아이콘(2) |
| `apps/game/src/inbox/inbox.css` | 버튼 줄·결과 상자(1), 머리 주석(5) |
| `apps/game/src/inbox/quickActions.ts` | 주석(1) |
| `apps/game/src/summary/ReturnSummary.tsx`·`SummaryDialog.tsx` | `onNavigate`(6) |
| `apps/game/src/summary/summaryText.ts`·`summaryText.test.ts` | 길이 단위 경계(8) |
| `apps/game/messages/ko.json`·`en.json` | `inbox_bell_count` 지움, `inbox_group_other`·`inbox_item_opened`·`inbox_deadline_soon` 더함(W3 자리) |
| `apps/game/src/inbox/firstScreen.test.ts`(새), `apps/server/src/trpc/homeInputs.test.ts`(새) | 첫 화면 가져오기 규칙, 입력·출력 타입(12) |
| `docs/worklog/2026/10/29-2240-app-shell-w3.md` | 키 수(10), 꽂는 줄·W4·정한 것·함께 바꿀 파일·건드리지 말 것·미검증의 바뀐 줄 |
| `docs/worklog/2026/10/30-0030-app-shell-w3-review.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- 홈 자료 조회를 더할 때(W4 `dashboard.cards` 등): `apps/game/src/net/homeQueries.ts`에 더한다. 따로 된 조각을 만들면 같은 틱의 조회가 다른 요청이 된다.
- 공용 요청·응답 타입(`packages/shared/src/inbox.ts`·`dashboard.ts`)과 서버 입력 검사(`apps/server/src/trpc/inbox.ts`·`summary.ts`·`dashboard.ts`)는 함께 바꾼다(`homeInputs.test.ts`가 본다).
- 첫 화면 모듈을 더하거나 이름을 바꾸면 `apps/game/src/inbox/firstScreen.test.ts`의 목록도 바꾼다.
- `apps/game/src/summary/summary.css`의 37.5em ↔ W1 `shell/layout.ts`(W1이 합쳐진 뒤 `layout.test.ts`가 본다).

## 건드리지 말 것
- 바로 처리 결과 알림 영역(`.inbox-item-feedback`, role=status)을 결과가 생길 때 새로 그리지 않는다. 늘 그려 두고 글만 넣어야 읽기 프로그램이 읽는다.
- 강조 줄 제목 id `inbox-highlight`는 앱 안 이동의 `focusId`가 쓴다. 바꾸면 `INBOX_HIGHLIGHT_ID` 하나만 바꾼다.
- `29-2240` 기록의 "건드리지 말 것" 그대로(첫 화면 가져오기, `preview_` 앞머리, 실제 항목의 바로 처리).

## 미검증·TODO·알려진 문제
- 휴대폰에서 보지 않았다(Unknown): 줄 안 결과 상자, 강조 줄 숨은 글을 VoiceOver·TalkBack이 읽는 모습, 안드로이드 뒤로로 복귀 요약 닫기.
- 화면 확인은 W1+W3 복제본(W2·W4·W5 없음)과 헤드리스 Chromium만이다. W2가 합쳐진 main에서 `settings.*` 요청 모양은 다시 보지 않았다(Unknown).
- 멈춘 조각 받기를 [다시 시도]로 다시 불러도, 브라우저가 같은 주소의 멈춘 받기를 기다리면 다시 10초 뒤 실패한다(Assumed: 모듈 지도의 받기를 함께 쓴다). 실제로는 브라우저의 받기 시간 초과·오류로 끝나고, 실패한 동적 import를 다시 받는지는 브라우저마다 다르다(Unknown).
- 5초 다시 연결 규칙 때문에, 받기를 시작한 직후 짧게 끊긴 동안 생긴 바뀜은 다음 받기(화면 보임 60초·화면 열기)까지 늦을 수 있다. 지금은 처리할 일 실시간 알림이 없어 영향이 작다(Assumed). 위협 종류가 생겨 WebSocket "처리할 일이 바뀜" 알림을 만들 때 다시 본다(ADR 37 7절).
- W4 쪽 시안 표시 정리(지적 7)는 W4 몫이다. 이 가지에는 바꿀 코드가 없다.

## 사용자 결정 대기
- 없음.
