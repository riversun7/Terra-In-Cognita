# 1차맵 타일 경계 앞치마·선명한 유기적 지형·연속 사행 하천 셰이더

- 일시: 2026-11-19 23:37 (KST)
- 작업 도구: Antigravity
- 관련: ADR `2026-10-29-s2-planet-lod.md`, 커밋 `4731e30c`

## 한 일
- **타일 경계 끊김 제거 (`TileApronStitcher`)**: 32×32 칸 텍스처를 34×34(`cells + 2`) 앞치마 텍스처로 감싸, 같은 면 8방향 이웃·정육면체 면 경계(`wrapFaceIJ`) 이웃을 양방향으로 잇고 같은 레벨 이웃이 없을 때(LOD 경계) 한 단계 거친 타일(`mapLevel − 1`)에서 빈 변을 채우도록 구현했다.
- **블러 없는 선명한 유기적 바이옴 경계 (`crispLandBlend`)**: 기존 2×2 단순 이중선형 색 블러를 없애고, 도메인 워프(`organicWarp`) + 동일 바이옴 가중치 합산 + 화면 픽셀 폭(`fwidth`) 승자 경계로 호수와 같은 수준의 또렷하고 둥근 지형 경계를 그린다. 근접 시 미세 수관·토양 질감과 연속 수심 기반 해양 그라데이션도 보탰다.
- **연속 사행 하천망 + 망상 하천 구멍 메움**:
  - CPU 앞치마 단계(`markCheckerboardRivers`)에서 상하좌우 4방향이 모두 물(그중 2방향 이상이 하천)로 둘러싸인 체커보드 내부 칸에 `CHECKERBOARD_RIVER_BIT(0x80)`를 표시하고 이웃 앞치마와 재동기화한다(원본 값만 읽어 로딩 순서와 무관).
  - 셰이더(`evalRiverField`)에서 도메인 워프된 2×2 스칼라장에 네 변에서 이중선형과 수학적으로 정확히 일치하는 대각 다리(`1 − |fx − fy|`, `1 − |fx + fy − 1|`)와 변 연속 보정(`edgeFade`)을 더해 대각선 끊김·45° 각짐·망상 구멍을 없앴다.
  - 하구에서는 호수·해안 윤곽선을 자연스럽게 열고 강 물색을 맞닿은 호수·연안 바다 색으로 섞어 하나로 이어지게 했다.
  - 정육면체 면 경계에서는 `faceEdgeFade`로 워프를 0으로 모아 다른 면과도 이음매 없이 맞춘다.
- **검증(Verified)**:
  - 단위 시험 `tileApron.test.ts`·`planetMaterials.test.ts`·`layerColors.test.ts`·`tileMesh.test.ts` 51개 통과.
  - Playwright Chromium으로 사용자 제보 좌표(`Berfort`/`발몽드` 남서쪽 `i=456, j=312` 및 4개 타일 교차점 `448, 320`, 정육면체 면 경계 `face 0 ↔ face 1`, Stage 3/4/5, 지형·영토·기후 레이어)를 직접 촬영·대조해 타일 끊김·지형 블러·대각선 끊김·망상 구멍이 모두 사라지고 WebGL 콘솔 오류가 0건임을 확인.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/engine/src/planet/tileApron.ts` | 1칸 앞치마 패딩, 같은 면·면 경계(`wrapFaceIJ`)·LOD 거친 이웃 양방향 동기화, 망상 하천 내부 메움 비트(`0x80`) 계산 |
| `packages/engine/src/planet/tileApron.test.ts` | 앞치마 패딩, 이웃·면 경계·LOD 경계 동기화, 망상 하천 4면/3면 판별 단위 시험 |
| `packages/engine/src/planet/planetMaterials.ts` | `createTileMaterial`에 선택 인자 `pad = 0`과 `uPad` uniform 추가(기존 6인자 호출 호환 유지) |
| `packages/engine/src/planet/planetView.ts` | 타일 생성 시 34×34 앞치마 텍스처 업로드 및 `TileApronStitcher` 연동, 해제 시 정리 |
| `packages/engine/src/planet/planetTileShader.ts` | `uPad` 기반 `sampleAt`, 선명한 유기적 바이옴(`crispLandBlend`), C⁰ 연속 2×2 대각·사행 하천(`evalRiverField`), 하구 개방·연속 수심·면 경계 페이드 |

## 함께 바꿔야 하는 파일
- `packages/engine/src/planet/tileApron.ts`의 `CHECKERBOARD_RIVER_BIT` 비트 위치를 바꾸면 `planetTileShader.ts`의 하천 등급 마스크(`& 127`)도 함께 맞춘다.
- `planetMaterials.ts`의 `uPad` 기본값이나 앞치마 폭을 바꾸면 `planetView.ts`의 `paddedSide`와 `planetTileShader.ts`의 `sampleAt` 범위를 함께 확인한다.

## 건드리지 말 것
- `packages/planet/` 생성기·타일 이진 형식(`docs/PROTECTED.md`): 이번 작업은 GPU 셰이더와 렌더러 텍스처 패딩만 바꿨다.
- `planetMaterials.test.ts`가 검증하는 카메라 빛·하늘 꺼짐 경로 셰이더 식(`color = base * (0.5 + 0.62 * diffuse);`, `if (uSkyBlend <= 0.0) { color = cameraLight(applyPick(base), n, wet);`).

## 미검증·TODO·알려진 문제
- 실기기 모바일 GPU에서의 프레임 시간은 아직 측정하지 않았다(Assumed: 기존 2×2 표본 대비 텍스처 읽기가 4+4회라 모바일 부하는 낮으나 실기 측정은 미실행).
- `origin/main` 푸시는 사용자 확인 후 기존 로컬 커밋 묶음과 함께 진행한다.

## 사용자 결정 대기
- 로컬에 쌓인 1차맵·2차맵·모바일 개선 커밋 묶음의 `origin/main` 푸시 여부.
