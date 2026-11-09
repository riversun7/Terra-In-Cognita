# 2차맵 가까이 볼 때 가시거리: 더 눕히기, 화면이 보는 땅에 소품, 가시거리 자동 조절

- 일시: 2026-11-09 17:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-28-s1-second-map.md` "바뀜 (2026-11-09, 가까이 볼 때 가시거리)", `2026-11-08-map-input.md`(확대 단계), 가지 `work/map-viewdist`

## 사용자 지적
- 휴대폰, NAS, 2차맵, 운영자 계정. 사진 5/5·3/5. 휴대폰 120fps, p95 8ms.
- "주변시야가 왜 확대하면 더 안보이냐 오히려 축소하면 더 보이고 fps충분하면 가시거리 늘려라"

## 원인 진단 (Verified: 코드 읽기 + 헤드리스 측정)
| 후보 | 결과 |
|---|---|
| 카메라 기울기 | **원인 1.** 기울기가 거리와 상관없이 45°(`cameraMath.ts` `DEFAULT_PITCH_RAD`)다. 세로 시야각 40°라 화면 위 끝 시선이 수평 아래 25°다. 가장 가까이에서 화면 위 끝 땅이 화면 가운데 땅에서 약 96m(390×844) ~ 126m(411×784 휴대폰, 5/5 대표 거리) 앞까지만 보였다 |
| 소품 모델 범위 | **원인 2.** 나무·바위 모델은 카메라 목표 둘레 원에만 섰다. 반지름 = max(60m, 화면 짧은 변 × 0.8)이다(`propView.ts`). 5/5에서는 60m라 화면 위쪽 띠(목표에서 60m 너머)에 나무가 없고 땅 색만 보였다. 3/5에서는 원이 수백 m라 화면 대부분에 나무가 섰다 → "축소하면 더 보인다" |
| 먼 면(far plane) | 원인 아님. `거리 + 2차맵 한 변 × 2 + 500m`라 지형 전체가 들어간다 |
| 거리 안개 | 없다(`scene.fog` 없음) |
| 지형·이웃 청크 | 원인 아님. 지금 2차맵 전체와 받은 이웃을 늘 다 그린다. 이웃은 목표가 경계 20% 안일 때 받는다(앱 `secondMapNeighbours.ts` `NEAR_EDGE`) |
| 탐사 안개(시야) | 게임 규칙(ADR 26). 바꾸지 않았다 |

## 한 일
- 가까이 눕힘(`packages/engine/src/camera/cameraMath.ts`)
  - 그린 기울기 = 사용자 기울기 − 눕힘이다. 눕힘은 확대(거리 ÷ 가장 가까운 거리) 1.5배까지 15°, 4배부터 0이고, 사이는 로그 거리에 smoothstep이다.
  - 기본 45°면 5/5에서 30°, 3/5 이하에서 45°다.
  - 그린 기울기 하한은 28°(시야각/2 + 8°)다. 화면 위 끝 시선이 늘 수평 아래라 지평선이 보이지 않는다(ADR 규칙 유지).
  - `CameraState.basePitch`(사용자 기울기, 선택 칸)를 더했다. `clampCamera`·`withViewPitch`가 거리로 `pitch`를 정하고, `orbit`은 `basePitch`를 바꾼다.
  - 확대 단계 미끄러짐(`cameraGlide.ts`)과 엔진 `applyCamera`도 거리를 바꾼 뒤 기울기를 맞춘다.
- 화면이 보는 땅에 소품(`props/propArea.ts` 새 파일, `props/propView.ts`)
  - 세우는 땅 = 네 모서리 아래 땅(목표점 높이 평면)의 사다리꼴 ∩ 목표점 둘레 가시거리 원(24각형으로 자름)이다.
  - 화면 뒤·옆 밖에는 모델을 쓰지 않는다. 상한을 넘으면 화면 아래 가운데 땅(보는 사람 쪽)에 가까운 칸부터 세운다.
  - 세운 땅을 둘레 여유(가시거리 × 0.1, 12~40m)만큼 넓혀 둔다. 지금 보는 땅의 꼭짓점이 모두 그 안이면 다시 세우지 않는다(볼록이라 전체가 안). 보는 땅이 절반 아래로 줄면(확대) 다시 세운다.
- 가시거리 자동 조절(`render/viewDistance.ts` 새 파일)
  - 단계 다섯: 가시거리 120·180·250·340·450m, 모델 상한 2,500·3,500·5,000·7,000·9,000. 처음은 가운데(250m·5,000)다.
  - 엔진 `frame`이 이어 그린 프레임 간격(화면 전체)과 엔진 시간을 넣고, 0.5초 묶음의 p95로 판정한다.
  - 올리기: 간격 p95 ≤ 20ms이고 엔진 p95 ≤ 6ms인 묶음이 6개(3초) 이어질 때.
  - 내리기: 간격 p95 > 28ms거나 엔진 p95 > 12ms인 묶음이 3개(1.5초) 이어질 때.
  - 문턱 사이 묶음은 이어진 수를 비운다(히스테리시스). 바꾼 뒤 첫 묶음은 버린다. 정지 화면(그리기를 쉼)에서는 단계를 그대로 둔다.
  - 값은 모두 상수다(한국어 주석).
- 화면: 운영진 성능 판에 "가시거리 Nm · n단계 · 소품 N" 줄(`map_perf_view`, ko·en)을 더했다. 시험 표지는 `data-view-level`·`data-view-reach`다.
- 개발자 2차맵 시험(`/dev/second-map-lab`): `propCap`을 주면 단계 상한 대신 그 값을 쓴다. 기본값을 2,500 → 5,000(처음 단계)으로 바꿨다.

## 잰 값 (헤드리스 Chromium + SwiftShader, 390×844, dev 계정 운영자 보기, 낮밤 끔 — 휴대폰 값이 아니다)
MEASURE_TABLE

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/camera/cameraMath.ts` | 가까이 눕힘(`closeTilt`·`viewPitch`·`withViewPitch`), `basePitch` |
| `packages/engine/src/camera/cameraGlide.ts` | 확대 미끄러짐 뒤 기울기 맞춤 |
| `packages/engine/src/props/propArea.ts` | 화면이 보는 땅 ∩ 가시거리 원(새 파일) |
| `packages/engine/src/props/propView.ts` | 원 대신 보는 땅에 세움, `setReach`, 다시 세우기 조건 |
| `packages/engine/src/render/viewDistance.ts` | 가시거리 자동 조절(새 파일) |
| `packages/engine/src/secondMapEngine.ts` | 조절기·보는 땅 연결, 요약 `viewLevel`·`viewReachM` |
| `packages/engine/src/engineTypes.ts`, `engineParts.ts` | 요약 칸 |
| `apps/game/src/map/MapPerfPanel.tsx`, `messages/{ko,en}.json` | 성능 판 가시거리 줄 |
| `apps/game/src/map/mapHudData.ts` | 시험 표지 `data-view-level`·`data-view-reach` |
| `apps/game/src/editor/secondMapLab/SecondMapLabScreen.tsx` | 개발자 시험 기본 상한 5,000 |
| 시험: `cameraMath.test.ts`, `propArea.test.ts`, `viewDistance.test.ts`, `e2e/map-viewdist.spec.ts` | 눕힘·보는 땅·조절기, 화면 시험·측정 |
| `docs/adr/2026-10-28-s1-second-map.md` | "바뀜 (2026-11-09)" 절 |

## 함께 바꿔야 하는 파일
- 기울기 상수를 바꾸면 `cameraMath.test.ts` "가까이 눕힘"과 `e2e/map-viewdist.spec.ts`(5/5 기울기 < 40°, 위 끝 > 200m)를 같이 본다.
- 가시거리 단계 표를 바꾸면 `propView.ts` 기본값(`MAX_PROPS`·`PROP_REACH_M`은 처음 단계에서 읽는다)과 개발자 시험 기본 상한을 본다.

## 건드리지 말 것
- 탐사 안개(시야) 규칙, 처음 5/5, 확대 단계 수 5는 이 일에서 바꾸지 않았다(사용자 규칙).
- 2차맵 UI 판 파일(`SecondaryMapScreen.tsx`, `UnitControlPanels.tsx` 등)은 다른 줄기가 고친다. 이 일은 손대지 않았다.

## 미검증·TODO·알려진 문제
- 휴대폰에서 단계가 실제로 오르는지, 450m·9,000개에서 휴대폰 p95는 재지 않았다(Unknown). 헤드리스 SwiftShader는 6fps 안팎이라 단계가 맨 아래로 내려간다.
- 정지 화면에서는 프레임이 없어 단계가 오르지 않는다. 끌거나 유닛이 움직일 때만 잰다.
- 거리 안개는 넣지 않았다. 가시거리 끝에서 나무가 생기는 경계는 땅 색(소품 색 섞기)이 이어 줘 눈에 덜 띈다(Assumed, 휴대폰에서 확인할 것).
- 이웃 2차맵은 목표가 경계 20%(약 300m) 안일 때만 받는다. 5/5로 경계를 바라보면 화면 위 끝이 받기 전의 빈 하늘에 닿을 수 있다(전에도 3/5 이하에서 같았다).

## 사용자 결정 대기
- 가까이 눕힘 정도(지금 5/5에서 30°). 더 멀리 보려면 하한 28°까지 내릴 수 있다.
