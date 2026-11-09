# 2차맵 이동 경로·목적지 표시

- 일시: 2026-11-09 21:20 (KST)
- 작업 도구: Claude Code
- 관련: 사용자 요청 2026-11-09 "2차맵에서 이동 클릭시 목적지와 경로를 표시하는 ui 추가", `docs/adr/2026-11-07-unit-control.md`, `docs/adr/2026-11-08-seamless-second-map.md`

## 한 일
- 땅을 눌러 보내면 누른 자리에 목적지 고리를 바로 둔다. 서버 경로가 오기 전에도 보인다.
- 서버 경로(`unit_paths`)가 오면 남은 경로를 땅 위 점선으로 그린다. 이미 간 부분은 지워지고, 끝에는 목적지 고리가 있다.
- 다 가거나 멈추면 경로와 고리를 거둔다. 명령 뒤 5초 안에 움직이지 않으면(거절·길 없음) 고리를 거둔다.
- 보이는 유닛: 내가 다룰 수 있는 고른 유닛 하나뿐이다(내 유닛, 운영자 모드면 아무 유닛). 남의 유닛 경로는 그리지 않는다.
- 옆 2차맵 땅을 눌러 보낼 때(travel_start)도 누른 자리에 고리를 둔다. 경로는 그 구간(변 끝까지)만 그린다. 거절되면 고리를 거둔다. 넘으면(rebase) 옛 좌표라 지운다.
- 정한 것(사용자가 정하지 않아 기본값으로 고름):
  - 색은 선택 고리와 같은 노랑(`HIGHLIGHT_COLOR`)이고, 가장자리는 유닛 테두리 색이다.
  - 굵기는 화면 6px다(가까이·멀리 같은 굵기).
  - 땅·언덕에 가려지지 않게 깊이 검사를 껐다. 언덕 뒤 경로도 보인다.
- 서버·프로토콜은 바꾸지 않았다. 클라이언트가 이미 받던 경로를 그린다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/units/routePath.ts` (+ `.test.ts`) | 새 파일. 경로를 0.5칸 간격으로 자르기(`drapeRoute`), 목적지 표시 수명(`createTargetLife`) — 순수 함수 |
| `packages/engine/src/units/routeView.ts` | 새 파일. 점선 띠(셰이더가 너비·간 부분 지우기)와 목적지 고리 |
| `packages/engine/src/units/unitMotion.ts` (+ 시험) | 경로 판(`revision`), 경로 점(`pathPoints`), 간 길이(`travelled`) 읽기 |
| `packages/engine/src/secondMapEngine.ts`·`engineTypes.ts`·`engineParts.ts` | `setRouteUnit`·`setMoveTarget` API, 프레임마다 경로 갱신, 넘을 때 지우기, 통계 `routePoints`·`moveTarget` |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 다룰 수 있는 고른 유닛을 경로 표시 유닛으로 |
| `apps/game/src/map/useMapEngine.ts` | 땅을 눌러 보내면 `setMoveTarget`, 옆 2차맵 보내기에 목적지 표시 연결 |
| `apps/game/src/map/neighbourTravel.ts` | `markTarget`(보낼 때 두고 거절되면 거둠) |
| `apps/game/src/map/mapHudData.ts` | `data-route` = "경로 점 수,목적지 1/0"(화면 시험용) |
| `e2e/unit-control.spec.ts` | 보내면 경로·고리가 보이고, 멈추면 `0,0`인지 확인 |

## 함께 바꿔야 하는 파일
- `SecondMapEngine` API를 바꾸면 `engineParts.ts`의 `inertEngine`도 같이 바꾼다.
- `EngineStats`에 칸을 더하면 `inertEngine`의 빈 통계에도 더한다.

## 건드리지 말 것
- 경로를 그리는 유닛은 화면이 정한다(`setRouteUnit`). 엔진이 소유권을 판단하지 않는다(남의 유닛 경로를 그리지 않는 것은 화면 몫).

## 미검증·TODO·알려진 문제
- 실제 휴대폰에서 굵기·색이 잘 보이는지 보지 않았다(미검증). 헤드리스 사진으로만 봤다(아래 "검사").
- 2차맵 사이 이동은 지금 구간(변 끝까지)의 경로만 그린다. 다음 2차맵의 경로는 넘은 뒤 그 구간 경로가 오면 그린다. 옆 2차맵의 목적지 고리는 넘으면 사라진다.
- `secondMapEngine.ts`가 733줄이다(600줄 경고, 바꾸기 전 689줄). 1,000줄 전에 나눠야 한다.

## 사용자 결정 대기
- 색·굵기·언덕 뒤에도 보이기는 기본값으로 골랐다. 바꾸고 싶으면 알려 준다.
- main 합치기·NAS 배포: 사용자 승인(2026-11-09 "다른 작업 없으면 진행"). 최신 main 위에 다시 올리며 충돌 5곳을 손으로 풀었다(`SecondaryMapScreen.tsx` 한눈 정보·`mapHudData.ts` 가시거리 칸·`useMapEngine.ts` 옆 2차맵 누르기의 정보 판 닫기·`neighbourTravel.ts` 안내 모양·`secondMapEngine.ts` 가시거리 단계 — 모두 양쪽을 합침).

## 검사
- 엔진·2차맵 단위 시험 640개 통과, 타입 검사·biome·oxlint 통과(Verified).
- 화면 시험(Playwright, 헤드리스): `unit-control` "땅을 눌러 보내고 [멈추기]로 세운다"가 통과했다. 이 시험이 보내면 `data-route`의 점 수 > 0·목적지 1, 멈추면 `0,0`인지 본다. `seamless` "옆 2차맵 땅 누르기"도 통과했다(Verified).
- 사진(`unit-control-moving-390`, 파스텔)을 눈으로 봤다: 사이보그 선택 고리에서 목적지 고리까지 노란 점선이 이어진다. 다크 테마 사진은 찍지 않았다. 지도 그림이라 테마 토큰과 상관없다(Assumed).
