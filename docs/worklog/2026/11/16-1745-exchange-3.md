# 거래소 3: 유닛마다 개인 창고·남의 거래소 거래 직무는 노동 계약·거래 직무의 일·환전 이용료 (기획 대조 2081·2083·2084·2086)

- 일시: 2026-11-16 17:45 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-571 1943·1944, D-564 1682, D-560, D-548, D-570 1822. 질문 `docs/questions/2026-11-16-exchange-2.md`(2081·2083·2084·2086 답 표시), 새 질문
  `docs/questions/2026-11-16-exchange-3.md`(2201~2207). ADR `docs/adr/2026-11-16-exchange-buildings.md` "바뀜 (2081·2083·2084·2086)"(덧붙임). 가지 `work/exchange-3`
  (바탕 54a9482 — 줄기 npc-econ-5). 프로토콜 56(최소 55), 팩 core@126, SIM_VERSION 그대로(62), 마이그레이션 `20261116082232_exchange_unit_lockers`.

## 한 일
1. **2081 개인 창고 = 유닛마다**(D-571 1943 원문 "유닛마다 작은한도 창고 제공, 비용지불하여 창고확장도 가능"): 유닛(사이보그 본체·휴먼·사이보그 유닛)마다 작은 창고
   (기본 `exchange_locker_g` + 그 유닛 넓힌 칸 × `exchange_locker_step_g`). 주인이 쓸 수 있는 크기 = 그 주인 유닛 창고의 합(`@terra/shared/exchange` `unitLockersG`,
   서버 `market/lockers.ts` `lockerUnitsOf`·`ownerLockerG`). 물건 자리(원장 계정)는 그대로 — 주인마다 한데 모인다(질문 2201). 넓히기는 고른 유닛 창고에
   (`market_locker_expand` unitId — 없으면 사이보그 본체 먼저 칸이 남은 유닛, `defaultLockerUnit`), 칸 위 끝은 유닛마다, 남의 유닛이면 `unknown_unit`.
   넓힌 칸 = 새 표 `exchange_unit_lockers`(도시 × 유닛, 새 파일 `db/exchangeLockerSchema.ts` — `schema.ts`는 `export *` 한 줄로 999줄).
2. **2083 남의 거래소 거래 직무 = 주인이 자리를 내고 노동 계약으로**: 거래 직무 자리 = 거래소 건물마다 레벨 × `exchange_trade_slots`(주인 배치·남의 계약이 함께 —
   `facilities/world.ts` tradeDesk). 노동 서비스 `workplaceOf`에 거래 직무 자리를 넣어 내 거래소는 다른 일터처럼 직무 배치, 남의 거래소 배치는 `forbidden`. 남은 주인이
   시간당 자리 값(노동 임대료)을 내면 임대형 계약으로 빌린다(자리 다 차면 `facility_full`), 주인은 구인 게시판으로 고용도(임금형). 자리 값은 기존 임대형 길 그대로 그 거래소
   금고(소득세). 일꾼 줄에 계약 ID·그 일의 몫을 받는 주체(`forOwnerId` — 직무 배치·임대형 = 유닛 주인, 임금형 = 고용주)를 더하고(`labor/workerEntry.ts`로 옮김),
   주문 한도·거래창은 그 주체로 센다(`market/appSource.ts`). 거래 직무 계약은 산출이 없다(시험 광석도). 노동 서비스에 `rentOf`(주인이 낸 자리 값).
3. **2084 거래 직무의 일**: 그 거래소에서 나를 위해 일하는 거래 직무 유닛이 내 개인 창고 반입·반출을 먼저 나르고(사이보그 본체도 — 다른 운반에서는 본체가 빠진다), 나를 때
   시간이 `exchange_desk_haul_pm`(500‰) 배(`gather/station.ts` `haulTime` — 운영자 빠르기와 함께). 남의 거래 직무 유닛은 그 자리를 쓰는 주인의 짐만 나른다
   (`gather/porter.ts` `deskAt`). 거래 물품 관리 = 주문 한도(그대로). 막지 않는다(질문 2205).
4. **2086 환전 이용료**: 회차마다 그 화폐를 판 쪽이 받은 기준 통화 × 요율 ÷ 10000(버림)을 그 화폐 나라에서 요율이 가장 낮은 일하는 외환 거래소 금고에(사업장 장부 수입
   `fx_fee`, 소득세 — `market/fxFee.ts`·`fxFeeHook.ts`, `fx.ts` fee 고리, `npc/economy.ts` 한 줄). 요율 = 주인(대주주)이 정한 만분율(`business_price` item `service:fx_fee`,
   0 = 받지 않음, 위 끝 `exchange_fx_fee_max_bp` 1000), 정하지 않으면 적정 요율 `exchange_fx_fee_bp` 50. 건물 판 [관리]에 환전 이용료 칸(`FxFeeService.tsx` — 외주 수리
   요금 칸과 같은 모양: 지금 요율·적정 요율·위 끝·[요율 정하기]·[적정 요율로]), 환전 화면 화폐 카드에 "환전 이용료 x%".
5. **화면**: 거래창 거래소 칸(`ExchangeDesk.tsx`) — 개인 창고에 "내 유닛 N명마다 기본 200kg + 넓힌 칸"·넓힐 유닛 창고 고르기, 거래 직무에 "자리 차지/모두 · 내 몫 N명"·
   남의 거래소면 자리 값/"자리를 내지 않았다"·[자리 빌리기](labor_create lease), 내 거래소면 자리 내는 법 안내, [빼기]는 계약이면 해지. 새 문구 ko·en 24개, 바꾼 문구 1개
   (`market_desk_rule`).

## 지금 세계 옮기기 (리셋 필요 없음)
- **리셋 필요 없음.** 거래소 물건은 원장 계정 그대로(주인마다 한데) — 옮기지 않는다. 마이그레이션이 옛 주인마다 넓힌 칸을 대표 유닛(사이보그 본체 먼저, 없으면 가장 작은
  휴먼·사이보그 유닛 ID) 창고로 한 번 옮긴다(멱등). 유닛이 하나도 없는 주인의 칸은 옛 표에 남는다(그 주인은 창고 크기 0 — 새 사기·반입만 막힌다).
- 옛 표 `exchange_lockers`는 남겼다(직전 판 앱이 쓴다). 새 앱은 읽지도 쓰지도 않는다 → **다음 배포에서 지운다**(TODO). 직전 판으로 되돌리면 옛 표의 칸으로 돈다(이 판에서
  넓힌 칸은 옛 표에 없다).
- 옛 남의 거래소 직무 배치(줄기 exchange-2)는 다음 정산에 풀린다(유닛이 쉬게 된다, 물건 없음).
- 55판 기기는 56 서버에 붙는다(unitId 없이 넓히면 서버가 고르고, `unknown_unit`은 `locker_max`로 낮춤). 54판 이하는 새 앱을 받는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/businessCoefficients.ts`·`tuningBusiness.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 셋 더함·넷 설명(유닛마다·레벨마다), 팩 core@126 |
| `packages/shared/src/exchange.ts`·`.test.ts` | 유닛 창고 합·기본 유닛 고르기 |
| `packages/shared/src/economy.ts` | 거래창 칸(유닛 창고 줄·자리·자리 값·계약 ID), 환전 카드 `feeBp` |
| `packages/shared/src/businessBooks.ts` | `FX_FEE_ITEM`, 장부 칸 `fx_fee`, 장부 응답 `fxFee` |
| `packages/protocol/src/market.ts`·`business.ts`·`version.ts`·`index.ts`·`market.test.ts` | 56(최소 55), unitId·`unknown_unit`, `service:fx_fee` |
| `apps/server/src/db/exchangeLockerSchema.ts`(새)·`schema.ts`(한 줄)·`drizzle/20261116082232_exchange_unit_lockers/`·`world/persist/tables.ts` | 유닛 창고 표, 옛 칸 옮기기 SQL |
| `apps/server/src/market/lockers.ts`·`lockerRoom.ts`·`service.ts`·`gateway.ts`·`exchangeDesk.ts`·`appSource.ts` | 2081·2083 서버·화면 자료 |
| `apps/server/src/market/fxFee.ts`(새)·`fxFeeHook.ts`(새)·`fx.ts`·`fxViews.ts`·`views.ts`·`worldInput.ts`, `npc/economy.ts` | 2086 |
| `apps/server/src/labor/service.ts`·`workerEntry.ts`(새)·`store.ts`·`workBook.ts`, `facilities/world.ts`·`serviceTypes.ts`·`views.ts`·`equipmentRepair.ts` | 2083(import 자리 옮김 포함) |
| `apps/server/src/gather/porter.ts`·`station.ts`·`world.ts` | 2084 |
| `apps/server/src/business/commands.ts`·`books.ts`, `facilities/appSource.ts` | 환전 이용료 요율 정하기·장부 칸 |
| `apps/server/src/market/exchangeBuildings.ts`·`exchangeStock.ts` | 주석 |
| 시험: `market/fxFee.test.ts`(새)·`labor/tradeDesk.db.test.ts`(새)·`gather/station.test.ts`·`business/commands.test.ts`·`market/market.db.test.ts`·`market/exchange2.test.ts`·`labor/produce.db.test.ts`·`labor/gateway.test.ts` | |
| `apps/game/src/economy/market/ExchangeDesk.tsx`·`marketText.ts`, `economy/ExchangeView.tsx`·`economyText.ts`, `map/business/FxFeeService.tsx`(새)·`map/building/BuildingPanel.tsx`, `messages/{ko,en}.json` | 화면 |
| `e2e/economy.spec.ts` | 거래창 유닛 창고·자리, 환전 이용료 줄 |
| 문서: ADR 바뀜, 질문 답 표시·새 질문 | 기록 |

## 함께 바꿔야 하는 파일
- 프로토콜 53~55·팩 121~125·SIM 63~65는 같은 묶음 다른 줄기 몫으로 비웠다(판 번호는 묶을 때 다시 매긴다). 합칠 때 `version.ts` 설명 차례·`MIN_SUPPORTED_PROTOCOL_VERSION`·
  manifest 판·`UNIT_LOCKER_PROTOCOL_VERSION`(시험이 56으로 고정)을 맞춘다.
- 마이그레이션: 형제가 생기면 그대로 합친다(다시 만들지 않는다). 다음 배포에서 `exchange_lockers` 표와 `db/marketSchema.ts`의 정의·`tables.ts` 줄을 지운다.
- 사업장·노동 줄기가 `labor/service.ts`(992줄)·`LaborWorkerEntry`(이제 `labor/workerEntry.ts`)를 고치면 import 자리가 겹친다.

## 건드리지 말 것
- 시뮬 판정(`packages/sim/src/simulator/*`): 환전 이용료·거래 직무는 서버만(SIM 판 그대로). 시뮬에 넣으면 SIM 판을 올린다.
- `labor/service.ts` 992줄·`db/schema.ts` 999줄·`npc/economy.ts` 935줄 — 더하면 새 모듈로.

## 미검증·TODO·알려진 문제
- 유닛 창고 크기를 셀 때 사기 주문·거래창마다 모든 2차맵 유닛을 한 번 훑는다(`lockerUnitsOf`) — NAS 규모(봇 1,000 + NPC 휴먼)에서 비용은 재지 않았다(Assumed 가벼움).
  1차맵을 걷는 등 2차맵에 없는 유닛은 창고를 주지 않는다 [임시].
- NPC 거래소 주인은 거래 직무 자리를 내지 않는다(NPC 도시에서는 빌리지 못함 — 질문 2204).
- 거래 직무 유닛이 나르는 동안에도 주문 한도 몫은 그대로다(자리를 비워도 센다) [임시].
- 환전 이용료가 붙어 서버 NPC 환전 결과가 시뮬과 조금 갈라진다(시뮬 밸런스는 이용료 0 경우) — 질문 2091과 같은 갈라짐.
- 화면: 남의 거래소 [자리 빌리기]·건물 판 환전 이용료 칸은 화면 시험이 그 상태를 만들지 않아 눈으로 보지 않았다(미검증 — 서버 길은 DB 시험).
- 묶음 시험 중 `npc/cityBuildUpgrade.db.test.ts` 하나가 여러 파일과 함께 돌 때 한 번 실패했고, 혼자 돌리면 바탕·이 줄기 모두 통과했다(부하 때 시각 흔들림으로 본다, Assumed).
- 검사 결과는 아래.

## 검사
- Verified 전체 `pnpm check`(TEST_DATABASE_URL 있음, 잠금 안): 포맷·린트·타입·경계·파일 크기·다국어(8,123키)·디자인 값·콘텐츠(core@126)·단위 시험 통과 — 시험 파일 768개,
  시험 5,756개 모두 통과. 앞 두 번은 포맷 두 곳(`gather/station.ts`·`e2e/economy.spec.ts`)·시험 타입 하나(`station.test.ts` 화살표 반환)로 걸려 고친 뒤 다시 돌림.
- Verified 새·바꾼 시험: `labor/tradeDesk.db.test.ts`(내 거래소 배치·남의 배치 forbidden·자리 값 없으면 not_for_lease·임대형 빌리기·일꾼 줄 몫·산출 없음·자리 값 → 거래소 금고),
  `market/fxFee.test.ts`(요율·위 끝·가장 싼 거래소·회차 이용료 판 쪽만), `gather/station.test.ts`(거래 직무 유닛 먼저·절반 시간·남의 거래 직무 유닛은 안 나름),
  `business/commands.test.ts`(service:fx_fee 외환 거래소만·위 끝), `market/market.db.test.ts`(유닛 창고 칸·unknown_unit·넓히기 → exchange_unit_lockers·다시 켜도 그대로·자리 칸),
  `packages/shared` `exchange.test.ts`, `packages/protocol` `market.test.ts`(56 unitId·unknown_unit).
- Verified `pnpm check:content 54a9482c28`(호환 포함) 통과 — core@126. `pnpm check:docs` 통과. `db:generate` "No schema changes"(손으로 더한 옮기기 SQL 뒤).
- Verified `pnpm build` + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,147 B / 상한 131,416 B(바뀐 화면은 지연 조각).
- Verified 화면 시험(빌드한 앱, 헤드리스) `economy.spec.ts` 25개: 24 통과, 1 실패(새 단언의 locator — 화면은 바르게 그려짐) → `getByRole("combobox")`로 고쳐 그 시험만 다시
  돌려 통과(거래창 유닛 창고 고르기·자리 칸·NPC 거래소 "자리를 내지 않았다"·환전 이용료 0.5% 줄 확인). 사진: 저장소 밖
  `scratchpad/exchange-3-shots/economy-live-book-{pastel,dark}-{ko,en}-390.png`(거래소 칸), `economy-exchange-{pastel,dark}-ko-390.png`(환전).
- 미실행: `building-screen`·`facilities` spec(건물 판 환전 이용료 칸은 외환 거래소 주인일 때만 보여 그 시험이 만들지 않는다), `labor` spec.

## 사용자 결정 대기
- 질문 2201~2207(`docs/questions/2026-11-16-exchange-3.md`).
