# 세계 비우기 DB 시험의 연결 틈 고침 (main CI 빨강)

- 일시: 2026-11-08 08:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-08-world-reset.md`, CI run 263(main c6d29bd)

## 한 일
- main c6d29bd의 CI `check`가 `apps/server/src/cli/resetWorld.db.test.ts` 2개로 실패했다(3,932개 가운데). 첫째 시험이 시험 연결을 닫은 바로 뒤 `reset-world --wait 0`을 돌렸는데, 닫은 연결이 PostgreSQL 연결 목록(`pg_stat_activity`)에 아직 2개 남아 보여 "다른 연결 있음"(종료 코드 3)으로 거절됐다. 둘째 시험은 첫째가 비운 세계를 써서 따라 실패했다. 로컬(PostgreSQL 16)에서는 통과했고 CI(18.6)에서 났다 — 시험 쪽 틈이다(도구 동작은 맞다: 앱이 떠 있으면 거절).
- 첫째 시험이 운영 워크플로처럼 `--wait 10`으로 기다리게 했다(1초마다 다시 보고, 연결이 사라지면 바로 진행). 거절을 보는 시험(`--wait 0`)은 그대로다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/cli/resetWorld.db.test.ts` | 닫은 연결이 목록에서 빠질 때까지 기다림 |

## 함께 바꿔야 하는 파일
- 없음.

## 건드리지 말 것
- `reset-world`의 다른 연결 거절(앱이 떠 있으면 지우지 않음)은 그대로 둔다.

## 미검증·TODO·알려진 문제
- CI(PostgreSQL 18)에서 다시 돌려 확인한다. 통과하면 NAS 배포 뒤 세계 비우기 워크플로를 돌린다(D-522).

## 사용자 결정 대기
- 없음.
