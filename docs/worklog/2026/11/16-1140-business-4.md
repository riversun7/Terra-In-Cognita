# 사업장 4차: 끊기지 않는 임금·적자 멈춤·외주 수리·NPC 운반꾼·NPC 장부·적정가 (D-570)

- 일시: 2026-11-16 11:40 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-570(1789 원문 "적자는 기본적으로 멈춰야한다. 중단이 어려울때 마지막을 적자처리하고 마지막 사이클을 돌리고 재정안정될때까지 운영중단 원칙.", 1822 원문
  "당연히 판매자가 정하지, 적정가격 계산은 필요 재료비 인건비, 수수료 세금 등을 대략계산하여 가격설정시 보여줌.(모든 제작이 그러함)")·D-564 1623·1626·1627·1682·D-555 1502·
  1504·1505·D-212·D-569, ADR `docs/adr/2026-11-15-business-ledger.md` "바뀜 (D-570)", 질문 `docs/questions/2026-11-16-business-4.md`(2041~2057), 답 반영
  `docs/questions/2026-11-15-business-2.md`·`2026-11-16-business-3.md`, 가지 `work/business-4`(바탕 a8fbaf1), 프로토콜 54(최소 53), 팩 core@121, SIM_VERSION 63,
  마이그레이션 없음

## 한 일
1. **1783 다음 임금만큼 남김 — 했음**: 지급준비금 남길 돈 = max(비율 셈, 바닥), 바닥 = 열린 임금형의 다음 정산까지 낼 임금 합. 0%여도 남긴다. 장부 응답
   `reserve.lines[].floor`, [관리] 칸에 "늘 남김(다음 임금)" 줄(Verified: `core.test.ts`·`business.db.test.ts`).
2. **1785 외주 수리 — 했음**: 남의 공방은 **그 공방 일꾼**(직무 배치·임금형, 다른 작업 없음)이 고친다 — 보낸 unitIds는 보지 않는다. 요금 = 주인이 정한 **시간당 요금** ×
   걸리는 시간(값 표 `business_prices`의 `service:equipment_repair` 줄 — 새 표·열 없음), 정하지 않았으면 적정가, 0이면 받지 않음(`service_closed`), 일꾼이 없으면
   `no_shop_worker`. 재료는 맡기는 사람이 낸다(질문 2048). 수리 줄이 있는 공방을 일터로(직무 배치 가능, 자리 = 레벨 × 레벨당 자리, 0이면 1). 작업 동안 공방 일꾼의 원래
   직무 산출은 쉰다(`pausesFor`를 유닛 주인 기준으로, `dropJob`이 일꾼 주인도 정산). 장비 수리 코드를 `facilities/equipmentRepair.ts`로 옮겼다(service.ts 983 → 960줄).
   화면: 건물 판 [관리]에 "외주 수리" 칸(시간당 요금·적정가·일꾼 수·[요금 정하기]·[적정가로]), 경제 화면 장비 수리 줄은 남의 공방이면 내 장인 없이 서버 견적 시간·일꾼 수.
   옛 설정 칸 요금(재료 기준 값 × 20%)은 없앴다(Verified: `facilities.db.test.ts` 외주 시험).
3. **1788·1789 적자 = 멈춤·자동 해고 없음·고용 막기 — 했음**: 보증금·금고로 덮지 못한 임금은 **임금 주기 하나만** 적자로 넣고 그 주기 끝 시각에 멈춘다(`core.stopAfter` —
   `business_states.suspended_at_ms`에 앞날 시각을 적는다, 그 전까지는 돈다). 재정 안정(적자 0 + 금고 ≥ 다음 임금)이면 갚기·넣기·매출·자동 정산 때 풀린다. 임금형은
   보증금이 0이 되어도 끝내지 않고 일시 중지(`@terra/sim` payDue — SIM 63). 새 임금형(직접 고용·구인 받기)은 금고에 한 주기 임금이 없거나 멈춘 사업장이면 막는다
   (`insufficient_funds`·`employer_insufficient_funds` — 적자로 미리 넣지 않는다). 화면: 장부 알림 "마지막 한 주기만 적자로 돌립니다, ○시에 멈춤", 멈춤 문구를 새 규칙으로.
4. **1790 주인 또는 대주주 — 했음**: 지급준비율은 건물 주인(대주주가 아니어도)·대주주·운영자(`commands.ts` reserve). 정산·값 정하기는 예전처럼 대주주(질문 2047).
5. **1886 보이는 NPC 운반꾼 — 했음**: 보는 사람(구독자)이 있는 2차맵에서, 옮김 칸이 있는 건물 시설의 첫 일꾼 휴먼이 이번 산출의 끝 몫(시뮬과 같은 옮김 시간, 짧으면 한 번
   오가는 시간 + 20초) 동안 가장 가까운 창고 둘레로 걸어갔다 일터로 돌아간다(`BotHome.haul`, `humanPlaces` → `bots.ts` targetOf·arrivalIdleMs). 판정은 시간 셈 그대로(모습만,
   화물 없음 — 질문 2052). 보지 않는 2차맵은 일정을 붙이지 않는다.
6. **1887 NPC 장부 — 했음(손익 몫)**: NPC 세력 시설 산출마다 그 도시(나라)가 시세(거래소 마지막 체결가, 없으면 팩 시작 시세)에 사들인 매출(`business_sale`)과 레시피 재료
   재료비(새 거래 종류 `business_input`, 장부 새 칸 "재료비")를 시설 금고에 적고 바로 국고로 정산(국고 합 그대로, 같은 주머니라 소득세 없음). 설정 칸 `business_npc_books`
   (기본 1)로 끈다. 물건 흐름(도시 창고 바로)·시뮬 판정은 그대로(질문 2053·2054). 1분 지표 `econNpcSales`.
7. **1822 적정가 — 했음**: `@terra/shared/fairPrice`(적정가 = (재료비 + 인건비 + 수수료) ÷ (1 − 소득세율), 수수료 = 설정 칸 `business_service_fee_pm` — 이름을 "적정가
   수수료"로). 창고 물건(장부 기간 임금 지출 ÷ 산출, 재료 0 — 질문 2055)·외주 수리(시간당 공방 일꾼 인건비 — `labor.hourlyLabor`)·배 주문(배 종류마다 재료 기준 값 + 조선소
   인건비 × 만드는 시간)에 값을 정하는 사람에게 보인다. 판정 그대로.
8. **1784 확인**: 거래소 유저 물건은 거래소 건물 창고에만 있고 운반꾼·체결로만 들어간다. 남은 예외는 옮김 셈 끔·거리 0(설정 칸 시험 모드)과 NPC 물건 자리(질문 1945) — 그 밖의
   우회 길은 찾지 못했다(질문 2057, Verified: 코드 훑기 — `cityLocation(` 쓰는 곳 모두).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/economy/laborContract.ts`·`.test.ts`, `version.ts` | 자동 해고 없앰(보증금 0 → 일시 중지), SIM_VERSION 63 |
| `packages/sim/src/society/businessCoefficients.ts`, `tuningBusiness.ts`, `content/core/tuning.json`, `manifest.json` | `serviceFeePm` 뜻 = 적정가 수수료, `npcBooks` 새 칸, 팩 core@121 |
| `packages/shared/src/fairPrice.ts`(새)·`.test.ts`, `package.json` | 적정가 셈 |
| `packages/shared/src/businessBooks.ts` | `REPAIR_SERVICE_ITEM`, 칸 `materials`·거래 `business_input`, `ReserveView.floor`, `BookGoods.fair`, `RepairServiceView` |
| `packages/shared/src/facilities.ts`, `harbor.ts` | 외주 견적 `ms`·`workers`, 배 종류 `fair` |
| `packages/protocol/src/facilities.ts`·`business.ts`·`version.ts`·`index.ts` | 프로토콜 54: `no_shop_worker`·`service_closed`, unitIds 빈 목록, `service:equipment_repair` |
| `apps/server/src/business/reserve.ts`·`core.ts`·`commands.ts`·`books.ts`·`fairPrice.ts`(새) | 1783 바닥, 1789 멈춤 예약·재정 안정·고용 막기, 1790, 외주 요금, 적정가 |
| `apps/server/src/labor/service.ts`·`jobBoard.ts` | fundDueWages(마지막 한 주기 적자 + 멈춤), 고용 막기, `hourlyLabor` |
| `apps/server/src/facilities/equipmentRepair.ts`(새)·`service.ts`·`serviceTypes.ts`·`views.ts`·`appSource.ts`·`world.ts`·`gateway.ts` | 외주 수리(공방 일꾼·요금), 공방 = 일터, 53판 코드 낮추기 |
| `apps/server/src/boats/core.ts`·`service.ts`·`world.ts` | 배 주문 적정가 |
| `apps/server/src/world/bots.ts`, `npc/humanPlaces.ts`·`cityRest.ts`·`economy.ts`·`runtime.ts` | 보이는 NPC 운반꾼 |
| `apps/server/src/npc/npcBooks.ts`(새)·`economy.ts` | NPC 장부 |
| `apps/game/src/map/business/RepairService.tsx`(새)·`BooksParts.tsx`·`ReserveTools.tsx`·`businessText.ts`, `map/building/BuildingPanel.tsx`, `economy/FacilityCards.tsx`·`facilityText.ts`, `map/boats/HarborPanel.tsx`, `messages/{ko,en}.json` | 화면(새 문구 20개, 바꾼 문구 2개) |
| 시험: `world/testSupport.ts`(`fundTestVault`)·`core.test.ts`·`business.db.test.ts`·`labor.db.test.ts`·`facilities.db.test.ts`·`produce.db.test.ts`·`worldUnits.db.test.ts`·`travel.db.test.ts`·`retireOldWorkers.db.test.ts`·`cityRest.test.ts`·`fairPrice.test.ts`(새)·`laborContract.test.ts`·`facilities/gateway.test.ts`·`labor/gateway.test.ts`·`npcBooks.test.ts`(새)·`humanPlaces.test.ts`·`bots.test.ts`, `e2e/building-screen.spec.ts` | 바뀐 규칙 |
| 문서: ADR `2026-11-15-business-ledger.md` "바뀜 (D-570)", 질문 `2026-11-16-business-4.md`(새)·답 반영 둘 | 기록 |

## 함께 바꿔야 하는 파일
- 프로토콜 48~53은 같은 묶음의 다른 줄기 몫으로 비웠다. 합칠 때 `version.ts` 설명 차례와 `MIN_SUPPORTED_PROTOCOL_VERSION`(53)을 맞춘다. 53판 낮추기는
  `facilities/gateway.ts`(`OUTSOURCE_PROTOCOL_VERSION`).
- 팩 115~120, SIM 57~62도 다른 줄기 몫. 합칠 때 manifest 판(121)·SIM_VERSION(63) 설명 줄을 맞춘다.
- 배 줄기(D-570 1827 배 판매값): 주문 요금을 바꾸면 `boats/service.ts` types의 `fair`를 그 요금 화면 곁에 둔다.

## 건드리지 말 것
- `apps/server/src/labor/service.ts` 989줄·`npc/runtime.ts` 990줄·`facilities/service.ts` 960줄 — 더하면 나눈다.
- `app.ts`·`db/schema.ts`·`world/world.ts`는 고치지 않았다.

## 리셋 필요 여부
- **필요 없음.** DB 표·마이그레이션이 없다. 외주 요금은 기존 값 표에 새 줄(`service:equipment_repair`)로, 멈춤 예약은 기존 열(`suspended_at_ms`)의 앞날 값으로 적는다.
  이미 멈춘 사업장은 그대로(재정이 안정되면 풀린다), 이미 적자로 맺은 계약은 그대로 돈다. 옛 `deposit_used_up` 끝 계약은 기록 그대로. 옛 외주 수리 작업(내 장인)은 끝 시각에
  그대로 끝난다.

## 미검증·TODO·알려진 문제
- 보이는 NPC 운반꾼은 시험(단위)만 — 실제 2차맵에서 걷는 모습은 눈으로 보지 않았다(미검증). 일터에서 쉬던 휴먼은 쉼이 끝나야 일정을 알아챈다(일정을 늦게 받으면).
- NPC 장부는 산출마다 원장 거래 3개(매출·재료비·정산)를 더한다 — NAS 부하는 재지 않았다(Unknown). 크면 설정 칸 `business_npc_books` 0.
- 외주 수리 중 공방 일꾼이 임금형이면 임금은 계약대로 나간다(산출만 쉰다).
- 적정가 인건비(창고 물건)는 장부 기간에 산출이 없으면 0이다.

## 검사
- Verified `pnpm check`(TEST_DATABASE_URL 있음, 잠금 안): 포맷·린트·타입·경계·파일 크기·다국어(7,998키)·디자인 값·콘텐츠(core@121) 통과, 시험 파일 751개·시험 5,644개
  모두 통과. 첫 두 번은 실패 → 고침: ① oxlint `unbound-method`(`npcBooks.ts` 고리 꼴), ② 빈 금고 고용을 막아 옛 DB 시험 5곳이 계약을 못 맺음(시험 도우미
  `fundTestVault`로 금고를 채움 — `facilities.db`·`produce.db`·`worldUnits.db`·`travel.db`·`retireOldWorkers.db`), `cityRest.test`(옮김 칸에 `haulTo`).
- Verified `pnpm check:content main`(호환 포함) 통과 — core@121.
- Verified 빌드 + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,088 B / 상한 131,416 B(바탕 무렵 110,064 B — 바꾼 화면은 지연 조각).
- Verified 화면 시험(빌드한 앱, 헤드리스): `building-screen` 7/7(견본 장부에 적정가·늘 남김·멈춤 예정·외주 수리 칸을 더하고 확인), `facilities` 5/5 — 12 passed.
- 사진(저장소 밖 `scratchpad/business-4-shots/`, 390 파스텔 한국어·다크 영어): `building-repair-service-390-*`(외주 수리 칸), `building-reserve-390-*`(늘 남김 줄),
  `building-books-390-*`(멈춤 예정 알림), `building-goods-390-*`, `facilities-*`. 창고 칸 적정가 줄은 견본이 남의 사업장이라 사진에 없다(미검증 — 화면 그림).
- 미실행: `labor`·`economy`·`boats` spec(경제 화면 외주 줄·배 주문 적정가 줄은 눈으로 보지 않았다 — 미검증), NPC 운반꾼 실제 2차맵 걷기.

## 사용자 결정 대기
- 질문 2041~2057(`docs/questions/2026-11-16-business-4.md`).
