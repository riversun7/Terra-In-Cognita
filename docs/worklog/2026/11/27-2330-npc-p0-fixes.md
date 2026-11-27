# 작업 기록: NPC 직무수행·피로·경험치 P0 결함 4건 수정

- 일시: 2026-11-27 23:30 KST
- 작업 도구: Antigravity (Orca worker, 로컬 브랜치 `riversun7/npc-p0-fix-plan`)

## 한 일

NPC 직무수행·피로·경험치 조사에서 도출된 P0 결함 4건을 오너 확정 결정에 따라 4개 커밋으로 나누어 수정했다.

1. **P0-2 (`away`·`held`·`onStrike` 일꾼 대상 필터 통일)** — **Verified** (단위 시험 통과):
   - `SimUnit.away` 필드를 추가하고 `laborOrderOf`·`livingDay`가 `away === true`를 제외하도록 통일했다.
   - `economy.ts` `recount()`가 `unit.away`를 동기화하고 1-out-1-in 교체도 `refreshPresence`가 감지하도록 보강했다.
   - `humanPlaces.ts`가 `held === true` 휴먼의 옛 `home`을 `setHome(id, null)`로 지우고, `onStrike` 휴먼은 오버플로우에서도 시설 슬롯에서 제외하도록 수정했다.
   - `npcLogistics.ts`가 `laborOrderOf`를 써서 `away`·`onStrike`·`laborRank` 순서를 일치시켰고, `ops/world.ts` `isNpcWorker`가 `info.held !== true`를 검사하게 했다.
2. **P0-4 (`syncCity` 생산 배치 진행률 보존)** — **Verified** (단위 시험 통과):
   - `PendingBatch.gatherProgress`와 `batchDurationFor`를 `@terra/sim`에서 공개해 `economy.ts` `syncCity`가 `workers`/`dutyPm`/`haul`/`level`/`plots` 변경 시 기존 배치 진행률(`donePpm`, ppm `1_000_000`)과 `batches`를 보존하고 남은 시간만 재산정하게 했다.
   - `selectTier` 변경 시 진행 중 배치는 유지하고 다음 배치부터 새 티어를 적용하며, `workers === 0` 시 `pending = undefined`(`aiMonitor` 호환)로 일시 정지하면서 `donePpm`·`pausedBatch`를 보존한다.
   - 레시피 변경·시설 제거 시에만 0%로 초기화한다.
3. **P0-3 (물류센터 운반꾼 쉼터·숙박비 통합 및 왕복·거리·무게·성공률 차등 배달 경험치)** — **Verified** (단위 시험 통과):
   - `porter.ts`·`station.ts`에 `DeliveryReport`·`onDelivered`와 정수 순수 함수 `deliveryExp`(편도 거리 `500~2500‰`, 1회 적재 대비 무게·왕복 수 최대 10회 상한 및 `<1kg` 1g 쪼개기 차단, 완주 `1200‰` 보너스 vs 부분 전달 비율)를 추가해 플레이어·NPC 물류센터 공통으로 배달 완료 시 경험치를 지급한다.
   - `gather/world.ts` `gainExp`에 `world.npc?.setHumanLevel(unitId, gained.level)` 동기화 누락을 수정했다.
   - `npcLogistics.ts` `planCenterWorkFacilities`·`centerWorkers`·`invalidate`와 `npcWages.ts` `extraWorkers`를 연동해 물류센터 운반꾼을 `planCityRest`·숙박비 예약/징수에 포함하고, `afterDay`에서 `payCenterHaulers`를 `chargeLodgingFees`보다 먼저 실행하도록 순서를 바로잡았다.
4. **P0-1 (NPC 상태 기반 피로 저장소 `NpcFatigueStore` 도입)** — **Verified** (단위 시험 통과, DB 통합 시험 여부는 아래 기록):
   - 메모리 전용 `NpcFatigueStore`를 도입해 `aiState === "work"`이면서 시설 가동 중(`economy.isFacilityActive`)이거나 물류 운반 중(`station.isCarrying`)일 때만 피로가 누적되고, 휴식·비가동 구간에서는 숙소/집/노숙 배율대로 단조 감소하도록 했다.
   - `bots.ts`·`secondMap.ts`·`mapFactory.ts`·`ops/world.ts`·`holdings/world.ts`·`npcWorkInjury.ts`·`aiMonitorSource.ts`·`world.ts`가 단일 원본 `NpcFatigueStore`를 참조하고, 성향 기반 `restAt`(`70~110`) 및 N23 스탯 감소(`90/100/110` → `-10/-20/-30%`)가 실제로 작동하도록 연결했다.
   - 새 ADR `docs/adr/2026-11-27-npc-stateful-fatigue.md`를 작성했다.

## 바꾼 파일과 이유

- `packages/sim/src/simulator/world.ts`, `humanPurse.ts`, `humanPurse.test.ts`: `SimUnit.away` 추가 및 일꾼·임금 대상 필터 통일.
- `packages/sim/src/simulator/economy.ts`, `serverEconomy.ts`: `PendingBatch.gatherProgress` 추가 및 `batchDurationFor` 재수출(`SIM_VERSION = 78` 유지).
- `apps/server/src/gather/porter.ts`, `station.ts`, `station.test.ts`, `registry.ts`, `world.ts`: 배달 완료 보고(`onDelivered`), `deliveryExp` 차등 산정, `isCarrying` 조회, `registerStation`, `setHumanLevel` 동기화.
- `apps/server/src/npc/economy.ts`, `syncCityProgress.test.ts`: `away` 동기화, `syncCity` 진행률 보존, 물류센터 `planCityRest`·`afterDay` 순서 조정, 시설 정지 추적(`stalledFacilities`) 및 일꾼 배정/가동 조회.
- `apps/server/src/npc/humanPlaces.ts`, `humanPlaces.test.ts`: `held` 정리 및 `onStrike` 슬롯 제외.
- `apps/server/src/npc/npcLogistics.ts`, `npcLogistics.test.ts`, `npcWages.ts`, `npcWages.test.ts`: 물류센터 운반꾼 필터·쉼터·숙박비 연동.
- `apps/server/src/npc/npcFatigue.ts`, `npcFatigue.test.ts`: 메모리 기반 NPC 상태 피로 저장소 및 단위 시험.
- `apps/server/src/npc/runtime.ts`, `npcWorkInjury.ts`, `npcWorkInjury.test.ts`, `aiMonitorSource.ts`, `aiBridge.ts`, `workExp.db.test.ts`: `NpcFatigueStore` 런타임 연결·부상/모니터/DB 시험 갱신.
- `apps/server/src/world/bots.ts`, `secondMap.ts`, `secondMapTypes.ts`, `mapFactory.ts`, `world.ts`, `holdings/world.ts`, `ops/world.ts`: `BotFatigueAccess` 연결, N23 피로 스탯 불이익 NPC 적용, 운영 조회 실측 피로 표시.
- `docs/adr/2026-11-27-npc-stateful-fatigue.md`, `docs/worklog/2026/11/27-2330-npc-p0-fixes.md`, `docs/WORKLOG.md`: ADR·작업 기록·목차 갱신.

## 함께 바꿔야 하는 파일

- `apps/server/src/npc/npcFatigue.ts`의 피로 누적·회복 규칙을 바꿀 때는 `apps/server/src/world/bots.ts`의 `mustRest` 판정과 `apps/server/src/npc/npcFatigue.test.ts`를 함께 맞춰야 한다.
- `apps/server/src/gather/station.ts`의 `deliveryExp` 계수나 상한을 바꿀 때는 `apps/server/src/gather/station.test.ts`를 함께 갱신한다.

## 건드리지 말 것

- 기존 확정 ADR 본문(`docs/adr/2026-11-26-fatigue-stat-penalty.md`, `docs/adr/2026-11-26-unit-life-rules.md`, `docs/adr/2026-11-27-npc-work-exp.md`)은 수정하지 않는다.
- `apps/server/src/world/settlement.ts` DB 정산 경로는 이번 메모리 전용 NPC 피로 결정 범위 밖이므로 건드리지 않는다.
- `packages/sim` 시뮬레이터 골든 해시(`SIM_VERSION = 78`)를 깨뜨리는 결정성 변경을 넣지 않는다.

## 미검증·TODO

- **Verified**: `pnpm format:check`, `pnpm typecheck`, `pnpm lint`(경고·오류 0), `pnpm check:boundaries`, `pnpm check:size`, `pnpm check:i18n`, `pnpm check:contrast`, `pnpm check:content --no-compat`, 전체 단위 시험(`vitest run` 832/833 통과 + CPU 경합으로 1회 실패한 `metrics.test.ts` 단독 7/7 통과), DB 통합 시험(`apps/server/src/npc/workExp.db.test.ts` 로컬 PostgreSQL 3/3 통과).
- 원격 푸시·PR 생성은 오너 지시에 따라 수행하지 않고 로컬 브랜치(`riversun7/npc-p0-fix-plan`) 커밋까지만 완료했다.

## 관련 ADR

- [2026-11-27-npc-stateful-fatigue.md](../../../adr/2026-11-27-npc-stateful-fatigue.md)
- [2026-11-27-npc-work-exp.md](../../../adr/2026-11-27-npc-work-exp.md)
- [2026-11-26-fatigue-stat-penalty.md](../../../adr/2026-11-26-fatigue-stat-penalty.md)
- [2026-11-26-unit-life-rules.md](../../../adr/2026-11-26-unit-life-rules.md)
