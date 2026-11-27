# ADR: NPC 일꾼 상태 기반 피로(메모리 추적) 도입

- 상태: 확정
- 날짜: 2026-11-27
- 관련 문서: [2026-11-26-fatigue-stat-penalty.md](./2026-11-26-fatigue-stat-penalty.md), [2026-11-26-unit-life-rules.md](./2026-11-26-unit-life-rules.md), [2026-11-27-npc-work-exp.md](./2026-11-27-npc-work-exp.md)

## 배경

기존 NPC 일꾼의 피로는 `world/bots.ts`의 시간 기반 삼각파(`shiftFatiguePm`, 천장 `SHIFT_FATIGUE_PEAK_PM = 600‰`, 즉 피로 72/120)로 어림 계산했다. 이 방식에는 네 가지 구조적 문제가 있었다.

1. **N23 피로 스탯 불이익 미발동**: 어림 천장이 72라 N23 피로 불이익 구간(`90 / 100 / 110` → `-10% / -20% / -30%`)에 아예 도달하지 못했고, `holdings/world.ts`도 플레이어 직무 상태(`job.fatigue`)만 읽어 NPC 피로 불이익이 빠져 있었다.
2. **휴식 중 피로 상승 모순**: 5상태 FSM이 피로 64 무렵에 `"rest"`로 전환해도 시간 삼각파는 근무 시간 끝까지 72로 계속 올라가, 쉬는 중인 NPC의 피로가 올라가는 모순이 생겼다.
3. **실제 생산·운반과 괴리**: 시설이 정지·적자 멈춤·재료 부족으로 멈춰 있거나, 물류센터 운반꾼이 짐 없이 대기 중이어도 시간에 따라 피로가 똑같이 쌓였다.
4. **성향 기반 생활 규칙 미적용**: 플레이어 유닛에 도입한 규율 성향별 `restAt`(`70~110`)·`resumeAt`(`0`) 규칙(`@terra/shared/unitLife`)이 NPC 일꾼에는 적용되지 않았다.

## 결정

NPC 일꾼의 피로를 메모리 전용 상태 저장소(`apps/server/src/npc/npcFatigue.ts`, `NpcFatigueStore`)로 전환한다.

1. **메모리 전용 추적(DB 미저장)**:
   - 서버 재시작 시 NPC 일꾼 피로는 0부터 다시 누적한다.
   - `world_units.fatigue` DB 열과 `world/settlement.ts` 소유 주체 DB 정산은 건드리지 않는다.
   - 매 `npc.tick()`과 2차맵 봇 이벤트(`SecondMap` `arrive`/`wake`)에서 밀리 피로 단위(`1000 = 1점`) 정수 연산으로 피로를 전진시킨다.
2. **가동 시에만 누적, 휴식·비가동 시 단조 감소**:
   - `aiState === "work"`이고 배정 시설이 실제로 가동 중(`economy.isFacilityActive`, 생산 켬·일꾼 > 0·진행 중 배치·적자/재료 부족 정지 아님)이거나 물류센터 운반 짐을 실제로 나르는 중(`station.isCarrying` 또는 보이는 운반 일정)일 때만 `TEST_JOB_RULES.cycleMs` 속도로 피로가 누적된다.
   - `"rest"`·비근무·정지·재료 부족·대기 구간에서는 배정된 쉼터(`RestPlace`, 숙소·집·노숙)의 `restRecoveryPm` 배율과 `TEST_JOB_RULES.restStepMs` 속도로 피로가 단조 감소한다.
3. **단일 원본 조회 및 성향·N23 연동**:
   - `world/bots.ts`(5상태 FSM·이동 목표), `ops/world.ts`(운영 콘솔 조회·정렬·상태 거르기), `holdings/world.ts`(N23 피로 1차 스탯 감소), `npc/npcWorkInjury.ts`(작업 중 부상 판정), `npc/aiMonitorSource.ts`(작동 모니터) 모두 `NpcFatigueStore` 단일 원본을 조회한다.
   - `restAt`·`resumeAt`은 플레이어 유닛과 동일한 `@terra/shared/unitLife` `defaultLifeRules`(규율 성향 0~1000 → `restAt` 70~110, `resumeAt` 0)를 적용한다. 이에 따라 규율 성향이 높은 NPC는 실제로 90/100/110 구간에 진입해 N23 스탯 감소(`-10/-20/-30%`)를 받는다.
   - `NpcFatigueStore`가 없는 독립 단위 시험 환경에서는 기존 `shiftFatiguePm` 어림값으로 안전하게 fallback한다.

## 대안과 비교

- **A안 (어림 삼각파 보정)**: 천장과 FSM 표시만 맞추는 최소 수정. 구현량은 작지만 실제 시설 정지·재료 부족·빈 물류센터 대기를 반영하지 못하고, FSM 조기 휴식 전환과 시간 파형이 구조적으로 계속 어긋난다.
- **B안 (메모리 상태 기반 추적 — 채택)**: DB 쓰기 부하와 마이그레이션 위험을 피하면서도 실제 작업·휴식·시설 정지·성향 `restAt`·N23 불이익을 단일 원본으로 정합시킨다.
- **C안 (DB 영속화 + `settlement.ts` 통합)**: 재시작 후 피로가 이어지지만 수만 NPC 휴먼의 잦은 DB 쓰기와 `settlement.ts` 경계 확장 비용이 크다.

## 영향 범위

- `apps/server/src/npc/npcFatigue.ts`: 상태 기반 피로 저장소 신설.
- `apps/server/src/npc/economy.ts`: 시설 정지(`stalledFacilities`) 추적, `isFacilityActive`·`workerAssignmentOf`·`workerIds` 공개.
- `apps/server/src/npc/runtime.ts`, `apps/server/src/world/world.ts`, `apps/server/src/world/mapFactory.ts`, `apps/server/src/world/secondMap.ts`, `apps/server/src/world/secondMapTypes.ts`: `NpcFatigueStore` 생성·틱 전진·2차맵·보유 물건·운반 상태 연결.
- `apps/server/src/world/bots.ts`, `apps/server/src/ops/world.ts`, `apps/server/src/holdings/world.ts`, `apps/server/src/npc/npcWorkInjury.ts`, `apps/server/src/npc/aiMonitorSource.ts`, `apps/server/src/npc/aiBridge.ts`: 단일 원본 피로 조회 및 `fatigueEstimated` 해제.
- `packages/sim`: 변경 없음(`SIM_VERSION` 유지).

## 후속·제약

- 서버 재시작 직후에는 모든 NPC 일꾼이 피로 0에서 시작한다(의도된 메모리 전용 제약).
- 향후 오프라인 장기 보존이 필요해지면 `NpcFatigueStore`의 직렬화 스냅샷을 별도 ADR로 검토한다.
