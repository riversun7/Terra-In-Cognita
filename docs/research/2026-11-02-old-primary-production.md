# 옛 1차 생산 규칙 대조 — 채집 건물별 스탯·티어·진행·수확량·하위 재료의 쓰임

> 출처: 기술 세션(Claude Code), 2026-11-02 KST. 사용자 원문(2026-11-02): "일단 넘어가라 왜 이전 프로잭트를 계속 무시하냐? 하위광석 석재등은 건축에 쓰인다. 주스탯 부스탯이 1차생산에 미치는 영향도 왜 무시하냐" → 기획 D-507(미러 `3fc96ba`, 49 N44), 원칙 `docs/questions/2026-11-02-gather-tier.md` 끝 절.
> 옛 프로젝트: AntiGravt01 main `0ea5299`을 읽기만 했다(실행하지 않음). 모든 줄 번호는 그 커밋 기준이다(**Verified**: 파일을 열어 그 줄을 읽음).
> 반영: 가지 `work/primary-production`(팩 core@30, `SIM_VERSION` 9). ADR `docs/adr/2026-10-31-economy-core.md` "바뀜 (2026-11-02, 옛 1차 생산 규칙 …)", 작업 기록 `docs/worklog/2026/11/02-2330-primary-production.md`.

## 1. 어디에 있나 (옛 코드)

| 파일 | 하는 일 |
|---|---|
| `terra-server/game/gather/BuildingGatherEngine.js` | 건물 안 채집: 농장(FARM)·목장(PASTURE)·낚시터(FISHING_DOCK). 1분 틱(`server.js:445~452`, 60,000ms) |
| `terra-server/game/gather/FieldGatherEngine.js` | 필드 채집: 광산(MINE)·벌목장(LUMBERYARD)·약초원(HERB_GARDEN). 60초 틱(`server.js:515~547`) + 10초 동작 틱(`server.js:550~557`) |
| `terra-server/game/gather/GatherResolverEngine.js` | 티어 추첨·아이템 고르기·채집 스킬 XP |
| `terra-server/database_init/migrations/index.js` | `gather_type_config`(642~736)·`resource_tier_items`(803~837)·`skill_tier_probability`(839~912)·`fishing_config`(613~640) |
| `terra-server/seeds/building_seed.js` + `utils/system/auto_seed.js` | 건물 건설 비용 공식과 값(pg 시드는 `auto_seed.js:98~112`가 `BUILDING_SEEDS`를 넣는다, `ServerBootstrap.js:48~49`) |
| `terra-server/game/territory/BuildingSpawner.js` | 건설 재료 차감 `checkAndDeductMaterials`(293~414) |
| `docs/GDD/Item/Consolidated_Item.md` ITM-10 | 스탯 표·공식·티어 아이템 표(1~230줄) |
| `docs/GDD/Building/BLD-3_Durability.md` | 내구도·수리 재료 |

## 2. 건물별 규칙 표

공통(옛 코드 마지막 판):
- **진행 속도**: 틱마다 진행 += `max(1, floor(주 스탯 / 20))` — `BuildingGatherEngine.js:291`(농장)·`:527`(목장). 문서 ITM-10 53줄 "progressBonus = max(1, floor(1차스탯 / 20))".
- **필요 진행**: `max(30, 30 + 티어 × 30)` — `BuildingGatherEngine.js:82~88`(주석 표 T0 30 … T9 300). 농장은 작물 칸 값이 먼저다: `Number(cropRow.required_progress) || tierRequiredProgress(tier)`(`:260`), 목장은 늘 티어 공식(`:505`).
- **해금 티어(선택 방식)**: `min(9, floor((주 + 보조) / 20))` — `BuildingGatherEngine.js:73~80`(예: "VIT 60 + INT 20 = 80 → T4", 76줄). 문서 ITM-10 33~51줄.
- **추첨 티어(확률 방식)**: 유효 스탯 = 주 + 보조(`GatherResolverEngine.js:144`), 그 값이 든 20 단위 구간의 가중치(`:81~94`, 구간 밖이면 마지막 구간), 칸 최대 티어가 1 이상일 때만 상한(`:138~139`), 뽑은 티어에 아이템이 없으면 더 낮은 티어(`:155~163`), 같은 티어 여럿이면 `drop_weight`(기본 10) 가중 추첨(`:170~180`, 표 기본값 `migrations/index.js:813`).
- **수확량**: 코드는 **1개 고정** — `GatherResolverEngine.js:186` "기획상 채집량 일괄 1개 고정 통일", `BuildingGatherEngine.js:300·535`, 수동 채집 `routes/economy/resource_routes.js:241`. `yield_base·yield_per_stat·yield_cap`은 넘기지만 쓰지 않는다(`GatherResolverEngine.js:133`, `FieldGatherEngine.js:419~421·1049~1051`). 문서 ITM-10 54줄은 "수확량 보너스: floor(2차스탯 × yield_per_stat(0.08)) — 추가 수확 개수".
- **채집 스킬 XP**: 필요 XP = 레벨 × 50 + 50, 최대 99(`GatherResolverEngine.js:220~230`), 수확마다 `xp_reward`(기본 5, `BuildingGatherEngine.js:316~321·350~351`).

| 건물 | 주 · 보조 (`gather_type_config`, `migrations/index.js:715~733`) | 티어 방식 | 진행 | 수확량 칸 (`yield_base`·`yield_per_stat`·`yield_cap`, 같은 곳 657~664·725~733) | 피로 (`fatigue_per_cycle`) | 그 밖 |
|---|---|---|---|---|---|---|
| 광산 MINE | STR · VIT | 확률 추첨(`FieldGatherEngine.js:1043~1052`) | 없음: GATHERING 상태의 틱마다 1번(10초 동작 틱도 돈다, `:522`는 IDLE만 건너뜀) | 1 · 0.10 · 10 (코드는 1개 고정) | 5/번(`:422·1171~1173`) | 자원 칸 HP −1/번, 0이면 30분 뒤 다시 참(`:1027~1037`), T2 이상 부상 확률(`:1156~1163`), 무게 95%·피로 100이면 복귀(`:1181~1182`) |
| 벌목장 LUMBERYARD | DEX · STR | 확률 추첨 | 없음(광산과 같은 엔진) | 1 · 0.10 · 10 | 5 | 광산과 같음 |
| 약초원 HERB_GARDEN | INT · WIS | 확률 추첨 | 없음(같은 엔진) | 1 · 0.10 · 8 | 4 | 같음 |
| 농장 FARM | VIT · INT | 선택 + 효율: 해금 티어 이하 가장 높은 티어 작물, 같은 티어면 무작위(`BuildingGatherEngine.js:244~253`) | max(1, ⌊VIT/20⌋)/분, 필요 = 작물 값 또는 티어 공식 | 1 · 0.08 · 8 (코드 1개) | 1/틱(`:215`) | 유닛마다 큐(V4, 1~10줄), 수확 뒤 큐 지움 → 다음 틱 새로 고름(`:346~347`) |
| 목장 PASTURE | WIS · AGI | 선택 + 효율(`resource_tier_items` BYPRODUCT, `:490~498`, `drop_weight` 가중) | 같음, 필요 = 티어 공식(`:505`) | 1 · 0.08 · 6 (코드 1개, 티어별 yield_min·max를 적지만 안 씀 `:506~508·535`) | 1(`:461`) | 수확 뒤 진행만 0으로(같은 부산물 반복, `:563~564`) |
| 낚시터 FISHING_DOCK | AGI · DEX | 성공 확률 → 확률 추첨(`:723~735`, 칸 상한 9) | 없음(1분 틱마다 시도) | 1 · 0.10 · 5 (코드 1개) | 1/시도(`:693`) | 성공률 = min(0.80, 0.30 + 0.50 × min(1, (주 + 보조)/200))(`:638~642·715~716`, `fishing_config` `migrations/index.js:613~640`), 반경 5칸에 물이 없으면 못 함(`:678~691`) |

확률표(`skill_tier_probability`, `migrations/index.js:856~910`)는 `docs/questions/2026-11-02-gather-tier.md` 0절 표 그대로다(D-506이 0~39를 [임시] 값으로 바꿨다, D-507 "확률은 나중에 사용자와 고침").

## 3. 옛 문서와 옛 코드가 다른 곳 (무엇이 돌았나)

| 무엇 | 옛 문서 | 옛 코드 (돌던 것) | 새 프로젝트 |
|---|---|---|---|
| 확률 추첨의 스탯 | ITM-10 31줄 "1차 스탯 단독" | 주 + 보조(`GatherResolverEngine.js:144`) | 코드(D-506·D-507) |
| 수확량 | ITM-10 54줄 floor(2차 × 0.08) 추가 | 1개 고정(`GatherResolverEngine.js:186`) | **켬**: 사용자 원문 "부스탯이 1차생산에 미치는 영향" → D-507. 값은 시설마다 `gather_type_config`(0.10, 농장·목장 0.08, 상한 5~10) |
| 진행 속도를 받는 건물 | ITM-10 23줄 "1차 스탯: … 틱 속도 결정"(모든 건물) | 농장·목장만(필드 엔진엔 진행이 없다) | 모든 1차 생산(D-507 "주 스탯 → 작업 속도", 43 §4) |
| 스탯 짝 | ITM-10 14~21줄 = `gather_type_config` | 엔진 안 고정 표가 다르다: 목재 STR·DEX, 광석 STR·CON, 약초 WIS·DEX, 식량 CON·WIS, 부산물 STR·AGI, 어류 AGI·CON(`BuildingGatherEngine.js:218~228·464~474·697~707`, `FieldGatherEngine.js:425~435`). 표의 `primary_stat`·`secondary_stat`은 읽지만 쓰지 않는다(`BuildingGatherEngine.js:145~146`). 게다가 필드 엔진 질의는 `constitution`을 가져오지 않아(`FieldGatherEngine.js:326`) 광석 보조는 늘 0이었다 | `gather_type_config` 짝(D-507: 고정 표는 옛 버그로 봄, Assumed). 수동 채집 길은 표 짝을 썼다(`resource_routes.js:254~265`) |
| 낚시 확률 | 문서 "성공률 + 확률 추첨" | 같음. 칸 상한 9 고정(`:731`) | 시설·레시피 없음(넣지 않음) |

## 4. 하위 재료의 쓰임

- 아이템 표(ITM-10): 잡석 T0 "가장 흔하고 무가치한 돌멩이"(74줄), 석재 T1 "기본적인 건축 자재로 사용되는 돌"(75줄), 구리 T2 "초기 공예와 전선의 기초 재료"(76줄), 소나무 T0 "가장 보편적인 초반 건축 뼈대용 연재"(88줄).
- **건설 비용(돌던 것)**: `building_seed.js` 공식 = 기준 재료 × 티어² × 카테고리 배율(8~16줄, `buildCost` 87~95줄, 줄마다 반올림). 재료 이름 바꾸기 `MAT_MAP`(36~43줄): WOOD·STONE·PLANK·BRICK → **잡석**, INGOT → **철**(옛 MINERAL_T3_IRON, 지금 `iron_ore`, D-505 4), CHEMICAL → Bio-Resin. 배율 `CAT_MUL`(52~66줄): PRIMARY·BREEDING 0.8, HOUSING·STORAGE·RESEARCH·LOGISTICS·RELIGION 1.0, PUBLIC·COMMERCIAL·SECONDARY 1.2, MILITARY 1.5, TERRITORY 3.0. pg 서버는 이 값을 `auto_seed.js:98~112`로 넣었다.
  - 다른 점: 머리 주석은 WOOD·PLANK·BRICK의 잡석 대체를 "임시"라 적었다(35·37·39·40줄 — 옛 나무 더미 자원을 지워서). 문서·아이템 설명은 석재·소나무를 건축 재료로 적는다. **돌던 것(잡석·철)을 따랐다**(D-507 "마지막 판"). 석재·소나무로 바꾸는 것은 팩 `facilities.build.materials` 자료만 고치면 된다(질문 1).
  - 건설 시간 = 재료 무게 합 × 10초 × 티어 계수(0.5·1·1.5·2.5, 69·129~137줄), 유지비 = 재료 합 × 1%/일 도시 화폐(106~119줄). 건설은 유닛 인벤토리 → 세력 WAREHOUSE 차례로 뺀다(`BuildingSpawner.js:330~407`), NPC 첫 FARM·LUMBERYARD·MINE과 첫 VILLAGE_HALL은 공짜(`:297~316`).
  - 건물 재료(옛 raw → 잡석·철): 농장 {WOOD 8}(227줄, T1 PRIMARY), 벌목장 {WOOD 10, STONE 5}(205줄), 광산 {WOOD 12, STONE 10}(216줄), 제련소 {STONE 15, WOOD 8}(407줄, T2 SECONDARY_REFINE), 무기공방 WORKSHOP {PLANK 10, INGOT 6}(800줄, T3 SECONDARY_CRAFT), 주방 KITCHEN {PLANK 15, STONE 10, BRICK 5}(`database_init/schema.js:4057~4078`, 옛 sqlite 길의 글자 그대로 값, pg 시드 목록에는 없음 — 가장 가까운 pg 시드는 제빵소 BAKERY {WOOD 10, STONE 8} 484줄).
- **수리**: 내구도 10%를 고칠 때 건설 재료의 10%(`BLD-3_Durability.md:26~29`, `building_seed.js:26~30`). 6시간마다 최대 내구도 10% 자연 감소, 30%에서 멈추고 기능 정지(같은 문서 14~17줄).
- **가공**: 잡석·석재 → 시멘트(PURE_CEMENT) → 벽돌(BRICK), 수율 0.30(`utils/item/item_lookup.js:62·67~68`). NPC 제작 AI가 광석 코드로 이 표를 찾는다(`ai/NpcCraftAI.js:67~68`).
- **NPC 재고 목표**: 자원 STONE = 잡석(`ai/NpcHarvestAI.js:20·26·41`). 창고가 꽉 차면 창고 건설에 잡석을 쓰고 모자라면 광산으로 보낸다(`FieldGatherEngine.js:575·599~610`).
- 무기·방어구 T1 레시피(ITM-11)는 석재를 쓴다(예: 석제 단검 석재 ×2, `Consolidated_Item.md:287`) — 문서만, 새 팩에는 장비 제작 레시피가 없다.

## 5. 새 프로젝트에 옮긴 것 (D-507, 팩 core@30, SIM 9)

| 규칙 | 옛 값 · 출처 | 새 위치 |
|---|---|---|
| 진행 속도 max(1, ⌊주 ÷ 20⌋) | `BuildingGatherEngine.js:291·527` | 설정 칸 N32 `n32_main_divisor` 20, `@terra/sim` `gatherProgress`. 시뮬은 시설 시간당 작업량 × 이 값 |
| 필요 진행 max(30, 30 + T × 30) | `BuildingGatherEngine.js:82~88` | N44 `n44_tier_progress_base` 30·`n44_tier_progress_step` 30, `tierRequiredProgress`. 사다리(추첨·선택) 산출은 나온 티어마다 이만큼(빈 번은 T0) |
| 진행 1 = 1분 | `server.js:445~452`(BuildingGatherTick 60,000ms) | N44 `n44_tick_ms` 60,000 |
| 수확량 min(상한, 기본 + ⌊보조 × 비율⌋) | `gather_type_config`(`migrations/index.js:657~664·725~733`) | 팩 `facilities.gather.yieldBase·yieldPerStatPm·yieldCap`: 광산 1·100‰·10, 벌목장 1·100‰·10, 농장 1·80‰·8. 칸이 없는 시설은 N32 `n32_sub_yield` 80‰ |
| 광석 한 번 = 1kg | ITM-10 무게 1.0kg(72~83줄) | N44 `n44_ore_grams` 1,000(기본 단위 g·묶음 > 1 아이템) |
| 해금 티어 min(⌊(주 + 보조) ÷ 20⌋, 9) | `BuildingGatherEngine.js:73~80` | 49 P8, `accessibleTier`. 농장 `gather.mode: "select"`(작물 사다리, 지금 켜진 작물 없음 → 곡물 레시피는 사다리 밖) |
| 스탯 짝 | `gather_type_config` | 광산 STR·VIT, 벌목장 DEX·STR(앞 가지), 농장 VIT·INT(이 가지) |
| 하위 광석·목재 켬 | ITM-10 74~76·88~90줄 | 잡석·석재·구리 원석, 소나무·자작나무·편백나무(T0~T2) 켬. 벌목장 레시피 `cut_logs`(목재 사다리 추첨, 수량·작업량은 `cut_timber`와 같은 [임시] 값) |
| 건설 재료 | `building_seed.js` 위 4절 | 팩 `facilities.build {mulPm, materials}`(49 M14 출발값 = 옛 값), 레벨 L = 줄마다 round(qty × L² × 배율). 셈하는 곳은 아직 없다 |

## 6. 옮기지 않은 것 (까닭)
- 필드 채집의 이동·자원 칸 HP·재생 30분·적재 무게·복귀, 낚시 성공률·물 검사, 칸 최대 티어: 시뮬 시설에 칸·이동이 없다(서버 생산도 아직 없다).
- 피로(`fatigue_per_cycle` 5·5·4·1·1·1)와 채집 스킬 XP·부상: 시뮬 경제 일꾼에 피로·스킬이 없다(49 N22 "작업별 피로 누적" 출발값 없음 칸에 옛 값이 있다는 것만 적는다).
- 농장 작물의 작물별 필요 진행(`farm_crops.required_progress`): 새 팩에 작물 레시피가 없다. 사다리 밖 레시피는 레시피 작업량이 그 자리다.
- 목장·약초원·낚시터 시설: 팩에 없다(아이템은 꺼진 채로 있다).
- 건설·레벨 올림·수리·유지비·건설 시간: 시설은 시나리오 처음부터 있고 짓는 행동이 없다. 데이터만 넣었다.
- 잡석·석재 → 시멘트 → 벽돌, 구리 제련: 시멘트·벽돌 아이템이 없고, 구리 괴·제련 레시피는 꺼진 채 둔다(켜면 econ16 거래 목록이 바뀐다).

## 7. 묻거나 확인할 것
1. 건설 재료: 돌던 코드(모두 잡석 + 철)를 따랐다. 문서 뜻(WOOD → 소나무, STONE → 석재, PLANK·BRICK → 가공품)으로 바꿀지. → 답함(D-508): 처음 레벨은 1차 원자재, 대부분은 가공품, 건물 편집기에서 고침. 반영 ADR `docs/adr/2026-11-02-building-editor.md`(레벨 구간 `facilities.build.levels`, 판자·벽돌·제재소·가마를 옛 자료로 꺼진 채 더함, 시간·유지비 설정 칸 M14).
2. 건설 비용의 레벨 배율: 옛 공식의 "건물 티어"를 새 시설 레벨(Lv1~5)로 읽었다(D-5001이 시설 Lv를 옛 시설 T1~T5와 맞춤, Assumed). 옛 제련소(T2) 값 = 새 제련소 Lv2 값.
3. econ16 철 공급(아래 8절): 필요 진행을 넣자 광산 한 번이 평균 45분(T0 70%·T1 15%·T2 10%·T3 5%)이 되어 철이 더 줄었다. 손잡이: 일꾼 STR(40이면 진행 ×2), 확률표 0~39 구간, N44 진행 1 시간·필요 진행, 레벨 보너스, 광산 일꾼 수.

## 8. econ16 앞·뒤 (시드 1, 180일, Verified 실행)
| 180일 합 | 앞(main `f69d514`, core@29, SIM 8) | 뒤(core@30, SIM 9) |
|---|---|---|
| 철광석 | 65,295kg | 19,986kg |
| 철 주괴 | 45,591 | 13,902 |
| 생활용품 | 22,783 | 6,936 |
| 잡석 · 석재 · 구리 | 0 · 0 · 0 (빈 묶음) | 277,906개 · 59,450개 · 39,318kg |
| 원목 | 1,796,600 | 3,902,080 |
| 곡물 · 배급 식량 | 4,586,480 · 3,439,560 | 4,829,300 · 3,621,630 |
| 재료 모자람(생산 못 함) | 165,736번 | 214,236번 |
| 생활용품 · 배급 모자람(유닛·시간) | 100,098 · 542,471 | 122,017 · 575,569 |
| 체결 · 시장 수 | 346 · 504 | 565 · 768 |
| 반란 성공 · 폐허 · 끝 도시 · 끝 유닛 | 70 · 36 · 29 · 415 | 103 · 32 · 32 · 474 |
| `linesHash` | f592cdc5 | 5a18d660 |
