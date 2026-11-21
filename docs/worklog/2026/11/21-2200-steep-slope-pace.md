# 가파른 비탈 막힘 → 느리게 지나감(비용 ×4), 건물은 그대로 못 지음

- 일시: 2026-11-21 22:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-21-steep-slope-pace.md`(새로 씀)

## 한 일

사용자 지적(2026-11-21, 사진): "갇혀버리는 문제 발생. 속도패널티를 받고 갈수있게하라."

- **원인**: 높이 차 650cm 이상인 지형 칸은 비용 0(막힘)이었다. 비탈에 둘러싸인 풀밭에서 길이 없었다.
- **비탈 비용**: 비탈은 지표 비용 × 4로 지나간다. 구간 빠르기가 비용을 걸음 배율로 쓰므로 실제로 느리게 걷는다.
- **건물 배치**: 비탈(비용 ≥ 4,000)에는 여전히 못 짓는다.
- **판**: `SIM_VERSION` 68.

## 바꾼 파일과 이유

| 파일 | 이유 |
|---|---|
| `packages/sim/src/terrain/layerCosts.ts` | 비탈 = 지표 비용 × `STEEP_COST_PM`, `STEEP_COST_FLOOR` |
| `packages/sim/src/placement/placement.ts` | 비탈 칸 건물 막기(`blocked_terrain`) |
| `packages/sim/src/version.ts` | `SIM_VERSION` 68 |
| `packages/sim/src/terrain/layerCosts.test.ts`·`tempTerrain.test.ts`·`placement/placement.test.ts` | 새 규칙 시험, 비탈 아닌 칸이 늘 `STEEP_COST_FLOOR` 아래인지 |
| `docs/adr/2026-11-21-steep-slope-pace.md`(새) | 결정 기록 |

## 함께 바꿔야 하는 파일

- 지표 비용(`SURFACE_COST`)·숲 배율(`FOREST_COST_PM`)·팩 `map_props` `slowPm`을 올리면, 비탈이 아닌 칸이 `STEEP_COST_FLOOR`(4,000)에 닿는지 본다. 닿으면 건물이 그 칸에 못 지어진다.
  - `layerCosts.test.ts`는 상수만 보고 팩 `slowPm`은 1.5배로 가정한다.

## 건드리지 말 것

- `packages/planet` `SM_CLIFF_RELIEF_CM`(생성기 소품 배치용, PROTECTED). sim `CLIFF_RELIEF_CM`과 같은 값을 유지한다(서버 시험이 본다).

## 미검증·TODO·알려진 문제

- 사진의 그 자리에서 실제로 빠져나가는지는 NAS에서 보지 않았다. 서버 경로 시험만 했다.
- 배율 4는 [임시] 값이다(기획 수치 없음).
- 물이나 차폐(큰 바위)로 둘러싸인 곳은 여전히 갇힐 수 있다.

## 검사
- 단위 시험(Verified, DB 포함 `TEST_DATABASE_URL`): `packages/sim` 전체와 서버 `world`·`gather`·`travel`·`facilities`, 218개 파일·1,575개 통과.
- 처음에 서버 워커 시험 7개가 실패했다. `packages/sim/src/index.ts`에서 새 상수를 잘못된 파일(`tempTerrain.ts`) 내보내기에 넣어 워커가 뜨지 못했기 때문이다.
  - 이미 `export *`로 내보내고 있어 그 줄을 지웠다.
