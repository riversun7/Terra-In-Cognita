# 옛 1차 자원 팩 커밋, 기준 가치 → 시작 시세, 금속 원석 1g·괴 1kg (질문 295, D-505)

- 일시: 2026-11-02 21:30 (KST)
- 작업 도구: Claude Code
- 관련: 질문 `docs/questions/2026-11-01-item-editor-3.md` 295 "검토 뒤 답", 기획 D-505(미러 `e0c96f4`), ADR `docs/adr/2026-11-01-item-editor.md` "바뀜 (… 295·D-505 …)"·`docs/adr/2026-10-31-economy-core.md` "바뀜 (… 시작 시세)", 변환본 `docs/research/2026-11-02-old-resources-draft.md`, 가지 `work/old-resources`(main `f52d38a`에서 시작, `e0c96f4` 위로 다시 얹음)

## 한 일
- **기준 가치 → 시작 시세** (295-9 "기준가치란 없다. 시장시세를 사용하자" → "시작 시세만 둠")
  - 아이템 칸 `baseValue` → `startPrice`(팩 스키마, 팩 core@28). 뜻 = 그 세계에서 그 물건 시장이 처음 열릴 때의 첫 가격뿐. 그 뒤 계산은 시장 시세.
  - 바꾼 곳 전부: 팩 스키마·시험 자료, 공용 타입(`ItemJson`·`ItemRow`·미리 보기 `value.startPrice`·경제 목록 `CatalogItemView.startPrice`), 서버 편집기(목록·항목·미리 보기 원가·권고 경로), 경제 시안(`previewStartPrice`, 시안 시장 `startPrice`), 시뮬 목록(`CatalogItem`·`PreparedCatalog.startPrice`, `cli/common.ts`), 대량 도구(CSV 열, `startPricePm`·`scaleStartPrice`, tRPC 입력), 편집기 칸·정렬·요약·미리 보기·권고 문구(ko·en, 키 셋 이름 바꿈: `dev_items_field_base_value` → `dev_items_field_start_price`, `dev_items_placeholder_value` → `dev_items_start_price_hint`, `dev_items_preview_base_value` → `dev_items_preview_start_price`, 새 키 `dev_items_world_price_label`·`_none`·`_row`·`_no_value`).
  - 지운 것: 유닛 묶음(`apps/server/src/roster/catalog.ts`)의 `baseValue` 표 — 읽는 곳이 없었다(Verified, 찾기).
  - 시작 시세가 아직 쓰이는 곳(모두 "첫 가격" 뜻으로 맞춤): ① 시뮬 NPC 매물 값 `npcTrade.ts` `refPrice` = 마지막 체결가, 체결이 없을 때만 시작 시세, ② 중앙은행 물가 지수 `economy.ts` `priceIndexMilli` = 지금 생필품 시세 ÷ 시작 시세(그 세계의 첫 가격 대비, 1000 = 첫 가격 그대로, 목표 `targetMilli` 1000도 같은 기준), ③ 경제 화면 시안 `previewStartPrice`(가짜 시장의 출발 값, 화면 값은 그 시장 시세), ④ 편집기 미리 보기·권고의 레시피 원가(입력 시작 시세 합 ÷ 출력 수량)와 비교(`advice_value_below_cost`·`above_cost`, "세계가 처음 열릴 때"의 원가 알림), ⑤ 시뮬 `catalog.startPrice.has(…)` 두 곳(처음 재고·남의 도시 재고)은 값이 아니라 "켜진 물건인가"만 본다. 셈은 하나도 바뀌지 않았다.
  - 옛 이름 읽기: 켤 때 옛 덮어쓰기 줄(core@27까지 저장한 items)의 `baseValue`는 `legacy.ts`가 `startPrice`로 옮겨 읽는다(같은 값, 둘 다 있으면 `startPrice`, DB 줄 원본 그대로, 서버 기록 `content boot` `upgraded`). 감사 기록의 옛 판 항목(`items.historyEntry`, 다시 담기)도 같은 함수(`upgradeLegacyEntry`, 새로 꺼냄)로 읽는다. 대량 도구 가져오기는 JSON 칸 `baseValue`와 CSV 열 `baseValue`를 `startPrice`로 읽는다(`ITEM_CSV_ALIASES`, 두 이름을 같이 적으면 겹친 열). 내보내기는 새 이름만.
  - 편집기 값 구역의 시작 시세 칸 옆에 **"지금 세계 시세"**(읽기만): `items.get` 응답 `markets`(도시 시장마다 {도시, 화폐, 마지막 체결가, 사는 값·파는 값}). 서버가 물자 거래소를 아직 돌리지 않아(경제 ADR "결과", `economy.marketItems`도 `not_ready`) 늘 빈 목록 → "시세 없음 — 서버 거래소가 아직 열리지 않았습니다(시작 시세가 첫 가격이 됩니다)". 시안 시장(가짜 거래)은 시세로 보이지 않는다.
- **옛 1차 자원 136개 팩 커밋**(변환본 + 답 1~8)
  - 새 아이템 135개(모두 `enabled: false`, 시작 시세 1 [임시], 설명 없음) + `iron_ore` 합침 1개. 이름 그대로: 미스릴 / Mithril(`mithril`), 세계수의 이슬잎 / World tree dew leaf(`world_tree_dew_leaf`), 오리할콘 / Orichalcum(`orichalcum`). 변환본 후보 ID `meteoric_iron`·`sacred_dew_leaf`는 쓰지 않았다.
  - 은·금·백금(`silver_ore`·`gold_ore`·`platinum_ore`) → 원자재·광석(대분류 9 아님). 티타늄·미스릴·오리할콘도 원자재·광석. 광석 중분류 10개 = 잡석·석재 + 금속 원석 8.
  - 새 중분류 `livestock_byproduct` 목축 부산물 / Livestock byproducts(원자재, 식품 아님, 축산물 바로 뒤, 중분류 35 → 36): feather·deer_hide·deer_antler·wool·bison_hide·bison_horn·silver_fur·hard_tusk·croc_hide·croc_tooth·raptor_beak·gryphon_feather·purifying_horn·unicorn_mane·dragon_scale·drakeheart_shard(16) + mink_oil.
  - 어류 무게 = 옛 시드 값, 이름 길이 권고는 그대로(긴 이름은 편집기 권고로 보인다).
- **금속 원석 1g·괴 1kg** (295-10, 괴 크기 "모두 1kg 고정")
  - 원석 1단위 = 1g(무게 1): `copper_ore`·`silver_ore`·`titanium_ore`·`gold_ore`·`platinum_ore`·`mithril`·`orichalcum`. 잡석·석재(`rubble`·`stone`)는 괴를 만들지 않아 변환본 무게 1,000g 그대로.
  - 괴: `iron_ingot` 무게 1,000(이름 "철 주괴 / Iron ingot"·값·켬 그대로). 새 괴 7개 `copper_ingot`·`silver_ingot`·`titanium_ingot`·`gold_ingot`·`platinum_ingot`·`mithril_ingot`·`orichalcum_ingot`(구리 괴 / Copper bar …, 철 주괴와 같은 가공품·중분류 없음, 티어 = 원석 티어 2·4·5·6·7·8·9, 무게 1,000, 시작 시세 1 [임시], 꺼짐).
  - 제련 레시피 7개 `smelt_copper`·`smelt_silver`·`smelt_titanium`·`smelt_gold`·`smelt_platinum`·`smelt_mithril`·`smelt_orichalcum`(제련소, 원석 1,000 → 괴 1, 작업량 1,000, 손실 없음 [임시], 꺼짐). 철 레시피(`mine_iron_ore`·`smelt_iron`)는 g로 바꾸지 않았다(아래 보류).
- **보류: 철광석의 1g·티어 3** — 시킨 대로 의미를 바꾸기 전에 멈췄다(D-487). `iron_ore`에는 중분류 광석만 얹었다(화면·거르기만 읽는 칸, 시뮬 출력 그대로).
  - 정수 시세: 지금 철광석 1개 = 시작 시세 8, 캐기 1회 10개, 제련 10개 → 철 주괴 7개(옛 시드 1개 = 1,000g). 1개 = 1g이면 1g당 0.008 최소 단위라 정수가 안 된다(물자 호가창 값 = 1개당 최소 단위 정수). 가장 작은 값 1로 올리면 1kg = 1,000(지금의 125배)이고 철 주괴(14)·생활용품(40)과 맞지 않는다. 레시피도 10,000g 단위로 바꿔야 한다(econ16 공업 도시의 캐기·제련·목표 재고·NPC 거래 양이 모두 ×1,000).
  - 티어 3: 레시피 티어 = 산출 최고 티어라 `mine_iron_ore`가 T3이 되고 econ16 광산(Lv1, 최고 T1)이 시작에서 멈춘다("facility level too low for mine_iron_ore"). Lv2로 올리면 광산 오염(레벨 × 6)이 두 배라 정원사·경제 출력이 바뀐다.
  - 새 원석(꺼짐) 7개는 자료만이라 1g으로 넣었다. 그래서 지금은 철광석(1개 = 1kg 뜻)과 다른 원석(1개 = 1g)의 단위가 다르다(꺼진 동안만, 선택 뒤 맞춘다).

## 검증
- 시뮬 앞·뒤(Verified, 시드 1, 각 한 번): 앞 = main `f52d38a`(core@27), 뒤 = 이 가지(core@28). war16 30일 230줄·stub16 180일 403줄·econ16 180일 1,933줄, 줄 수 같음. 머리 줄과 요약 줄에서 `content`(판·해시)·`linesHash`를 빼면 모든 줄이 같다(본문 줄 전부 같음, 위반 0). `linesHash` war16 a4658b31 → 298e64ca, stub16 6f0cf6c8 → ad19690d, econ16 35379dcd → fe804508. 팩 해시 c65b6c6c… → e5970e5d…. 새 항목은 모두 꺼짐(`prepareCatalog`가 거름), 철광석 중분류·철 주괴 무게는 시뮬이 읽지 않는다 → `SIM_VERSION` 7 그대로.
- `pnpm check:content main`(Verified): core@28 (e5970e5df894) 통과, 단계 1·2·4a·4b. 새 ID가 팩 `id-changes`의 지운 ID와 겹치지 않음(변환 도구가 확인).
- `TEST_DATABASE_URL=… pnpm test`(Verified, `e0c96f4` 위로 얹기 전 같은 코드): 372파일 3,139개 통과. 새 시험: 대량 도구 옛 이름 읽기 1(`itemEditorBulk.test.ts`: CSV 열·JSON 칸 `baseValue`, 겹친 열, 내보내기 새 이름), legacy 2(`legacy.test.ts`: `baseValue` → `startPrice`·둘 다 있으면 새 칸·켤 때 지워지지 않음, 옛 판 항목 읽기). DB 시험 `legacy.db.test.ts`가 core@25 모양 줄(`baseValue: 5` 포함)을 켤 때 `startPrice` 5로 싣는 것을 본다.
- 포맷·린트(oxlint `--deny-warnings`)·타입(`pnpm typecheck`, e2e 포함) 통과(Verified).
- 화면 시험(Verified, `TEST_DATABASE_URL=… pnpm e2e`): `items.spec.ts`·`economy.spec.ts`·`mail.spec.ts` 66개 통과(5.8분, items 33·economy 20·mail 13). 그 뒤 시세 문구 키를 고친 마지막 코드로 `items.spec.ts` 33개 다시 통과(2.5분). 새 배치 시험 8개(네온·라이트 × ko·en × 390·1440): 구리 원석의 시작 시세 칸 = 1, 지금 세계 시세 = "시세 없음…", 중분류 거르기 광석 10줄·목축 부산물 17줄, 가로 넘침·작은 누르는 곳 없음. 두 탭 충돌 시험이 시작 시세 칸을 고쳐 다시 얹고(`startPrice` 9), 대량 가져오기 시험이 옛 CSV 열 `baseValue`로 새 아이템 시작 시세 5를 만든다.
- `pnpm check:bundle`(Verified, e2e 준비가 만든 빌드): 첫 화면 JS 105,399 B / 상한 131,416 B(직전 기록 105,401 B). 아이템 편집기 조각 `ItemEditorScreen-*.js` 161,962 B(직전 기록 161,851 B).
- `pnpm check:contrast`(738쌍)·`check:i18n`(3,258키)·`check:size`(경고 `packages/sim/src/simulator/economy.ts` 619줄 — 원래 615줄, 주석 4줄 더함, 1,000 아래)·`check:boundaries` 통과(Verified).
- 사진(저장소 밖, 개발 테마 네온·라이트 × ko·en × 390·1440, 1440은 `VIEWPORTS.desktop`): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/old-resources/shots/items-start-price-*.png`(값 구역: 시작 시세 칸·지금 세계 시세 "시세 없음"), `items-ore-*.png`(광석 거르기 목록 10줄), `items-livestock_byproduct-*.png`(목축 부산물 17줄). 네온 1440(ko·en)·라이트 390(ko·en) 값 구역과 네온 1440 광석 목록·라이트 390 목축 부산물 목록을 눈으로 봤다: 지금 세계 시세가 시작 시세 칸 오른쪽(넓은 화면)·아래(좁은 화면)에 읽기 칸으로 놓이고 잘리지 않는다. 목록 요약은 "1 g · 시작 시세 1".

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/items.ts`(·`economy.ts`·`categories.ts` 주석), `fixtures/valid/items.json`, `testFixtures.ts`, `node/load.test.ts` | `startPrice` 칸·뜻 |
| `content/core/items.json`·`item_subcategories.json`·`recipes.json`·`manifest.json`(core@28) | 칸 이름, 옛 자원 135 + 합침 1, 목축 부산물 중분류, 괴 7·제련 7, 철 주괴 무게 |
| `packages/shared/src/itemEditor.ts`·`itemEditorBulk.ts`(+시험)·`itemEditorPreview.ts`·`economy.ts` | 공용 타입·범위·대량 도구 옛 이름 읽기·`ItemMarketPrice`·`markets` |
| `packages/sim/src/simulator/catalog.ts`·`economy.ts`·`npcTrade.ts`·`testEconomy.ts`, `economy/centralBank.ts`(주석), `cli/common.ts` | 시뮬 목록 칸 이름과 "첫 가격" 뜻 주석(셈 그대로) |
| `apps/server/src/itemEdit/views.ts`·`advice.ts`·`preview.ts`·`services.ts`(+시험), `trpc/items.ts` | 편집기 칸·권고 경로·원가·`markets`·옛 판 항목 읽기·patch 칸 |
| `apps/server/src/contentEdit/legacy.ts`(+`legacy.test.ts`·`legacy.db.test.ts`) | 옛 `baseValue` 줄 고쳐 읽기, `upgradeLegacyEntry` |
| `apps/server/src/economyView/catalog.ts`·`previewWorld.ts`·`previewMarket.ts`·`services.ts`(+시험), `roster/catalog.ts` | 경제 목록·시안 시작 시세, 쓰지 않는 표 지움 |
| `apps/game/src/editor/items/ItemForm.tsx`·`ItemDetail.tsx`·`ItemEditorScreen.tsx`·`ItemList.tsx`·`ItemPreview.tsx`·`ItemBulk.tsx`·`itemModel.ts`(+시험), `apps/game/messages/ko.json`·`en.json` | 시작 시세 칸·지금 세계 시세·정렬·요약·대량 도구 문구 |
| `scripts/apply-tuning-diff.test.mjs`·`check-content.test.mjs` | 시험 팩 칸 이름 |
| `e2e/items.spec.ts` | 칸 이름, CSV 옛 열 `baseValue` 읽기 확인, 옛 자원 배치·사진 |
| ADR 아이템 편집기·경제 코어, PLAN 13·14장, 질문 295 상태, 변환본 문서 상태 | 기록 |

## 함께 바꿔야 하는 파일
- 시작 시세 범위: `packages/content` `itemEntrySchema.startPrice` ↔ `packages/shared` `ITEM_LIMITS.startPrice` ↔ 대량 도구 `ITEM_BULK_LIMITS.startPricePm`(tRPC `trpc/items.ts`가 읽음).
- 아이템 칸 이름을 또 바꾸면: `legacy.ts`(켤 때 DB 줄·감사 옛 판), `itemEditorBulk.ts`(JSON 칸·`ITEM_CSV_ALIASES`)에 옛 이름 읽기를 더한다.
- 서버가 물자 거래소를 열면(R5·L1): `apps/server/src/itemEdit/services.ts` `get`의 `markets`를 그 시장 표(도시마다 마지막 체결가·최고 사는 값·최저 파는 값)에서 채운다. 시장 상태에 "첫 가격"을 저장할지도 그때 본다(경제 ADR 바뀜).

## 건드리지 말 것
- `SIM_VERSION` 7: 시뮬 출력 본문이 그대로다.
- `iron_ore`의 티어·무게, `mine_iron_ore`·`smelt_iron` 양: 사용자 선택 전에는 바꾸지 않는다(econ16·정수 시세).
- 변환본 `docs/research/2026-11-02-old-resources-draft.json`(옛 칸 이름 그대로 둔 기록, 대량 가져오기가 지금도 읽는다).

## 미검증·TODO·알려진 문제
- 옛 PWA 기기(새 서버, 옛 화면)는 아이템 편집기 항목 모양 검사가 `baseValue`를 찾아 항목을 담지 못하고, 여러 개 고치기 옛 칸 `baseValuePm`은 400이다. 개발 화면이라 새로 고침으로 푼다(미실행).
- 옛 내보내기 차이(`pnpm tuning:apply`·`sim --tuning`의 `entries`에 `baseValue`)는 고쳐 읽지 않고 스키마 문제로 알린다(앞 바뀜과 같은 방침).
- 세계 DB(NAS)에 `baseValue`가 든 덮어쓰기 줄이 있는지는 모른다(Unknown). 있으면 켤 때 서버 기록 `content boot` `upgraded`에 키가 남는다.
- "지금 세계 시세"는 늘 "시세 없음"이다. 채우려면 서버 물자 거래소(도시·물건 시장, 걸린 주문 표 복원, 경제 ADR 4·5절)가 먼저다. 시세가 있을 때의 줄 모양(도시 · 마지막 · 사는 값 · 파는 값)은 화면에 그리는 코드만 있고 실제 값으로 본 적은 없다(미실행).
- 다국어 검사(`scripts/check-i18n.mjs`)는 한 파일 안의 겹친 키를 잡지 못한다(`JSON.parse`가 뒤 값만 남긴다). 이번에 새 키를 처음 `dev_items_market_none`으로 지었다가 거래 방식 문구("거래 안 함")와 겹쳐 화면 사진에서 찾고 이름을 바꿨다(e2e도 같은 뒤 값을 읽어 통과했었다). 검사에 겹친 키 찾기를 더하는 것은 따로 할 일이다.
- 철 주괴 이름은 "철 주괴 / Iron ingot"이고 새 괴는 "구리 괴 / Copper bar" 꼴이다(이름은 편집기에서 맞출 수 있다). 괴 8개는 가공품에 중분류가 없다(철 주괴와 같게). 가공품 중분류 `metal`(금속)에 넣을지는 편집기 값이다.

## 사용자 결정 대기
- **철광석 1g 단위(D-487, 고를 안)**: 가. 시장·레시피는 1kg 묶음(로트)으로 사고팔고 보유는 g로 센다(물자 시장에 물건마다 로트 크기, 값 = 1kg당 정수 — 환전 로트와 같은 틀, 시뮬 거래소·NPC 판단 고침, SIM_VERSION 올림) / 나. 화폐 최소 단위를 1/1000로 낮춰 모든 값 × 1000(장부·잔고·세율 셈 전체, 가장 큰 바뀜) / 다. 보유 물건(인스턴스)이 생길 때까지 철광석 1개 = 1kg(무게 1,000)으로 두고, g로 나누기·쪼개기는 그때(지금 바뀜 가장 작음, 새 원석도 1개 = 1kg로 맞춤). 기술 추천: 다(지금은 나누고 쪼갤 보유 물건이 없다) → 보유 물건 줄기에서 가.
- **철광석 티어 3**: econ16 광산 Lv2(오염 두 배 → 정원사·경제 출력 바뀜, SIM_VERSION 올림) / 철광석 T1 유지(옛 T3과 다름).
- [임시] 값: 새 아이템·괴 시작 시세 1(값은 편집기에서), 제련 손실 없음 1,000g → 괴 1(레시피 편집기 값), 제련 작업량 1,000, 괴 티어 = 원석 티어, 목축 부산물 영어 이름 "Livestock byproducts".
- 원석 시작 시세 1은 1g당 1이라 1kg = 1,000이다(괴 시작 시세 1과 맞지 않음). 값을 정할 때 같이 맞춘다.
