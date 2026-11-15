# 거래소 건물: 물자·외환 거래소를 도시의 건물로, 지금 세계는 켤 때 세우기 (D-561)

- 일시: 2026-11-16 07:50 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-561(거래소는 건물), D-560(분류 "상업"), D-564 1628·D-569 1784(실어 나른 물건만), D-117·D-125·D-148, ADR `docs/adr/2026-11-16-exchange-buildings.md`(새, 확정),
  질문 `docs/questions/2026-11-16-exchange-buildings.md`(1941~1953), 앞 질문 1784(`2026-11-15-business-2.md`)·1885(`2026-11-16-business-3.md`), 가지 `work/exchange-buildings`(바탕 abe00de),
  프로토콜 47(최소 46), 팩 core@114, SIM_VERSION 그대로(55), 마이그레이션 없음

## 한 일
1. **거래소 건물 넷**(팩 core@114, 상업 단계 `commerce`·분류 `commerce`, 시설 칸 `exchange`): `goods_exchange` 물자 거래소·`fx_exchange` 외환 거래소(짓기 가능),
   `unit_exchange` 유닛 거래소(기능 전 잠금)·`stock_exchange` 증권 거래소(출시 뒤 잠금 — D-393·D-409). 팩 검사 `exchange_needs_commerce`·`commerce_needs_exchange`.
   공용 이름·수치는 `@terra/shared/exchange`(새).
2. **짓기 규칙**(`market/exchangeBuildings.ts`): 잠긴 종류 `exchange_locked`, 같은 도시 같은 종류(짓는 중 포함) `exchange_exists`, 도시 밖 `no_place`. 짓기 목록은 잠긴 거래소를
   보이되 고르지 못하고 까닭(출시 뒤·기능 준비 중)을 적는다.
3. **물자 거래소 = 그 도시 물자 거래소 건물**: 에스크로는 도시 자리 그대로, 유저 물건 자리 = 그 건물 창고(시뮬 `GoodsMarketConfig.holdingOf` 선택 칸 — 판정 그대로).
   팔기는 건물 창고 물건만, 산 물건·돌려받는 물건은 건물 창고로. 거래소 건물이 없으면 새 주문 `no_exchange`(거두기는 됨). NPC 세력 물건 자리는 도시 창고 그대로 [임시](1945).
4. **반입·반출 실제 운반**: 거래소 건물 `storage_move in` = 운반꾼(내 그 2차맵 유닛)이 도시 칸 → 거래소 건물을 걷는다(`gather/station.ts` `haulIn`, `porter.ts` `deliverTo`).
   옮김 셈 끔·거리 0이면 바로(`exchange_deposit`). 꺼내기는 기존 운반꾼 길(거래소 건물 창고는 "판매만"에서 뺐다).
5. **외환 거래소**: 그 화폐 나라의 도시에 외환 거래소 건물이 있어야 환전 주문(`no_exchange`). 환전 화면 짝마다 "외환 거래소 없음" 알림.
6. **주문 한도 D-148**: 기본 10 + 그 종류 거래소 건물 3칸 안에 선 내 유닛마다 ⌊(INT + WIS) ÷ 20⌋, 위 끝 40 [임시](1944). 거래창·내 주문·환전 화면 한도가 이 값.
7. **NPC 거래소**: 세계 씨앗 — 시작 도시 물자·외환, 마을 물자(`npcSeed.ts` `SEED_EXCHANGES`·`VILLAGE_EXCHANGES`). NPC 증축 목표에 물자·외환 하나씩(`npc/cityBuild.ts`, 서버만).
8. **화면**: 거래창 거래소 건물 안내(이름·도시 창고 몫·[거래소로 옮기기] 링크, 없으면 경고), 경제 화면 물건 자리 도시 창고 줄 [○○ 거래소로], 거래소 건물 창고 이름
   "물자 거래소 #id", 짓기 목록 잠금 줄, 환전 짝 경고, 결과 코드 문구, 건물 편집기 단계 "상업". 문구 ko·en 새 14개.
9. ADR·질문 문서를 먼저 쓰고 구현했다.

## 지금 세계 옮기기 (리셋 필요 없음)
- **리셋 필요 없음.** DB 표·마이그레이션이 없다(거래소 건물은 이미 있는 시설 줄·건물 칸이다).
- 켤 때 세계 씨앗이 NPC 도시마다 모자란 거래소 건물만 세운다(멱등 — 이미 있으면 그대로, 다음 켤 때도 같다). Verified: `npcSeed.db.test.ts`(빈 세계·옛 세계·다시 켬).
- 걸린 주문은 에스크로가 도시 자리라 그대로 남는다(Verified: `market.db.test.ts` 다시 켬 뒤 걸린 팔 주문 그대로). 끝나면(체결·거둠·만료) 유저 몫은 그 도시 거래소 건물 창고로 간다.
- 도시 창고에 이미 있는 유저 물건은 그대로다. 팔려면 거래소 건물로 실어 나른다([거래소로] 단추).
- 46판 기기는 47 서버에 그대로 붙는다(새 코드는 46판에 unknown_city·unknown_currency·forbidden으로 낮춤). 45판 이하는 인사에서 새 앱을 받는다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/exchange.ts`(새)·`exchange.test.ts`(새)·`package.json` | 거래소 종류·잠금·주문 한도 식 |
| `packages/shared/src/facilityCategory.ts`·`buildingEditor.ts`·`facilities.ts`·`economy.ts`·`businessBooks.ts` | 단계 commerce, 편집기 칸 통과, 화면 자료 칸(`exchange`·`exchangeLock`·`exchangeId`·`MarketBookResponse.exchange`·`FxPairView.exchange`), 장부 칸 `exchange_deposit` |
| `packages/content/src/schema/economy.ts`·`validate/facilities.ts`, `content/core/facilities.json`·`manifest.json` | 시설 칸 `exchange`·단계, 검사, 시설 넷, 팩 114 |
| `packages/sim/src/economy/goodsMarket.ts` | 선택 칸 `holdingOf`(주인 물건 자리). 시뮬은 쓰지 않아 판정 그대로 |
| `packages/protocol/src/facilities.ts`·`market.ts`·`index.ts`·`version.ts` | 47(최소 46), 코드 `no_exchange`·`exchange_locked`·`exchange_exists` |
| `apps/server/src/market/exchangeBuildings.ts`(새)·`exchangeBuildings.test.ts`(새)·`exchangeStock.ts`·`books.ts`·`service.ts`·`views.ts`·`fxViews.ts`·`appSource.ts`·`worldInput.ts`·`gateway.ts`·`market.db.test.ts` | 거래소 찾기·한도, 물건 자리, 주문 확인, 화면 자료, 46판 낮춤 |
| `apps/server/src/session.ts` | 거래소 연결에 프로토콜 판 넘김 |
| `apps/server/src/facilities/service.ts`(976줄)·`catalog.ts`·`views.ts`·`gateway.ts`·`npcSeed.ts`·테스트 | 짓기 규칙·반입 고리·자리 목록·씨앗 |
| `apps/server/src/gather/station.ts`·`porter.ts`·`world.ts`·`station.test.ts` | `haulIn`·`deliverTo` |
| `apps/server/src/npc/economy.ts`·`cityBuild.ts` | 거래소 물건 자리 입력, 증축 목표 |
| `apps/server/src/buildingEdit/views.ts`, `apps/game/src/editor/buildings/*` | 편집기가 `exchange` 칸을 지우지 않게, 단계 문구 |
| `apps/game/src/economy/market/MarketBookView.tsx`·`marketText.ts`, `ExchangeView.tsx`, `StorageParts.tsx`, `facilityText.ts`, `map/construction/BuildSheet.tsx`, `messages/{ko,en}.json` | 화면 |
| `e2e/economy.spec.ts`·`build-mode.spec.ts` | 거래소 안내·잠긴 거래소 확인 |

## 함께 바꿔야 하는 파일
- 프로토콜: 다른 줄기가 48·49를 쓴다. 합칠 때 `version.ts` 설명 차례·`MIN_SUPPORTED_PROTOCOL_VERSION`을 맞춘다. 46판 낮춤은 `market/gateway.ts`·`facilities/gateway.ts`.
- 팩: 다른 줄기가 115를 쓴다(합칠 때 판 차례).
- 유닛 경매(D-242)를 만들면 `@terra/shared/exchange` `EXCHANGE_LOCKS.units`를 지우고 그 기능을 유닛 거래소에 잇는다.

## 건드리지 말 것
- `app.ts`·`db/schema.ts`·`world.ts`: 고치지 않았다. `facilities/service.ts` 976줄 — 다음에 더하면 나눈다.
- 시뮬 판정: `holdingOf`는 시뮬이 쓰지 않는다(SIM_VERSION 55 그대로). NPC 세력 물건 자리를 건물로 바꾸면 SIM 판을 올린다(1945).

## 미검증·TODO·알려진 문제
- 반입 운반 중 짐은 메모리(다시 켜면 운반꾼 화물에 남고 거래소로 다시 떠나지 않는다, 1953).
- 배치 유닛 한도는 사이보그 본체도 센다(건물 3칸 안에 서 있으면). 화면에 배치 유닛 목록은 아직 없다(한도 숫자만).
- 건물 편집기에서 단계 "상업"을 고르면 `exchange` 칸을 고를 수 없어 팩 검사에 걸린다(편집기는 칸을 그대로 둔다 — 새 상업 시설은 팩에서).
- 거래소 건물 찾기는 유저 체결·돌려받기마다 시설 줄을 한 번 훑는다(Assumed 가벼움).
- 검사 결과는 아래.

## 검사
- Verified 전체 `pnpm check`(TEST_DATABASE_URL 있음, 잠금 안): 포맷·린트·타입·경계·파일 크기·다국어·디자인 값·콘텐츠 통과, 시험 파일 746개 중 2개 실패(`houseRecruit.db.test.ts`·
  `nationTiers.db.test.ts` — 씨앗 시설 목록에 거래소가 더해진 기대값) → 기대를 고치고 두 파일만 다시 돌려 통과(22/22). 시험 5,603개 통과(실패 2는 위). 그 뒤 고친 것(`station.ts` 물자만
  받기, e2e 두 파일, `build.css`)은 서버 타입·biome·oxlint(그 파일)·`station.test.ts`(17/17)·`check:size`·`check:contrast`·`format:check`만 다시 돌려 통과.
- Verified 새·바꾼 시험: `exchange.test.ts`(공용), `exchangeBuildings.test.ts`(짓기 규칙·도시 거래소 고르기), `station.test.ts` haulIn(운반꾼·화물·건물 창고), `gateway.test.ts` 47·46판 낮춤,
  `npcSeed.test.ts`·`npcSeed.db.test.ts`(씨앗 거래소, 다시 켬 멱등), `market.db.test.ts`(산 물건 = 거래소 건물 창고, 도시 창고 0, 다시 켬 뒤 걸린 주문 그대로).
- Verified `pnpm check:content abe00de`(호환 포함) 통과 — core@114. `pnpm check:docs` 통과.
- Verified 빌드 + `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 110,088 B / 상한 131,416 B(business-3 무렵 110,064 B와 거의 같다 — 바꾼 화면은 지연 조각).
- Verified 화면 시험(빌드한 앱, 헤드리스): `economy`·`build-mode`·`facilities`·`building-screen` 42개 가운데 41 통과, 1 실패(`build-mode` 잠긴 거래소 누르기 — Playwright가 aria-disabled
  단추를 누르지 않음) → `click({ force: true })`로 고치고 그 시험만 다시 돌려 통과. 경제 화면 내 주문 한도 10/10(배치 유닛 없음)도 통과.
- 사진(저장소 밖 `scratchpad/exchange-shots/`): `market-exchange-note.png`(거래창 거래소 안내, 파스텔 390), `build-list-390-{pastel,dark}.png`(짓기 목록 — 잠긴 거래소 줄은 목록 아래라
  사진 밖, 시험이 문구·aria-disabled를 본다), `economy-*`·`building-*`·`facilities-*`. 잠긴 줄 점선 테두리(`build.css`)는 시험 뒤에 더해 사진에 없다(미검증 — 그림).
- 미실행: `market` 이름의 spec은 없다(거래창은 `economy`가 본다). 환전 화면 "외환 거래소 없음" 알림은 e2e 세계에 외환 거래소가 늘 있어 보이지 않는다(미검증 — 그림).

## 사용자 결정 대기
- 질문 1941~1953(`docs/questions/2026-11-16-exchange-buildings.md`).
