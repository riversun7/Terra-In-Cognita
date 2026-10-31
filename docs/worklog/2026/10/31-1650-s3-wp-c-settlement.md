# S3 WP-C: 오프라인 정산·최소 원장·접속 상태·복귀 요약 생산 칸

- 일시: 2026-10-31 16:50 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-s3-server-stage.md` 4절·"구현하며 정한 것 (WP-C)", ADR 5·8·37, 기획 D-061·D-136·D-144·D-150·D-162·D-6014, 앞 작업 기록 `2026/10/31-1525-s3-wp-a-persistence.md`

## 한 일
- `packages/sim`에 정산 해결 함수(직무 일·쉼·피로, 접속 상태별 끝, 유지비 경계)를 넣었다. 나눠 정산해도 같다.
- 서버에 원장(메모리 잔고 + 쓰기 대기열), 소유 주체 단위 정산(접속 상태가 바뀔 때·주기·요약 조회 전), 접속 상태(모든 연결이 끊긴 시각), 시험 일꾼·시험 화폐 함수를 넣었다.
- 복귀 요약: 확인 시각 표와 `summary.ack`, 생산 칸(시험 자원). 기기는 요약을 닫을 때 확인을 보낸다.

## 검사·측정
- `TEST_DATABASE_URL=postgres://terra@127.0.0.1:55432/postgres pnpm check` 통과: 시험 파일 203개·시험 1,929개(새 `settle.test.ts` 6개, `settlement.db.test.ts` 3개, 요약·문 시험 더함).
- `pnpm e2e` 60개 통과(3.6분). 요약 닫기에 확인 보내기가 더해져 돌렸다(화면 모양은 그대로).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/settle/settle.ts`(새)·`settle.test.ts`(새), `packages/sim/src/index.ts` | 정산 해결 함수 |
| `apps/server/src/economy/ledger.ts`(새) | 원장 |
| `apps/server/src/world/settlement.ts`(새)·`settlement.db.test.ts`(새) | 정산·접속 상태·시험 함수 |
| `apps/server/src/world/summarySources.ts`(새) | 복귀 요약 생산 칸·확인 시각 |
| `apps/server/src/world/world.ts`, `persist/load.ts` | 원장·정산 연결, 접속 상태 읽기, 시험 NPC 화폐 |
| `apps/server/src/session.ts`, `apps/server/src/app.ts` | 연결마다 접속 상태, 요약 자료를 tRPC 맥락에 |
| `apps/server/src/summary/summary.ts`·`summary.test.ts`, `home/services.ts`, `trpc/{context,createContext,summary}.ts` | 요약 자료(출처 + 확인 시각), `summary.ack` |
| `apps/server/src/world/world.db.test.ts` | 접속 기록이 생기고 끊긴 시각이 적히는지 |
| `apps/game/src/summary/summaryGate.ts`·`summaryGate.test.ts`, `apps/game/src/net/homeQueries.ts` | 닫을 때 확인 보내기 |
| `docs/adr/2026-10-31-s3-server-stage.md` | 구현하며 정한 것 (WP-C) |

## 함께 바꿔야 하는 파일
- 직무 종류를 더하면 `packages/sim/src/settle/settle.ts`의 `jobCutoffMs`와 시험을 같이 고친다.
- 정산 결과에 새 원장 거래를 더하면 `world/invariants.ts`의 원장 검사가 그대로 덮는지 본다(자산 코드만 다르면 덮는다).

## 건드리지 말 것
- 원장 거래·항목은 고치거나 지우지 않는다(DB 트리거가 막는다). 바로잡기는 반대 거래로 한다.

## 미검증·TODO·알려진 문제
- 직무는 제자리 일이다(걷기·생활 시설 없음, 기획 질문 S3-Q3~Q5). 수치는 모두 임시다.
- 시험 일꾼을 기기에서 받는 길은 WP-B 시험 명령으로 낸다(아직 없음).
- NAS에서는 아직 돌리지 않았다.

## 사용자 결정 대기
- 없음.
