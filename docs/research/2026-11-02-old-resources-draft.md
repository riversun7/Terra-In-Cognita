# 옛 1차 자원 변환본(검토용 초안) — 이름 바꿈 목록·출처 대조

> 출처: 기술 세션(Claude Code), 2026-11-02 KST. 아이템 편집기 WP-7(설계안 `docs/research/2026-11-01-item-editor-design.md` 3.8 "옛 1차 자원 136개", 6장 WP-7).
> 상태: **초안. 팩에 넣지 않았다.** 사용자가 이 문서를 확인한 뒤(D-487) 팩 커밋으로 넣는다. 변환본 파일: `docs/research/2026-11-02-old-resources-draft.json`.

## 1. 무엇을 했나
- 옛 프로젝트 `AntiGravt01/terra-server/scripts/seed_primary_materials.js`(1차 자원 136개)를 **글로만 읽어**(실행하지 않음) 새 팩 아이템 모양으로 바꿨다. 변환 도구는 저장소에 두지 않았다(한 번 쓰는 도구, 세션 임시 폴더).
- 채운 칸: ID(영어 snake_case), 영어 이름, 대분류·중분류, 티어, 무게(g). 식재료 계열은 중분류가 정한다(작물·약초 → 농작물 INT·WIS, 어류 → 낚시 DEX·AGI, 축산물 → 목축 STR·VIT, 50 §5.1·D-472).
- 넣지 않은 칸: 설명(옛 한국어 설명만 있다. 두 언어 필수 D-158이라 영어를 만든 뒤 넣는다), 태그(지금 태그가 없다).
- 모든 새 항목은 **꺼진 채**(`enabled: false`), 기준 가치는 모두 **1**(옛 시드에 값이 없다. 값은 편집기에서 정한다, D-487·D-398).
- 확인(Verified, 2026-11-02 실행): 지금 팩(core@25)을 복사해 `items.json`에 변환본을 얹고 팩 검사기(`loadContentPack`)로 보니 문제 0개(새로 135 · 고침 1). 136개·35,121바이트라 대량 도구 가져오기 한 묶음(300개·900 KiB 안)에 들어가고, 가져오기 해석기(`@terra/shared` `parseItemsJson`)도 문제 0개로 읽는다. 화면에서 실제로 가져와 적용해 보지는 않았다(미실행).

## 2. 쓰는 법(확인 뒤)
- 시험해 보기: `/dev/items` → [대량 도구] → 가져오기에 JSON을 붙여 넣고 [읽기] → "새로 135 · 고침 1" → [담기] → [적용]. 그 세계의 덮어쓰기로만 들어가고 팩은 그대로다(지우면 은퇴 ID가 남는다).
- 팩에 넣기: 아래 확인할 것을 고친 판을 `content/core/items.json`에 넣고 `manifest.json` 판을 올린 뒤 `pnpm check:content`.

## 3. 확인할 것(사용자 결정)
1. **이름 바꿈 목록**
   | 옛 코드 | 옛 이름 | 까닭 | 변환본(후보) |
   |---|---|---|---|
   | `MINERAL_T8_MITHRIL` | 미스릴 | 다른 작품의 창작 이름(D-067, 설계안 위험 14) | 운철 / Meteoric iron (`meteoric_iron`) — 실제 물질의 일반 이름이다 [Assumed: 상표 문제 없음]. 다른 후보를 고르면 ID도 바꾼다 |
   | `HERB_T9_WORLD_TREE_LEAF` | 세계수의 이슬잎 | 다른 게임의 유명한 회복 아이템("세계수의 잎")과 겹친다(D-067) [Assumed: 겹침 판단] | 신목 이슬잎 / Sacred dew leaf (`sacred_dew_leaf`) |
   | `MINERAL_T9_ORICHALCUM` | 오리할콘 | 옛 문헌(플라톤)의 이름이라 그대로 두되 출시 전 상표 검색(D-067 "창작 이름은 출시 전에 상표를 검색") | 오리할콘 / Orichalcum (`orichalcum`) — 검색 전까지 보류 |
2. **은·금·백금의 대분류**: 변환본은 대분류 9(귀금속·총량 자원)로 보냈다. 까닭: 50 §5.1 표에서 9번의 생산 단계가 "채집(총량 자원 D-112)"이고, 금·은이 예로 적혀 있다. 백금은 9번에 맞는 중분류가 없어 중분류 없이 두었다 → `platinum`(또는 "희귀 광물") 중분류를 만들지 정한다. 다른 안: 옛 그대로 원자재·광석에 두고 정제한 주괴만 9번.
3. **티타늄·운철·오리할콘**: 44 경제 표의 "희귀 광물(총량 자원)"에 드는지 기획에 없다(Unknown) → 지금은 원자재·광석.
4. **철광석 합치기**: 옛 `MINERAL_T3_IRON`(철, T3, 1,000g)은 지금 팩의 `iron_ore`(철광석, 임시 값 T1·기준 가치 8)와 같은 것으로 보고 새로 만들지 않았다. 변환본은 `iron_ore`의 이름·기준 가치·켬은 그대로, 티어 1 → 3·무게 1,000g·중분류 광석만 얹는다(가져오기에서 "고침 1"). 따로 두려면 다른 ID를 정한다.
5. **먹지 않는 목축 부산물**(가죽·뿔·엄니·깃털·양털·갈기·비늘·심장 파편 16개): 지금 중분류에 "먹지 않는 원자재 축산물"이 없어 크리쳐 재료로 보냈다(축산물 중분류는 식품이라 식량 창고·신선도 권고가 붙는다). 목축 부산물 중분류를 새로 둘지 정한다.
6. **밍크 오일**: 옛 분류(BIO)대로 축산물(식품)로 보냈지만 먹는 것이 아니다(장비 관리·버프 오일 재료) → 5번과 같이 정한다.
7. **기준 가치**: 모두 1(임시). 티어별 값 규칙이 없어서 만들지 않았다(D-487).
8. **설명**: 옛 한국어 설명 136개를 영어로 옮겨 함께 넣어야 한다(D-158). 옮길 때 실존 지명·상표(예: "페루의 산삼", "이베리코")는 50 §8 소재 규칙대로 바꾼다.
9. **이름 길이 권고**(50 §8 출발값 한글 2~8자·영문 3~16자, 편집기 권고 `advice_name_length`): 한 글자 — 은·금·콩·밀·쌀, 9자 넘음 — 최고급 은빛 모피(9)·상급 도토리 흑돈육(10)·유니콘의 은빛 갈기(10)·고대룡의 적열 비늘(10)·드래곤 하트 파편(9). 영어 이름은 모두 16자 안으로 지었다.
10. **옛 역할 표시**: 설명 끝의 (주식)·(부원료)·(주원료)는 태그 후보다(지금 태그 없음).

## 4. 출처 대조(시드 ↔ 옛 문서)
- 대조한 문서: `AntiGravt01/docs/GDD/Item/Consolidated_Item.md`의 ITM-10 표(1차 자원 티어). 둘 다 136줄이다.
- 광물·목재·작물·약초·목축(깃털 하나 빼고)은 티어·이름·무게가 같다. **어류는 많이 다르다**: 무게 19개·설명 21개가 다르고, 다금바리 코드가 시드 `FISH_T8_GROUPER` / 문서 `FISH_T8_KELP_GROUPER`로 다르다. 깃털 무게도 시드 50g / 문서 0.1kg.
- 변환본은 **시드 값**을 썼다(실제로 돌던 코드). 문서 값을 쓰려면 아래 목록에서 고른다(03 §11 11-01 교훈: 다른 판이 있으면 적는다).

대조 목록(시드 ↔ 문서, 다른 것만):
- FISH_T0_LOACH: 무게 시드 20g / 문서 0.1kg
- FISH_T0_MINNOW: 무게 시드 10g / 문서 0.05kg
- FISH_T0_MINNOW: 설명이 다름
- FISH_T1_CARP: 설명이 다름
- FISH_T1_CRUCIAN: 무게 시드 500g / 문서 0.8kg
- FISH_T2_SALMON: 무게 시드 4000g / 문서 2.0kg
- FISH_T2_TROUT: 무게 시드 1500g / 문서 1.8kg
- FISH_T2_TROUT: 설명이 다름
- FISH_T3_SAURY: 무게 시드 150g / 문서 0.2kg
- FISH_T3_SAURY: 설명이 다름
- FISH_T3_MACKEREL: 설명이 다름
- FISH_T3_SQUID: 무게 시드 400g / 문서 1.5kg
- FISH_T3_SQUID: 설명이 다름
- FISH_T4_ROCKFISH: 무게 시드 1000g / 문서 2.5kg
- FISH_T4_ROCKFISH: 설명이 다름
- FISH_T4_FLATFISH: 무게 시드 2000g / 문서 3.0kg
- FISH_T4_FLATFISH: 설명이 다름
- FISH_T5_SEA_BREAM: 설명이 다름
- FISH_T5_SEA_BASS: 무게 시드 3000g / 문서 4.0kg
- FISH_T5_SEA_BASS: 설명이 다름
- FISH_T6_OCTOPUS: 무게 시드 5000g / 문서 4.0kg
- FISH_T6_OCTOPUS: 설명이 다름
- FISH_T6_YELLOWTAIL: 무게 시드 10000g / 문서 8.0kg
- FISH_T6_YELLOWTAIL: 설명이 다름
- FISH_T6_MARLIN: 무게 시드 150000g / 문서 15.0kg
- FISH_T6_MARLIN: 설명이 다름
- FISH_T7_SUNFISH: 설명이 다름
- FISH_T7_STURGEON: 무게 시드 30000g / 문서 50.0kg
- FISH_T7_STURGEON: 설명이 다름
- FISH_T7_SAILFISH: 무게 시드 80000g / 문서 30.0kg
- FISH_T7_SAILFISH: 설명이 다름
- FISH_T8_GREAT_WHITE: 설명이 다름
- FISH_T8_TUNA: 무게 시드 80000g / 문서 150.0kg
- FISH_T8_TUNA: 설명이 다름
- FISH_T8_GROUPER: 옛 문서 표에 없음
- FISH_T8_GIANT_GROUPER: 설명이 다름
- FISH_T9_WHALE_SHARK: 무게 시드 150000g / 문서 1000.0kg
- FISH_T9_MEGALODON: 무게 시드 1000000g / 문서 2000.0kg
- FISH_T9_MEGALODON: 설명이 다름
- FISH_T9_COELACANTH: 무게 시드 50000g / 문서 80.0kg
- FISH_T9_COELACANTH: 설명이 다름
- RANCH_T0_FEATHER: 무게 시드 50g / 문서 0.1kg
- FISH_T8_KELP_GROUPER: 시드에 없음(문서에만)

## 5. 변환표(136줄, 시드 차례)
- 비고: merge = 지금 팩 항목에 얹음, precious = 대분류 9, rename = 이름 바꿈 후보, trademark = 상표 확인 보류, not_food = 먹지 않는데 식품 중분류, ko·en N자 = 이름 길이 권고.

| 옛 코드 | 새 ID | 한국어 | 영어 | 대분류/중분류 | 티어 | 무게(g) | 비고 |
|---|---|---|---|---|---|---|---|
| MINERAL_T0_RUBBLE | `rubble` | 잡석 | Rubble | raw/ore | T0 | 1,000 |  |
| MINERAL_T1_STONE | `stone` | 석재 | Stone | raw/ore | T1 | 1,000 |  |
| MINERAL_T2_COPPER | `copper_ore` | 구리 | Copper ore | raw/ore | T2 | 1,000 |  |
| MINERAL_T3_IRON | `iron_ore` | 철광석 | Iron ore | raw/ore | T3 | 1,000 | merge |
| MINERAL_T4_SILVER | `silver_ore` | 은 | Silver ore | precious/silver | T4 | 1,000 | precious, ko 1자 |
| MINERAL_T5_TITANIUM | `titanium_ore` | 티타늄 | Titanium ore | raw/ore | T5 | 1,000 |  |
| MINERAL_T6_GOLD | `gold_ore` | 금 | Gold ore | precious/gold | T6 | 1,000 | precious, ko 1자 |
| MINERAL_T7_PLATINUM | `platinum_ore` | 백금 | Platinum ore | precious/(중분류 없음) | T7 | 1,000 | precious |
| MINERAL_T8_MITHRIL | `meteoric_iron` | 운철 | Meteoric iron | raw/ore | T8 | 1,000 | rename |
| MINERAL_T9_ORICHALCUM | `orichalcum` | 오리할콘 | Orichalcum | raw/ore | T9 | 1,000 | trademark |
| WOOD_T0_PINE | `pine_log` | 소나무 | Pine log | raw/wood | T0 | 2,000 |  |
| WOOD_T1_BIRCH | `birch_log` | 자작나무 | Birch log | raw/wood | T1 | 2,000 |  |
| WOOD_T2_CYPRESS | `cypress_log` | 편백나무 | Cypress log | raw/wood | T2 | 2,000 |  |
| WOOD_T3_MAPLE | `maple_log` | 단풍나무 | Maple log | raw/wood | T3 | 2,000 |  |
| WOOD_T4_OAK | `oak_log` | 참나무 | Oak log | raw/wood | T4 | 2,000 |  |
| WOOD_T5_ASH | `ash_log` | 물푸레나무 | Ash log | raw/wood | T5 | 2,000 |  |
| WOOD_T6_WALNUT | `walnut_log` | 호두나무 | Walnut log | raw/wood | T6 | 2,000 |  |
| WOOD_T7_TEAK | `teak_log` | 티크나무 | Teak log | raw/wood | T7 | 2,000 |  |
| WOOD_T8_ROSEWOOD | `rosewood_log` | 자단나무 | Rosewood log | raw/wood | T8 | 2,000 |  |
| WOOD_T9_EBONY | `ebony_log` | 흑단나무 | Ebony log | raw/wood | T9 | 2,000 |  |
| CROP_T0_HAY | `hay` | 건초 | Hay | raw/crop | T0 | 100 |  |
| CROP_T0_BEAN | `bean` | 콩 | Bean | raw/crop | T0 | 100 | ko 1자 |
| CROP_T0_BARLEY | `barley` | 보리 | Barley | raw/crop | T0 | 100 |  |
| CROP_T1_POTATO | `potato` | 감자 | Potato | raw/crop | T1 | 200 |  |
| CROP_T1_CABBAGE | `napa_cabbage` | 배추 | Napa cabbage | raw/crop | T1 | 300 |  |
| CROP_T1_CARROT | `carrot` | 당근 | Carrot | raw/crop | T1 | 200 |  |
| CROP_T2_WHEAT | `wheat` | 밀 | Wheat | raw/crop | T2 | 200 | ko 1자 |
| CROP_T2_ONION | `onion` | 양파 | Onion | raw/crop | T2 | 200 |  |
| CROP_T2_TOMATO | `tomato` | 토마토 | Tomato | raw/crop | T2 | 200 |  |
| CROP_T3_RICE | `rice` | 쌀 | Rice | raw/crop | T3 | 200 | ko 1자 |
| CROP_T3_GARLIC | `garlic` | 마늘 | Garlic | raw/crop | T3 | 100 |  |
| CROP_T3_GREEN_ONION | `green_onion` | 대파 | Green onion | raw/crop | T3 | 100 |  |
| CROP_T4_CORN | `corn` | 옥수수 | Corn | raw/crop | T4 | 200 |  |
| CROP_T4_ASPARAGUS | `asparagus` | 아스파라거스 | Asparagus | raw/crop | T4 | 100 |  |
| CROP_T4_CELERY | `celery` | 샐러리 | Celery | raw/crop | T4 | 200 |  |
| CROP_T5_SOYBEAN | `soybean` | 대두 | Soybean | raw/crop | T5 | 100 |  |
| CROP_T5_OLIVE | `olive` | 올리브 | Olive | raw/crop | T5 | 100 |  |
| CROP_T5_SESAME | `sesame` | 참깨 | Sesame | raw/crop | T5 | 50 |  |
| CROP_T6_PUMPKIN | `kabocha` | 단호박 | Kabocha squash | raw/crop | T6 | 500 |  |
| CROP_T6_ARTICHOKE | `artichoke` | 아티초크 | Artichoke | raw/crop | T6 | 400 |  |
| CROP_T6_SHALLOT | `shallot` | 샬롯 | Shallot | raw/crop | T6 | 100 |  |
| CROP_T7_QUINOA | `quinoa` | 퀴노아 | Quinoa | raw/crop | T7 | 100 |  |
| CROP_T7_WASABI | `fresh_wasabi` | 생와사비 | Fresh wasabi | raw/crop | T7 | 200 |  |
| CROP_T7_GINGER | `ginger` | 생강 | Ginger | raw/crop | T7 | 100 |  |
| CROP_T8_BLACK_MACA | `black_maca` | 블랙 마카 | Black maca | raw/crop | T8 | 300 |  |
| CROP_T8_WHITE_TRUFFLE | `white_truffle` | 화이트 트러플 | White truffle | raw/crop | T8 | 100 |  |
| CROP_T8_LOTUS_SEED | `lotus_seed` | 연꽃 씨앗 | Lotus seed | raw/crop | T8 | 100 |  |
| CROP_T9_GOD_GRAIN | `divine_grain` | 신의 낟알 | Divine grain | raw/crop | T9 | 500 |  |
| CROP_T9_AMBROSIA | `ambrosia` | 암브로시아 | Ambrosia | raw/crop | T9 | 500 |  |
| CROP_T9_GOLDEN_APPLE | `golden_apple` | 황금 사과 | Golden apple | raw/crop | T9 | 500 |  |
| HERB_T0_WILD_HERB | `wild_herb` | 자생초 | Wild herb | raw/herb | T0 | 100 |  |
| HERB_T0_WILD_CHIVE | `wild_chive` | 들달래 | Wild chive | raw/herb | T0 | 100 |  |
| HERB_T0_CLOVER | `clover` | 클로버 | Clover | raw/herb | T0 | 100 |  |
| HERB_T1_ALOE | `aloe` | 알로에 | Aloe | raw/herb | T1 | 300 |  |
| HERB_T1_PEPPERMINT | `peppermint` | 페퍼민트 | Peppermint | raw/herb | T1 | 100 |  |
| HERB_T1_CHAMOMILE | `chamomile` | 카모마일 | Chamomile | raw/herb | T1 | 100 |  |
| HERB_T2_LAVENDER | `lavender` | 라벤더 | Lavender | raw/herb | T2 | 100 |  |
| HERB_T2_ROSEMARY | `rosemary` | 로즈마리 | Rosemary | raw/herb | T2 | 100 |  |
| HERB_T2_THYME | `thyme` | 타임 | Thyme | raw/herb | T2 | 100 |  |
| HERB_T3_ANGELICA | `angelica_root` | 당귀 | Angelica root | raw/herb | T3 | 200 |  |
| HERB_T3_LICORICE | `licorice_root` | 감초 | Licorice root | raw/herb | T3 | 200 |  |
| HERB_T3_SWEET_BASIL | `sweet_basil` | 스위트 바질 | Sweet basil | raw/herb | T3 | 100 |  |
| HERB_T4_BELLADONNA | `belladonna` | 벨라돈나 | Belladonna | raw/herb | T4 | 100 |  |
| HERB_T4_WOLFSBANE | `wolfsbane` | 투구꽃 | Wolfsbane | raw/herb | T4 | 100 |  |
| HERB_T4_STAR_ANISE | `star_anise` | 팔각 | Star anise | raw/herb | T4 | 100 |  |
| HERB_T5_MANDRAKE | `mandrake` | 맨드레이크 | Mandrake | raw/herb | T5 | 1,000 |  |
| HERB_T5_SAFFRON | `saffron` | 샤프란 | Saffron | raw/herb | T5 | 50 |  |
| HERB_T5_HEMLOCK | `hemlock` | 독미나리 | Hemlock | raw/herb | T5 | 200 |  |
| HERB_T6_GINSENG | `ginseng` | 인삼 | Ginseng | raw/herb | T6 | 200 |  |
| HERB_T6_FLEECEFLOWER | `fo_ti_root` | 하수오 | Fo-ti root | raw/herb | T6 | 300 |  |
| HERB_T6_BLACK_TRUFFLE | `black_truffle` | 블랙 트러플 | Black truffle | raw/herb | T6 | 200 |  |
| HERB_T7_GASTRODIA | `gastrodia` | 천마 | Gastrodia tuber | raw/herb | T7 | 200 |  |
| HERB_T7_AGARWOOD | `agarwood` | 침향 | Agarwood | raw/herb | T7 | 500 |  |
| HERB_T7_MOONLIGHT_LAUREL | `moonlight_laurel` | 달빛 월계수 | Moonlight laurel | raw/herb | T7 | 100 |  |
| HERB_T8_MILLENNIUM_GINSENG | `ancient_ginseng` | 천년산삼 | Ancient ginseng | raw/herb | T8 | 500 |  |
| HERB_T8_BLOOD_LOTUS | `blood_lotus` | 적혈연꽃 | Blood lotus | raw/herb | T8 | 200 |  |
| HERB_T8_GANODERMA | `reishi` | 영지버섯 | Reishi mushroom | raw/herb | T8 | 300 |  |
| HERB_T9_SNOW_GINSENG | `snow_ginseng` | 만년설삼 | Snow ginseng | raw/herb | T9 | 1,000 |  |
| HERB_T9_WORLD_TREE_LEAF | `sacred_dew_leaf` | 신목 이슬잎 | Sacred dew leaf | raw/herb | T9 | 100 | rename |
| HERB_T9_STARLIGHT_MOSS | `starlight_moss` | 별빛 이끼 | Starlight moss | raw/herb | T9 | 100 |  |
| FISH_T0_LOACH | `loach` | 미꾸라지 | Loach | raw/fish | T0 | 20 |  |
| FISH_T0_MINNOW | `minnow` | 피라미 | Minnow | raw/fish | T0 | 10 |  |
| FISH_T1_CARP | `carp` | 잉어 | Carp | raw/fish | T1 | 1,500 |  |
| FISH_T1_CRUCIAN | `crucian_carp` | 붕어 | Crucian carp | raw/fish | T1 | 500 |  |
| FISH_T2_SALMON | `salmon` | 연어 | Salmon | raw/fish | T2 | 4,000 |  |
| FISH_T2_TROUT | `trout` | 송어 | Trout | raw/fish | T2 | 1,500 |  |
| FISH_T3_SAURY | `saury` | 꽁치 | Pacific saury | raw/fish | T3 | 150 |  |
| FISH_T3_MACKEREL | `mackerel` | 고등어 | Mackerel | raw/fish | T3 | 500 |  |
| FISH_T3_SQUID | `squid` | 오징어 | Squid | raw/fish | T3 | 400 |  |
| FISH_T4_ROCKFISH | `rockfish` | 우럭 | Rockfish | raw/fish | T4 | 1,000 |  |
| FISH_T4_FLATFISH | `olive_flounder` | 광어 | Olive flounder | raw/fish | T4 | 2,000 |  |
| FISH_T5_SEA_BREAM | `sea_bream` | 도미 | Sea bream | raw/fish | T5 | 2,500 |  |
| FISH_T5_SEA_BASS | `sea_bass` | 농어 | Sea bass | raw/fish | T5 | 3,000 |  |
| FISH_T6_OCTOPUS | `octopus` | 문어 | Octopus | raw/fish | T6 | 5,000 |  |
| FISH_T6_YELLOWTAIL | `yellowtail` | 방어 | Yellowtail | raw/fish | T6 | 10,000 |  |
| FISH_T6_MARLIN | `marlin` | 새치 | Marlin | raw/fish | T6 | 150,000 |  |
| FISH_T7_SUNFISH | `ocean_sunfish` | 개복치 | Ocean sunfish | raw/fish | T7 | 200,000 |  |
| FISH_T7_STURGEON | `sturgeon` | 철갑상어 | Sturgeon | raw/fish | T7 | 30,000 |  |
| FISH_T7_SAILFISH | `sailfish` | 돛새치 | Sailfish | raw/fish | T7 | 80,000 |  |
| FISH_T8_GREAT_WHITE | `white_shark` | 백상아리 | White shark | raw/fish | T8 | 500,000 |  |
| FISH_T8_TUNA | `bluefin_tuna` | 참다랑어 | Bluefin tuna | raw/fish | T8 | 80,000 |  |
| FISH_T8_GROUPER | `grouper` | 다금바리 | Grouper | raw/fish | T8 | 20,000 |  |
| FISH_T8_GIANT_GROUPER | `giant_sea_bass` | 돗돔 | Giant sea bass | raw/fish | T8 | 100,000 |  |
| FISH_T9_WHALE_SHARK | `whale_shark` | 고래상어 | Whale shark | raw/fish | T9 | 150,000 |  |
| FISH_T9_MEGALODON | `megalodon` | 메갈로돈 | Megalodon | raw/fish | T9 | 1,000,000 |  |
| FISH_T9_COELACANTH | `coelacanth` | 실러캔스 | Coelacanth | raw/fish | T9 | 50,000 |  |
| RANCH_T0_RAW_MEAT | `raw_meat` | 생고기 | Raw meat | raw/livestock_product | T0 | 500 |  |
| RANCH_T0_EGG | `egg` | 계란 | Egg | raw/livestock_product | T0 | 100 |  |
| RANCH_T0_FEATHER | `feather` | 깃털 | Feather | raw/creature_material | T0 | 50 |  |
| RANCH_T1_VENISON | `venison` | 사슴 고기 | Venison | raw/livestock_product | T1 | 1,000 |  |
| RANCH_T1_DEER_LEATHER | `deer_hide` | 사슴 가죽 | Deer hide | raw/creature_material | T1 | 1,000 |  |
| RANCH_T1_DEER_HORN | `deer_antler` | 사슴 뿔 | Deer antler | raw/creature_material | T1 | 500 |  |
| RANCH_T2_MUTTON | `mutton` | 양고기 | Mutton | raw/livestock_product | T2 | 1,000 |  |
| RANCH_T2_WOOL | `wool` | 몽실한 양털 | Fluffy wool | raw/creature_material | T2 | 200 |  |
| RANCH_T2_MILK | `sheep_milk` | 양유 | Sheep milk | raw/livestock_product | T2 | 500 |  |
| RANCH_T3_PREMIUM_BEEF | `prime_beef` | 1등급 쇠고기 | Prime beef | raw/livestock_product | T3 | 1,500 |  |
| RANCH_T3_BISON_HIDE | `bison_hide` | 두꺼운 들소가죽 | Thick bison hide | raw/creature_material | T3 | 3,500 |  |
| RANCH_T3_BISON_HORN | `bison_horn` | 들소 뿔 | Bison horn | raw/creature_material | T3 | 1,500 |  |
| RANCH_T4_FOX_MEAT | `fox_meat` | 여우 고기 | Fox meat | raw/livestock_product | T4 | 800 |  |
| RANCH_T4_SILVER_FUR | `silver_fur` | 최고급 은빛 모피 | Silver fur | raw/creature_material | T4 | 500 | ko 9자 |
| RANCH_T4_MINK_OIL | `mink_oil` | 밍크 오일 | Mink oil | raw/livestock_product | T4 | 200 | not_food |
| RANCH_T5_BLACK_PORK | `acorn_pork` | 상급 도토리 흑돈육 | Acorn-fed pork | raw/livestock_product | T5 | 1,200 | ko 10자 |
| RANCH_T5_HARD_TUSK | `hard_tusk` | 단단한 엄니 | Hard tusk | raw/creature_material | T5 | 1,000 |  |
| RANCH_T5_LARD | `lard` | 돼지 비계 | Lard | raw/livestock_product | T5 | 500 |  |
| RANCH_T6_CROC_MEAT | `croc_tail_meat` | 악어 꼬리 고기 | Croc tail meat | raw/livestock_product | T6 | 1,500 |  |
| RANCH_T6_CROC_LEATHER | `croc_hide` | 철갑 악어가죽 | Croc hide | raw/creature_material | T6 | 2,000 |  |
| RANCH_T6_CROC_TOOTH | `croc_tooth` | 악어 이빨 | Croc tooth | raw/creature_material | T6 | 500 |  |
| RANCH_T7_GRYPHON_MEAT | `gryphon_meat` | 그리폰 고기 | Gryphon meat | raw/livestock_product | T7 | 2,000 |  |
| RANCH_T7_RAPTOR_BEAK | `raptor_beak` | 맹금의 부리 | Raptor beak | raw/creature_material | T7 | 1,500 |  |
| RANCH_T7_GRYPHON_FEATHER | `gryphon_feather` | 그리폰의 깃털 | Gryphon feather | raw/creature_material | T7 | 100 |  |
| RANCH_T8_UNICORN_MEAT | `unicorn_meat` | 유니콘 고기 | Unicorn meat | raw/livestock_product | T8 | 1,500 |  |
| RANCH_T8_PURIFICATION_HORN | `purifying_horn` | 정화의 뿔 | Purifying horn | raw/creature_material | T8 | 1,000 |  |
| RANCH_T8_UNICORN_MANE | `unicorn_mane` | 유니콘의 은빛 갈기 | Unicorn mane | raw/creature_material | T8 | 100 | ko 10자 |
| RANCH_T9_DRAGON_MEAT | `dragon_meat` | 고대룡의 고기 | Dragon meat | raw/livestock_product | T9 | 5,000 |  |
| RANCH_T9_DRAGON_SCALE | `dragon_scale` | 고대룡의 적열 비늘 | Dragon scale | raw/creature_material | T9 | 8,000 | ko 10자 |
| RANCH_T9_DRAGON_HEART_FRAG | `drakeheart_shard` | 드래곤 하트 파편 | Drakeheart shard | raw/creature_material | T9 | 10,000 | ko 9자 |
