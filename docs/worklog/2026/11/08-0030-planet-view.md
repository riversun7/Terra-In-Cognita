# 지도 보기: 확대 단계 표시, 검은 우주·항성계 보기, 극축 고정 회전, 항성계 편집기 정리

- 일시: 2026-11-08 00:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-planet-view.md`(제안), 질문 `docs/questions/2026-11-07-planet-view.md`(650~656), 가지 `work/planet-view`

## 한 일
- 사용자 개선 요청(2026-11-07) 1·2를 넣었다: "맵에서 확대 단계나 확대단계 표시 필요. 1차맵 확대시 우주 배경이 검은색으로 표현되어야하고 더 축소시 항성계가 보여지게 해야함. 개발자페이지에서도 항성계 시스템은 매우 엉망 / 1차맵에서 행성 회전이 극지방 축이 어느정도 고정되었으면 좋을듯."
- 엔진
  - 돌림판(`turntable.ts`): 화면 위쪽 = 북쪽, 목표점 위도 ±80°. 끌기·확대 모두 손가락 아래 땅을 닫힌 식으로 따라간다(위도 → 동쪽 축 회전, 경도 → 극축 회전). 놓으면 관성(τ 325ms, 동작 줄이기면 없음). 두 손가락 회전·오른쪽 끌기 방위는 없앴다.
  - 확대 단계(`zoomStages.ts`): 카메라 거리 한계를 로그 눈금 다섯 등분, `stats().zoomStage`·`onZoomStage`·`zoomStep(±1)`·`initialStage`.
  - 끝 너머 밀기(`camera/zoomPush.ts`): 끝에 닿은 채 새로 시작한 줄이기·키우기가 1.15배 넘으면 `onZoomEdge`(1차맵·2차맵 엔진 둘 다). 2차맵 엔진에도 `zoomStep`.
  - 우주: 검정(`SPACE_COLOR` 0x000000) + 별 점 1,400개(`starfield.ts`).
  - 확대 움직임·관성은 `cameraMotion.ts`로 빼서 `planetEngine.ts`가 600줄 아래.
- 화면
  - 1·2차맵 위 판 줄(머리 판 옆)의 확대 단계 판(`map/ZoomLadder.tsx`): [−] "1차맵 3/5"(점 다섯)·"항성계"·"2차맵" [+]. 아래 판의 옛 "단계 N/5" 줄은 지웠다. 처음 둔 오른쪽 세로 판은 1차맵 아래 판과 겹쳐(사진) 옮겼다.
  - 1차맵: 1단계 끝에서 더 줄이면 항성계 보기(`map/PlanetSystemView.tsx`, 검정 바탕, 태양계 9천체, 지구 강조, 달 점, 고른 천체 카드), [+]·휠 위·두 손가락 벌리기·Esc·[행성으로 돌아가기]로 돌아온다. 5단계 끝에서 더 키우면 가운데 2차맵으로 들어간다(없으면 안내). [이 2차맵으로 들어가기]도 확대 단계 5 기준.
  - 2차맵: 가장 멀리에서 [−]나 한 번 더 줄이기 = 그 자리 1차맵 5단계(`/map/planet?key=…&stage=5`).
  - 항성계 그림(`space/StarSystemView.tsx`)을 1차맵·편집기가 같이 쓰는 우주 그림으로 바꿨다: 테마와 상관없는 `--color-space-*`, 이름표(HTML 층), 먼지 점 소행성대, 가스 행성·위성, 하늘색 고름·노란 지금 행성, 로그 눈금(1차맵).
  - 항성계 편집기: 휴대폰은 화면 전체 스크롤 + 이름 줄만 위에 붙음, 머리 줄 [뒤로]·제목·[새 항성계] / 고르기 한 줄, [항성계 지우기]는 판 맨 아래 지우기 칸, 카드 제목 여백, 그림 이름표(천체 이름 + AU).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/turntable.ts`·`.test.ts` | 돌림판 계산(극축 고정·위도 묶음·관성) |
| `packages/engine/src/planet/zoomStages.ts`·`.test.ts` | 확대 단계 1~5와 [+]·[−] 거리 |
| `packages/engine/src/camera/zoomPush.ts`·`.test.ts` | 끝 너머 밀기(1·2차맵 조작이 같이 씀) |
| `packages/engine/src/planet/cameraMotion.ts` | 확대 움직임·관성(엔진 파일 크기) |
| `packages/engine/src/planet/starfield.ts`·`.test.ts`, `planetView.ts` | 검은 우주 + 별 |
| `packages/engine/src/planet/globeControls.ts`, `planetEngine.ts`, `planetTypes.ts`, `inertPlanetEngine.ts`, `globeCamera.ts` | 돌림판 조작·단계 API·관성 연결(`fallbackForward` 내보냄) |
| `packages/engine/src/camera/controls.ts`, `secondMapEngine.ts`, `engineTypes.ts`, `engineParts.ts` | 2차맵 끝 너머 밀기·`zoomStep` |
| `apps/game/src/map/ZoomLadder.tsx`·`zoomLadder.css` | 확대 단계 판(1·2차맵) |
| `apps/game/src/map/PlanetSystemView.tsx`·`planetSystem.css` | 1차맵 항성계 보기 |
| `apps/game/src/map/PlanetMapScreen.tsx`, `planetMap.css` | 단계 판·항성계 보기·끝 처리·`?stage=` 연결, 옛 단계 줄 지움 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 2차맵 단계 판·끝에서 1차맵 5단계 |
| `apps/game/src/space/StarSystemView.tsx`·`starSystemView.css`·`starSystemLayout.ts`(+시험) | 같이 쓰는 우주 그림(천체 보기 모양, 이름표, 로그 눈금) |
| `apps/game/src/space/homeSystem.ts`·`spaceMessages.ts` | [임시] 태양계 자료·이름(D-5067·D-366) |
| `apps/game/src/editor/starSystem/StarSystemScreen.tsx`·`starSystem.css` | 편집기 틀 정리·새 그림 연결 |
| `apps/game/src/styles/tokens.css` | 우주 그림 색 `--color-space-*`(테마와 상관없음) |
| `apps/game/messages/{ko,en}.json` | 단계 판·항성계 보기·천체 이름·편집기 문구(ko·en) |
| `packages/shared/src/routes.ts`(+시험) | `map_planet` 주소에 `stage` |
| `e2e/planet-view.spec.ts` | 화면 시험(단계·항성계 보기·끝 넘기기·돌림판·사진) |
| `docs/adr/2026-11-07-planet-view.md`, `docs/questions/2026-11-07-planet-view.md`, `docs/PLAN.md` 14장 | 결정·확인 대기 650~656 |

## 함께 바꿔야 하는 파일
- 우주 색을 바꾸면 `packages/engine/src/planet/planetView.ts` `SPACE_COLOR`와 `tokens.css` `--color-space`를 같이 바꾼다.
- 항성계 자료가 콘텐츠 팩으로 오면(질문 650) `apps/game/src/space/homeSystem.ts`를 지우고 `PlanetSystemView.tsx`가 그 자료를 쓴다.
- 1차맵 주소에 매개변수를 더하면 `packages/shared/src/routes.ts`와 `routes.test.ts`를 같이.

## 건드리지 말 것
- `zoomPush`의 "끝에 닿은 채 시작한 묶음만" 규칙: 지우면 `e2e/vision.spec.ts`처럼 쭉 줄이는 손짓이 2차맵에서 1차맵으로 튕긴다.
- 별 점은 깊이를 보지도 쓰지도 않고 맨 먼저 그린다(`renderOrder` 가장 작음). 바꾸면 행성 위에 별이 비친다.

## 미검증·TODO·알려진 문제
- 검사(마지막 한 번, 2026-11-08): 메시지 다시 만들기 → `TEST_DATABASE_URL=… pnpm check` 통과(시험 파일 480·시험 3,798, DB 시험 포함) → `pnpm check:docs origin/main` 통과 → `pnpm e2e planet-view.spec.ts star-system.spec.ts` 23개 통과(2.9분). 그 전 두 번은 실패해서 고쳤다: 휠 시험(헤드리스 휠 한 번 배율이 문턱 1.25보다 작음 → 문턱 1.15, 가장 멀리면 크기가 바뀌어도 가장 멀리), 돌림판 시험(끌기 시작점이 성능 판 위 → 지도 띠로, 느린 소프트웨어 WebGL이라 멀리서·적게).
- 사진(390px 파스텔·다크 × 한국어·영어, 1440px, 개발 화면 네온·라이트 390·1440): `planet-view-ladder-390-*`·`planet-view-system-390-*`·`planet-view-system-1440-pastel-ko`·`planet-view-stage1-1440-pastel-ko`·`planet-view-local-390-*`·`star-system-390-*`·`star-system-1440-*`(세션 임시 폴더, 저장소 밖).
- 390px 항성계 보기에서 화면 틀의 1·2차맵 전환 단추(오른쪽 가운데)가 그림 오른쪽 끝 바깥 궤도 일부를 가린다(이름표는 가리지 않음, 사진 확인).
- 빌드·`check-pwa`·`check:bundle`은 돌리지 않았다(줄기 지침: 합칠 때). 첫 화면 JS 크기는 Unknown(새 코드는 지도·편집기 지연 조각, Assumed).
- 휴대폰 실기기(터치 관성·두 손가락 돌아가기)는 보지 않았다(헤드리스 마우스·휠만).
- 옛 자유 회전 함수(`dragGlobe`·`rotateHeading`·`zoomAround`)는 쓰는 곳이 없다(시험만). 다음 정리 후보.
- D-107 단계별 정보 층(1~2단계 도시 이름만, 5단계 부대 묶음 등)은 아직 단계에 묶지 않았다(다음 줄기, 도시 표시는 `work/world-layout`).

## 사용자 결정 대기
- 질문 650~656(항성계 자료 출처·편집기 극 묶음·단계 경계·들어갈 2차맵이 없을 때·손짓 규칙·다른 천체·별).
