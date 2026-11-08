# 공성 결과 DB 시험 가끔 실패 고침

- 일시: 2026-11-08 23:05 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-08-war-outcomes-d527.md`, main CI(`b109825`) 실패

## 한 일
- main CI에서 `warOutcomes.db.test.ts`의 "재건 뒤 다시 전쟁" 확인이 실패했다. 우리 컨테이너에서도 4번 중 2번 실패해 재현했다(**Verified**: 실행).
- 원인: 재건하는 하루 끝에서 다시 전쟁은 제대로 걸린다. 그 뒤 `npc.tick(true)`에서 NPC 판단이 그 둘의 강화를 맺을 때가 있다(판단 시각에 따라 갈림). 게임 규칙대로 도는 것이라 코드 결함은 아니다(**Verified**: 임시 로그로 `resume` 다음 `makePeace`를 봤다. 로그는 지웠다).
- 고침: 다시 전쟁 확인을 하루 끝 바로 뒤, 틱 전으로 옮겼다. 고친 뒤 6번 모두 통과(**Verified**).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/npc/warOutcomes.db.test.ts` | 다시 전쟁 확인을 NPC 판단 틱 전으로 옮김 |

## 함께 바꿔야 하는 파일
- 없음

## 건드리지 말 것
- `packages/sim/src/simulator/society.ts`의 `resumeWar`·강화 규칙: 규칙대로 돈다.

## 미검증·TODO·알려진 문제
- NPC 강화 판단이 기록한 시각이 하루 끝 시각보다 이르다(판단 예약 시각을 그대로 쓴다). 시험과는 상관없고 지금은 그대로 둔다.

## 사용자 결정 대기
- 없음
