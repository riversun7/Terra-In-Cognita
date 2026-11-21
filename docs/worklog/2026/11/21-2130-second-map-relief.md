# 2차맵 화면 높이 과장 ×4(보기만)

- 일시: 2026-11-21 21:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-second-map-relief.md`(새로 씀)

## 한 일

사용자 지적(2026-11-21, 사진 두 장): "1차맵에서 고도차가 심한 곳인데도 2차맵에서는 평지로만 보인다 2차맵을 더 고도 표현하게해라".

- **원인(Verified)**:
  - 1차맵은 높이를 ×12로 그리고(`PLANET_EXAGGERATION`), 2차맵은 ×1로 그렸다.
  - 사진의 칸(면 0, (464, 202))은 2차맵 안 높이 차가 19m / 1.46km다(임시 측정 스크립트, 커밋하지 않음).
- **고친 것**: 게임 2차맵 화면이 받은 지형을 해수면 기준 ×4로 늘려 엔진에 넘긴다(`gameTerrainView`).
  - 지금 2차맵과 이웃 2차맵이 같은 받기 길을 지난다. 기준이 같아 경계가 이어진다.
- **그대로인 것**: 생성기·서버·이동 판정은 그대로다. 생성기 판 올림이나 세계 새로 시작은 없다.
- **함께 정리한 것**: 개발자 2차맵 시험의 과장 계산을 `map/terrainRelief.ts`로 옮겨 같이 쓴다. 시험 화면 동작은 그대로다.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `apps/game/src/map/terrainRelief.ts`(새, + 시험) | 과장 계산(`scaleTerrainRelief`), 게임 화면용 `gameTerrainView`, 배율 `SECOND_MAP_RELIEF` = 4 |
| `apps/game/src/map/SecondaryMapScreen.tsx` | 지형 받기에 `gameTerrainView`를 걸었다 |
| `apps/game/src/editor/secondMapLab/labTerrain.ts` | 같은 계산을 가져다 쓴다(중복 제거) |
| `apps/game/messages/{ko,en}.json` | 시험 화면 과장 안내에 "게임 2차맵 화면은 ×4" |
| `docs/adr/2026-11-21-second-map-relief.md`(새) | 결정 기록 |

## 함께 바꿔야 하는 파일

- 배율을 바꾸면 `SECOND_MAP_RELIEF`, 시험 화면 안내 문구(ko·en), `terrainRelief.test.ts`를 같이 바꾼다.

## 건드리지 말 것

- 기준 높이(pivot)를 2차맵마다 다르게 하지 않는다. 지금은 해수면 0이다. 2차맵마다 다르면 이웃과 경계가 어긋난다.

## 미검증·TODO·알려진 문제

- 화면에서 높낮이가 잘 보이는지는 눈으로 확인하지 못했다. 화면 시험 세계의 시작 자리가 평지(도시)라 사진으로 차이가 드러나지 않았다.
  - 사용자 사진 같은 높낮이 있는 곳은 휴대폰에서 봐야 한다.
- 화면 높이(×4)는 판정 높이와 다르다. 가파른 비탈(지나갈 수 있는 한계)은 약 66°로 보인다.
- 높이 폭이 약 1,600m를 넘는 2차맵은 배율이 낮아져 이웃과 경계가 어긋날 수 있다(잰 최대는 193m).

## 검사
- 단위 시험(Verified): `terrainRelief.test.ts` 3개(×4·경계 이어짐·배율 낮춤)와 `labTerrain.test.ts` 통과. 게임 타입 검사·oxlint 통과.
- 화면 시험(Playwright, Verified): `seamless.spec.ts` "이웃 안개 사진 390 pastel" 통과. 임시 시험으로 2차맵을 열고 1/6까지 멀리 보았고, 오류가 없었다.
