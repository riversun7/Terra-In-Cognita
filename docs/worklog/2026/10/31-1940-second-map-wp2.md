# 2차맵 생성 WP-2: 소품 규칙(map_props), 숲 나누기·빈 길·흩기·갇힌 곳 잇기, 지형 비용, 숲 경로 측정

- 일시: 2026-10-31 19:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-second-map-from-planet.md`(46, 제안) "구현하며 정한 것 (WP-2 배치·엄폐)", ADR 35 "숲"(질문 27 기본안), 기획 질문 125·126 기술 기본안. 가지 `work/second-map-v2`(main `23207f8` 합친 뒤)

## 한 일
- main(`23207f8`, R2 경제 core@5)을 합쳤다. 콘텐츠 분류 표 두 곳이 겹쳐 손으로 합쳤다.
- 콘텐츠 분류 `map_props`를 더했다: 스키마·검증(ko·en 이름, 곡선 순서·범위, 바이옴 참조·중복). 팩을 core@6으로 올렸다(임시 항목 7개).
- `@terra/shared` `mapProps.ts`: 소품 그림 이름표(번호 = 지형 파일 바이트), 배치 방식, 곡선 축·범위, 덩이 크기.
- 2차맵 생성기에 배치 단계를 더했다(`placement.ts`·`pockets.ts`·`props.ts`).
  - 엄폐 값 256²(숲 나누기, 빈 길, 흩기 소품, 갇힌 곳 잇기)과 소품 그림 256²을 만든다.
  - 결과 해시에 그림 층을 넣고, 결과에 규칙 해시를 실었다.
- 지형 파일 TCTR 2판에 소품 그림 층(깃발 4)을 더했다. 엄폐 층 형식은 그대로다(R3가 읽는다).
- sim `placementCostsFromLayers`: 지표 11종 비용 [임시]과 차폐 = 막힘을 넣었다. 임시 지형도 이 함수를 쓴다(결과 같음).
- 서버: 팩 항목 → 생성기 입력(`world/mapProps.ts`). 숲 지형 경로 측정 `bench/secondMapPaths.ts`(리드 승인: sim이 planet을 못 가져와 서버 꾸러미에 둔다).
- 측정 명령 `second-map`에 `forest` 자리, 엄폐·소품 그림, 엄폐 몫을 더했다.
- 빠르게 했다: 숲 지역 2차맵 하나 p50 118ms → 40~63ms.
  - 정수 내림 나눗셈을 `Math.floor(a / b)`로 바꿨다(|a| < 2^53에서 정확, BigInt 시험).
  - 노이즈 보간을 펼쳐 썼다. 고르게 펴기 표를 두었다. 지형 칸 비중을 미리 계산하고 대기열을 할당 없이 돌렸다.
  - 이 바꿈 전후로 지형 골든 해시가 같았다(같은 값을 낸다는 확인).

## 잰 값
- 생성 F9(개발 컨테이너 4코어, 부하 1.5~2.5, 측정 명령)(**Verified**, 개발 컨테이너):
  - 숲 4×4: p50 63ms, p95 134ms. 숲 6×6: p50 39.5ms, p95 50.8ms. 강 4×4: p50 61ms. 바닷가 4×4: p50 38ms.
  - 최대 117~155ms는 처음 JIT를 포함한다.
  - 공유 변 불일치 0.
  - F = 255 지역 엄폐 몫: 없음 43%, 은폐 31%, 차폐 26%.
- 숲 경로(서버 벤치, F9 숲 밀도 255 2차맵 6장, 경로 1,000개)(**Verified**, 개발 컨테이너):
  - 막힌 칸: 0~12% → 24~31%.
  - 합계: 숲 0.8~3.8초, 엄폐 뺀 격자 0.5~5.2초. p95 2.6~8ms. 펼친 칸 평균 2.5천~13천.
  - 크기 등급 3 no_path 1~6개. 깊은 강으로 갈린 2차맵 하나는 엄폐와 상관없이 no_path 516개였다.
  - 2차맵 하나의 지형 비용은 0.6~3ms, 배치 격자는 0.6~3ms였다.
- NAS는 재지 않았다(**Assumed**: 1.3~1.7배).
- 시험(planet 2차맵 40개, 서버 3개, 콘텐츠 7개, shared 2개, sim 5개, protocol 1개 더함): 아래를 본다.
  - 숲 몫, 빈 길에는 차폐 없음.
  - 빈 길이 면 경계(뒤집힌 변 포함 30가지)를 넘어 이어진다.
  - 엄폐 무늬가 경계 너머 같음 비율 ≥ 안쪽의 0.9배다.
  - 갇힌 곳이 없다. 생성기 판정과 따로 센 것, sim 격자 통과 폭으로 센 것 둘 다 본다.
  - 추운 곳에서 침엽수 몫이 크다.
  - 같은 바이옴 이웃 지문의 거리가 0.3보다 크고, 같은 지문이 없다.
- 검사: `pnpm check`(DB 시험 포함) 통과, 시험 2,203개. 화면 시험 `pnpm e2e` 85개 모두 통과(9.7분).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/mapProps.ts`(새)·`index.ts`·`mapProps.test.ts`(새) | 소품 이름표(그림 번호·축·덩이) |
| `packages/content/src/schema/mapProps.ts`(새)·`categories.ts`·`index.ts`, `validate/mapProps.test.ts`(새) | `map_props` 분류 |
| `content/core/map_props.json`(새), `content/core/manifest.json` | 임시 소품 7개, 팩 6판 |
| `packages/planet/src/secondMap/props.ts`(새)·`placement.ts`(새)·`pockets.ts`(새) | 규칙 컴파일, 배치, 갇힌 곳 잇기 |
| `packages/planet/src/secondMap/generate.ts`·`hash.ts`·`index.ts`·`latticeNoise.ts`·`layout.ts` | 배치 연결, 그림 층 해시, 소금·고르게 펴기·빠른 보간, 빠른 내림 나눗셈 |
| `packages/planet/src/secondMap/testMapProps.ts`(새)·`testPlanetValues.ts`, `*.test.ts` | 시험 소품 규칙(팩 사본), 골든 해시, 배치·규칙 시험 |
| `packages/planet/bench/secondMap.ts` | 소품 규칙, 숲 자리, 엄폐·소품 그림 |
| `packages/protocol/src/terrain.ts`·`terrain.test.ts` | TCTR 2판 소품 그림 층 |
| `packages/sim/src/terrain/layerCosts.ts`(새)·`layerCosts.test.ts`(새)·`tempTerrain.ts`·`index.ts` | 지형 층 비용(지표 11종, 차폐) |
| `apps/server/src/world/mapProps.ts`(새)·`mapProps.test.ts`(새) | 팩 → 생성기 규칙, sim 격자로 갇힌 곳 시험 |
| `apps/server/bench/secondMapPaths.ts`(새)·`bench/tsconfig.json`(새)·`package.json` | 숲 지형 경로 측정 |
| `docs/adr/2026-10-31-second-map-from-planet.md`, `docs/PROTECTED.md`, `AGENTS.md` | 구현하며 정한 것(WP-2), 그림 번호 규칙, 명령 표 |

## 함께 바꿔야 하는 파일
- 팩 `map_props`를 고치면 `packages/planet/src/secondMap/testMapProps.ts`(사본)와 골든 해시를 함께 고친다(`props.test.ts`가 다르면 실패).
- 소품 그림을 더하면 `MAP_PROP_ARTS` 끝에 더하고, 엔진 그림(WP-4)과 측정 명령 색을 함께 더한다.
- 지표 비용을 바꾸면 sim `layerCosts.ts`의 `SURFACE_COST`와 그 시험을 고친다. 벼랑 기준은 planet `SM_CLIFF_RELIEF_CM`과 같이 바꾼다(서버 시험).

## 건드리지 말 것
- 엄폐 층 형식(배치 칸 256² u8, 0·1·2, 차폐 = 막힘): R3(시선 판정)가 읽는다. 바꾸려면 리드에게 먼저 묻는다.
- R2 경제 영역(`packages/sim/src/ledger`, 경제 코드, 팩 경제 분류).

## 미검증·TODO·알려진 문제
- 서버는 아직 이 생성기를 쓰지 않는다(WP-3에서 생성 워커·캐시 열쇠에 규칙 해시).
- 물까지 거리는 2차맵 안만 본다(경계 64칸 안 비중 차이, 감수).
- 몫 상한이 걸린 2차맵은 경계에서 몫이 다를 수 있다.
- 갇힌 곳을 이을 때 길이 큰 바위 칸을 지나면 그 바위가 은폐가 된다(그림 그대로).
- 크기 등급 3은 숲 지역에서 다닐 곳이 크게 준다(ADR 35 예상).
- 연결 영역 번호로 바로 no_path를 답하는 것은 아직 없다. 깊은 강으로 갈린 2차맵에서 경로 하나가 묶음 전체(약 2.5만 칸)를 펼친다.
- 소품 수치·비중·지표 비용은 모두 [임시]다(질문 125·126 답, Step 5 설정값 전).

## 사용자 결정 대기
- 2차맵 밤 깊이(낮밤 작업 기록 `31-1740`)는 휴대폰을 본 뒤 사용자가 정한다.
