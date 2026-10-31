# R1 규칙 틀·시뮬레이터: 가상 시계 루프, 공용 장부·정산, D-391 지표 기록기

- 일시: 2026-10-31 18:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-10-31-rules-simulator.md`(제안, 이번에 씀), `2026-10-31-roadmap-to-launch.md`(R1 행), `2026-10-31-n1-real-time-gate.md`(조정 시뮬 ↔ 실제 시간 관문), `2026-10-31-s3-server-stage.md`, 가지 `work/rules-r1-simulator`

## 한 일
- 서버와 시뮬이 같은 코드를 쓰게 `packages/sim`으로 모았다(D-013).
  - 같은 시각 차례 키 (종류, 대상): 큐가 차례 함수를 받는다(기본은 그대로). 서버 2차맵 예약도 이 키를 써서 실행 중 차례 = 다시 켤 때 차례가 됐다.
  - 원장 장부(복식부기 거절·잔고)를 sim으로 옮기고, 서버 원장은 장부 + DB 쓰기 고리로 바꿨다. 메모리 감사(I1·I2·I6)를 더했고 문구는 서버 SQL 검사와 같은 상수다.
  - 소유 주체 정산(`settleOwnerPeriod`: 시험 직무·유지비 → 장부 거래)을 서버 `settlement.ts`에서 옮겼다.
- 시뮬레이터 `packages/sim/src/simulator/`: 가상 시계 실행 루프, 시나리오 형식, 세계(세력·도시·일꾼·장부), [임시] 대리 규칙, D-391 지표 기록기, 실행(JSON 줄 + 요약).
- 실행 도구 `packages/sim/cli/`(`pnpm --filter @terra/sim sim`, `sim:speed`), 시나리오 `stub16.json`(빈 세계, 국가 16)·`synthetic.json`(속도용 이동 부하).
- 작업 중 조율자 알림(D-410·D-412, ADR `2026-10-31-n1-real-time-gate.md`)대로 속도 목표를 "조정이 하루에 여러 번 돌 만큼"으로 적고, 기록기는 시계를 모르게 만들어 실제 시간 관문도 같은 기록기·줄 형식을 쓰게 했다.
- ADR `2026-10-31-rules-simulator.md`(제안), AGENTS.md 7장 명령 두 줄.

## R1 통과 기준 확인 (Verified)
| 기준(기술 순서 ADR R1 행) | 결과 |
|---|---|
| 같은 시드 두 번 → 지표 해시 같음 | `stub16` 시드 1 × 180일 두 번: 줄 파일·요약 파일 `cmp` 같음(해시 `536642f6`). 단위 시험 `run.test.ts`도 줄·요약 바이트 비교. 다른 시드는 해시가 다름 |
| 빈 세계(국가 16) 180일 분량 완주 | 시드 1~5 모두 완주, 각 0.36~0.52초 |
| 불변 조건 위반 0 | 시드 1~5 모두 하루마다 180번 검사, 위반 0 |
| 배속을 잼 | 아래 표 |

속도(Verified: 개발 컨테이너 Intel Xeon 2.1GHz 4 vCPU 공유, 부하 평균 4.5~5.6, Node 24.22.1, `sim:speed`, 줄마다 새 프로세스. NAS 값이 아니다)

| 시나리오 | 유닛 | 날 | 걸린 시간 s | 예약 | 예약/초 | 유닛당 예약 간격(분) | 가상 시간/실제 초 | 배속 | 최대 RSS MB |
|---|---|---|---|---|---|---|---|---|---|
| stub16 | 640 | 180 | 0.38 | 20,157 | 53,289 | - | 11,420.8 h | 41,114,956 | 145 |
| synthetic | 1,008 | 30 | 0.70 | 670,822 | 958,648 | 65.2 | 1,028.9 h | 3,704,136 | 133 |
| synthetic | 10,000 | 7 | 3.26 | 1,541,664 | 472,480 | 65.4 | 51.5 h | 185,355 | 314 |
| synthetic | 100,000 | 2 | 14.27 | 4,369,632 | 306,186 | 65.9 | 3.4 h | 12,108 | 406 |

- 어림(Assumed: 위 값에서 산술): 1만 유닛 180일 ≈ 1.4분, 10만 유닛 180일 ≈ 21분. 진짜 규칙의 예약은 더 무겁다. R2~R5마다 같은 도구로 다시 잰다.
- 검사: `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과(시험 파일 217개, 시험 2,083개, 건너뜀 없음 = DB 시험 포함). main `c4c5457`로 리베이스한 뒤 푸시 전 훅의 `pnpm check`(DB 포함)도 통과했다(시험 파일 221개, 시험 2,115개). 리베이스 직후 첫 푸시는 린트가 2차맵 새 메시지 키를 못 찾아 멈췄다: 생성 파일 `apps/game/src/paraglide/`가 옛것이었다 → `pnpm --filter @terra/game typecheck`로 다시 만들고 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/events/eventKey.ts`(새)·`eventKey.test.ts`(새) | 같은 시각 차례 키 (종류, 대상). 문자 코드 순서(지역 설정 무관) |
| `packages/sim/src/events/eventQueue.ts` | 차례 함수를 받을 수 있게(없으면 전과 같음) |
| `packages/sim/src/ledger/ledgerBook.ts`(새)·`audit.ts`(새)·`ledgerBook.test.ts`(새) | 원장 장부 한 벌 + 메모리 불변 조건 감사 |
| `packages/sim/src/settle/owner.ts`(새)·`owner.test.ts`(새) | 소유 주체 정산을 서버에서 옮김(유지비·산출 거래, 나눠도 같음 시험) |
| `packages/sim/src/simulator/*`(새) | 실행 루프·시나리오·세계·대리 규칙·지표 기록기·실행 + 시험 |
| `packages/sim/src/index.ts` | 위 공개 |
| `packages/sim/cli/*`(새), `packages/sim/scenarios/*`(새) | 실행·속도 도구, 시나리오 |
| `packages/sim/package.json`, `pnpm-lock.yaml` | `sim`·`sim:speed` 명령, typecheck에 `cli/`, 실행 도구가 팩을 읽으려고 `@terra/content`(작업공간, 원래 허용된 방향) |
| `apps/server/src/economy/ledger.ts` | 공용 장부 + DB 쓰기 고리(쓰는 행은 전과 같음) |
| `apps/server/src/world/settlement.ts` | 판정은 `settleOwnerPeriod`를 부르고 결과만 적음. 시험 자산 상수는 sim에서 다시 내보냄 |
| `apps/server/src/world/scheduler.ts`, `secondMap.ts` | 스케줄러가 차례 함수를 받고 2차맵 예약이 `compareEventKeys`를 씀. restore의 따로 된 정렬(`localeCompare`) 지움 |
| `apps/server/src/world/invariants.ts` | 불변 조건 문구를 sim 상수로(메모리 감사와 같은 문구) |
| `docs/adr/2026-10-31-rules-simulator.md`(새) | 시뮬레이터 구조 결정(제안) |
| `AGENTS.md` | 7장 명령 표에 `sim`·`sim:speed` |

## 함께 바꿔야 하는 파일
- 장부 판단을 바꾸면 서버 원장과 시뮬이 같이 바뀐다(`ledgerBook.ts` 하나). 원장 불변 조건 문구를 바꾸면 서버 SQL 검사(`invariants.ts`)와 감사(`audit.ts`)가 같은 상수를 쓴다.
- 출력 줄 모양을 바꾸면 `SIM_OUTPUT_FORMAT`(`simulator/run.ts`)을 올린다(관전판·관리자 화면이 읽는다).
- 진짜 규칙(R2~R5)은 `simulator/stubRules.ts` 자리에 들어간다. 세계 모양(`world.ts`)과 하루 줄 칸(`metrics.ts` `FactionDay`)을 함께 넓힌다.

## 건드리지 말 것
- `simulator/stubRules.ts`의 결과(요약의 D-391 통과 표시)를 판단에 쓰지 않는다. 대리 규칙이라 의미가 없다(지금 시드 1~5가 셋 다 "통과"로 나오지만 우연이다).
- `packages/sim/src/`에 실제 시각·Node API를 넣지 않는다(결정성 검사). 시간 재기·파일은 `cli/`.

## 미검증·TODO·알려진 문제
- main과 겹치는 파일은 없었다(Verified: `git diff --name-only`).
- NAS에서는 재지 않았다(Unknown). 조정용이라 개발 컨테이너면 된다(ADR `n1-real-time-gate`).
- 관전판 화면(`/dev` 밑)은 만들지 않았다. 출력 형식만 그래프용으로 맞췄다(ADR 6절).
- 콘텐츠 팩 분류(국가 프리셋·아이템·레시피·시설)는 미뤘다(R2·R4, ADR 4절). 기술 순서 ADR R1 행과 다르다.
- 서버 관리 명령(`cli.js simulate`)은 만들지 않았다. 서버 이미지에서 돌릴 일이 생기면 `runSimulation`을 부르는 명령 하나를 더한다.
- `PROTECTED.md`의 "생성되면 추가할 보호 대상: 원장·거래소 코드"는 그대로 두었다. 원장 장부가 `packages/sim/src/ledger/`로 옮겨 왔으니 통합 담당이 줄을 옮길지 본다.
- S3 ADR 1절의 "예약 큐는 넣은 차례를 지키므로 큐는 고치지 않았다"는 이제 맞지 않는다(이 ADR 2절). S3 ADR을 확정할 때 표시한다.

## 사용자 결정 대기
- 없음(조율자 판단 몫: 위 미룬 두 가지).
