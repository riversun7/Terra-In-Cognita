# 입은 장비·인공장기·아이템 버프를 유닛 스탯과 전투에 넣기 (사이보그 화면·유닛 상세·생명 수치 최대·세계 전투 시작)

- 일시: 2026-11-07 11:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-03-item-holdings.md` "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)", `docs/adr/2026-10-31-combat-core.md` "바뀜 (2026-11-07, 입은 장비·버프로 전투 시작)", 질문 353~355 `docs/questions/2026-11-07-equip-stats.md`, 기획 D-423·D-490·D-501·D-502·D-507·D-511·D-512·N49(285·286)·48 §2.3·§3.1, 가지 `work/equip-stats`

## 한 일
- **옛 규칙 대조(D-507, AntiGravt01 main `0ea5299` 읽기만, GitHub에서 받은 파일)**: 옛 전투는 입은 장비(인공장기 다섯 + 장비 열 칸)의 템플릿 기본값 + 인스턴스 보너스를 칸마다 더해(`terra-server/utils/item/equipment.js:115~160` `getEquipmentTotals`, 칸 목록 `:130~136`, 더하기 `:143~157` — 반지 두 칸도 더하기) 사이보그 1차 스탯·최대 HP·공격·아머·쉴드에 얹었다(`terra-server/routes/map/piximap_routes.js:1104~1145`). 캐릭터 화면 응답은 장비 몫을 0으로 두고 화면이 더했다(`terra-server/routes/character/character_routes.js:324~325`). 내구도 0이면 전투 끝에 강제로 벗겼다(`terra-server/combat/BattleResult.js:312~346`), 탄약 0이면 공격 못 함(`terra-server/combat/CombatEngine.js:192`). 옛 요리 버프는 1차 스탯 고정값(`docs/GDD/Item/Consolidated_Item.md:748~751`).
- **서버 실효 몸 한 벌**(`apps/server/src/roster/unitBody.ts`): 바탕(만든 사이보그 또는 [임시] 기본 몸) + 입은 물건(굴린 값 + 지금 정의의 무기 사양, 내구도 0은 아무것도 안 줌) + 걸린 효과(1차 스탯 고정값 버프 → 성장값 뒤에 더함, 전투 수치 버프 → 전투 시작 때 걸린 효과)로 `bodyParts`(sim `loadoutOf`) → 화면 자료 / `specFromStats` 전투 사양 / 화면 요약(D-502 실제 공격력·명중·크리·간격, D-511 실제 스태미나 회복). 새 식·수치 없음.
- **쓰는 곳**: `cyborg.get`(`realCyborgBody(…, gear)` + 새 선택 칸 `CyborgBody.combat`), `units.list`(유닛 상세, `realUnit(…, gear)`), 생명 수치 최대(`vitals/config.ts`, 몸 자료에 시각을 넘김), 보유 물건 효과량 1차 스탯(`holdings/config.ts`), 세계 전투 시작(`world/battleBodies.ts`: 사이보그는 늘, 그 밖 세계 유닛은 지닌 것이 있을 때만 다시 만듦 → 생명 수치 → 전투 서비스). 보유 물건 서비스에 `effectsOn`, 보유 물건 월드에 `gearOf`(입은 물건 + 켜진 효과 사전 칸), 유닛 화면 자료에 `coefficients`(실효 전투 계수표), 월드 설정에 `roster`.
- **판정(sim)**: `CombatUnitSpec.startEffects`(들어올 때 걸린 버프·디버프 → `ActiveEffect`). 칸이 없으면 옛 전투와 같다. `SIM_VERSION` 12 그대로(아래 시뮬 비교).
- **D-490**: 전투 시작 사양의 `bareHanded`·`weaponFields`가 장비 묶음 그대로라 맨손(무기 칸 비었거나 부서짐)이면 맨손 스킬만, 지팡이를 쥐면 속성 칸 스킬과 장비 스킬(불꽃 폭발)이 든다(서버 시험). 판정의 `skillUsable` 검사는 이미 있었다.
- **화면**: 사이보그 상세 전투 스펙 OFFENSE 끝에 실제 공격력·명중·크리 확률·공격 간격 줄(펼치면 식·든 무기/맨손·비율·결과), 스태미나 회복 줄은 실제 회복과 그 셈(03-1330 작업 기록의 "사이보그 풀이는 행 값 720" 한계를 닫음). 보유 물건 목록이 다시 오면 `cyborg.get`·`units.list`·생명 수치를 다시 받는다. 문구 15개 ko·en.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/battleTypes.ts`·`battleState.ts`·`index.ts`, `startEffects.test.ts`(새) | 들어올 때 걸린 효과 칸, 시험 5개 |
| `packages/shared/src/roster.ts` | `RosterCombat`·`RosterWeaponPart`, `CyborgBody.combat`(선택 칸), 1차 출처 `effect` 설명 |
| `packages/content/src/index.ts` | `EFFECT_COMBAT_STATS` 내보내기(서버가 전투 수치 버프를 가른다) |
| `apps/server/src/roster/unitBody.ts`(새)·`unitBody.test.ts`(새) | 실효 몸 한 벌, 시험 9개 |
| `apps/server/src/roster/body.ts` | 굴린 값 장비(`EquippedSpec`), 1차 버프(`PrimaryBuff`, 출처 effect), 유닛 종류 타고난 무기, `bodyParts` 내보냄 |
| `apps/server/src/roster/cyborgBody.ts`·`services.ts`·`catalog.ts` | 사이보그·유닛 상세에 지닌 것, `combat` 요약, 계수표 접근자 |
| `apps/server/src/roster/equipStats.db.test.ts`(새) | DB 시험 2개(아래) |
| `apps/server/src/world/battleBodies.ts`(새)·`world.ts` | 세계 전투 시작 사양의 몸, 생명 수치 ↔ 보유 물건 늦은 잇기, `roster` 설정, `persistence.bodies` |
| `apps/server/src/holdings/service.ts`·`serviceTypes.ts`·`world.ts`·`config.ts`·`testContent.ts` | `effectsOn`, `gearOf`, 쓰는 유닛 1차 스탯에 지닌 것, 시험 물건(내구도 검·STR 빵·STR 버프 효과) |
| `apps/server/src/vitals/service.ts`·`world.ts`·`config.ts` | 몸 자료 = 지닌 것이 든 몸, 시각을 넘김 |
| `apps/server/src/app.ts`·`main.ts` | 월드 `roster`, 유닛 화면 `gear`, 계수표 접근자 |
| `apps/game/src/cyborg/CombatAttack.tsx`(새)·`CombatSpecs.tsx`·`CyborgScreen.tsx` | 판정 값 줄·스태미나 실제 회복, 장착 뒤 다시 받기 |
| `apps/game/src/units/UnitsScreen.tsx`·`UnitList.tsx`, `apps/game/src/roster/parts.tsx` | 장착 뒤 유닛 목록·생명 수치 다시 받기, 2차 줄 `data-stat` |
| `apps/game/messages/{ko,en}.json` | `cyborg_attack_*`·`cyborg_ms`·`cyborg_stamina_real_*` 15개 |
| `e2e/equip-stats.spec.ts`(새) | 화면 시험 10개(아래) |
| `docs/adr/2026-11-03-item-holdings.md`·`2026-10-31-combat-core.md`, `docs/questions/2026-11-07-equip-stats.md`(새), `docs/PLAN.md`(14장), 이 기록, `docs/WORKLOG.md` | 결정·질문·상태·기록 |

## 검사·시험 (Verified, 개발 컨테이너, Node 24.22.1, 무거운 잠금 안)
- 시뮬 비교(시드 1): 이 가지와 main의 판정 파일(`battleState.ts`·`battleTypes.ts`를 잠깐 main 것으로 바꿔 돌린 뒤 되돌림) — war16 30일 236줄(전투 129줄) `cmp` 같음(해시 be74f1f5), econ16 60일 817줄(전투 21줄·웨이브 221줄) `cmp` 같음(해시 38524eb6). `SIM_VERSION` 12 그대로.
- 새 시험: sim `startEffects.test.ts` 5개, 서버 `roster/unitBody.test.ts` 9개(검 → 공격력 10 → 18·명중 749‰·간격 1,200ms(D-502 ADR 표), 부서진 검 = 맨손, 인공장기·장신구 두 칸 더하기, 칸 묶음 밖 굴린 값 뺌, 1차 버프 고정값만·디버프 빼기·‰ 넣지 않음, 실제 스태미나 회복 Lv 1 720·Lv 30 적정 39, 유닛 상세 조끼, 전투 사양 D-490 맨손/검/지팡이 스킬, 전투 수치 버프 남은 시간), DB `roster/equipStats.db.test.ts` 2개(만든 사이보그가 검을 쥐면 `cyborg.get` 실제 공격력 = 스탯 + ⌊20 × 비율 ÷ 1000⌋로 오르고, NPC 런타임과 같은 길로 연 세계 전투의 저장된 시작 사양(`world_battles.init`) 무기 공격력 20, 같은 시드에서 허수아비에게 맨손보다 많이 침, 내구도 0인 검은 화면·전투 모두 맨손과 같음 / 조끼 → 생명 수치 최대 아머 + 굴린 값, STR 빵 → 화면 STR·1차 출처 effect, 24시간 공격 버프 약 → 1시간 뒤 전투 시작 사양 `startEffects` 남은 시간, 끝난 1차 버프는 사양에서 빠짐).
- 화면 시험 `pnpm e2e equip-stats.spec.ts cyborg.spec.ts units.spec.ts inventory.spec.ts vitals.spec.ts`: 70개 통과(3.7분). 새 `equip-stats` 10개: 맨손 실제 공격력 = 스탯 공격력·"맨손 — 맨손 스킬만" → 시험용 검 장착 → 값이 오름·"든 무기: 시험용 검" → 해제 → 돌아옴, 스태미나 회복 줄 = 셈의 끝 값(첫 실행의 dev 사이보그는 STA 점수 14 → "= 720/분 × min(2, 14 ÷ 10) = 1,008/분"), 유닛 상세 조끼 → 아머 HP 오름, 사진 8조합.
  - 처음 돌렸을 때 실패 둘을 고쳤다: ① 스태미나 값 비교가 자리 나눔("1,008")을 몰랐다 → 줄 값 글 그대로 비교. ② `equip-stats`가 dev 사이보그에 검을 남겨 뒤에 도는 `inventory.spec`의 "칸 창 고를 거리 1개"가 2개가 됐다(보유 물건은 버릴 길이 없어 한 실행 안에 남는다) → 이 시험은 admin 계정을 쓴다.
- `TEST_DATABASE_URL=… pnpm check` 통과: 시험 417파일 3,462개(DB 시험 포함, 건너뜀 없음), 다국어 3,771키, 대비 738쌍, 모듈 경계·파일 크기(`world.ts` 893줄·`holdings/service.ts` 785줄). `pnpm build && node scripts/check-pwa.mjs && pnpm check:bundle` 통과(첫 화면 JS 105,902 B / 상한 131,416 B — 새 화면 코드는 사이보그 지연 조각 안). `pnpm check:docs`(기준 main `0cf446d`)·`pnpm check:content origin/main`(core@37 그대로, 4b 호환 포함)·`pnpm docs:index --check` 통과. origin/main에 새 커밋 없음(합칠 것 없음).
- 사진(저장소 밖): `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/equip-shots/` — `equip-offense-{390,1440}-{pastel,dark}-{ko,en}.png`(OFFENSE 묶음, 실제 공격력 펼침), `equip-vitals-…png`(VITALS 묶음, 스태미나 회복 펼침), `equip-unit-stats-…png`(유닛 상세 스탯 판, 조끼 입음) 24장 + 같은 실행의 cyborg·inventory·vitals·units 사진. 눈으로 확인: 390 파스텔 한국어 OFFENSE, 1440 다크 영어 VITALS, 390 다크 한국어 유닛 스탯.

## 함께 바꿔야 하는 파일
- 효과 사전 전투 수치 목록(`packages/content` `EFFECT_COMBAT_STATS`)을 바꾸면 sim `ModifierStat`·`modifiersOf`, 서버 `unitBody.ts`(`startEffectsOf`가 이 목록으로 가른다).
- 세계가 여는 전투가 늘면(습격·조우) 시작 자료를 `bodies.battleStart` → `vitals.service.battleStart` 차례로 거친다(지금은 NPC 런타임 `startBattle` 하나).
- 몸 바탕 규칙(저장된 유닛 스탯이 생기면)은 `unitBody.ts` `BodyBase`·`bodySpecOf` 한 곳.

## 건드리지 말 것
- 시뮬레이터에는 `startEffects`를 넣지 않았다(넣으면 출력이 바뀌어 `SIM_VERSION` 13).
- 사이보그 화면의 실제 공격력·방어율 줄에 전투 수치 버프를 더하지 않는다(질문 354 답 전, 랭킹은 버프 뺀 값 D-7022).

## 미검증·TODO·알려진 문제
- 질문 353(1차 스탯 ‰ 버프 — 지금 아무것도 안 줌), 354(전투 수치 버프의 화면 표), 355(꺼진 아이템을 입고 있을 때 — 지금 아무것도 안 줌).
- 지닌 것이 있는 플레이어 휴먼은 [임시] 기본 몸(1차 10) + 장비로 싸운다(시뮬 [임시] NPC 사양보다 약함). 지금 플레이어 유닛은 세계 전투에 들지 않는다. 저장된 유닛 스탯 줄기에서 맞춘다.
- 유닛 상세에는 판정 값 요약(`combat`)을 아직 싣지 않았다(사이보그 화면만). 스탯 줄은 지닌 것을 반영한다.
- 전투 밖 쉴드 재생에 버프를 넣지 않는 한계(생명 수치 ADR 4절)는 그대로.
- 질문 번호: 처음 347~349로 적었으나 노동 직무판(347~350)·보유 물건 2차(351~352)가 이미 써서 조정자 지시로 353~355로 바꿨다.
- NAS·실제 휴대폰에서 재지 않았다.

## 사용자 결정 대기
- 질문 353~355 — 기획 세션.
