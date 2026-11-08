# 사용자 지적 묶음 2 합치기 (성향·지도 조작·옆 2차맵·NPC 국가·채집소·건물 모양)

- 일시: 2026-11-08 12:40 (KST)
- 작업 도구: Claude Code
- 관련: 통합 가지 `merge/integration`(시작 = main a366ef2). 사용자 지적 2026-11-08(문제 목록 8개, 기획 D-523). ADR `2026-11-01-first-login-cyborg.md`(바뀜: 기술 성향)·`2026-11-08-map-input.md`·`2026-11-07-play-flow.md`(WP14·WP-NPC)·`2026-11-07-gather-objects.md`(바뀜: 채집소)·`2026-11-08-building-art.md`

## 한 일
- 여섯 줄기를 차례로 합쳤다.
  1. `work/creation-fix` (ad40cf0): 기술 성향 = DEX·AGI.
  2. main f897b59(미러 dbbf450, D-523).
  3. `work/map-travel` (b765ffc): 충돌은 목차뿐.
  4. `work/npc-presence` (8060626): 충돌 PLAN 14장 줄·play-flow ADR(WP14와 WP-NPC 절을 둘 다 남김)·목차.
  5. `work/building-art` (cbebba8): 충돌 `SecondaryMapScreen.tsx` 가져오기 두 줄(정부 판·건물 겉모습 둘 다), PLAN 줄, 목차.
  6. `work/gather-station` (0ae7373): 충돌 PLAN 줄·목차. 팩은 두 줄기 모두 core@52로 올려 같은 값.
  7. `work/map-input` (0606269): 이 줄기가 통합 가지(3b2d4d5)를 먼저 합치고(채집 덧그림 충돌을 그쪽에서 풂, 정부 판 조회 시험의 가짜 건물에 건물 모델 줄기가 더한 `placement`를 넣음) 묶음 전체로 `pnpm check`·화면 시험을 돌린 뒤 빨리감기로 올렸다.
- 판: 프로토콜 17(최소 16) 그대로, 팩 core@52, `SIM_VERSION` 20 그대로, 마이그레이션 없음.
- 묶음 검사:
  - `pnpm check`: map-input 줄기가 묶음 머리 바로 앞(문서 커밋 하나 차이)에서 돌림, 시험 522파일 3,998개 통과(DB 시험 포함).
  - 통합 가지 머리에서: `check:docs`·`check:content`(core@52) 통과, 빌드·`check-pwa` 통과, `check:bundle` 첫 화면 JS 106,407 B / 상한 131,416 B.
  - 화면 시험: 통합 가지 머리에서 control-move3·planet-view·faction·produce·facilities·labor·recruit·first-login·economy 103개 통과. map-input 줄기가 같은 묶음에서 map-input·unit-control·building-art·gather-station·government·map-travel·gather·play-map·vision 75개 중 73 통과·1 건너뜀(측정용)·1 실패(시험 누를 자리) → 고친 뒤 map-input·unit-control 14개 통과.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/game/src/map/SecondaryMapScreen.tsx` | 정부 판·건물 겉모습 가져오기 충돌을 둘 다 남김 |
| `docs/PLAN.md`, `docs/adr/2026-11-07-play-flow.md`, `docs/WORKLOG.md` | 줄기들의 줄·절을 모두 남김, 목차 다시 만듦 |

## 함께 바꿔야 하는 파일
- 2차맵 위에 HTML 표시를 새로 놓으면 `pointer-events: none`으로 두고 누르기는 덧그림 층 `tap()`으로 받는다(ADR `2026-11-08-map-input.md`). 단추로 받으면 끌기가 다시 막힌다.
- `apps/server/src/world/secondMap.ts` 959줄, `world.ts` 979줄, `sim/src/index.ts` 약 986줄: 1,000줄 넘으면 CI 실패. 더하기 전에 나눈다.

## 건드리지 말 것
- 성향 ID(`tech` 등)는 DB에 저장된다. 바꾸지 않는다.

## 미검증·TODO·알려진 문제
- 휴대폰 손가락으로 재지 않았다(누르기 거리 10px, 건물 모델 프레임 p95).
- 넘는 순간 화면 바뀜(옆 2차맵)은 화면 시험이 없다(서버 넘기는 DB 시험).
- NPC 지도자는 서 있기만 하고 겉모습이 같다. 이름은 [임시]. 시장 "없음", 국적 바꾸기 없음.
- 반경 안 원자재가 없는 곳에 지은 옛 벌목장·광산은 일꾼이 있어도 산출이 멈춘다(판에 "원자재 없음").
- 질문 720~725·730~736·740~749·750~757·760~763은 기획 세션에 보낸다.

## 사용자 결정 대기
- 없음. 문제 6(NPC 세력)은 추천 해석으로 만들었다(ADR play-flow WP-NPC).
