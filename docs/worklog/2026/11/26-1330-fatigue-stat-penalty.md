# 피로 불이익을 1차 스탯 감소로 바꿈, 직접 채집 피로 10·시설 감소, 숙소 종류별 회복 배율

- 일시: 2026-11-26 13:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-26-fatigue-stat-penalty.md`(새로 씀), `2026-11-26-fatigue-band-penalty.md`(대체됨 표시), 앞 작업 기록 `26-0900-fatigue-band-penalty.md`(커밋 `1d129a82`)

## 한 일

사용자 지적(2026-11-26 "영향이 잘못되었다 … 피로구간 90, 100, 110 이상 패널티 각 -10, 20, 30 스탯 감소 / 작업 전투 공통영향 / 걷기속도는 스탯 감소로 자동 영향")으로 앞 작업을 고쳤다.

- 기획서를 다시 봤다(Verified: 미러 = 원본 최신 `1955bd7`, 옛 캐릭터 문서 §9.1): 사용자가 말한 규칙은 기획서에 없고, 기획서 값은 앞 작업이 건 31·61·91 구간이다. 사용자에게 알리고 새 결정으로 받았다(물음 넷의 답은 ADR 배경).
- **구간 불이익 = 1차 스탯 감소**: 피로 90·100·110 이상이면 1차 스탯 여섯 칸 −10%·−20%·−30%. 부상 불이익과 같은 길(유닛 몸)이라 작업·전투·걷기에 함께 든다. 앞 작업의 일 주기 길이·채집 시간·걷기 ‰는 걷어 냈다(파일을 앞 커밋 전으로 되돌림).
- **쌓이는 양**: 직접 채집 한 번 10점. 채집 시설 반경 안이면 레벨 1 −10%, 레벨마다 −10%p, 가장 크게 −90%.
- **회복**: 생활비 미납은 피로 회복과 무관. 숙소는 종류마다 회복 배율 칸(팩 `restRecoveryPm`, 건물 편집기 칸). 팩의 숙소는 1500‰.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/roster/body.ts`, `unitBody.ts`, `unitBody.test.ts` | 몸의 피로 스탯 감소(`fatiguePm`, 효과 출처 `fatigue`) |
| `apps/server/src/holdings/world.ts`, `apps/server/src/world/world.ts` | 유닛의 지금 피로 → 감소 ‰(`gearOf`) |
| `apps/server/src/world/walkSpeed.ts` | 걷기 몸 지문에 피로 감소(앞 작업의 이동 ‰는 뺌) |
| `packages/sim/src/society/labor.ts`, `labor.test.ts`, `coefficients.ts`, `cyborgUpkeep.test.ts` | `fatigueStatCutPm`, 구간 기본값 90·100·110, 회복에서 생활비 미납 뺌 |
| `packages/sim/src/society/logistics.ts`, `logistics.test.ts` | 숙소 쉼터의 종류별 회복 배율 |
| `packages/sim/src/settle/settle.ts`·`settle.test.ts`, `apps/server/src/gather/rules.ts`·`service.ts`·`objects.test.ts`·`station.db.test.ts`, `apps/server/src/labor/workerRest.ts`·`workerRest.test.ts`, `apps/server/src/world/walkSpeed.test.ts` | 앞 작업의 방식을 걷어 냄(앞 커밋 전 내용으로) |
| `packages/content/src/schema/economy.ts`, `packages/shared/src/buildingEditor.ts`, `apps/server/src/buildingEdit/views.ts`, `apps/server/src/facilities/catalog.ts`, `apps/server/src/market/worldInput.ts`, `apps/server/src/npc/cityRest.ts` | 시설 칸 `restRecoveryPm`과 쉼터 계획 연결 |
| `apps/game/src/editor/buildings/BuildingDetail.tsx`, `buildingModel.ts`, `apps/game/messages/{ko,en}.json` | 건물 편집기 [숙소 피로 회복 배율] 칸 |
| `content/core/tuning.json`, `facilities.json`, `manifest.json` | 구간·채집 피로·시설 배율 값, 숙소 1500‰, 팩 판 159 |
| `packages/sim/src/society/gatherObjects.ts`, `apps/server/src/gather/station.test.ts` | 채집 피로 기본값을 팩 값과 같게, 시험 기대값 |

## 함께 바꿔야 하는 파일

- `UnitGear`를 만드는 곳은 `fatiguePm`도 넣는다(지금은 `holdings/world.ts` 한 곳).
- 시설 칸을 더할 때 건물 편집기의 `cleanFacility`·`pick` 목록과 서버 `facilityJsonOf`에도 넣는다(빠지면 다른 칸만 고쳐도 지워진다).

## 건드리지 말 것

- `roster/body.ts` `buffsWithInjury`: 부상·피로는 같은 바탕에서 따로 세어 뺀다(곱하지 않는다).

## 미검증·TODO·알려진 문제

- 실제 화면에서 피로 90 이상인 유닛의 스탯·걷기가 주는 것은 보지 않았다(미실행). 건물 편집기의 새 칸도 화면으로 보지 않았다(미실행).
- 직무의 일 주기당 피로 1점은 그대로다(설정 칸 없음).
- 쉬러 가는 때(유닛 성향·주인 규칙, 유닛 화면 설정)는 다음 작업이다. 지금은 직무가 상한(120)에서 쉰다.
- 포만감(음식 섭취) 규칙은 플레이어 유닛에 포만감 값 자체가 서버에 없어 만들지 않았다.
- 피로 스탯 감소는 화면에 "버프" 합의 음수로만 보인다.
- 기획 49 N23·D-455와 다르다. 기획 세션에 전달이 필요하다.

## 검증

- Verified(깨끗한 작업 복사본, `b7666210` + 이 변경): `pnpm check` 통과(시험 6,240개 통과·430개 건너뜀).
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 385파일 2,269개 통과. 채집소 시험(`gather/station.test.ts`·`station.db.test.ts`·`objects.test.ts`)의 피로 기대값은 새 값으로 고쳤다(시설 레벨 1 배율 500‰ → 900‰, 90주기 뒤 피로 45 → 81).
- 팩 설정 칸과 기본 계수표가 같아야 하는 시험(`world/combatCatalog.test.ts`)에 맞춰 채집 피로 기본값(`packages/sim/src/society/gatherObjects.ts`)도 팩 값과 같게 바꿨다.
