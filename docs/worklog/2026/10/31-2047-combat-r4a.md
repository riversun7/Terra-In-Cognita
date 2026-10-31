# R4a: 장비·효과 사전·스킬 부품(Step 9-3·9-4), 전투 결과의 세계 반영, 퇴각 중인 파티만 빠짐(D-434)

- 일시: 2026-10-31 20:47 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-31-combat-core.md`(제안, 7·8절 더함, 퇴각 줄 고침), `2026-10-29-combat-map-instances.md`(35, "구현하며 정한 것"에 R4a 한 줄), 가지 `work/rules-r4a`(main `6a0eba1`에서)

## 한 일
- 판정(`packages/sim/src/combat/`): 효과 사전 처리 `effects.ts`(버프·디버프·지속 피해·회복·상태이상, 쌓임, 1차 스탯 저항 D-429), 스킬 `skills.ts`(모양·공식·조건·효과 부품, 등급 배율, 고르기·시전·풀기, 지속형), 장비 `equipment.ts`(칸 배치, 칸과 스탯 묶음 D-423, 스탯 요구 없음 D-424, 스킬 칸 D-427), 자료 묶음 `catalog.ts`(`TEST_COMBAT_CATALOG`)·팩 변환 `packCatalog.ts`. 공식 부품은 `formula.ts`(`skillAttack`·`withAttackModifiers`·`withDefenseModifiers`·`healAmount`). 상태 도우미를 `battleState.ts`로 나눔(battle.ts 600줄 아래).
- D-434: 가장자리 구역으로 빠지는 것은 퇴각 중인 파티(퇴각 명령 또는 ⑦)만. 한 유닛의 퇴각 명령은 파티 전체 퇴각([임시] 해석). 쫓아 들어간 파티 시험을 더함.
- 콘텐츠 팩 판 8(임시): `effects`·`skills`·`unit_kinds` 분류, `items`의 `equip` 칸(시험 장비 6개). 스키마가 버프 수치·상태이상 저항·칸과 스탯 묶음·무기 칸을 본다.
- 시뮬레이터: 유닛이 장비(검·투구·조끼·반지)와 스킬(강타·강철 피부·응급 처치)을 갖고 싸운다(팩 자료). `runSimulation` 옵션 `statTable` → `combatCatalog`.
- 서버: `world_units` 부상·나을 시각·포로 주체, `ledger_accounts.location` + (주체, 자산, coalesce(위치, 0)) 유일 색인, `world_battle_results` 표(마이그레이션 `20261031114206_unit_conditions_cargo`, 추가만). 전투 끝 시각에 `applyBattleOutcome`(부상·안전한 곳·포로·탈취)을 결과 기록과 같은 쓰기 묶음으로 한 번 적용. 포로·중태는 명령을 받지 않는다. 불변 조건 I9~I12. 팩 → 전투 자료 `combatCatalog.ts`.

## 확인 (Verified)
- 시험: 효과(지속 피해·쌓임·만료·쓰러짐, 버프·디버프 합, 한 번 회복, 저항 확률 모양), 스킬(조건·자원·쿨, 시전 800ms 뒤 풀림, 기절이 막음·저항 1000‰이면 안 걸림, 아군 반지름, 지속형, 체력 조건, 등급 배율, 스킬 섞인 전투 결정성·스냅숏 재생 바이트 같음), 장비(칸 배치, 1차·2차 갈래, 잘못된 칸·묶음 거절, 적정치 미달 착용, 스킬 칸 자름, 만들 때 범위), 콘텐츠 스키마·참조, 팩 = `TEST_COMBAT_CATALOG`(서버 시험), D-434 쫓기 시험.
- 서버 DB 시험: 전쟁 전투 → 끝 시각 뒤 다시 켬 → 진 유닛 2개 중상·포로(이긴 주체)·안전한 칸, 이동 명령 거절, 화물 10씩 → 5씩 남고 이긴 쪽 유닛 화물 10, 불변 조건 0, 또 켜도 탈취 거래 1·결과 기록 1. 결과 기록만 커밋되고 status를 못 고친 경우 다시 적용하지 않음.
- war16 10일 두 번 `cmp` 같음(해시 `b34ea06d`), 위반 0, 전투 80, 시간 초과 0.
- 전체 검사: `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과(시험 파일 253개, 시험 2,271개, 건너뜀 없음).

속도(Verified: 개발 컨테이너 Intel Xeon 2.1GHz 4 vCPU 공유, 부하 평균 3.0~5.0(다른 줄기가 돎), Node 24.22.1, `sim:speed`. NAS 값이 아니다)

| 시나리오 | 유닛 | 날 | 걸린 시간 s | 예약 | 예약/초 | 유닛당 예약 간격(분) | 가상 시간/실제 초 | 배속 | 최대 RSS MB | 위반 |
|---|---|---|---|---|---|---|---|---|---|---|
| stub16 | 640 | 180 | 0.63 | 20,157 | 32,235 | - | 6,908.5 h | 24,870,645 | 143 | 0 |
| econ16 | 640 | 180 | 20.14 | 1,728,432 | 85,831 | - | 214.5 h | 772,283 | 280 | 0 |
| war16 | 640 | 30 | 61.18 | 3,467 | 57 | - | 11.8 h | 42,369 | 215 | 0 |
| synthetic | 1,008 | 30 | 0.81 | 670,822 | 830,390 | 65.2 | 891.3 h | 3,208,558 | 167 | 0 |
| synthetic | 10,000 | 7 | 3.08 | 1,541,664 | 500,427 | 65.4 | 54.5 h | 196,319 | 289 | 0 |
| synthetic | 100,000 | 2 | 16.31 | 4,369,632 | 267,927 | 65.9 | 2.9 h | 10,595 | 412 | 0 |

- R3 때와 비교: war16 30일 57.15 → 61.18초(장비·스킬·효과가 더해짐, 부하 차이 섞임). stub16·econ16·synthetic은 전투 코드를 돌지 않아 부하 차이로 본다(Assumed).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/effects.ts`·`skills.ts`·`equipment.ts`·`catalog.ts`·`packCatalog.ts`·`battleState.ts` | 효과·스킬·장비 판정과 자료 |
| `packages/sim/src/combat/battle.ts`·`battleTypes.ts`·`formula.ts`·`unitSpec.ts`·`outcome.ts` | 스킬·효과를 틱에, D-434, 탈취 받는 곳·중복 방지 키 |
| `packages/sim/src/simulator/combatRun.ts`·`run.ts`, `cli/*` | 시뮬 유닛 장비·스킬, 팩 자료 |
| `packages/content/src/schema/combat.ts`·`economy.ts`·`categories.ts`, `content/core/*` | 분류·장비 칸, 팩 판 8 |
| `apps/server/src/db/schema.ts`, `drizzle/20261031114206_unit_conditions_cargo/` | 유닛 상태·원장 위치·결과 기록 표 |
| `apps/server/src/world/battleResults.ts`·`battles.ts`·`unitCondition.ts`·`secondMap.ts`·`world.ts`·`invariants.ts`·`persist/*`·`combatCatalog.ts`, `economy/ledger.ts` | 세계 반영, 한 번 적용, 불변 조건 |
| `docs/adr/2026-10-31-combat-core.md`, `2026-10-29-combat-map-instances.md` | 결정 기록 |

## 함께 바꿔야 하는 파일
- 전투 자료를 바꾸면 팩(`content/core/effects.json`·`skills.json`·`unit_kinds.json`·`items.json`의 equip)과 `TEST_COMBAT_CATALOG`를 같이 바꾼다(서버 시험 `combatCatalog.test.ts`가 맞춰 본다). 칸·1차 스탯 코드 목록은 `packages/content/src/schema/combat.ts`와 `packages/sim/src/combat/equipment.ts`가 같아야 한다(sim 시험).
- `BattleState`·`UnitState` 모양을 바꾸면 남은 스냅숏이 맞지 않는다 → `SIM_VERSION`.

## 건드리지 말 것
- 올라간 마이그레이션은 고치지 않는다.
- 2차맵 지형·엄폐 생성(V2 줄기).

## 미검증·TODO·알려진 문제
- 판정 비용 NAS 측정 없음(Unknown). ADR 35 제안 그대로.
- [임시] 모두: 칸 이름·개수, 부품 종류, 효과 수치 칸, 쌓임, AI(목록 앞 스킬부터), 부상 단계(중상)·회복 시간, 안전한 곳(2차맵 가운데 칸, R4b에서 안전 도시), 화물 위치(음수 = 유닛), 편 faction = 주체 ID, 포로·중태 명령 거절 코드(`invalid_request`).
- 세계에서 전투를 열 때 유닛 묶기(R5), 부상 단계가 시간에 따라 내려가기, 포로 처형·몸값(D-244·D-269), 스킬석 인챈트·유전자 추출·생성기(뒤 단계).
- 기획 본문 48(스탯·공식)이 오면 7절과 대조한다.
- D-430~D-433(피로·급여·만족도)은 R4b.

## 사용자 결정 대기
- 없음.
