# 2차맵 생성 WP-3: 서버 연결 — 행성 값 파일, 지형 워커·캐시, 고정본, 시험 2차맵을 땅으로, 이웃 지형, 빠른 no_path

- 일시: 2026-10-31 20:27 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-10-31-second-map-from-planet.md`(46, 제안) "구현하며 정한 것 (WP-3)", ADR 35 "경로탐색", 사용자 결정 U2·U3·U4 (가). 가지 `work/second-map-v2`(main `1ca22da` 합친 뒤)

## 한 일
- 행성 굽기가 행성 값 파일(TCPV)을 함께 만든다. 캐시 `.values`, 목록 형식 3판. 행성 서비스는 `planetValues(행성 ID)`를 준다. 월드 행성 것만 메모리에 든다(`keepValuesFor`).
- 2차맵 지형 서비스(`world/terrainService.ts`)를 만들었다.
  - 찾는 차례는 메모리 LRU 48장 → 지형 워커(`terrainWorker.ts`)다. 워커는 디스크 캐시(`<행성 캐시>/second-maps/`) → 생성기 순서로 찾는다.
  - 같은 2차맵 동시 요청은 하나로 묶는다. 워커가 죽으면 다시 띄운다. 닫으면 기다리던 요청이 실패한다.
  - 시험은 같은 스레드에서 같은 핵심(`terrainCore.ts`)을 쓴다.
- 2차맵(`SecondMap`)이 지형을 `MapTerrain`(지형 비용 + 지형 파일 + 판 표지)으로 받는다(`world/mapTerrain.ts`). 임시 지형도 같은 모양으로 감싼다.
  - 지형 주소는 `?v=<2차맵 생성기 판>.<행성 생성기 판>.<정의 해시 8자>.<소품 규칙 해시>`다.
- 고정본 표 `second_map_pins`를 만들었다(마이그레이션 `20261031110827_second_map_pins`, 표 더하기만).
  - 처음 건물을 놓을 때 지금 지형을 쓴다.
  - 부팅은 고정본 → 지형 서비스 차례로 찾는다.
- 시험 2차맵을 S2 시험 행성 F9 면 0 (282~345, 328) 초지 줄로 옮겼다. 서버 `testMapKey`와 protocol `S1_TEST_MAP_KEY`를 함께 바꿨다.
- 부팅 때 옛 시험 2차맵 64장의 유닛·건물·탐사 기록을 지운다. 지운 것이 있으면 감사 기록을 남긴다(U4 (가)).
- 부팅 때 띄운 2차맵의 8이웃 지형을 미리 만든다. 지형 경로는 볼 수 있는 2차맵의 이웃이면 띄우지 않은 2차맵도 준다.
- sim: 크기 등급별 연결 영역 번호(`grid/components.ts`)를 만들었다. 다른 영역이면 길찾기가 바로 no_path를 돌려준다. `SIM_VERSION`을 2로 올렸다.
- 기기·엔진: 지형 파일 2판의 실제 칸 크기를 쓴다. 꼭짓점 물 높이로 물 면을 그린다(`engine/terrain/waterMesh.ts`).
- 배포 안전
  - Fastify `pluginTimeout`을 300초로 늘렸다. 빈 캐시 화면 시험에서 onReady 10초 상한에 걸려 서버가 꺼졌다.
  - CI 이미지 확인의 /health 기다림을 90초로 늘렸다.

## 잰 값
- 화면 시험 빈 캐시 부팅(개발 컨테이너, 빌드한 서버, DB 있음): S2 시험 행성 굽기 13.3초(행성 값 포함) → 지형 서비스 준비 0.1초 → 월드 복구까지 13.7초(시험 2차맵 1장 생성 포함)였다. 편집 전용 행성은 그 뒤에 구웠다. 굽는 동안 최대 RSS 610.7MB를 기록했다(봇 0, 두 번째 행성 굽기 중)(**Verified**, 개발 컨테이너).
  - 이전에 기록한 값은 행성 하나·봇 1,000개 418MiB다. 이 차이가 이 일 때문인지는 재지 않았다(**Unknown**).
  - 그 뒤 월드 행성 값만 들고 있게 고쳤다(편집 전용 행성 약 22MB를 덜 든다).
- 2차맵 생성(지형 워커 안 생성 + 인코딩 + gzip, 개발 컨테이너): WP-2 생성 시간(p50 40~63ms) + 인코딩·gzip 몇 ms다(**Assumed**: 워커 안 시간은 따로 재지 않았고 지표 `terrainBuildMs`로 남긴다).
- 빠른 no_path(서버 벤치, F9 숲 2차맵 6장, 경로 1,000개)(**Verified**, 개발 컨테이너):
  - 깊은 강으로 갈린 2차맵: 3.78초 → 0.41초, 펼친 칸 평균 13천 → 1.1천.
  - 예산 16,384에서 budget_exceeded 514개 → no_path 516개.
- NAS: 재지 않았다. 첫 배포 때 행성 캐시 형식이 바뀌어 두 행성을 다시 굽는다(행성마다 약 18초). 월드는 S2 시험 행성만 기다린다(**Assumed**).
- 시험
  - 서버: 지형 서비스·월드·지형 경로·DB(옛 시험 2차맵 정리·고정본) 10개, 행성 값 서비스 1개.
  - sim: 연결 영역 3개. 엔진: 물 면 3개. 기기: 지형 2판 1개.
- 캐시가 있는 부팅(같은 화면 시험 두 번째 실행): 행성 캐시 읽기 0.13초·0.05초, 월드 복구 0.29초(시험 2차맵 지형은 디스크 캐시)(**Verified**, 개발 컨테이너).
- `pnpm check`(DB 시험 포함): 2,223개 가운데 1개(`metrics.test.ts` 이벤트 루프 히스토그램, 부하에 흔들리는 시험으로 알려짐)가 실패했다가 그 파일만 다시 돌려 통과했다. 화면 시험 `pnpm e2e` 85개 모두 통과(6.9분). 행성 값 들고 있기를 고친 뒤 다시 돌려 85개 모두 통과(6.6분).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/planet/sources.ts`·`bake.ts`·`bakeMessages.ts`·`bakeWorker.ts`·`baker.ts`·`cache.ts`·`service.ts`·`testSupport.ts`(+시험 3개) | 행성 값 파일 굽기·캐시·전달 |
| `apps/server/src/world/mapTerrain.ts`(새)·`terrainCore.ts`(새)·`terrainWorker.ts`(새)·`terrainService.ts`(새)·`terrainDisk.ts`(새)·`terrainMessages.ts`(새) | 2차맵 지형 서비스 |
| `apps/server/src/world/pins.ts`(새), `src/db/schema.ts`, `drizzle/20261031110827_second_map_pins/` | 고정본 표, 옛 시험 2차맵 정리 |
| `apps/server/src/world/world.ts`·`secondMap.ts`·`terrainRoute.ts`·`testSupport.ts`, `src/app.ts`·`main.ts`, `vite.config.ts` | 부팅 길(고정본 → 지형 서비스), 새 시험 자리, 이웃 미리 받기·경계 너머 지형, 워커 빌드 입력, onReady 상한 |
| `apps/server/src/world/secondMapTerrain.test.ts`(새) | 위 전부의 시험(F9 한 번 생성) |
| `packages/protocol/src/secondMap.ts`·`terrain.ts` | 새 시험 2차맵 키, 판 표지 주소 |
| `packages/sim/src/grid/components.ts`(새)·`components.test.ts`(새)·`placementGrid.ts`·`path/astar.ts`·`version.ts`·`index.ts` | 연결 영역 빠른 no_path, `SIM_VERSION` 2 |
| `packages/engine/src/terrain/waterMesh.ts`(새)·`waterMesh.test.ts`(새)·`terrainView.ts`·`terrainData.ts`·`index.ts` | 꼭짓점 물 높이 물 면 |
| `apps/game/src/map/mapWire.ts`·`mapWire.test.ts` | 실제 칸 크기, 물 높이 |
| `.github/workflows/ci.yml` | 이미지 확인 /health 90초 |
| `docs/adr/2026-10-31-second-map-from-planet.md`, `docs/PLAN.md`, `docs/PROTECTED.md`, `AGENTS.md` | 구현하며 정한 것(WP-3), 2차맵 넘는 이동은 뒤로, 판 올림 규칙·고정본 행, 명령 표 |

## 함께 바꿔야 하는 파일
- 시험 2차맵 자리를 바꾸면 서버 `TEST_MAP_ORIGIN`·protocol `S1_TEST_MAP_KEY`·`secondMapTerrain.test.ts`(땅 줄 확인)를 함께 바꾼다.
- 2차맵 생성기 출력이 바뀌면 `SECOND_MAP_GENERATOR_VERSION`을 올리고, 그 커밋에서 고정본 이웃 경계 섞기(U3)를 만든다(PROTECTED).
- 판정 결과가 바뀌면 `SIM_VERSION`(R3 줄기도 올릴 수 있다: 나중에 합치는 쪽이 다시 올린다).

## 건드리지 말 것
- `second_map_pins` 행을 고치거나 지우지 않는다(PROTECTED).
- 엄폐 층 형식(R3).

## 미검증·TODO·알려진 문제
- NAS에서 첫 배포 부팅 시간·RSS를 재지 않았다. 배포 뒤 `nas-metrics`로 본다.
- 유닛이 2차맵을 넘는 이동(D-139)은 뒤로 미뤘다(PLAN 11장). 띄운 2차맵은 부팅 때의 시험 2차맵뿐이다.
- 고정본은 지금 건물을 처음 놓을 때만 쓴다. 벌목·도로는 그 기능이 생길 때 같은 고리를 부른다.
- 띄우지 않은 이웃 2차맵에 고정본이 있으면 지형 경로가 생성기 지형을 준다. 지금은 고정본이 띄운 시험 2차맵에만 생겨서 해당이 없다.
- 엔진 물 아래 칠하기(지형 재질)는 아직 해수면 기준이다. 강·호수 바닥은 물 면이 덮는다.

## 사용자 결정 대기
- 2차맵 밤 깊이(낮밤 작업 기록 `31-1740`)는 휴대폰을 본 뒤 사용자가 정한다.
