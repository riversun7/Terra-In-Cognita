# 2차맵 인접 경계 시각 UI 추가

- 일시: 2026-11-26 23:15 (KST)
- 작업 도구: Antigravity
- 관련: `docs/adr/2026-10-31-second-map-from-planet.md` WP-4, `docs/adr/2026-11-08-seamless-second-map.md` WP-3

## 한 일
- 사용자 선택(추천 1: 지형 밀착 이중 점선 + 인접 구역 톤 낮추기 + 이웃 간 연한 경계 + 줌 자동 조절)에 따라 2차맵 지형 셰이더와 엔진에 인접 2차맵 경계 구분 UI를 추가했다.
- 확대 거리에 따른 경계 세기 계산(`borderStyleForZoom`, `zoomProgress`)을 순수 함수로 분리했다(`borderStyle.ts`).
  - 이웃 2차맵이 없을 때(`neighbours.count === 0`)는 모든 세기가 `0`이라 1장 단독 보기 화면은 바뀌지 않는다.
  - 멀리 볼 때(`1/6`~`2/6`)는 중심 2차맵 테두리 점선·이웃 간 경계 점선·인접 구역 톤 낮추기가 선명하고, 가까이 확대할 때(`4/6`~`6/6`)는 이웃 경계와 톤 낮추기가 서서히 풀리며 중심 점선만 은은하게 남아 심리스 이동(`rebase`) 시 튐을 막는다.
- 지형 셰이더(`terrainMaterial.ts`)에 `uBorder` (`vec4`) 유니폼을 추가해 추가 그리기 호출 없이 경계를 그린다.
  - 세계 좌표(`vTerrainPos.xz / uCellSize`) 기반 대칭 점선(4칸 ↔ 1칸 화면 픽셀 크기로 자동 전환)을 써 90°·180°·270° 회전된 면 경계 이웃과도 위상·두께가 어긋나지 않는다.
  - 중심 2차맵 네 모서리는 직각 꺾쇠로 마감하고, `3×3` 맨 바깥 외곽(하늘 맞닿음)에는 선을 그리지 않는다.
  - 인접 2차맵은 채도·밝기를 살짝 낮추고 중심 경계 바깥에 얕은 음영을 깔았으며, 물 메시(`terrainView.ts`) 색상도 같은 세기로 톤을 맞췄다.
  - 미탐사 안개 위에서도 경계 점선이 35% 세기로 은은하게 보여 구획을 가늠할 수 있다.
- 검증(**Verified**):
  - 단위 시험: `borderStyle.test.ts`·`terrainMaterial.test.ts`·`neighbourTerrains.test.ts` 포함 `@terra/engine` 전체 통과.
  - 브라우저(Playwright WebGL) 시각 확인: 밤(`23:50`)·낮(`12:00`)·확대 단계(`1/6`·`3/6`·`5/6`)·모바일(`390×844`)·안개 모드에서 콘솔·셰이더 오류 0건, 경계 점선·톤 분리·모서리 정렬 확인.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/terrain/borderStyle.ts` | 확대 거리별 중심 점선·이웃 경계·인접 톤 세기 순수 계산 |
| `packages/engine/src/terrain/borderStyle.test.ts` | 줌 단계별 단조 감소·이웃 없음·경계값 단위 시험 |
| `packages/engine/src/terrain/terrainMaterial.ts` | `uBorder` 유니폼·인접 톤 낮추기·지형 밀착 이중 점선 셰이더 추가 |
| `packages/engine/src/terrain/terrainMaterial.test.ts` | `uBorder` 유니폼 포함 여부 및 `setBorder` 동작 시험 |
| `packages/engine/src/terrain/terrainView.ts` | `setBorder` 메서드와 인접 2차맵 물 색 톤 맞추기 추가 |
| `packages/engine/src/terrain/neighbourTerrains.ts` | `setBorderStyle` 및 새 이웃·`adopt` 시 인접 경계 스타일 유지 |
| `packages/engine/src/secondMapEngine.ts` | 카메라 거리·이웃 수·`rebase`에 따른 `syncBorders` 연동 |
| `docs/worklog/2026/11/26-2315-second-map-neighbour-border.md` | 작업 기록 |
| `docs/WORKLOG.md` | 작업 기록 목차 갱신(`pnpm docs:index`) |

## 함께 바꿔야 하는 파일
- `packages/engine/src/terrain/terrainMaterial.ts`의 유니폼 목록을 바꾸면 `packages/engine/src/terrain/terrainMaterial.test.ts`도 함께 맞춘다.

## 건드리지 말 것
- 2차맵 지형 생성기(`packages/planet/src/secondMap/`)와 `SECOND_MAP_GENERATOR_VERSION`은 건드리지 않는다(렌더링 셰이더만 변경).
- `terrainMaterial.ts`의 `PROGRAM_KEY`를 중심·인접으로 분리하지 않는다(`uBorder` 유니폼 하나로 셰이더 프로그램을 공유한다).

## 미검증·TODO·알려진 문제
- 수심 15m 이상 깊은 바다 2차맵에서는 해저 시차를 피하기 위해 바닥 점선을 줄이고 물 색 톤 차이로만 구분한다. 깊은 바다 위 수면 점선까지 필요하면 `waterMesh` 전용 재질 확장이 필요하다(미실행).
- 현재 작업 트리에 다른 작업(`economyFlow`, 크리처 초상화)의 미커밋 변경이 함께 있어, 전체 커밋·푸시와 `e2e/seamless.spec.ts` 전체 실행은 아직 하지 않았다(미실행).

## 사용자 결정 대기
- 없음(적용 결과 확인 후 점선 굵기·색·톤 강도나 켜기/끄기 토글 버튼 추가 필요 시 조정 가능).

- 커밋 때(2026-11-27, Claude Code가 대신 확인·커밋): 깨끗한 작업 복사본에서 `pnpm check` 통과. `e2e/seamless.spec.ts`는 6개 중 5개 통과 — "걸어서 넘기"(607줄, 확대 단계 기대 4·실제 3)는 이 변경을 뺀 상태(`7aaa71f8`)에서도 똑같이 실패한다(Verified). 이번에 고치지 않았다.
