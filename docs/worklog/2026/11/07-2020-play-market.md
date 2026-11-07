# 플레이 흐름 WP6: 도시 거래소 값이 나라 화폐가 되고, 환전 동시호가가 열리고, 없는 동안 체결된 주문이 복귀 요약에 보인다

- 일시: 2026-11-07 20:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP6 나라 화폐·체결 알림"(이 절만 더함), `2026-10-31-economy-core.md`(5·6절 환전·중앙은행, 고치지 않음), 질문 534·537·538 답(D-518, 미러 `c79d6bd`)·새 질문 560~564 `docs/questions/2026-11-07-play-economy.md`, 가지 `work/play-market`(main `d5a320b` 위)

## 한 일
- D-515: 수치는 [임시](로트 10, 1인당 하루 거래액 200, 회차 1시간, 한 회차 주문 10개), 모양이 빈 것은 기본안 + 질문 560~564.
- **534 가 — 나라 화폐**
  - `apps/server/src/npc/currency.ts`(새): 세력 → 나라 프리셋(시험 NPC 세력 = 16번째 프리셋, `npc_nation_NN` = nationCode 자리 프리셋, 없으면 반란 부모·종주) → 화폐 `cur:<코드>`·세율, 화폐마다 찍는 나라(자기 프리셋을 가진 살아 있는 고정 나라), 처음 발행 E6(인구 = 휴먼 수와 시작 도시 주거 합 중 큰 쪽 [임시], 키 `npc_mint:<화폐>`).
  - `npc/economy.ts`: 시험 화폐 고정을 걷어내고 위 화폐·세율·발행 나라를 시뮬 경제 자료에 넣었다. `Economy.fx` = 환전 시장 모음, `issuer` = 찍는 나라 → 시뮬 `onFx`(발행 나라 시장 조성 `quoteFx` + 동시호가 체결)·NPC 환전(`requestCurrency`)·하루 끝 `bankDay`가 그대로 돈다. 거래소 끔(N53)이면 환전 회차도 건너뛴다. `nextFxAt()`(화면 "다음 체결까지").
  - `market/fx.ts`(새): 환전 시장 모음 — 짝 ID 고정(`fx_pairs`), 내기·거두기·회차마다 주문 줄(`fx_orders`)·회차 줄(`fx_rounds`)을 쓰기 대기열에, 유저 끝난 주문은 남기고 NPC 주문은 지움, 부팅 복원(걸린 주문 같은 차례·지난 체결가). `market/load.ts` `loadFx`.
  - `market/books.ts`·`load.ts`: 거래소 줄·체결 줄에 화폐를 남긴다. 부팅 때 남긴 화폐(빈 칸 = WP4 시험 화폐)로 걸린 주문을 되살린 뒤 도시 화폐와 다르면 시뮬 `retarget`(돌려줌 → 새 화폐), 쓰지 않던 옛 거래소도 처음 쓸 때 줄을 고친다. 화폐가 바뀌면 메모리 체결 창을 비운다.
  - 시뮬 `packages/sim/src/economy/fxMarket.ts`: 서버 몫만 더함(`cancel` = 회차 전 거두기, `restore` = 걸린 주문·지난 체결가, `run().fills`, `place().orderId`). 기본 동작 그대로라 `SIM_VERSION` 16.
  - 유저 환전: 프로토콜 15 `fx_place`·`fx_cancel` → `fx_result`(최소 14, `packages/protocol/src/market.ts`), 서버 `market/service.ts` `fxPlace`·`fxCancel`(정산 뒤 묶음, 한 회차 10개, 커밋 뒤 답), `gateway.ts`·`session.ts` 나누기.
  - 화면 자료: `market/fxViews.ts`(새, 예상 체결가 = 모인 주문 + 나라 시장 조성 어림값, 지난 24회차, 내 주문·지난 결과), `market/views.ts` 화폐 칸 = 그 도시 거래소 화폐(팩 화폐 코드), `economyView/services.ts` `exchange` 실제 자료. 공유 타입 `FxMyOrder`·`FxMyDone`·`EconomyExchangeResponse.open/done/maxOrders`.
  - 화면 `apps/game/src/economy/ExchangeView.tsx`: [환전 주문 내기]·결과 알림·내 이번 회차 주문 [거두기]·지난 결과·회차가 지나면 다시 받기. `market/marketCommands.ts` `sendFxCommand`. 거래창 주문표에서 화폐가 모자라면 [환전하러 가기](`OrderFormPanel.tsx`). 메시지 22개 ko·en, 환전 곧 열림 문구 고침.
  - 불변 조건 M2(`world/invariants.ts`), 쓰기 대기열 표 셋·열 둘(`world/persist/tables.ts`), 국고 지표 = 나라 화폐(`npc/runtime.ts` 한 줄).
- **538 다 — 복귀 요약 거래 칸**: `world/summarySources.ts` `marketSource`(마지막 확인 뒤 내 걸린 주문이 남과 체결된 수 + 만료 수 + 체결된 환전 주문 수, 누르면 `/economy/orders`), `@terra/shared/inbox` `SUMMARY_SECTION_KINDS`에 `market`, 기기 `summary/summaryText.ts`·메시지 `summary_section_market`. 실시간 `market_fill`은 그대로.
- **537 가**: 지금 코드가 이미 답이다(시장가는 남은 양을 걸지 않고 돌려줌, `market/service.ts` `place`). 바꾸지 않고 문서에 적었다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/economy/fxMarket.ts`·`index.ts`·`callAuction.test.ts` | 서버 환전 몫(거두기·복원·주문별 체결·주문 ID), 시험 하나 더함 |
| `packages/protocol/src/market.ts`·`index.ts`·`version.ts`·`market.test.ts`·`cyborg.test.ts`·`facilities.test.ts`·`ruins.test.ts` | 환전 메시지, 프로토콜 15(최소 14) |
| `packages/shared/src/economy.ts`·`inbox.ts` | 내 환전 주문 타입, 복귀 요약 거래 칸 |
| `apps/server/src/npc/currency.ts`(새)·`npc/economy.ts`·`npc/runtime.ts` | 나라 화폐·처음 발행·환전 시장·중앙은행 연결 |
| `apps/server/src/market/fx.ts`(새)·`fxViews.ts`(새)·`books.ts`·`load.ts`·`service.ts`·`gateway.ts`·`views.ts`·`books.test.ts`·`market.db.test.ts` | 환전 모음·화면 자료·명령, 거래소 화폐 저장·바꾸기 |
| `apps/server/src/db/marketSchema.ts`·`db/schema.ts`·`drizzle/20261107105609_fx_currency/` | 표 셋 + 화폐 열 둘(더하기만) |
| `apps/server/src/world/persist/tables.ts`·`world/invariants.ts`·`world/summarySources.ts` | 쓰기 대기열 표, M2, 거래 칸 |
| `apps/server/src/economyView/services.ts`·`session.ts` | 환전 실제 자료, 환전 메시지 나누기 |
| `apps/game/src/economy/ExchangeView.tsx`·`market/marketCommands.ts`·`market/OrderFormPanel.tsx`·`economyText.ts`·`summary/summaryText.ts`·`map/mapFeed.ts`·`messages/{ko,en}.json` | 환전 화면·명령, 환전으로 가는 길, 거래 칸 이름, 새 서버 메시지 거르기 |
| `e2e/economy.spec.ts`·`e2e/summary.spec.ts` | 플레이어 환전 내기·거두기, 실제 환전 사진, 거래 칸 |
| `docs/adr/2026-11-07-play-flow.md`·`docs/questions/2026-11-07-play-economy.md`·`docs/PLAN.md` 14장 | 결정·질문·요약 |

## 함께 바꿔야 하는 파일
- 합칠 때(다른 줄기): 프로토콜 판은 이 줄기가 15(최소 14)다. 다른 줄기도 15면 `version.ts` 주석 15 줄을 합치고 판 숫자를 박은 시험(`market.test.ts`·`cyborg.test.ts`)은 같은 값. `npc/economy.ts`·`market/*`·`session.ts`·`economyView/services.ts`·`messages/{ko,en}.json`·`e2e/economy.spec.ts`는 다른 경제 줄기와 겹칠 수 있다. 마이그레이션이 여럿이면 갈래로 그대로 합친다(AGENTS 6장 Drizzle).
- 질문 530(도시 매입 호가 시뮬에도)·531·533(나라마다 특산)·535(폐허 창고 유저 물건 옮김)를 넣는 줄기: 화폐는 `economy.currencyOf`(나라 화폐)이고, 폐허 처리 시뮬 `cityRuined`가 도는 자리는 그대로다.

## 건드리지 말 것
- `fx_pairs.id`는 환전 에스크로 계정(`escrow:fx:<짝>:base·quote`) 열쇠, `market_books.id`는 거래소 에스크로 열쇠다. 다시 매기지 않는다.
- `market_books.currency`는 부팅 복원이 걸린 주문을 되살리는 화폐다(빈 칸 = 시험 화폐). 손으로 바꾸면 에스크로가 어긋난다.
- `fx_orders.locked`는 M2가 원장과 견준다(쓰기는 `market/fx.ts` 한 곳).
- 환전 로트(`SERVER_ECONOMY_SETTINGS.fxLot`)는 짝 줄에 남기지 않는다. 바꾸려면 걸린 환전 주문이 없을 때(회차 직후) 바꾼다(되살린 팔 주문의 묶인 양이 로트 × 수량이라).

## 미검증·TODO·알려진 문제
- 검사 결과는 아래 "끝 검사".
- 실제 NAS(봇 1,000·국가 4)에서 환전 회차·시장 조성 양·나라 국고(처음 발행분)의 흐름은 재지 않았다(미실행). NPC 구인 카드·연구 값은 이제 나라 화폐 국고에서 나간다(시뮬과 같다).
- 직전 판 앱으로 되돌리면 그 앱은 화폐 칸을 몰라 거래소를 시험 화폐로 다시 만든다(나라 화폐로 걸린 살 주문 에스크로가 어긋남 → M1 경고). 되돌리기 전에 걸린 주문을 거두는 것이 안전하다.
- 중앙은행 미소각 이자·NPC 세율 규칙식 세율은 메모리(다시 켜면 처음 값). 환전 회차는 켠 시각 + 1시간마다(정시 아님, 질문 564).
- 처리할 일 `order_filled`·`order_expired`는 넣지 않았다(질문 562, 확인 저장 `inbox.ack`가 먼저).
- 로트 10이라 환율 눈금이 거칠다(로트당 1 = 10%, 질문 561).

## 끝 검사
- (끝에 채움)

## 사용자 결정 대기
- 질문 560~564(`docs/questions/2026-11-07-play-economy.md` 끝 "WP6").
