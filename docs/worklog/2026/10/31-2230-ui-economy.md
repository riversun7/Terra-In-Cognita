# 경제 화면: 창고·생산·거래창(호가 + 주문표 + 차트)·내 주문·환전

- 일시: 2026-10-31 22:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-29-app-shell.md`(37) 끝 "구현하며 정한 것 (경제·거래창 화면)", ADR `2026-10-31-economy-core.md`(R2), 기획 `docs/design/60_UX_FTUE.md` §6·§9, `40_Systems/43_Production.md`·`44_Economy.md`, 기획 질문 `docs/questions/2026-10-31-ui-economy.md`(141~152). 줄기 `work/ui-economy-market`(main `f38e088`에서).

## 한 일
- 사용자 요청(2026-10-31) "기획서 참고하여 병렬로 가능한 부분은 함께진행하라 / 기획서가 부실하거나 다르면 질문해라 / 그럴듯하게 페이지를 빨리 구현할수있으면 좋겠다"의 경제 몫. "준비 중"이던 `/economy`를 화면으로 바꿨다.
  - 칸: 한눈에(요약 카드 4) · 창고(지갑, 도시 창고 종류·용량·상하는 시각, 화물) · 생산(시설 레벨·일꾼·상태·진행·예약, 반복 예약, 급여, 레시피 목록) · 거래(물건 목록 → 도시별 목록 → 호가 + 주문표 + 차트 + 체결 + 내 주문) · 내 주문(`/economy/orders`) · 환전(기준 통화 짝 동시호가, 예상 체결가, 남은 시간).
  - 주문표: 지정가(만료)·시장가(안전망)·조건(발동 가격), 칸 검사, 바로 체결분·평균가·걸어 둘 양, 거래세(판 쪽), 묶이는 돈·물건, "남은 주문 n/10"(누르면 늘리는 법). [주문]은 "곧 열림"(서버 거래소를 만들지 않는다는 지시).
- 서버 조회 tRPC `economy.*` 8개와 시안 자료(sim 거래소·동시호가·생산 규칙으로 만든 가짜 시장)를 더했다. 플레이어는 실제 팩 목록·원장 잔고만, 거래소·생산·환전은 "곧 열림".
- 주소 7줄(`economy_*`), 메뉴 지금 화면을 하위 화면에서도 맞추는 `menuRoute`.
- 기획 질문 12개(141~152)를 모으고 기술 기본안(가)으로 만들었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/routes.ts`·`routes.test.ts`·`index.ts` | 경제 주소 7줄, `menuRoute`(부모를 따라 올라간 메뉴 항목)와 시험 |
| `packages/shared/src/economy.ts`, `packages/shared/package.json` | 경제 응답 타입(새 진입점 `@terra/shared/economy`, 첫 화면에 넣지 않음) |
| `apps/server/src/economyView/catalog.ts` | 팩 → 화면 목록(켜진 항목, 레시피 기준 시간) |
| `apps/server/src/economyView/previewWorld.ts` | 시안 도시·창고·지갑 |
| `apps/server/src/economyView/previewMarket.ts` | sim `createGoodsMarket`에 시드 주문을 넣은 시안 거래소(24시간, 10분 칸, 캐시) |
| `apps/server/src/economyView/marketShape.ts` | 호가 단계·봉·체결·24시간 수치(순수, 거래소가 열리면 재사용) |
| `apps/server/src/economyView/previewExchange.ts` | sim `clearCallAuction` 시안 환전 |
| `apps/server/src/economyView/previewProduction.ts` | 시안 시설·반복 예약·급여(sim `batchDurationMs`) |
| `apps/server/src/economyView/services.ts`·`worldSource.ts` | 경제 조회 서비스(실제 원장 잔고 읽기 + 시안), 월드 원장 읽기 |
| `apps/server/src/economyView/economyView.test.ts`, `apps/server/src/trpc/economy.test.ts` | 단위·라우터 시험 |
| `apps/server/src/trpc/economy.ts`·`router.ts`·`context.ts`·`createContext.ts` | 라우터·맥락(`economy` 서비스) |
| `apps/server/src/app.ts`·`main.ts` | 팩 목록을 앱에 넘기고 월드 원장을 잇는다 |
| `apps/server/src/trpc/planetEditorRouter.test.ts` | 손으로 만든 맥락에 `economy` 칸 |
| `apps/game/src/economy/*`(화면 9, 순수 모듈 4 + 시험 2, CSS 2) | 경제 화면 |
| `apps/game/src/shell/routeViews.tsx`·`Shell.tsx`, `apps/game/src/sections/ComingSoon.tsx` | 주소 → 경제 조각, 메뉴 지금 화면, 준비 중에서 경제 빼기 |
| `apps/game/messages/{ko,en}.json` | `economy_*` 203키(ko·en) |
| `e2e/economy.spec.ts` | 화면 시험·사진 |
| `docs/adr/2026-10-29-app-shell.md` | "구현하며 정한 것 (경제·거래창 화면)" |
| `docs/questions/2026-10-31-ui-economy.md` | 기획 질문 141~152 |

## 검사·시험 결과
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check`: 통과(시험 파일 260개·2,324개, DB 시험 포함). 그 뒤 CSS만 고친 것은 `pnpm format:check`·`check:contrast`·oxlint로 다시 봤다.
- `pnpm e2e economy.spec.ts shell.spec.ts`(마지막 고침 뒤 빌드한 앱·서버, chromium-1243): 28개 통과(경제 13 + 틀 15, 4.4분). 앞선 실행에서 차트 접기 시험이 봉 클래스 이름 충돌(`eco-chart-body`)로 실패해 고쳤다. 사진 65장(8칸 × 390·1440 × 파스텔·다크 × 한국어·영어 = 64장 + 큰 값·긴 이름 1장), 폴더 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/ui-economy/shots/`. 전체 사진은 화면에 붙은 하단 탭을 사진 동안만 숨긴다.
- 사진으로 고친 것: 좁은 카드의 제목이 낱말 가운데서 나뉨(`overflow-wrap: anywhere` → 제목은 `break-word`, "시험" 표는 다음 줄로), 넓은 물건 목록에서 값이 "1,34 / 2"로 나뉨(`white-space: nowrap`), 넓은 호가 화면의 차트가 작음(옆 패널 3:2), 영어 수 1의 복수형("1 batches").
- 시안 시장 만들기: 처음(시장 24개) 약 130ms, 캐시 뒤 1~2ms(개발 컨테이너 tsx 1회, Verified).
- `pnpm check:bundle`: 첫 화면 JS 127,772B(main `f38e088` 즈음 빌드, main 작업 트리 dist) → 128,919B(+1,147B), 상한 131,416B 그대로(남음 2,497B). 늘어난 것: 주소 표 줄·`menuRoute`(routes 조각 +166B), 화면 이름 메시지 5개, 그리고 rolldown이 `auth/session.ts`를 첫 화면 조각에서 따로 떼어 미리 받는 조각 `session-*`(1,665B)으로 나눔(index 96,225 → 95,541B). 경제 조각이 `inbox/preview.ts`·`auth/session.ts`를 함께 쓰게 되면서 공용 조각 나눔이 바뀐 것으로 보인다(Assumed, AGENTS 6장의 "지연 조각을 더하면 공용 조각 나눔이 바뀐다"와 같은 현상. 경제 조각에서 `refreshSession` 가져오기를 빼 봐도 그대로였다: 128,920B). 경제 모듈은 첫 화면에 없다(빌드 소스 맵: 화면 이름 메시지만).
- 경제 조각 크기(원본): `EconomyScreen` 12.1KB, `MarketBookView` 22.6KB, `ProductionView` 7.8KB, `ExchangeView` 7.3KB, 나머지 3~5KB. CSS 12.1KB + 8.5KB.

## 함께 바꿔야 하는 파일
- 서버 거래소를 열 때(R5·L1): `apps/server/src/economyView/services.ts`의 `not_ready` 갈래를 실제 시장으로, 주문·취소 WebSocket 메시지(`packages/protocol`)를 만들고 주문표 [주문]·내 주문 [취소]를 켠다(`apps/game/src/economy/market/OrderFormPanel.tsx`·`OrdersView.tsx`). 호가·봉 모양은 `marketShape.ts`를 그대로 쓴다.
- 처리할 일 `order_filled`·`order_expired` 종류를 만들 때 이동 화면을 `economy_orders`로.
- 주소를 더하면 `shell/routeViews.tsx`(ROUTE_TITLES·renderRoute)와 `sections/ComingSoon.tsx`(Exclude 목록)가 타입 오류를 낸다.

## 건드리지 말 것
- `packages/sim`(규칙 줄기 R4b 몫). 시안은 sim을 읽기만 한다.
- 시안 값(`previewWorld.ts`·`previewMarket.ts` 등)은 게임 규칙이 아니다. 기획 판단에 쓰지 않는다.

## 미검증·TODO·알려진 문제
- 실제 원장 잔고 줄은 S3 시험 자원(`s3_test_credit`·`s3_test_ore`)뿐이다. 시험 계정(e2e)에는 주체가 없어 "아직 가진 것이 없습니다"만 확인했다(실제 주체가 있는 계정의 화면은 미실행).
- 휴대폰 실기기·사파리 미확인(헤드리스 chromium만). `color-mix()`·`@media (width < 64em)`는 기준선 브라우저(사파리 16.4+)가 지원한다(Assumed: 문서 기준, 실기기 미확인).
- 호가창은 받을 때 한 번 그린다(실시간 피드 없음, 시안은 10분 칸마다 바뀜). 실시간 호가 피드는 서버 거래소와 함께(ADR 37 1절 "구독 도우미").
- break-ui 점검: 390px 한국어·영어에서 긴 도시 이름(27자·45자), 12자리 값·9자리 잔량(e2e 응답 고침), 10자리 지갑, 빈 목록(플레이어: 곧 열림·빈 창고), 수 1의 영어 복수형(문구를 "Queued: {count}" 꼴로 바꿈)을 봤다. 320px·글자 200%·오른쪽에서 왼쪽 쓰기는 보지 않았다.
- `routes.ts`가 618줄, `routes.test.ts`가 624줄로 600줄 경고(실패 아님). 다음에 주소 표가 늘면 나눈다.

## 사용자 결정 대기
- 기획 질문 141~152(`docs/questions/2026-10-31-ui-economy.md`). 특히 141(오르내림 색)·142(화폐 소수점)·149(주문 한도 셈법)는 화면 모양을 바로 바꾼다.
- 차트 꾸러미를 쓰지 않고 SVG로 그렸다. 지표(이동 평균 등)가 필요하면 꾸러미 ADR이 필요한지 그때 묻는다.
