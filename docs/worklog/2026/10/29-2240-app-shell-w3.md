# 앱 뼈대 W3: 처리할 일·복귀 요약 — 서버 조회, 기기 저장소, 처리함 화면, 복귀 요약 대화상자

- 일시: 2026-10-29 22:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-29-app-shell.md`(37, 제안) 6·7·8·10·11·12절과 "구현하며 정한 것 (0단계)", 저장소 밖 계획서의 W3 절, 작업 기록 `29-2015-app-shell-stage0.md`·`29-2100-app-shell-stage0-review.md`, 기획 D-6006·D-6009·D-6014·D-6015·D-265·D-266(미러 `docs/design/60_UX_FTUE.md` 3.1·`02_Decision_Log.md`)
- 작업 자리: 작업 트리 `.claude/worktrees/app-shell-w3`, 가지 `work/app-shell-w3`, main `507e645`에서 시작했다. push·merge는 하지 않았다(통합 세션 몫).
- 검토 반영(2026-10-30, 작업 기록 `30-0030-app-shell-w3-review.md`): 아래 "꽂는 줄"·"W4(홈)가 쓸 것"·"정한 것"의 바뀐 줄, 메시지 키 수, "함께 바꿔야 하는 파일"·"건드리지 말 것"·"미검증"의 해당 줄을 고친 판으로 바꿨다(바뀐 줄에 "검토 반영"이라고 적었다).

## 한 일
- 서버(커밋 `a72977f`)
  - tRPC `inbox.list`·`summary.get`·`dashboard.cards`(조회만). 응답 타입은 0단계의 `@terra/shared/inbox`·`@terra/shared/dashboard` 그대로다.
  - 시안 자료(`preview: true`)는 권한 `home: ["preview"]`(dev·admin)가 없으면 FORBIDDEN(403), 로그인 안 하면 UNAUTHORIZED(401)다. `preview: false`나 없음은 누구나 자기 자료를 받는다(`trpc/preview.ts`).
  - 맥락에 홈 자료 서비스(`HomeServices`)를 더했다. 앱에 하나만 만든다(`createContextFactory` 안, `home/services.ts`). 지금 제공 함수가 0개라 DB를 받지 않는다.
  - `inbox/order.ts`(정렬·묶기, 순수 함수): 정렬 키 (분류 순위, 마감(없으면 분류 끝), 처음 생긴 시각, 항목 ID). 묶는 종류는 같은 (종류, 키)를 한 줄로 묶고 건 수·가장 이른 마감·가장 이른 처음 생긴 시각을 갖는다. `counts`(분류별 줄 수)·`badges`(메뉴 항목 → 줄 수)도 여기서 센다.
  - `inbox/registry.ts`: 종류마다 제공 함수(지금 0개), 모두 불러 묶고 정렬한다. `inbox/preview.ts`: 시안 자료(종류 표 8종류, 복귀 요약 칸 4종). `summary/summary.ts`: 사건 출처가 없어 실제 계정은 늘 `show: false`. `home/cards.ts`: 서버 카드 4장은 제공 함수가 없어 모두 `not_ready`.
- 기기(커밋 `7fa0c2e`, 화면 확인 뒤 고침 `6ea24cd`·`cc4ffbd`)
  - `inbox/store.ts`(첫 화면): 처리할 일 목록 하나를 종 배지·메뉴 배지·처리함·홈이 같이 쓴다. 겹친 요청은 하나로 묶는다. 요청은 `inbox/inboxClient.ts`를 동적 `import()`로 불러서 한다(검토 반영: 복귀 요약 요청과 함께 `net/homeQueries.ts` 하나로 합쳤다).
  - `inbox/preview.ts`(첫 화면): 시안 자료 보기 기기 표시(`localStorage` `terra.preview`). 켠 계정이고 dev·admin일 때만 켜진다. 켜는 곳은 W4의 홈 [편집]이다(`setPreviewOn`).
  - 처리함 화면 `InboxScreen.tsx`(지연 조각)와 목록 `InboxList.tsx`(홈도 쓸 수 있다), 문구 `inboxText.ts`, 바로 처리 `quickActions.ts`, 분류 아이콘 `icons.tsx`, `inbox.css`.
  - 복귀 요약: `summaryGate.ts`(첫 화면, 물을 때·보일지), `ReturnSummary.tsx`(첫 화면, 틀이 한 줄로 그린다), `SummaryDialog.tsx`(지연 조각, `<dialog>`), `summaryText.ts`, `summaryClient.ts`(지연, 검토 반영: `net/homeQueries.ts`로 합침), `summary.css`.
  - `net/apiErrors.ts`: 조회 오류 코드 → 이미 있는 문구 키(관리자 화면과 같은 방식).
  - 메시지 키 35개(ko·en 함께, `session_unavailable` 바로 뒤 W3 자리): `inbox_` 27개, `summary_` 8개. 다국어 검사 360개 키(main 325개). 검토 반영 뒤 37개(`inbox_` 29개, `summary_` 8개: `inbox_bell_count`를 지우고 `inbox_item_opened`·`inbox_deadline_soon`·`inbox_group_other`를 더함), 362개 키.
- 화면 틀(W1)이 main에 없어 처리함·복귀 요약은 따로 선 부품으로 두었다. 틀에 붙이는 줄 3개는 아래 "꽂는 줄"에 적었다. W1 파일은 건드리지 않았다.
- 화면 확인은 저장소 밖 Playwright 스크립트로 했다(W5 `e2e/`가 아직 없다). 시험 틀: `App.tsx`에 꽂는 줄 3개 대신 임시 패치를 넣고 빌드한 뒤 되돌렸다(저장소에 올리지 않음).

## 꽂는 줄 (W1이 합쳐진 뒤 통합 세션이 넣는다. 검토 반영: W1 `571d8a9`의 실제 자리·모양에 맞춘 판, 자세한 것은 `30-0030-app-shell-w3-review.md`)
W1 라우터는 주소 글자가 아니라 화면(`RouteTarget`)을 받는다(`navigate(target, options)`, `AppLink`의 `to`). 그래서 W3 부품은 `onNavigate(target)`를 받고, 꽂는 줄은 W1의 `navigate`를 그대로 넘긴다. W1+W3을 합친 복제본에 아래 줄을 넣어 타입 검사·린트·포맷·빌드·화면 확인을 통과했다(검토 반영 기록).
1. `shell/routeViews.tsx`
   - `const InboxScreen = lazy(() => import("../inbox/InboxScreen.tsx"));`(위의 "꽂는 줄(W3)" 주석과 `ComingSoon` 줄 대신)
   - `case "inbox": return <InboxScreen itemId={match.search.item} onNavigate={navigate} headerEnd={<BackButton />} />;`
   - 가져오기: `import { BackButton } from "./BackButton.tsx";`, `import { goBack, navigate } from "./routerStore.ts";`
2. `shell/TopBar.tsx`: `const useAlertCount = (): number => 0;`(와 그 위 주석)를 지우고 `const alerts = useInboxBellCount();`(`import { useInboxBellCount } from "../inbox/store.ts";`). 이름은 W1의 `shell_alerts_count` 그대로다(W3의 `inbox_bell_count`는 지웠다).
3. `shell/Shell.tsx`
   - 끝의 "꽂는 줄(W3)" 주석 줄 → `<ReturnSummary onNavigate={navigate} />`(`import { ReturnSummary } from "../summary/ReturnSummary.tsx";`, `routerStore.ts` 가져오기에 `navigate`). 로그인한 모든 화면에서 그린다(틀을 숨긴 지도·행성 편집기 포함). 기록 칸을 쌓지 않는다. [확인]·Esc로 닫으면 보던 화면에 남는다(D-266).
   - 메뉴 항목 배지: `NO_BADGES` 상수를 지우고 `Shell` 안에서 `const badges = useInboxMenuBadges();`(`../inbox/store.ts`), `badges={NO_BADGES}` 세 곳 → `badges={badges}`. `import { type MenuBadges, TabBar }`의 `type MenuBadges`를 지운다(안 지우면 린트 실패).
- 통합 뒤 할 수 있는 것: `inbox/icons.tsx`의 `CategoryIcon`을 W1 `ui/icons.tsx`의 `<Icon name={분류} className="inbox-icon" />`으로("그 밖의 알림"은 `bell`), `InboxList`·`SummaryDialog`의 `followInApp`·`follow`를 W1 `AppLink`로(그때 `onNavigate` 칸을 지운다. 복귀 요약은 `onClick`에서 먼저 닫는다). W1 `sections/ComingSoon.tsx`의 `inbox` 줄은 쓰이지 않게 된다.

## W4(홈)가 쓸 것 (검토 반영)
- 처리할 일: `useInbox()`(상태 전체), `ensureInbox()`(홈을 열 때: 없거나 60초 지났으면 받기), `refreshInbox()`, `InboxList`(`onInboxScreen={false}`, `headingLevel={3}`, 마감 기준 `now={data.generatedAt}`, `onNavigate={navigate}`). `InboxList`가 `inbox.css`를 가져오고 바로 처리 결과도 그 줄 안에 보인다(홈이 따로 처리할 것 없음).
- 복귀 요약 자료(부관 보고 카드)·홈 카드: 홈 자료 조회는 `net/homeQueries.ts` 한 모듈이다. `(await import("../net/homeQueries.ts")).loadSummary(isPreviewOn())`. `dashboard.cards`도 이 모듈에 `loadCards`로 더한다(같은 조각이라 처리할 일·복귀 요약과 같은 틱이면 한 요청).
- 시안 자료 칸(dev·admin [편집]): `usePreviewOn()`·`setPreviewOn(on)`(`inbox/preview.ts`, 기기 `localStorage` `terra.preview` = `{ v: 1, user }`). W4의 `homePrefs.ts` 시안 표시(sessionStorage)는 지우고 이것을 쓴다(표시가 둘이면 홈과 종 배지·복귀 요약이 어긋난다). 오류 문구는 `net/apiErrors.ts`의 `apiErrorInfo`.

## 정한 것 (ADR 37·계획서가 정하지 않은 것. 통합 세션이 ADR "구현하며 정한 것"으로 옮긴다)
- 서버
  - 묶은 줄의 `params`·`target`·`preview`는 그 묶음에서 가장 급한 건(마감 → 처음 생긴 시각 → 값의 JSON)의 것이다. 같은 입력이면 입력 차례를 섞어도 같은 응답이다(시험).
  - 묶지 않는 종류에 같은 (종류, 키)가 또 오면 같은 대상으로 보고 한 줄(개수 1)만 남긴다. 키 모양이 틀리거나 시각이 유한한 수가 아니면 RangeError다(제공 함수의 실수를 바로 드러낸다).
  - 제공 함수 하나가 실패하면 처리함 전체가 실패한다(500). 위협을 빠뜨린 목록을 보이지 않으려는 것이다. 한 종류에 제공 함수는 하나다(`checkProviders`, 앱을 만들 때 본다).
  - 등록부와 종류 표의 `planned`가 맞는지 시험이 본다: 제공 함수가 있는 종류는 planned가 아니고, planned가 아닌 종류는 제공 함수가 있다.
  - 시안 자료는 실제 항목에 더한다(바꾸지 않는다). 키를 `preview_`로 시작해 항목 ID가 겹치지 않는다. 이름 값(`place`)은 두 언어에서 같은 글자(`Nova`·`Vega`)다.
  - 복귀 요약 `since`는 확인 시각 표가 없어 null이다. 시안 자료는 8시간 전에 확인한 것으로 보인다(`since = now − 8시간`). `show` = 사건이 있는 칸이 하나라도 있음.
  - `dashboard.cards` 입력: `ids`는 1~64자 문자열 24개(`HOME_CARDS_MAX`)까지, 모르는 ID·기기 카드는 빼고 요청 순서대로 답한다. 시안 자료에서도 네 카드는 준비 중이지만 권한은 같게 본다.
- 기기
  - 시안 자료 보기 표시는 기기에만 둔다(`localStorage` `terra.preview` = `{ v: 1, user }`). 새로고침 뒤에도 남아야 켤 때 뜨는 복귀 요약을 시안 자료로 볼 수 있다. 다른 계정·dev·admin이 아닌 역할이면 꺼진 것으로 본다(플레이어가 403을 받지 않게).
  - 처리할 일 저장소가 다시 받는 때: 로그인한 계정·시안 여부가 바뀔 때, 서버 연결이 끊긴 뒤 다시 맺어질 때(`serverLink`의 down → ready. 처음 연결은 받지 않는다), 화면이 다시 보일 때 마지막으로 받은 지 60초가 넘었을 때, 화면을 열 때 `ensureInbox()`, `refreshInbox()`. 응답이 10초 없으면 끊는다. 검토 반영: 다시 연결됐을 때 5초 안에 시작한 받기(받는 중이거나 그 요청으로 받은 목록)가 있으면 다시 받지 않는다(로그인 직후 계정이 바뀌어 다시 맺은 연결로 또 받던 것을 없앴다). 10초 끊기는 요청 조각 받기가 멈춰도 실패로 끝낸다.
  - 저장소는 처음 쓸 때 켜진다(종 배지가 `useInbox…`를 부를 때). `main.tsx`(W1 파일)를 고치지 않으려는 것이다.
  - 종 배지 = `counts`에서 완료를 뺀 합(ADR 7절, 검토 반영: 모르는 분류도 센다. 0 이하·정수가 아닌 값은 뺀다). 종류 표 값(`INBOX_KINDS`)은 기기 묶음 어디에도 없다. 화면에 필요한 분류·이동 화면·동작은 항목에 실려 온다. 분류 순서는 `inboxText.ts` `CATEGORY_ORDER`에 따로 적고 공용 목록과 같은지 시험이 본다.
  - 목록은 분류마다 모아 분류 순서대로 그린다. 분류 안은 받은 차례 그대로다(받은 차례가 섞여도 분류 제목이 두 번 나오지 않는다). 모르는 분류의 줄은 그리지 않는다 → 검토 반영: 끝의 "그 밖의 알림" 묶음에 그린다(D-6011, 처리함에는 늘 모든 항목).
  - 모르는 종류: 제목 "새 알림", 값(`params`)·바로 처리 버튼을 보이지 않고, 마감은 보인다. 누르면 처리함(`?item=`)으로, 처리함 안에서는 링크가 없다.
  - 바로 처리 버튼: 시안 자료 항목에만 그린다. 누르면 명령을 보내지 않고 알림 영역에 "시험 자료라서 명령을 보내지 않았습니다"를 읽어 준다(검토 반영: 그 줄 안, 버튼 바로 아래 알림 영역이 보이고 읽는다). 실제 항목은 `inbox_action` 메시지가 생길 때까지 버튼이 없다(줄을 눌러 그 화면에서 처리한다). 기획(D-6015)의 "1~2개 버튼"은 그 메시지를 만들 때 실제 항목에 켠다.
  - 마감 문구: 남은 시간 1시간 안은 분(올림, 1분부터), 48시간 안은 시간, 그 뒤는 날. 지났으면 "마감 지남". 검토 반영: 분·시간·날 모두 내림, 1분 안은 "1분 안에 마감"(늘려 말하지 않는다). 기준은 목록을 만든 서버 시각(`generatedAt`)이다. 주기 타이머가 없어 화면을 오래 열어 두면 늦은 값이 된다(다시 받을 때 고쳐진다).
  - 이름 뒤에 조사를 붙이지 않게 이름(`place`)은 제목과 따로 보인다. 개수는 "명령 없는 유닛 6" / "Idle units: 6"처럼 복수형이 필요 없는 꼴이다.
  - `?item=` 항목은 테두리로 강조하고 화면 가운데로 옮긴다(검토 반영: `aria-current`, 제목 앞 숨은 글 "찾는 항목:", 제목 id `inbox-highlight`로 앱 안 이동 때 초점). 목록에 없으면 "찾는 항목이 목록에 없습니다…"를 보인다(넣은 값은 되풀이하지 않는다).
  - 복귀 요약을 묻는 때: 로그인한 계정이 정해질 때(앱을 켤 때와 새로 로그인할 때), 30분 넘게 숨겼다가 다시 볼 때(`pwa/updatePolicy.ts`의 숨김·보임 규칙 그대로). 같은 계정이면 로그인 상태를 다시 확인해도 다시 묻지 않는다.
  - 복귀 요약 대화상자: 열 때 제목에 초점을 둔다(읽기 프로그램이 처음부터 읽게). 제목은 누르는 곳이 아니라 초점 테두리를 그리지 않는다. 숫자를 누르면 닫고 그 화면으로 간다. 그릴 칸이 없으면(모르는 칸 종류뿐) 열지 않는다. 며칠 비우면 길이를 날로 보인다("지난 3일 동안").
  - 조회 오류 문구는 이미 있는 키를 다시 쓴다: UNAUTHORIZED `auth_notice_session_ended`(세션을 다시 확인), FORBIDDEN `admin_err_forbidden`, BAD_REQUEST `admin_err_bad_request`, INTERNAL_SERVER_ERROR `err_server`, 응답 없음 `err_network`, 나머지 `err_unknown`. 키 이름에 `admin_`이 남는다(문장은 일반 문장이다).

## 통과 기준 (계획서 W3)
| # | 기준 | 상태 | 근거 |
|---|---|---|---|
| 1 | 정렬·묶기 시험: 분류 순위, 마감 없는 항목은 분류 끝, 묶음 개수·가장 이른 마감, 같은 입력 → 같은 순서·같은 항목 ID | 됨 | `apps/server/src/inbox/order.test.ts` 13개(섞은 입력 4가지가 같은 응답), `preview.test.ts` 6개 |
| 2 | 권한 시험: 시안 자료를 player가 부르면 403, dev·admin은 된다, 로그인 안 하면 401 | 됨 | `apps/server/src/inbox/inbox.db.test.ts` 8개(DB 7개, PostgreSQL 16), 화면 확인에서도 403 ×3·401 ×3 |
| 3 | 플레이어: 빈 처리함 문구, 종 배지 없음, 복귀 요약 안 뜸 | 됨(자료·화면) / 배지 그림은 W1 | 시험 틀에서 빈 문구·종 배지 수 0·대화상자 없음. 0이면 배지를 그리지 않는 것은 W1 `TopBar`가 한다 |
| 4 | admin 시안 자료: 5분류 순서, 항목마다 "시험 자료", 바로 처리 버튼은 명령을 보내지 않는다. 복귀 요약이 [확인]·Esc로 닫히고 기록 칸이 늘지 않는다 | 됨(시험 틀) / 켜는 칸은 W4 | 5분류 순서·8줄·표시 8개, 버튼을 누른 뒤 보낸 WebSocket 프레임(핑 제외) 0개, Esc·[확인] 뒤 `history.length` 2 → 2·주소 그대로. 시안 자료는 `terra.preview`를 미리 넣어 켰다(W4의 [편집] 칸은 아직 없다) |
| 5 | 모르는 종류가 와도 화면이 깨지지 않는다(시험) | 됨 | `InboxList.test.ts` 6개·`inboxText.test.ts` 10개·`quickActions.test.ts` 4개, 화면 확인에서 응답을 바꿔치기해 모르는 종류·분류·동작·주소·복귀 요약 칸 |
| 6 | 파스텔·다크 × ko·en 사진(처리함 390) | 됨 | 아래 "사진" |
| 7 | 첫 화면 묶음에 tRPC 클라이언트와 종류 표가 없다(빌드 소스 맵으로 확인) | 됨(시험 틀 빌드) / W1 틀에서 다시 볼 것 | 첫 화면 조각 3개의 소스 맵에 `@trpc/client`·`net/api.ts`·`packages/shared/src/inbox.ts`·`inboxClient.ts`·`summaryClient.ts`·`inboxText.ts`·`SummaryDialog.tsx`가 없다. 대조: `api-*.js` 조각에 `@trpc/client`·`net/api.ts`가 있다. `inbox.ts`는 기기 묶음 어디에도 없다 |
| 공통 | `pnpm check`, 작업 기록 + `pnpm docs:index`, 새 런타임 의존성 없음, 사진, `web-design-guidelines`·`break-ui` | 됨 | 아래 "확인" |
| 공통 | 화면 시험 `pnpm e2e`(W5 뒤) | W5 뒤 | `e2e/`가 아직 없다. 저장소 밖 스크립트 결과를 남겼다. W5가 합쳐지면 `e2e/inbox.spec.ts`로 옮긴다 |

## 확인 (Verified: 이 작업 트리, Node 24.22.1, pnpm 11.28.9, PostgreSQL 16 시험 클러스터 `127.0.0.1:55432`)
| 명령·확인 | 결과 |
|---|---|
| `TEST_DATABASE_URL=… pnpm check`(마지막 트리 = 커밋 `cc4ffbd` + 이 기록·목차, 부하 평균 약 5~6, 1분 19초) | 포맷·린트·타입·경계·크기·다국어 360개 키·대비 136쌍(화면 CSS 10개)·콘텐츠 `core@2 (14495d30db2e)` 통과, 시험 파일 152개·시험 1,371개 통과(DB 포함). 앞서 `6ea24cd` 트리에서도 통과했다(1,369개, `cc4ffbd`가 목록 시험 2개를 더했다) |
| `node scripts/check-docs.mjs main`(커밋 뒤) | 작업 기록 있음, 새 런타임 의존성 없음, 마이그레이션 변경 없음 — 통과 |
| W3 시험 파일 14개 | 97개 통과: 서버 41(정렬·묶기 13, 시안 자료 6, 등록부 7, 복귀 요약 3, 서버 카드 4, 홈 자료 HTTP 8), 기기 56(저장소 12, 시안 표시 3, 문구·링크·마감 10, 바로 처리 4, 목록 그리기 6, 복귀 요약 문 10, 복귀 요약 문구 3, 조회 오류 8) |
| 화면 확인(저장소 밖 Playwright 1.63.0 + Chromium, 빌드한 앱 + 빌드한 서버 `127.0.0.1:4631`, 가짜 계정 `fake_w3_*`) | 68개 확인 모두 통과(마지막 실행, 약 40초). 390×844(DPR 3, 터치)·320·1440×900, 파스텔·다크, ko·en |
| 첫 화면 JS(빌드한 `index.html`의 모듈 + modulepreload, 파일마다 gzip -9 합) | 시험 틀 없이(= main과 같은 첫 화면): 368,388B, gzip 114,171B(4파일). 시험 틀(저장소 + 첫 화면 모듈 4개 `inbox/store.ts`·`inbox/preview.ts`·`summary/summaryGate.ts`·`summary/ReturnSummary.tsx` + 시험 틀 몇 줄): 373,888B, gzip 114,563B(3파일). 차이 +5,500B, gzip +392B. 조각이 다시 묶여 파일 수가 바뀌었다. W1 틀에 꽂은 뒤의 값이 공식 값이다 |
| 지연 조각 | 처리함 JS 9,594B(gzip 3,699B) + CSS 4,701B(gzip 1,059B), 복귀 요약 대화상자 JS 3,320B(gzip 1,598B) + CSS 3,101B(gzip 923B), `inboxClient` 328B(gzip 266B), `summaryClient` 553B(gzip 404B) |
| 조회 시간(빌드한 서버, 같은 기기 안 fetch 20번씩 차례로, 부하 평균 약 6~9) | `inbox.list` 자기 자료 중앙값 10.5ms(최대 35.6ms, 147B), 시안 자료 12.5ms(17.1ms, 2,002B), `summary.get` 시안 자료 12.2ms(16.6ms, 411B), `dashboard.cards` 4장 9.2ms(11.4ms, 179B) |

### 화면 확인 항목(68개, 저장소 밖 스크립트 `e2e/w3.cjs`)
- 로그인 안 함: 셋 다 401. 플레이어: 종 배지 수 0, 복귀 요약 없음, 시안 표시를 자기 id로 심어도 preview로 묻지 않음, 시안 자료 403 ×3·자기 자료 200, 빈 처리함 문구·줄 없음, 390 넘침·44px, 기기 오류 없음(일부러 부른 403 말고).
- admin 시안 자료(실제 로그인 한 번): 로그인 뒤 복귀 요약(칸 4종 + 시험 자료), 제목에 초점, Esc로 닫힘(기록 칸 2 → 2, 주소 `/`), 새로고침 뒤 다시 뜨고 [확인]으로 닫힘(기록 칸 그대로, `/`에 남음), 종 배지 수 7, `/inbox?item=unit_idle:preview_base_1`을 바로 열면 요약이 먼저 뜨고 [확인] 뒤 그 화면에 남음(D-266), 5분류 순서·8줄·표시 8개, `?item=` 강조 1줄, 미리 보기 안내 줄, [방어 배치]를 눌러도 보낸 프레임 0개 + 알림 문구, 없는 `?item=` 안내, 기기 오류 없음.
- dev 시안 자료: 처리함 8줄. 모르는 종류·분류·동작·주소(응답 바꿔치기): "새 알림", 값·모르는 주소를 쓰지 않음, 모르는 분류 줄 빠짐(10줄), 모르는 동작 버튼 없음, 기기 오류 없음. 모르는 복귀 요약 칸만: 대화상자를 열지 않음.
- 파스텔·다크 × ko·en(390): 복귀 요약·처리함 넘침·44px·글자 넘침 없음, 분류 이름. 1440: 복귀 요약은 가운데 판(480px).
- break-ui(응답 바꿔치기, 320·390 × ko·en): 긴 이름(한글 20자 + 영어 34자 한 낱말), 큰 수(1,234,567·9,876,543), 글자 그대로 보일 이름(`<b>Nova</b> & Co`, 이모지, 한자, 악센트), 묶음 1줄의 수, 며칠 비운 뒤 길이("지난 3일 동안" / "In the last 3 days"), 뿌리 글자 200%에서 넘침 없음.
- 세션은 계정마다 한 번 로그인한 쿠키를 다시 썼다. 첫 실행에서 admin으로 12번 넘게 로그인해 아이디별 시도 제한(15분에 10회)에 걸렸다(서버가 맞게 막았다).

### 사진(저장소 밖 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/shell-w3/shots/`)
- 처리함 390: `inbox-pastel-ko.png`, `inbox-pastel-en.png`, `inbox-dark-ko.png`, `inbox-dark-en.png`, 빈 처리함 `inbox-empty-pastel-ko.png`, 모르는 종류 `inbox-unknown-kinds-pastel-ko.png`, 1440 `inbox-pastel-ko-1440.png`
- 복귀 요약 390: `summary-pastel-ko.png`, `summary-pastel-en.png`, `summary-dark-ko.png`, `summary-dark-en.png`, 1440 `summary-pastel-ko-1440.png`
- break-ui: `breakui-inbox-320-ko.png`, `breakui-inbox-320-en.png`, `breakui-summary-320-ko.png`, `breakui-summary-320-en.png`, `breakui-inbox-zoom200-dark-ko.png`, `breakui-inbox-zoom200-dark-en.png`
- 위 띠는 아직 옛 계정 줄이다(W1 전). 처리함·복귀 요약 부분만 본다.

### 검토 스킬
- `web-design-guidelines`(2026-10-29에 받은 `command.md`): 막는 지적 없음. 복귀 요약 제목의 초점 테두리를 그리지 않는 것은 누르는 곳이 아닌 제목(tabIndex −1)이라 일부러 한 것이다. 스타일을 없앤 `ul`은 사파리 VoiceOver가 목록으로 읽지 않을 수 있다(분류 제목·줄 수가 있어 두었다, 미확인).
- `break-ui`: 고친 것 3개(며칠이 "72시간"으로 보임 → 날로, 긴 이름에서 화살표가 줄 왼쪽으로 떨어짐 → 줄 끝 고정, 큰 수에서 칸 이름이 7px로 눌림 → 이름·표 묶음만 줄 바꿈). 버틴 것: 긴 이름·큰 수·이모지·한자·`<b>` 글자, 1줄 묶음의 수, 빈 목록, 마감 없음·지남, 200% 글자. 남은 약한 곳(Fragile): 아래 "미검증·TODO".

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/inbox/types.ts`·`order.ts`·`order.test.ts` | 제공 함수의 건 타입, 정렬·묶기·분류별 수·배지(순수 함수)와 시험 |
| `apps/server/src/inbox/registry.ts`·`registry.test.ts` | 종류별 제공 함수 등록부(0개), 모으기·시안 자료 더하기, planned 맞춤 시험 |
| `apps/server/src/inbox/preview.ts`·`preview.test.ts` | 시안 자료(8종류, 복귀 요약 칸 4종) |
| `apps/server/src/inbox/inbox.db.test.ts` | 세 조회의 401·403·빈 상태·dev·admin 시안 자료·400·묶음 요청(DB) |
| `apps/server/src/summary/summary.ts`·`summary.test.ts` | 복귀 요약(사건 출처 0개, 시안 자료) |
| `apps/server/src/home/cards.ts`·`cards.test.ts`·`services.ts` | 서버 카드 상태(not_ready), 홈 자료 서비스 묶기 |
| `apps/server/src/trpc/inbox.ts`·`summary.ts`·`dashboard.ts`·`preview.ts` | tRPC 프로시저와 시안 자료 권한 |
| `apps/server/src/trpc/router.ts`·`context.ts`·`createContext.ts` | 라우터 연결, `HomeQuery`·`HomeServices`, 맥락의 `home` |
| `apps/game/src/inbox/store.ts`·`store.test.ts` | 처리할 일 저장소(첫 화면) |
| `apps/game/src/inbox/preview.ts`·`preview.test.ts` | 시안 자료 보기 기기 표시(첫 화면) |
| `apps/game/src/inbox/inboxClient.ts` | `inbox.list` 요청(지연). 검토 반영으로 `net/homeQueries.ts`에 합치고 지웠다 |
| `apps/game/src/inbox/inboxText.ts`·`inboxText.test.ts`, `quickActions.ts`·`quickActions.test.ts` | 종류·분류·마감 문구, 링크, 바로 처리 버튼 |
| `apps/game/src/inbox/InboxList.tsx`·`InboxList.test.ts`, `InboxScreen.tsx`, `icons.tsx`, `inbox.css` | 처리함 화면과 목록 |
| `apps/game/src/summary/summaryGate.ts`·`summaryGate.test.ts`, `ReturnSummary.tsx` | 복귀 요약을 물을 때·보일지(첫 화면) |
| `apps/game/src/summary/SummaryDialog.tsx`, `summaryText.ts`·`summaryText.test.ts`, `summaryClient.ts`, `summary.css` | 복귀 요약 대화상자(지연)와 요청 |
| `apps/game/src/net/apiErrors.ts`·`apiErrors.test.ts` | 조회 오류 → 문구 키 |
| `apps/game/messages/ko.json`·`en.json` | W3 자리 메시지 키 35개(검토 반영 뒤 37개) |
| `docs/worklog/2026/10/29-2240-app-shell-w3.md`, `docs/WORKLOG.md` | 이 기록, 목차(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- 꽂는 줄 3개(위)는 W1 파일이다. W1이 main에 합쳐진 뒤 통합 세션이 넣는다. 넣은 뒤 첫 화면 묶음 검사(통과 기준 7)를 W1 틀에서 다시 본다.
- 새 처리할 일 종류를 더할 때(ADR 37 7절 순서): `packages/shared/src/inbox.ts` 종류 표 → `messages`의 `inbox_<종류>_title`(ko·en) → `apps/game/src/inbox/inboxText.ts` `KIND_TITLES` 한 줄(빠지면 타입 오류) → 그 시스템의 제공 함수 + `apps/server/src/inbox/registry.ts` `createInboxProviders` 한 줄 + 종류 표의 `planned: false`(registry.test.ts가 짝을 본다). 바로 처리 동작을 더하면 `quickActions.ts` `ACTION_LABELS`와 `inbox_action_<동작>` 키(빠지면 타입 오류).
- 분류를 바꾸면(닫힌 목록) `inboxText.ts` `CATEGORY_ORDER`·`CATEGORY_NAMES`, `inbox/icons.tsx`, `inbox.css`의 분류 색, 서버 `order.ts` `zeroCounts`를 함께 고친다(시험·타입이 대부분 잡는다).
- 복귀 요약 칸 종류를 더하면 `summaryText.ts` `SECTION_LABELS`와 `summary_section_<칸>` 키.
- `inbox_action`(바로 처리 명령)을 만들 때: `quickActions.ts`의 "실제 항목은 버튼 없음"을 바꾸고, 결과를 받으면 `refreshInbox()`를 부른다. 프로토콜 ADR과 `PROTOCOL_VERSION`.
- 첫 사건 출처(S3 오프라인 정산·생산)를 만들 때: 확인 시각 표 + `summary.ack`, `summary/summary.ts`의 `since`, 기기 `summaryGate.ts`의 닫음 → 확인 보내기.
- W2(계정 설정)가 `apps/server/src/trpc/context.ts`의 `SettingsServices`를 바꾸면 이 가지의 `HomeServices` 추가와 겹친다(줄이 달라 손으로 합치기 쉽다). 합치는 순서는 W2 → W5 → W1 → W3 → W4다. 검토 반영 때 다시 봄: W2(`b9b790d`)는 `context.ts`를 고치지 않았다(Verified: `git diff --name-only`). 겹치는 파일은 W1·W4와 `messages`·`docs/WORKLOG.md`뿐이다.
- 복귀 요약 CSS `summary/summary.css`의 폭 경계 `37.5em`은 W1 `shell/layout.ts`의 좁음 경계와 같아야 한다(검토 반영). W1이 합쳐진 뒤 W1 `layout.test.ts`가 대 보는 CSS 목록에 이 파일을 더한다(루트 `vitest.config.ts`의 `css.include`에도).

## 건드리지 말 것
- 첫 화면 모듈(`inbox/store.ts`·`inbox/preview.ts`·`summary/summaryGate.ts`·`summary/ReturnSummary.tsx`)에서 `net/api.ts`·`@trpc/client`를 정적으로 가져오지 않는다. `@terra/shared/inbox`는 타입만 가져온다(값을 가져오면 종류 표가 첫 화면 묶음에 들어간다). 검토 반영: `net/homeQueries.ts`·지연 조각·CSS도 같고, `inbox/firstScreen.test.ts`가 소스로 본다(`import { type X }`도 잡는다).
- 시안 자료 키의 `preview_` 앞머리를 지우지 않는다(실제 항목 ID와 겹친다).
- 바로 처리 버튼이 실제 항목에서 명령 없이 동작하게 만들지 않는다. 게임 상태를 바꾸는 명령은 WebSocket으로만 보낸다(AGENTS 4장).

## 미검증·TODO·알려진 문제
- W1 틀에 꽂은 모습은 보지 못했다(Unknown). 사진의 위 띠는 옛 계정 줄이다. 첫 화면 크기 차이(+5,500B, gzip +392B)는 시험 틀 기준이다. → 검토 반영 때 W1+W3 복제본에 꽂아 보았다(검토 반영 기록의 확인·사진).
- 휴대폰에서 보지 않았다: 안드로이드 뒤로(닫기 요청)로 복귀 요약이 닫히는지, 아이폰 홈 화면 앱·사파리에서 Esc가 없는 길(Unknown). 사파리 하한(iOS 16.4)에서 `::backdrop`이 문서의 CSS 변수를 물려받지 않아 넓은 화면에서 바탕 어둡게가 투명할 수 있다(Assumed, 좁은 화면은 대화상자가 다 덮는다).
- 화면 확인은 헤드리스 Chromium만이다. Firefox·사파리는 미실행.
- Fragile(break-ui): 처리할 일 줄 수에 상한이 없다(서버 응답에 상한·"더 있음"이 없다. 지금 제공 함수 0개라 문제없음). 이름 값(`place`) 길이도 서버에 상한이 없다(제공 함수가 생길 때 그 시스템의 이름 규칙을 따른다). 200% 글자에서 아이콘·분류 칩(px 토큰)은 그대로라 글자보다 작아 보인다.
- 로그인 직후에는 처리할 일을 두 번 받을 수 있다(로그인 때 한 번, 계정이 바뀌어 다시 맺은 연결의 ready 때 한 번). 요청이 작아 감수했다(Assumed). → 검토 반영으로 고쳤다(한 번, Verified: W1+W3 복제본 화면 확인).
- 복귀 요약은 확인 기록이 없어 닫아도 다음에 켤 때 다시 뜬다(시안 자료만 해당, 실제 계정은 늘 show: false).
- 마감 문구는 목록을 만든 서버 시각 기준이다. 화면을 오래 열어 두면 늦은 값이 된다(주기 타이머 없음, ADR 6절).
- 스타일을 없앤 목록(`ul`)을 사파리 VoiceOver가 목록으로 읽는지는 확인하지 않았다(Unknown).

## 사용자 결정 대기
- 없음.
