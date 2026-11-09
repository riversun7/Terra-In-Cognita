# 2차맵 사이를 가는 중 [멈추기] 깜빡임 고침

- 일시: 2026-11-09 19:45 (KST)
- 작업 도구: Claude Code
- 관련: `docs/adr/2026-11-07-unit-control.md`, 작업 기록 `09-1700-map-tap-fix.md`(줄기가 찾은 문제), `docs/adr/2026-11-07-play-flow.md` WP9

## 한 일
- 내 사이보그가 2차맵 사이를 가는 중에 아래 [멈추기]가 나타났다 사라졌다 해서 누르기 어려웠다(map-tap-fix 줄기가 화면 시험 실패에서 봄).
- 원인(**Assumed**: 코드 읽기): 단추는 엔진의 "고른 유닛이 움직이는 중" 값만 봤다. 화면은 이 값을 1초마다 읽는다. 경로 구간 사이·2차맵 경계를 넘는 순간에는 엔진이 멈췄다고 보아 그 1초 동안 단추가 사라졌다.
- 고침:
  - 고른 유닛이 서버 travel 상태로 2차맵 사이를 가는 중이면 [멈추기]를 늘 보인다(`showStop`).
  - 2차맵 안 이동도 같은 유닛이 방금(2초 안) 움직였으면 움직이는 중으로 붙잡는다(`heldMoving`, `STOP_HOLD_MS`). 멈춘 뒤 최대 2초 단추가 남을 수 있다(누르면 아무 일 없음).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/map/anchorUnit.ts` | `heldMoving`·`showStop`·`STOP_HOLD_MS`(순수 함수) |
| `apps/game/src/map/anchorUnit.test.ts` | 위 두 함수 시험 |
| `apps/game/src/map/useMapEngine.ts` | 1초 읽기에서 같은 유닛의 마지막 움직임 시각을 들고 `heldMoving`으로 붙잡음 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | [멈추기] 조건을 `showStop`(가는 중 포함)으로 |
| `e2e/play-map.spec.ts` | WP9 시험: 가는 동안 4초간 0.25초마다 [멈추기]가 1개인지 본다 |

## 함께 바꿔야 하는 파일
- 가는 중 상태(`useTravelFollow`)는 내 사이보그만 본다. 1차맵에서 다른 내 유닛을 보내면(planet-travel) 그 유닛은 `heldMoving`만 쓴다. 다른 유닛도 가는 중 상태를 보려면 `useCyborgTravel`을 넓힌다.

## 건드리지 말 것
- 서버 `stop_unit`이 2차맵 사이 길도 끝낸다(map-tap-fix 확인). 단추가 보내는 명령은 그대로다.

## 미검증·TODO·알려진 문제
- 휴대폰에서 보지 않았다. 화면 시험 결과는 아래에 적는다.

## 사용자 결정 대기
- 없음
