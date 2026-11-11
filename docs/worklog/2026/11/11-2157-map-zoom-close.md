# 2차맵 확대 6단계(가장 가까이 15m)·고른 표시 고리 땅 가림 고침

- 일시: 2026-11-11 21:57 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-11-character-3d.md` "바뀜 (2026-11-11, 962)", `docs/adr/2026-11-08-map-input.md`·`docs/adr/2026-10-28-s1-second-map.md` "바뀜 (2026-11-11 …)", 질문 `docs/questions/2026-11-11-map-zoom-close.md`(996), 기획 정리 D-529 포인터(기술 질문 962 나), 가지 `work/map-zoom-close`

## 한 일
- 2차맵 가장 가까운 확대를 화면 짧은 변 40m → 15m로 당기고 확대 단계를 다섯 → 여섯으로 했다(같은 거리 비 로그 눈금 규칙 그대로). 휴대폰에서 키 1.8m ≈ 47px(옛 18px).
- 들어오면 6/6(새 가장 가까이) — 사용자 지시 "진입시 항상 최대 확대"를 글자 그대로. 걸어서 넘을 때는 단계 그대로(손대지 않음).
- 가까이 눕힘 기준을 짧은 변 40m 거리로 고정(눕힘 띠가 옛날과 같고 6단계는 다 눕힌 30°). 엔진 기본 처음 거리는 짧은 변 70m에서 구하게, 개발자 2차맵 시험 처음 배율 9 → 24(보이는 범위 그대로).
- 사다리: "2차맵 n/6" + 점 여섯(1차맵 n/5 그대로). 메시지 `zoom_value_stage` 값 `{stage}/{stages}`(ko·en).
- 고른 표시 고리(노랑)가 땅에 가려지는지 화소로 확인했다: 처음 연 2차맵 땅 위에서는 보였고, 옆 2차맵으로 화면 안에서 넘은 뒤(이웃 지형을 지금 지형으로 들임)에는 가려졌다(노란 고리 0화소, 나라 색 고리만 보임). 까닭 = three.js가 renderOrder가 같은 불투명 물체를 재질 번호 차례로 그리는데 이웃 지형 재질이 고리보다 나중에 만들어진다. renderOrder 18.5로 고쳤다(나라 색 고리 18 뒤, 경로 고리 19 앞).
- 화면 시험의 확대 단계 수를 고쳤다(5 → 6, "한 단계 줄여 4" → "두 단계 줄여 4" 등). 새 화면 시험 `e2e/selection-ring.spec.ts`, 엔진 시험 `units/unitView.test.ts`.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/camera/cameraMath.ts` | `CLOSE_VIEW_SPAN_M` 15, `TILT_REFERENCE_SPAN_M`·`tiltDistance`(눕힘 기준 40m), 처음 거리 = 짧은 변 70m |
| `packages/engine/src/camera/secondMapZoom.ts` | `LOCAL_ZOOM_STAGES` 6, 주석 |
| `packages/engine/src/index.ts` | `LOCAL_ZOOM_STAGES` 내보냄(사다리 점 수) |
| `packages/engine/src/units/unitView.ts` | 고른 표시 고리 `SELECTION_RING_RENDER_ORDER` 18.5 |
| `packages/engine/src/engineTypes.ts`, `secondMapEngine.ts` | 주석(initialZoom 뜻, 단계 1~6) |
| `packages/engine/src/camera/*.test.ts`, `props/propArea.test.ts`, `units/unitView.test.ts` | 15m·여섯 단계·눕힘 기준·고리 차례 시험 |
| `apps/game/src/map/ZoomLadder.tsx` | 단계 수를 칸마다(1차맵 5, 2차맵은 화면이 넘김) |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 사다리에 `stages: LOCAL_ZOOM_STAGES` |
| `apps/game/messages/{ko,en}.json` | `zoom_value_stage` = `{stage}/{stages}` |
| `apps/game/src/editor/secondMapLab/SecondMapLabScreen.tsx` | 처음 배율 24(짧은 변 약 360m 그대로) |
| `apps/game/src/map/useMapEngine.ts`, `mapProbe.ts`, `secondMapNeighbours.ts` | 주석(6/6) |
| `e2e/character-3d.spec.ts` | 진입 6, 휴대폰 6/6 = 가까운 단계 모델·5/6 = 먼 단계 |
| `e2e/unit-control.spec.ts`, `seamless.spec.ts`, `control-move3.spec.ts`, `map-input.spec.ts`, `map-viewdist.spec.ts`, `building-art.spec.ts` | 단계 수 6 |
| `e2e/selection-ring.spec.ts` | 넘은 뒤 고른 표시 고리 화소 검사(새) |
| `docs/adr/…`, `docs/questions/2026-11-11-map-zoom-close.md` | 바뀜·질문 996 |

## 함께 바꿔야 하는 파일
- 2차맵 단계 수를 바꾸면 `secondMapZoom.ts` `LOCAL_ZOOM_STAGES` 하나만 고치면 사다리 점·글이 따라간다. 화면 시험의 단계 숫자(위 e2e들)는 손으로 고친다.
- 가장 가까운 확대를 바꾸면 `cameraMath.ts` `CLOSE_VIEW_SPAN_M`. 눕힘 띠는 `TILT_REFERENCE_SPAN_M`이 따로 지킨다.
- 깊이를 쓰지 않는 새 땅 위 표시는 renderOrder를 0보다 크게 준다(재질 번호 차례에 기대지 않는다).

## 건드리지 말 것
- 1차맵 사다리(다섯 단계)·1차맵 진입 확대.
- 걸어서 넘을 때 확대 유지(map-seamless-2).

## 미검증·TODO·알려진 문제
- 결과는 아래 "시험"에 적는다.
- 휴대폰 실기기에서 6/6 보기는 보지 않았다(Unknown). 도시 가운데처럼 나무 덤불 안에 선 사이보그는 6/6에서 나무 갓이 화면을 덮는다(시험 세계 시작 자리 사진, Verified) → 질문 996.
- 단계별 화면 길이(ADR 표)는 계산값(Assumed).

## 사용자 결정 대기
- 996: 진입 6/6 그대로 / 5/6 / 6/6 + 유닛 앞 나무 옅게(추천).
