# 옛 보유 물건(아이템 인스턴스) 규칙 대조 — 굴림·쌓기·내구도·수리·신선도·소모품 사용·탄약

> 출처: 기술 세션(Claude Code), 2026-11-03 KST. 조율자 지시(보유 물건 줄기, 가지 `work/holdings`). 원칙 D-507(`docs/design/03_Planning_Rules.md` §5.5): 옛 프로젝트 규칙을 먼저 찾아 따르고, 없거나 기획과 부딪칠 때만 묻는다.
> 옛 프로젝트: AntiGravt01 main `0ea5299`을 읽기만 했다(실행하지 않음). 모든 줄 번호는 그 커밋 기준이다(**Verified**: 파일을 열어 그 줄을 읽음).
> 기획 답: 조사 중 조율자가 기획에 물은 것(285 소급·286 흐름·288 상함·289 닳음·수리)은 기획이 옛 규칙으로 답해 49 N49에 적었다(원본 `3b0e949`, 미러 `80272e5`). 그 뒤 사용자가 탄약 보충·물약 쿨을 정했다(D-509, 원본 `1c449b9`, 미러 `662b63f`: 탄약 = 재료로 내구도 회복·채울 때마다 최대 감소, 물약 = 전투·비전투 30초 쿨 하나·스태미나 0). 이어서 요리 = 5분 쿨, 물약 고르기 = HP 문턱 + 알맞은 물약(D-510, 미러 `f530fbd`).
> 반영: ADR `docs/adr/2026-11-03-item-holdings.md`, 작업 기록 `docs/worklog/2026/11/03-0940-item-holdings.md`. 남은 질문은 `docs/questions/2026-11-03-item-holdings.md`(320~331).

## 1. 어디에 있나 (옛 코드·문서)

| 파일 | 하는 일 |
|---|---|
| `terra-server/database_init/schema.js` | 옛 SQLite 표: `item_templates`(57~70), `template_equipments`(73~98, `max_durability` 76), `template_consumables`(101~109), `user_items`(112~121), `user_equipments`(124~134) |
| `terra-server/database_init/migrations/index.js` | PostgreSQL 판 자동 마이그레이션: `user_equipments.equipped_slot`(88~95), `user_items.instance_properties JSONB`·`item_templates.roll_config`(1169~1177), `user_items.instance_data`(2210~2211), 위치 색인(2584) |
| `terra-server/game/gather/ItemRollEngine.js` | 얻는 때 한 번 굴림 `rollInstanceProperties`(66~166), 품질 지수(49~55), 효과 배율(205~217) |
| `terra-server/game/gather/ItemUseEngine.js` | 음식·물약 사용 `useItem`(7~105) |
| `terra-server/game/StorageUtils.js` | 창고 쌓기 규칙(26~60) |
| `terra-server/game/gather/FieldGatherEngine.js` | 채집 때 굴림 호출(1059~1087) |
| `terra-server/game/WorkshopEngine.js` | 만든 장비 지급·자동 장착(288~328) |
| `terra-server/combat/BattleResult.js` | 전투 끝 내구도 닳기·강제 벗김·탄약 자동 교체(84~85, 312~440) |
| `terra-server/combat/CombatEngine.js`·`BattleAI.js` | 탄약 없으면 기본 공격 못 함(`CombatEngine.js:191~201`, `BattleAI.js:62~73`) |
| `terra-server/routes/character/enhancement_routes.js` | 공방별 장비 수리(864~960), 인챈트 실패 최대 내구도 감소(468~478) |
| `terra-server/routes/building/building_service_routes.js` | 공방 수리(재료 + 인건비 + 수수료, 307~499) |
| `terra-server/cron/spoilageCron.js` | 부패 틱(23~146) |
| `terra-server/repositories/CharacterRepository.js` | 장비 자세히 읽기: 템플릿 기본값 + 인스턴스 보너스(23~34) |
| `docs/GDD/Item/Consolidated_Item.md` | 도감·인스턴스 분리(1028~1029), 쌓기(1037), 보조무기(1040), 내구도·수리(1044~1049), 탄약(1050), 소모처(1062~1063), 신선도(1810~1877), 표 확장(2016~2027) |

## 2. 옛 규칙

### 2.1 표 모양
- 도감(템플릿)과 인스턴스를 나눈다: "아이템의 고유한 기본 스탯을 유지하는 '도감' 테이블과, 유저가 소유하여 강화되거나 옵션이 변형된 '실제 아이템' 테이블을 분리"(`Consolidated_Item.md:1028`).
- `user_items`(`schema.js:112~121`): `id`, `user_id`, `character_id`, `item_template_id`, `quantity`(기본 1), `expires_at`. 뒤에 `location_type`·`location_id`(`schema.js:1149~1164`, PG `migrations/index.js:2584` 색인), `instance_properties JSONB`(`migrations/index.js:1176`), `instance_data JSONB`(2211, 세력명·스탯 델타)가 더해졌다.
- `user_equipments`(`schema.js:124~134`): `user_item_id`(PK), `current_durability`(기본 100), `max_durability_penalty`(기본 0), `enhancement_level`, `bonus_str`·`bonus_vit`·…, `is_equipped`. PG에서 `equipped_slot`(`migrations/index.js:88~95`).
- 템플릿 `template_equipments.max_durability`(기본 100, `schema.js:76`), `required_ammo_code`(93), `is_two_handed`(92).
- 장비를 읽을 때 템플릿 기본값(`te.base_*`)과 인스턴스 보너스(`ue.bonus_*`)를 같이 읽는다(`CharacterRepository.js:25~33`) → 템플릿을 고치면 기본값은 바로 바뀌고, 인스턴스에 굴린 값은 그대로다(기획 N49가 이 뜻으로 답함).

### 2.2 굴림(얻는 때 한 번)
- `rollInstanceProperties(rollConfig)`(`ItemRollEngine.js:66~166`): "아이템 획득/제작 시점에 1회 호출 → 개체별 고유 수치 확정"(6줄). 템플릿 `roll_config`의 `{min, max}`마다 하나를 뽑는다.
  - 보석 `stats`(87~100), 장비 `base_atk`·`base_def`·`base_str`…(103~120), 자원 `weight`(124~133), 목재·약초 `potency`(137~146), 소모품 `freshness`(150~157).
  - 정수 굴림 = `Math.floor(min + random × (max − min))`(32~37, 최대 미포함에 가까움), 실수는 소수 둘째 자리.
  - 품질 지수 = (값 − 최소) ÷ (최대 − 최소), 0~1, 범위가 없으면 1.0(49~55). 여러 스탯은 평균(98·117).
- 호출 자리: 필드 채집(`FieldGatherEngine.js:1059~1087`), 생산 라우트(머리 주석 17줄). 만든 장비(`WorkshopEngine.js:300~319`)는 굴림 없이 `current_durability = max_durability`로 넣고 같은 칸 장비를 바꿔 입힌다.

### 2.3 쌓기
- 문서: 같은 아이템은 한 칸에 쌓이고 무게는 수량에 비례, 장비는 성능이 달라 쌓지 않는다(`max_stack = 1`, `Consolidated_Item.md:1029·1037`). "회복량 등 수치가 다른 요리/소모품은 개별 인스턴스로 분리"(1029).
- 코드: `instance_properties`가 있는 물건은 새 행, 없는 물건은 그 건물의 한 행(`instance_properties IS NULL`)에 더한다(`StorageUtils.js:29~60`).

### 2.4 내구도 닳기·0일 때
- 전투가 끝나면(이기든 지든) `processDurability`(`BattleResult.js:84~85`): 입은 장비마다 25% 확률로 −1(`BattleResult.js:317~325`, `random() < 0.25`).
- 0이 된 장비는 강제로 벗긴다(`BattleResult.js:327~362`). 탄약(보조무기, `weapon_type = 'AMMO'`)이면 같은 위치의 같은 템플릿 예비 탄약을 입히고(370~394), 없으면 탄약이 필요 없는 예비 주무기로 바꾼다(396~436).
- 원거리 무기(`required_ammo_code`)는 보조무기가 없거나 내구도 0이면 기본 공격을 못 한다(`CombatEngine.js:191~201`), AI는 후퇴한다(`BattleAI.js:62~73`). **타격마다 탄약을 줄이는 코드는 없다**(문서만: "타격 당 1씩 소모", `Consolidated_Item.md:1050`).
- 문서의 패배 감소 "착용 장비 약 15% 확률로 내구도 크게 감소"(49 C20이 옮김)는 코드에 양이 없다.

### 2.5 수리
- 문서: 수리 시설 등급마다 최대 내구도 감소(일반 −30%·대실패 −50%, 고급 −15%, 장인 −5~10%), 최대 내구도 ≤ 10이면 파괴, 분해만(`Consolidated_Item.md:1044~1049·1062`).
- 공방 수리 `enhancement_routes.js:864~960`: 공방 종류마다 고칠 수 있는 칸·무기 종류와 재료(`REPAIR_MAP` 878~883: 무기 공방 주괴 2, 원거리 공방 목재 2 + 주괴 1, 방어구 공방 주괴 1 + 가죽 1, 장신구 공방 크리스탈 1). 재료 양 = `max(1, ⌈기본 양 × 티어 × 잃은 ÷ 최대⌉)`(955~960, 티어 0은 1).
- 다른 수리 라우트 `building_service_routes.js:307~499`: 전부(1.0)·절반(0.5) 수리, 재료 = 아이템 수리 재료 또는 제작 레시피 재료 × 비율(최소 1, 367~392), 인건비 = 수리량 × 0.5, 수수료 = 재료 시세 합 × 10%(447~449). **최대 내구도를 줄이지 않는다**(498: 현재 내구도만).
- `max_durability_penalty`는 인챈트 실패만 쓴다(`enhancement_routes.js:468~478`: 소켓 차례마다 5~10, 10~20, 15~30).

### 2.6 신선도·부패
- 문서(`Consolidated_Item.md:1810~1877`): 모든 식재료·요리에 `created_at`과 `shelf_life_hours`. 신선도 = max(0, 1 − 경과 ÷ 유통기한)(1833). 효과 = 기준 × 신선도(1844~1845). 0이면 "자동 폐기 또는 '부패한 음식' 변환"(1854~1856). 보존: 냉장 ×2, 훈제 ×3(다른 아이템), 절임 ×3, 통조림 ×5, 냉동 정지(1862~1868). 거래소에 올린 물건도 신선도가 계속 준다(1874), 50% 미만은 못 올림(1876).
- 코드(`spoilageCron.js`): 1시간마다 유기물 카테고리 수량을 하루 10% × 보관 곳 배율(창고 0.5·전문 창고 0.3)만큼 줄이고(23~47·70~102), 0이면 지운다(104~112). `expires_at`이 지난 행은 바로 지운다(59~65). → 기획 N49: **이 수량 감소·지우기는 쓰지 않는다**(D-496과 다름).

### 2.7 소모품 사용
- `useItem`(`ItemUseEngine.js:7~105`): 사용자 인벤토리의 아이템을 사이보그·미니언 하나에 쓴다(대상 고름, 30~45). 음식·물약만(23~25). 음식은 포만감을 채우고, 요구 티어(레벨 10당 1) 미만이면 티어 차이마다 효과 반감(51~64). 회복량 = `heal_hp × 효율`(78). 버프는 "중복 방지 및 상위 버프 보존 로직 추가 필요"(81)라 적고 저장하지 않았다. 수량 −1, 0이면 행 지움(92~97).
- 소모품 칸: `template_consumables`(`schema.js:101~109`: `heal_hp`·`heal_mp`·`buff_str`·`buff_vit`·`buff_duration_sec`).

## 3. 기획 결정과 대조

| 무엇 | 옛 규칙 | 기획 결정 | 이번 구현 |
|---|---|---|---|
| 굴린 값·기본값 | 인스턴스 보너스 고정, 템플릿 기본값은 늘 읽음(`CharacterRepository.js:25~33`) | 285 = 새것부터 + 소급 명령(D-496), N49 = 옛과 같다 | 굴린 스탯·점수만 칸에 둔다. 무기 사양·속성·칸·유통기한·바뀌는 아이템은 실효 정의를 그때 읽는다. 소급 명령은 다음 줄기 |
| 굴림 | `{min, max}` 균등, 품질 = 자리 평균 | D-5003·D-5006(점수 = 범위 안 자리 평균, 만든 직후 값) | `rollHoldingStats`: 정수 균등(최대 포함), 자리 ‰, 점수 = 평균 ‰ |
| 쌓기 | 장비 1, 같은 것 쌓음, 수치가 다른 소모품은 따로 | D-496 286 같은 물약·요리는 같은 물건 | 장비 = 하나하나, 신선도 묶음 = 같은 숙성끼리, 소모품 = 같은 것끼리 stackMax까지 |
| 닳기 | 25% −1, 이기든 지든 | 289 "이겨도 조금씩, 지면 더", N49 = 25%·−1, 패배 추가 [임시] 4 | 확률·양 설정 칸 4개(N49), 패배 추가 확률 150‰ = 옛 문서 "약 15%"(49 C20) |
| 0일 때 | 강제로 벗김, 탄약은 예비로 자동 교체 | N49 286 "내구도 0이면 장착 불가", D-501 294 "보조장비를 교체해서 사용" | 벗김(전투 닳기·탄 소모), 탄약은 같은 유닛이 든 같은 탄약 종류(같은 아이템 먼저)로 |
| 수리 | 문서: 시설 등급별 최대 감소, 코드: 최대 감소 없음 + 재료·인건비 | D-5031·F11·F12, N49 재료 = 기준량 × 티어 × (잃은 ÷ 최대) | `repairDurable`(인공장기와 같은 함수) + `repairMaterialQty`. 시설·장인·재료 차감은 시설 줄기 |
| 신선도 | 문서: 1 − 경과 ÷ 유통기한, 효과 비례, 0이면 변환·폐기, 보존 배율 | D-285·D-289(거래소 포장 = 최대·감소 멈춤), D-496 288(0이면 고른 아이템), N49 보존 배수 | 숙성 ms(실제 시간 ÷ 보존 배율)를 두고 신선도 = 1 − 숙성 ÷ 실효 유통기한, 0이면 바뀜(꺼진 대상이면 버림). 보존 배율 고리 = 지금 모두 ×1 |
| 사용 | 대상 유닛 고름, 티어 차이 반감, 버프 저장 없음 | D-496 286·D-501(적정 스탯 비율 ±오차, 같은 효과는 높은 것, 다른 것은 확인), D-509(물약 30초 쿨 하나·스태미나 0, 옛 문서 스태미나 10·쿨 5초·물약마다 10~20초를 대체), D-510(요리 5분 쿨, 자동 물약 = HP 문턱 + 낭비가 가장 적은 물약) | 든 유닛이 쓴다, `useAmountRange`·`rollUseAmount`, 시간 버프만 `unit_effects`에, 회복 등은 전투 중(287), 쿨 `unit_cooldowns`(물약·요리), 자동 물약 고르기 `pickAutoPotion` |
| 탄약 | 탄약 장비 내구도 0이면 공격 못 함, 타격마다 줄이는 코드 없음 | D-497(내구도 = 남은 탄, 타격마다 1), D-509(재료로 채움, 채울 때마다 최대 감소) | 서버 고리 `spendAmmo`·`refillAmmo`. 전투 판정이 원거리 타격 수를 알려 주는 일은 다음 줄기(ADR 6절) |

## 4. 옛 규칙이 없거나 기획과 엇갈리는 것 → 질문

`docs/questions/2026-11-03-item-holdings.md`(320~331)에 쉬운 말로 적었다. 요약:
1. 신선도가 효과량에 드는가(옛 문서 = 비례, D-289 = 거래소 안 같은 물건).
2. 바뀔 아이템이 꺼졌을 때 버리는가(지금 버림, 옛 "자동 폐기").
3. 보존 배수 값과 어디에 붙는가(옛 문서 냉장 ×2·통조림 ×5·냉동 정지, 서버 창고 종류는 아직 없음).
4. 수리는 늘 끝까지인가(옛 코드는 절반 수리도 있음), 인건비·수수료(옛 0.5/점·10%)를 쓰는가, 공방별 기본 재료(옛 REPAIR_MAP)를 쓰는가, 장인 실력 ‰은 무엇으로 셈하는가.
5. 퇴각한 유닛은 "진 쪽"으로 더 닳는가(지금 진 쪽으로 침).
6. 탄약 장비는 전투 닳기에서 빠지는가(지금 빠짐: 내구도 = 남은 탄).
7. 소모품은 든 유닛만 쓰는가(옛: 계정 인벤토리에서 아무 유닛에게).
8. 전투 밖 회복약: D-509가 "전투비전투 무관하게" 쿨을 하나로 정해 전투 밖 사용이 있다는 뜻인데, 전투 밖 HP가 서버에 없어 지금 회복은 "전투 중에만". 전투 밖에서 무엇을 채우는가.
9. 요리 버프 지속 상한(지금 효과 줄 최대 1시간, 스키마)을 늘리는가(D-472 "지속은 설정값").
10. 소켓 수(D-5008)는 만들 때 등급으로 정하는데, 등급 분포(D-5007)가 없어 지금은 소켓 칸을 두지 않았다 — 등급 계산 줄기에서 같이.
11. 다 썩은(0) 묶음을 거래소에 올리는 문턱(E14 90%)·포장(D-289)은 서버 거래소가 열릴 때 넣는다(질문 아님, 기록).
12. 버프 아이템(중분류 buff_item)도 물약 쿨에 드는가(지금 식품이 아닌 소모품은 모두 물약 쿨, 질문 331).
13. 꺼진 아이템을 가진 물건: 지금 그대로 쓴다(285 "끈 것도 가진 것은 그대로 쓴다" 가안 + 코드 규칙 "끈 항목은 새로 나오지 않는다"). 효과도 끄는가(285 다)는 소급 명령과 함께.
