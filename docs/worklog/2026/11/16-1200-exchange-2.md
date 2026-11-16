# 거래소 건물 2: 개인 창고·거래 직무·NPC 거래소 운반·이용료 (D-571)

- 일시: 2026-11-16 12:00 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-571(질문 1941·1943·1944 답), 기존 결정으로 답한 1945(D-212·D-564 1626)·1947(D-148·D-7006)·1948(D-564 1682·D-548·D-160)·1950(D-559)·
  1951, C*(1942·1946·1949·1952·1953). ADR `docs/adr/2026-11-16-exchange-buildings.md` "바뀜 (D-571)"(덧붙임), 질문 `docs/questions/2026-11-16-exchange-buildings.md`
  (답 표시)·`docs/questions/2026-11-16-exchange-2.md`(새, 2081~2092). 가지 `work/exchange-2`(바탕 ddb2136). 프로토콜 56(최소 55), 팩 core@123,
  SIM_VERSION 그대로(57), 마이그레이션 `20261116023036_exchange_lockers`.

## 한 일
1. **1941 거래소 없는 도시**: 지금대로(물자 주문 막고 사업장 직판만). 코드 바뀜 없음, 질문 문서에 답 표시.
2. **1943 개인 창고**: 산 물건·돌려받는 물건의 자리(그 도시 물자 거래소 건물 창고)를 **주인마다 개인 창고**로 본다(원장 계정이 이미 주인마다라 물건은
   옮기지 않는다). 크기 = 기본 + 넓힌 칸 × 한 칸(설정 칸 `exchange_locker_g`·`_step_g`·`_max_steps`), 쓰는 무게 = 창고 물건 + 그 도시 걸린 내 팔·사기
   남은 양. 새 사기 주문(`locker_full`)·반입(운반꾼 떠날 때 `storage_full`)만 막는다. 넓히기 `market_locker_expand`(새 메시지) = 그 도시 화폐로 한 칸 값
   (`exchange_locker_step_price`)을 그 거래소 건물 금고에(사업장 장부 수입 `exchange_locker`), 칸 수는 새 표 `exchange_lockers`(도시 × 주인).
3. **1944 거래 직무**: 주문 한도의 배치 유닛 = 노동 직무 배치(`labor_assign` 꼴 그대로)로 물자·외환 거래소에 둔 내 유닛. 남의 거래소에도 둔다(주인마다
   `exchange_trade_slots` 자리, 산출 없음, 주인이 바뀌어도 풀리지 않음). "건물 3칸 안" 규칙(`EXCHANGE_STATION_CELLS`·`cellsFromRect`)은 없앴다.
   남의 거래 직무 유닛은 운반꾼이 되지 않는다(`gather/porter.ts`).
4. **1945 NPC**: 서버 NPC도 그 도시에 일하는 물자 거래소 건물이 있어야 주문(없으면 거절). NPC 물건 자리 = 거래소 건물 창고. 팔기는 건물 창고에 있는
   만큼 바로, 나머지는 보이지 않는 운반꾼 시간(유저 반입과 같은 `haulMs`, 도시 칸 → 건물 가운데) 뒤 도시 창고에서 옮겨 건다. 건물 창고에 남은 NPC 물건은
   같은 시간 뒤 도시 창고로(`market/npcHaul.ts`, 런타임 틱 5초). **시뮬은 바꾸지 않았다**(근거: 시뮬 경제에 2차맵·건물 자리가 없어 거리를 셀 수 없고,
   NPC 규칙은 도시 창고를 자리로 쓴다 → 서버 거래소 모음 감싸기에서만 더함, SIM_VERSION 57 그대로. 갈라짐은 질문 2091).
5. **1947**: 질문 문서 "가" — 지금대로(화폐 나라 도시에 외환 거래소가 하나라도 있으면 누구나 어디서든). 환전 한도는 외환 거래소 거래 직무 유닛으로 센다.
6. **1948 이용료**: 물자 거래소 체결마다 판 쪽이 총액 × `exchange_fee_bp`(50) ÷ 10000(버림)을 그 거래소 건물 금고에(사업장 장부 `exchange_fee`, 소득세
   포함). NPC도 낸다. 거래세(국고) 그대로.
7. **1950**: 이미 30% 아래 정지(건물 서비스 `works`). 거래창이 "거래소 없음"과 "멈춤"(`exchangeStopped`)을 나눠 알린다.
8. **C\***: 지금대로, 질문 문서에 답 표시.
9. **화면**: 거래창 거래소 칸(`ExchangeDesk.tsx`) — 개인 창고 막대·[넓히기 +200kg (100)]·넓힌 칸, 거래 직무 n/5·내 유닛 목록·[빼기]·쉬는 유닛 고르기
   [거래 직무에 두기], 멈춤 알림. 문구 ko·en 16개.

## 지금 세계 옮기기 (리셋 필요 없음)
- **리셋 필요 없음.** 거래소 건물 창고 물건은 이미 (주인, 물건, 건물 위치) 계정이라 그대로 각자 개인 창고로 읽힌다. 크기보다 많이 든 옛 창고도 물건은
  그대로(새 사기·반입만 막힌다 — 넓히면 풀린다).
- 표 `exchange_lockers`는 더하기만(줄이 없으면 넓히지 않은 기본 크기). 직전 판 앱은 모르는 표로 그대로 돈다.
- 걸린 NPC 팔 주문(도시 창고에서 묶인 에스크로)은 그대로 남고, 거두거나 만료되면 거래소 건물 창고로 돌아와 운반 시간 뒤 도시 창고로 간다.
- 거래 직무는 새로 두는 것(옛 "3칸 안" 유닛은 이제 한도를 늘리지 않는다).
- 55판 기기는 56 서버에 붙는다(`locker_full`은 `invalid_amount`로 낮춤, 넓히기 메시지는 보내지 못함). 54판 이하는 새 앱을 받는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/businessCoefficients.ts`·`tuningBusiness.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 `exchange_*` 여섯(서버만 읽음), 팩 core@123 |
| `packages/shared/src/exchange.ts`·`exchange.test.ts` | 개인 창고 크기·자리 식, 3칸 규칙 없앰 |
| `packages/shared/src/economy.ts` | 거래창 칸 `locker`·`desk`·`exchangeStopped` |
| `packages/shared/src/businessBooks.ts` | 장부 칸 `exchange_fee`·`exchange_locker`(수입)·`npc_exchange_haul`(물건) |
| `packages/protocol/src/market.ts`·`index.ts`·`version.ts`·`market.test.ts` | 56(최소 55), `market_locker_expand`, `locker_full`·`locker_max` |
| `apps/server/src/db/marketSchema.ts`·`schema.ts`(줄 수 그대로)·`drizzle/20261116023036_exchange_lockers/`·`world/persist/tables.ts` | 넓힌 칸 표 |
| `apps/server/src/market/lockers.ts`(새)·`lockerRoom.ts`(새)·`exchangeDesk.ts`(새)·`npcHaul.ts`(새) | 개인 창고, 반입 전 자리, 거래창 칸 자료, NPC 운반 |
| `apps/server/src/market/books.ts` | 이용료, NPC 막기·운반 대기·돌려보내기, NPC 물건 자리 |
| `apps/server/src/market/service.ts`·`gateway.ts`·`views.ts`·`appSource.ts`·`worldInput.ts`·`exchangeBuildings.ts`·`exchangeStock.ts` | 사기 자리 확인·넓히기, 55판 낮춤, 화면 자료, 거래 직무로 한도, NPC 운반 시간 |
| `apps/server/src/npc/economy.ts` | 이용료·NPC 운반 고리, 개인 창고 줄 읽기(`ServerEconomy.lockers`) |
| `apps/server/src/labor/service.ts`·`workBook.ts`, `facilities/world.ts` | 거래 직무(`tradeDesk` — 남의 거래소, 주인마다 자리) |
| `apps/server/src/gather/world.ts`·`porter.ts` | 반입 전 개인 창고 자리, 남의 직무 배치 유닛은 운반꾼 아님 |
| `apps/server/src/session.ts` | 넓히기 메시지 길(56) |
| `apps/server/src/market/exchange2.test.ts`(새)·`exchangeBuildings.test.ts`·`market.db.test.ts` | 이용료·NPC·개인 창고·거래 직무 한도·멈춤·넓히기·다시 켬 |
| `apps/game/src/economy/market/ExchangeDesk.tsx`(새)·`MarketBookView.tsx`·`marketCommands.ts`·`marketText.ts`·`market.css`, `messages/{ko,en}.json` | 화면 |
| `e2e/economy.spec.ts` | 개인 창고·거래 직무 칸 |
| `docs/adr/2026-11-16-exchange-buildings.md`(바뀜 절)·`docs/questions/…` | 결정·질문 |

## 함께 바꿔야 하는 파일
- 프로토콜: 48~55는 같은 날 다른 줄기들이 쓴다. 합칠 때 `version.ts` 설명 차례·`MIN_SUPPORTED_PROTOCOL_VERSION`(55)을 맞춘다.
- 팩: 116~122는 다른 줄기. 합칠 때 판 차례·`tuning.json` 같은 자리(business_service_fee_pm 뒤) 충돌을 본다.
- 마이그레이션: 형제가 생기면 그대로 합친다(다시 만들지 않는다 — AGENTS 6장 Drizzle).
- 사업장 4 줄기가 사업장 장부·운반을 고치면 `porter.ts` 거르기 한 줄·`businessBooks.ts` 칸 세 줄이 겹칠 수 있다.

## 건드리지 말 것
- 시뮬 판정(`packages/sim/src/simulator/npcTrade.ts`·`goodsMarket.ts`): NPC 거래소 건물·운반은 서버만(질문 2091). 시뮬에 넣으면 SIM 판을 올린다.
- `world.ts`·`app.ts`·`npc/runtime.ts`·`facilities/service.ts`: 고치지 않았다.

## 미검증·TODO·알려진 문제
- 거래 직무 배치(`labor_assign` → 남의 거래소) 서버 길은 DB 시험으로 돌리지 않았다(한도 셈은 단위 시험, 화면 칸은 e2e가 보임만 본다) — Assumed.
- NPC 운반은 단위 시험만(서버 DB 세계에서 NPC 팔기가 운반 시간만큼 늦게 오르는지는 미실행). 서버 NPC 도시 사이 운송이 바로(shipMs 0)라 거래소 건물
  창고의 NPC 물건을 다음 거래 판단이 다른 도시로 먼저 데려갈 수 있다(질문 2091).
- 반입 중 짐이 닿을 때는 자리를 다시 보지 않는다(떠날 때만). 거래 직무 유닛은 채집 직무 칸을 써서 피로가 쌓인다(질문 2084).
- 화면 시험 1440px 배치·사진(시안 화면) 넷은 사진 단계에서 Chromium "Unable to capture screenshot"(공유 기계 디스크 99~100%, 기기 배율 3 큰 사진 —
  앞 기록 `11/02-2135-gather-tier`·`11/15-1010-gather-objects-2`와 같은 환경 문제로 본다, Assumed). 넘침·작은 누르는 곳 판정은 사진 전에 통과했다.
- 검사 결과는 아래.

## 검사
- Verified 전체 `pnpm check`(TEST_DATABASE_URL 있음, 잠금 안): 포맷·린트·타입·경계·파일 크기·다국어·디자인 값·콘텐츠·단위 시험 통과 — 시험 파일 750개, 시험 5,654개
  모두 통과(처음 두 번은 포맷 한 곳·oxlint 함수 자리 둘·`schema.ts` 1,007줄로 걸려 고친 뒤 다시 돌림 — `schema.ts`는 거래소 표 다시 내보내기를 `export *`
  한 줄로 줄여 998줄, `db:generate` "No schema changes").
- Verified 새·바꾼 시험: `market/exchange2.test.ts`(이용료·NPC 막기·운반 대기·돌려보내기·개인 창고 무게), `exchangeBuildings.test.ts`(거래 직무 한도·멈춤),
  `market.db.test.ts`(화면 자료 개인 창고·거래 직무 칸, 넓히기 → `exchange_locker` 거래·`exchange_lockers` 줄, 다시 켜도 칸 수 그대로),
  `packages/shared/src/exchange.test.ts`, `packages/protocol/src/market.test.ts`(56 메시지·코드).
- Verified `pnpm check:content ddb2136`(호환 포함) 통과 — core@123. `pnpm check:docs` 통과.
- Verified `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,092 B / 상한 131,416 B(바꾼 화면은 경제 지연 조각).
- Verified 화면 시험(빌드한 앱, 헤드리스) `economy.spec.ts` 25개: 13 통과(거래창 개인 창고·거래 직무 칸 확인 포함), 12 실패 = 사진 단계 "Unable to capture
  screenshot"(디스크 100%). 일꾼 하나로 다시 돌려 실제 거래소 사진 넷(거래창 390px 파스텔·다크 × 한국어·영어, 넘침·작은 누르는 곳 검사 포함) 통과,
  배치·사진 390px 넷 통과, 1440px 넷은 같은 사진 오류(위 미검증). 사진: 저장소 밖 `scratchpad/exchange-2-shots/economy-live-book-{pastel,dark}-{ko,en}-390.png`
  (거래소 칸 — 개인 창고 0/200kg·넓히기·거래 직무 0/5·사이보그 고르기).
- 미실행: `build-mode`·`facilities`·`building-screen` spec(그 화면은 바꾸지 않았다).

## 사용자 결정 대기
- 질문 2081~2092(`docs/questions/2026-11-16-exchange-2.md`).
