# NPC 도시 일꾼에게 플레이어 유닛과 같은 직무 상태(일·쉼, 묶음마다 피로)

- 일시: 2026-11-28 14:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-27-npc-worker-jobs.md`(새로 씀), `2026-11-27-npc-work-exp.md`, `2026-11-26-job-fatigue-per-lot.md`, `2026-11-26-unit-life-rules.md`, 앞 작업 기록 `27-2115-ops-exp-sort-vehicle-bots.md`(커밋 `f6b124b5`)

## 한 일

사용자 결정(2026-11-27, NPC 휴먼에게도 플레이어 유닛과 같은 진짜 피로·직무 상태를 줄지 묻자 "네, 똑같이")을 옮겼다.

- **직무 상태**: NPC 도시 일꾼 휴먼이 플레이어 유닛과 같은 자리(2차맵 유닛의 직무 상태 — 저장됨)에 직무·단계(일·쉼)·피로를 갖는다.
- **피로**: 시설이 묶음 하나를 낼 때마다 그 시설에서 지금 일하는 일꾼 하나(차례로)의 피로가 오른다(직무 묶음 피로 10 × 시설 피로 배율 — 플레이어 채집소와 같은 식). 같은 일꾼이 경험치도 받는다.
- **쉼**: 피로가 생활 규칙의 쉬러 가는 피로(성향 기본값, 90 언저리)에 닿으면 쉼터로 가서 쉼터의 회복 배율로 회복하고, 0이 되면 돌아온다.
- **생산**: 쉬는 일꾼은 생산에서 빠진다(시설 생산 속도 = 지금 일하는 일꾼 몫). 아무도 일하지 않으면 그 시설은 선다. 숙소 회복 배율을 생산 속도에 곱하던 옛 평균 셈은 이 판에서 쓰지 않는다.
- **같이 맞춰진 것**: 피로 구간의 스탯 감소(전투·걷기), 작업 중 부상 판정의 피로, 일터 ↔ 쉼터 움직임, 운영자 콘솔(피로가 어림값이 아니라 진짜 값, "도시 일꾼 · 일하는 중/쉬는 중/가는 중").
- **스위치**: 설정 칸 `npc_worker_job_mode`(기본 1). 0이면 옛 셈으로 돌아간다(개발자 설정 칸 패널에서 바꾼다).

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/server/src/npc/workerJobs.ts`(새 파일), `workerJobs.test.ts`, `workerJobs.db.test.ts` | 일꾼 직무 장부: 직무 켬·끔, 묶음 피로, 쉬러 가기, 쉼터 회복, 일하는 일꾼 수 |
| `apps/server/src/npc/economy.ts` | 묶음을 낼 때 피로·경험치, 시설 생산 속도를 일하는 일꾼 몫으로(`applyDuty`), 일꾼 맞추기(`refreshJobs`), 틱(`workTick`) |
| `apps/server/src/npc/runtime.ts` | 장부 만들기·틱에서 밀기·휴먼 자리에 직무 단계 넘기기 |
| `apps/server/src/npc/humanPlaces.ts`, `aiBridge.ts`, `apps/server/src/world/bots.ts` | 일꾼의 일·쉼을 직무 단계로(`WorkShift.on`) |
| `apps/server/src/npc/npcWorkInjury.ts` | 직무 상태가 있는 일꾼은 진짜 피로 ÷ 피로 상한으로 굴린다 |
| `apps/server/src/world/settlement.ts`, `world.ts` | 정산이 이 유닛들의 직무 상태를 건드리지 않는다(`externalJobs`), 생활 규칙 넘기기 |
| `apps/server/src/ops/world.ts`, `apps/game/src/ops/UnitTable.tsx`, `UnitDetail.tsx` | 운영 조회: 직무 상태가 있는 NPC 일꾼의 진짜 피로·지금 하는 일, 이름표 "도시 일꾼" |
| `packages/sim/src/society/logisticsCoefficients.ts`, `tuningLogistics.ts`, `content/core/tuning.json`, `manifest.json` | 설정 칸 `npc_worker_job_mode`(팩 판 163) |
| `apps/server/src/npc/workExp.db.test.ts` | 운영 조회 시험의 기대(어림 피로 → 진짜 피로) |
| `docs/adr/2026-11-27-npc-worker-jobs.md` | 새 결정 |

## 함께 바꿔야 하는 파일

- 플레이어 직무의 피로 규칙(묶음 피로·시설 배율·회복 걸음)을 바꾸면 `npc/workerJobs.ts`의 `facilityFatiguePm`·`restStepMsOf`·`lot`도 같은 식인지 본다(`gather/rules.ts` `stationBuffs`, `@terra/sim` `rulesWithRecovery`).
- NPC 휴먼의 직무 상태를 쓰는 곳을 더하면 `world/settlement.ts` `externalJobs` 고리(정산이 건드리지 않는 유닛)를 기억한다.

## 건드리지 말 것

- `world/world.ts` `settlement.externalJobs(…)`: 빼면 소유 주체 정산이 NPC 일꾼의 피로를 일 주기마다 1점씩 올린다(`npc/workerJobs.db.test.ts`가 본다).
- `npc/economy.ts` `applyDuty`의 "아무도 일하지 않으면 잡아 둔 번을 거둔다": 빼면 배율 1‰로 아주 긴 번이 잡혀 일꾼이 돌아와도 시설이 그 번에 묶인다.
- `npc/economy.ts` `syncCity`의 `managed`(시설 견주기에서 생산 속도 배율을 빼는 것): 빼면 맞출 때마다 시설을 새로 놓아 진행 중인 번을 잃는다.

## 미검증·TODO·알려진 문제

- **플레이 값이 바뀐다**: NPC 생산량·NPC 휴먼의 전투·걷기.
- 잰 값(시험 세계 — 나라 둘·도시 둘·휴먼 약 100, 하루 생산 묶음 수 나흘): 이 판 708 → 534 → 586 → 606, 옛 셈 768 → 200 → 165 → 132. 일꾼 하나가 하루 약 6묶음(피로 약 54), 나흘째 끝에 쉬는 일꾼 99명 가운데 1명. 옛 셈이 둘째 날부터 떨어진 까닭은 재지 않았다(Unknown). 실제 세계(휴먼 4,600)의 생산 변화는 재지 않았다(미실행).
- 똑같지 않은 것: NPC는 시설이 묶음을 함께 내고 한 명이 그 피로를 받는다. NPC 일꾼의 스탯은 묶음 속도에 들지 않는다. 쉼터 ↔ 일터 오가는 시간은 회복에 넣지 않았다.
- 숙박비·집세는 옛 평균 셈(하루 쉼 횟수)으로 걷는다.
- 쉼을 센 시각·받을 차례는 메모리다(다시 켜면 그 시각부터).
- 규칙 시뮬레이터는 이 판을 돌지 않는다(서버와 NPC 생산 셈이 다르다).
- 판을 끈 옛 셈의 운영 조회(어림 피로) 시험은 따로 두지 않았다.
- 기획서에 없는 규칙이다. 기획 세션에 전달이 필요하다.

## 검증

- Verified(깨끗한 작업 복사본, `f6b124b5` + 이 변경): `pnpm check` 통과(시험 6,275개 통과·440개 건너뜀), `pnpm check:content` 통과(core@163).
- Verified(로컬 PostgreSQL 15, `TEST_DATABASE_URL`): 서버 시험 전체 390파일 2,297개 통과(DB 시험 포함).
  - `npc/workerJobs.db.test.ts`: 일꾼의 직무 켜짐, 정산이 건드리지 않음, 묶음 피로로 쉬러 감, 쉬는 일꾼의 움직임·시설 생산 속도, 쉼터 회복 뒤 복귀, 유닛 줄 저장, 설정 칸 끔(옛 셈), 하루 생산 묶음 수.
  - `npc/workerJobs.test.ts`: 장부 규칙(시설 피로 배율·회복 걸음·켬·끔·차례·다시 켠 뒤).
  - 이 판 때문에 기대가 달라진 기존 시험은 운영 조회 한 군데(NPC 일꾼 피로가 어림값 → 진짜 값)였다.
- Verified(화면 시험, 같은 복사본, `E2E_BROWSER_CHANNEL=chrome`, 헤드리스): `e2e/ops.spec.ts` 15개 통과. 390px 유닛 상세 사진을 눈으로 봤다.

## 사용자 결정 대기

- NPC 생산을 유닛마다의 묶음으로까지 바꿀지(도시 경제 생산 통째 교체).
- 숙박비를 실제로 쉰 횟수로 걷을지.

## 덧붙임 (2026-11-28 21:20) — main 위로 옮기며 한 일

올리려는 사이 main에 NPC 일꾼 피로를 메모리 저장소로 추적하는 묶음(ADR `2026-11-27-npc-stateful-fatigue.md`)이 먼저 들어가 있었다. 사용자에게 두 방식의 차이를 설명했고, 사용자가 이 작업의 직무 상태를 쓰기로 정했다(2026-11-28).

- 그 묶음의 마지막 커밋(`69979ef3`, 피로 저장소)만 되돌렸다: `npc/npcFatigue.ts`·`npcFatigue.test.ts` 삭제, 운반 중 여부 고리(`gather/porter.ts`·`registry.ts`·`station.ts`·`world.ts`), 봇 피로 접근(`world/bots.ts`·`mapFactory.ts`·`secondMap.ts`·`secondMapTypes.ts`·`world.ts`), `holdings/world.ts`의 NPC 피로 조회, `npc/aiBridge.ts`·`aiMonitorSource.ts`·`runtime.ts`·`economy.ts`·`npcWorkInjury.ts`·`ops/world.ts`의 그 몫.
- 같은 커밋에 섞여 있던 시험 타입 고침(`npcLogistics.test.ts`·`syncCityProgress.test.ts`)은 남겼다.
- 다른 세 수정(일꾼 거르기, `syncCity` 진행 보존, 운반꾼 쉼 계획·배달 경험치)과 합쳤다: `syncCity`가 시설을 다시 맞출 때 일하는 일꾼 몫(`dutyPm`)을 잃지 않게 했고, 운영 조회의 NPC 일꾼 판정에 "2차맵 사이 이동 중 제외"를 남겼다.
- ADR `2026-11-27-npc-stateful-fatigue.md`는 "대체됨"으로, `2026-11-27-npc-worker-jobs.md`에는 "바뀜 (2026-11-28)" 절을 더했다.
- 검증(Verified): 서버 타입 검사, `oxlint`, DB 시험 `apps/server/src/npc`·`ops`·`world` 108개 파일 531개 통과.

