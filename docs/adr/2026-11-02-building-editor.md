# 건물 편집기(/dev/buildings): 시설 건설 재료 레벨 구간(처음은 1차 원자재·위는 가공품), 건설 시간·유지비 설정 칸 M14, 시설 덮어쓰기

- 상태: 제안
- 날짜: 2026-11-02
- 관련: docs/PLAN.md 7장(설정값)·11장(개발자 페이지)·14장, ADR `2026-11-01-skill-editor.md`·`2026-11-01-item-editor.md`(덮어쓰기 층·판·감사·켤 때 고르기·내보내기 `entries` — 이 ADR이 분류 `facilities`를 더한다), `2026-11-01-dev-settings-panel.md`(권한·속도 제한·`pnpm tuning:apply`·설정 칸), `2026-10-31-economy-core.md`("바뀜 (옛 1차 생산 규칙)"의 `facilities.build {mulPm, materials}`를 이 ADR이 바꾼다), `2026-11-02-dev-ui.md`(개발 화면 층), 대조 `docs/research/2026-11-02-old-primary-production.md` 4절, 질문 `docs/questions/2026-11-02-gather-tier.md` 끝 절, 기획 D-508·D-507·D-5001·D-5044·D-398·D-461·49 M14·M15

## 배경
- 사용자 답(2026-11-02, 원문): "처음 건물은 1차 원자재 그대로 사용하여 초기발전에 문제없게하고 대부분은 가공품 사용. 건물 편집기에서 재료 수정" → 기획 D-508(미러 `a239a59`). 49 M14 출발값 = 옛 `seeds/building_seed.js` 식(비용 = 기준 재료 × 티어² × 분류 배율, 시간 = 재료 무게 합 × 10초 × 티어 계수, 유지비 = 하루 비용 단위 합의 1%), "티어 → 시설 레벨"은 기술 해석 ⏳.
- 그 전(Verified: main `f3e5920`, 팩 core@30): `facilities.build {mulPm, materials}` 한 벌. 재료는 옛 코드 그대로(WOOD·STONE·PLANK·BRICK → 잡석, INGOT → 철광석)라 모든 레벨이 같은 재료였고, 셈하는 곳·고치는 화면이 없었다. 판자·벽돌 아이템이 없었다.
- 원칙 D-507(03 §5.5): 옛 규칙·화면을 먼저 찾아 따른다.

### 옛 관리자 건물 편집기(Verified: AntiGravt01 main `0ea5299` `terra-client/src/app/admin/editor/buildings/page.tsx` 663줄, 읽기만)
- 화면: 카테고리 대시보드(14종 타일·개수) → 거르기(카테고리·찾기) → 표/카드 보기(ID·건물·카테고리·Tier·HP·유닛 min~max·생산 타입·[편집]·[삭제]) → 편집 폼 3단(기본 정보 | 생산·저장·주거·영토 | 계층·군사·기타). [새 건물 유형]·[삭제]·기본 건물 지급 판. 저장은 REST `PUT/POST /api/admin/building-types` 한 건씩(검사 없음).
- 칸: code·name·description·category·tier·phase, min/max units, max HP, **건설 시간(초)**, **건설 비용(자원 코드 → 수량 표)**, **유지 비용(자원 코드 → 수량 표)**, production type, max slots(저장), housing capacity·efficiency, territory center·radius, upgrade from·to, patrol·vision·beacon(군사), internal map size, water adjacent, prerequisites, allowed units.
- 값은 시드(`building_seed.js`)가 식으로 만든 것을 편집기가 칸마다 덮어쓴다(티어마다 다른 건물 유형 = 업그레이드 사슬).

## 선택지
### 레벨별 재료 모양
1. **레벨 구간(`levels: [{from, materials}]`) + 옛 식(qty × L² × 분류 배율)** — 레벨 L은 from ≤ L인 마지막 구간을 쓴다. "Lv1 원자재·Lv2부터 가공품"이 구간 둘이다.
2. 레벨마다 재료 다섯 벌(식 없음) — 고칠 칸이 다섯 배, 옛 식(L²)을 버린다.
3. 원자재 한 벌 + 가공품 한 벌 + 바뀌는 레벨 하나 — 구간이 셋 이상이면 못 적는다.

### 덮어쓰기
- 가. **기존 팩 항목 통째 덮어쓰기 층(`content_overrides`)에 분류 `facilities`를 더함** — 판·감사·켤 때 고르기·내보내기·`pnpm tuning:apply`·시뮬 `--tuning`이 그대로 든다.
- 나. 새 표 — 같은 일을 다시 만든다.

### 판자·벽돌
- ㄱ. **옛 자료대로 아이템·시설·레시피를 꺼진 채 더함**(옛 `database_init/schema.js` 3170~3310줄: Wooden Plank 1.0kg·Brick 1.5kg, SAWMILL 원목 3 → 판자 2·1800초, KILN 잡석 3 → 벽돌 2·2700초, 옛 `building_seed.js` SAWMILL raw {WOOD 15, STONE 8}·KILN {STONE 12, WOOD 5} T2).
- ㄴ. 있는 가공품(철 주괴)만 씀 — 농장 Lv2가 주괴를 먹는다(뜻이 맞지 않음).

## 결정
구간 1, 덮어쓰기 가, 판자·벽돌 ㄱ.

### 1. 팩 형식(core@31, `formatVersion` 그대로)
- `facilities.build = { mulPm, levels: [{ from, materials: [{item, qty}] }] }`(옛 `materials`는 지움 — 셈·덮어쓰기 줄이 없었다). 레벨 L 재료 = from ≤ L인 마지막 구간의 줄마다 round(qty × L² × mulPm ÷ 1000). 수량은 레시피와 같은 묶음 단위.
- `facilities.maxLevel`(선택, 1~5, 없으면 5 = D-5001): 구간 시작 레벨 상한·편집기 레벨 표.
- 2단계 검사(`packages/content/src/validate/facilities.ts`, 코드마다 메시지 키): 첫 구간 from 1(`build_levels_start`), from이 늘어나기만(`build_levels_order`), 최고 레벨 이하(`build_level_max`), 한 구간에 같은 아이템 한 줄(`build_material_duplicate` — 옛 raw는 재료 코드마다 한 칸), **켜진 시설의 처음 짓기(Lv1) 구간**에 꺼진 아이템이면 알림(`build_material_disabled`, D-508 "처음 건물이 막히면 안 됨"). 위 구간의 꺼진 가공품은 알리지 않는다(아직 켜지 않은 판자·벽돌을 미리 적는 것이 정상, 편집기 레벨 표가 레벨마다 보인다). 실제 팩은 알림 0이어야 한다(`apps/server/src/content.test.ts`).
- 식은 `@terra/shared/facilityBuild` 하나(`buildCostAt`·`buildTimeAt`·`buildUpkeepAt`, BigInt 정수): 팩 검사 상수·서버·편집기·앞으로의 짓기가 같이 쓴다(게임 앱은 `@terra/content`를 가져오지 않는다).

### 2. 출발값 [임시] (옛 raw → D-508)
| 시설 | 옛 raw(티어·분류) | 배율 | Lv1(1차 원자재) | Lv2~5(가공품) |
|---|---|---|---|---|
| 농장 | {WOOD 8} T1 PRIMARY | 800 | 소나무 8 | 판자 8 |
| 벌목장 | {WOOD 10, STONE 5} T1 PRIMARY | 800 | 소나무 10·석재 5 | 판자 10·벽돌 5 |
| 광산 | {WOOD 12, STONE 10} T1 PRIMARY | 800 | 소나무 12·석재 10 | 판자 12·벽돌 10 |
| 제련소 | {STONE 15, WOOD 8} T2 SECONDARY_REFINE | 1200 | 석재 15·소나무 8 | 벽돌 15·판자 8 |
| 주방 | {PLANK 15, STONE 10, BRICK 5}(옛 sqlite 값) | 1200 | 소나무 15·석재 10·잡석 5 | 판자 15·벽돌 15 |
| 공방 | {PLANK 10, INGOT 6} T3 SECONDARY_CRAFT | 1200 | 소나무 10·철광석 6 | 판자 10·철 주괴 6 |
| 제재소(새, 꺼짐) | {WOOD 15, STONE 8} T2 | 1200 | 소나무 15·석재 8 | 판자 15·벽돌 8 |
| 가마(새, 꺼짐) | {STONE 12, WOOD 5} T2 | 1200 | 석재 12·소나무 5 | 벽돌 12·판자 5 |
- 코드 대응: Lv1 = WOOD·PLANK → 소나무(옛 문서 "목재 → 소나무"), STONE → 석재, BRICK → 잡석(옛 벽돌 원료), INGOT → 철광석. Lv2~ = WOOD·PLANK → 판자, STONE·BRICK → 벽돌, INGOT → 철 주괴. 같은 아이템이 된 줄은 기준 수량을 더했다(주방 Lv2 벽돌 10 + 5).
- 레벨 대응: 옛 공식의 "건물 티어"를 새 시설 레벨로 읽는다(기술 해석 ⏳, 49 M14). 기준 수량은 Lv1 값이라 옛 T2 건물(제련소)의 옛 비용 = 새 Lv2 비용과 같은 수(예: 제련소 Lv2 = 벽돌 72·판자 38 = 옛 STONE 15·WOOD 8 × 4 × 1.2).
- 새 아이템: 판자 `plank`(가공품, 중분류 가공 목재, T0, 1,000g, 시작 시세 3), 벽돌 `brick`(건축물, 중분류 건축 자재, T0, 1,500g, 시작 시세 3) — 모두 꺼짐. 새 레시피 `saw_planks`(제재소, 소나무 3 → 판자 2, 작업량 500 = 옛 1800초), `fire_bricks`(가마, 잡석 3 → 벽돌 2, 작업량 750 = 옛 2700초) — 켬(시설·아이템이 꺼져 있어 세계에 나오지 않는다. 편집기로 시설·아이템을 켜면 레시피 편집기 없이 사슬이 돈다). 오염 제재소 2·가마 4, 시작 시세·티어는 [임시].

### 3. 설정 칸 M14(시간·유지비, 출발값 = 옛 식)
| ID | 값 | 뜻 |
|---|---|---|
| `m14_build_ms_per_kg` | 10,000 | 재료 1kg당 건설 시간(옛 10초) |
| `m14_time_factor_l1`~`l5` | 1000·1500·2500·2500·2500 ‰ | 레벨 계수(옛 T1 1.0·T2 1.5·T3 2.5. L4·L5는 옛 표에 없어 — 옛 코드는 없는 티어를 1.0으로 셈 — L3 값 [임시]) |
| `m14_upkeep_pm` | 10 ‰ | 하루 유지비 = 비용 단위 합(round 전 qty × L² × 배율)의 ‰(옛 1%) |
| `m14_upkeep_min` | 1 | 하루 유지비 최소(옛 Math.max(1, …)) |
- 시간 = round(Σ 재료 한 묶음 무게(kg, 아이템 `weight` × `lotSize`) × qty × L² × 배율 × kg당 ms × 계수 ÷ 1000). 옛 식처럼 반올림하기 전 수량으로 셈한다. 무게가 없는 아이템은 0으로 셈하고 편집기가 알린다. 옛 `MAT_WEIGHT`(잡석 10·철 12)는 옛 단위라 쓰지 않고 우리 아이템 무게를 쓴다.
- 세력·사회 계수표 `facilityBuild`(`@terra/sim` `tuningBuild.ts`), 반영 범위 live(건물 편집기 목록이 쓸 때마다 읽는다, `apps/server/src/tuning/scope.ts`). 유지비를 무엇으로 내는지(옛: 도시 화폐, 군사·생산은 식량 더함)는 정하지 않았다.

### 4. 덮어쓰기·서버(tRPC `buildings.*`)
- `CONTENT_EDIT_CATEGORIES`·`ENTRY_DIFF_CATEGORIES`·`pnpm tuning:apply` `ENTRY_FILES`에 `facilities`. DB 검사 제약 두 개(`content_overrides_category`·`content_retired_ids_category`)를 넓히는 마이그레이션 `20261102194948_content_overrides_facilities`(넓히기만: 직전 판 앱은 시설 줄을 모르는 분류 잠든 줄로 둔다).
- 실효 시설을 읽는 곳: 경제 목록(`economyCatalogAccessor`가 실효 항목 묶음을 받아 아이템·시설 둘 다), 유닛 화면 시설 이름(`rosterCatalogOf`), 아이템 편집기 채집 미리 보기. 바로 든다(D-461). 시뮬 `--tuning`은 `entries`의 시설도 얹는다(같은 `effectiveEntries`).
- `buildings.list`(시설 실효·팩·덮어쓰기·해시·그 시설 레시피, 재료 고르기 창 = 실효 아이템(무게·묶음), 원자재 중분류, M14 규칙·N43 레벨 보너스, 잠든 시설 줄, 판), `check`(묶음을 얹은 실효 팩 검사: 오류면 코드가 붙은 문제, 아니면 시설 권고), `save`(baseHash 묶음: put·revert·discard_sleeping, 팩에 없는 ID = 만들기는 `unknown_entry`), `history`(감사 요약 중 시설 줄). 권한·속도 제한·판·차례·감사는 스킬·아이템 편집기와 같다(`tuning:read`·`write`).

### 5. 화면 `/dev/buildings`(`?facility=<ID>`)
- 주소 줄 `dev_buildings`(부모 dev, 틀 있음, dev·admin), 개발자 홈 줄(집 아이콘). 개발 화면 층(네온 다크·라이트), 촘촘, 모바일 먼저(390px는 표 → 편집 판), 토큰만. 조각 `BuildingEditorScreen-*`, 미리 캐시 밖(`DEV_ONLY_CHUNK` `[Bb]uildingEditor`, `DEV_ONLY_SOURCE` `src/editor/buildings/`, `globIgnores`).
- 옛 화면 대응: 표(시설·단계·최고 레벨·레벨당 자리·Lv1 재료·상태)는 옛 표/카드 보기, 편집 판은 옛 3단 폼 가운데 우리 자료에 있는 칸만: 이름 ko·en·켜기·생산 단계·최고 레벨·레벨당 일하는 자리(옛 min/max units 자리)·오염 / 건설 재료(분류 배율 = 옛 카테고리 배율, 레벨 구간마다 아이템·수량 줄 = 옛 건설 비용 표) / **레벨 표**(레벨마다 재료·시간(옛 건설 시간)·유지비(옛 유지 비용)·자리·채집 보너스, 꺼진 재료 표지) / 채집(주·보조 스탯·사다리 중분류·방식·수확량 기본·비율·상한 = 옛 gather_type_config) / 레시피(읽기만, 아이템 편집기로 가는 고리).
- 고친 칸은 바로 담기고(실효 값과 같아지면 빠진다) 막대의 [적용]이 한 묶음(메모 200자). 입력이 1초 멈추면 `check`. `entry_changed`면 목록을 다시 받아 내 칸만 새 항목 위에 얹는다(칸마다 3방향, 양쪽이 바꾼 칸은 내 값·알림). [팩 값으로](되돌리기 담기)·[담기 취소]·[비우기]·[내보내기](`tuning.export`)·[최근 바꿈].
- 옛 편집기에 있고 우리 자료에 없어 두지 않은 칸: HP·내구도(M15 "건물 에디터 입력값", 출발값 없음), 저장 슬롯·무게 한도, 주거(수용·효율), 영토(중심·반경), 군사(순찰·시야·비컨), 업그레이드 사슬·전제 건물·허용 유닛·물가 필요·내부 맵 크기·phase·설명, 새 건물 유형 만들기·지우기(레시피 편집이 없어 시설만 만들면 쓸 데가 없다).

## 이유
- 레벨 구간 + 옛 식: D-508의 "처음 원자재·대부분 가공품"을 구간 둘로 바로 적고, 셋 이상(예: Lv4부터 고급 재료)도 같은 모양이다. 옛 식(L²·분류 배율)을 그대로 지켜 49 M14와 맞는다.
- 덮어쓰기 층 재사용: 판 충돌·감사·켤 때 고르기·내보내기를 다시 만들지 않는다(DB 마이그레이션은 제약 넓히기 하나).
- 판자·벽돌을 옛 자료로 더함: 사용자 원문 "가공품 사용"을 뜻 그대로 따르면서, 꺼둬서 시뮬 출력이 바뀌지 않는다(Verified 아래).
- 처음 짓기 구간만 알림: 실제 팩 알림 0 규칙을 지키면서 D-508이 막으려는 것(처음 건물이 막힘)만 잡는다.

## 결과
- 시뮬레이터(Verified, 시드 1): econ16 180일·war16 30일을 이 팩과 "더한 것(제재소·가마·판자·벽돌·두 레시피·M14 칸)을 뺀 팩"으로 돌려 머리·요약 줄(팩 판·해시)만 다르고 본문 줄은 바이트까지 같다 → `SIM_VERSION` 9 그대로. 건설 재료(`build`)는 시뮬이 읽지 않는다.
- 지금 시설을 짓거나 레벨을 올리는 곳은 없다(시설은 시나리오·NPC 시작 도시에 처음부터 있다). 이 식·자료는 편집기 미리 보기와 앞으로의 짓기(R3 이후)가 쓴다. 짓기가 생기면 Lv2 이상은 판자·벽돌을 켜야 지을 수 있다(꺼진 동안 레벨 표에 "꺼짐").
- 감수할 점: 옛 MAT_WEIGHT 대신 우리 무게를 써서 시간 수치는 옛과 다르다(예: 농장 Lv1 128초, 옛 640초). L4·L5 시간 계수는 [임시]. 유지비 단위(무엇으로 내나)가 없다. 건물 만들기·지우기, HP·주거·영토 칸은 없다.
- 다시 볼 조건: 짓기·레벨 올림·수리(옛 BLD-3: 10% 수리 = 건설 재료 10%)가 생길 때, 기획이 M15(수용·내구도)·유지비 단위를 정할 때, 판자·벽돌·제재소·가마를 켤 때(econ16 거래 목록이 바뀐다 → `SIM_VERSION`), 레시피 편집기가 생길 때(건물 만들기).
