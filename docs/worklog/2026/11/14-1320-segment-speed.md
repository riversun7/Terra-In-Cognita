# 구간 빠르기 — 경로 구간마다 지형·도로에 따라 실제로 느리게 걷는다 (D-541)

- 일시: 2026-11-14 13:20 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-541(질문 1317 나)·D-5052, ADR `docs/adr/2026-11-14-segment-speed.md`(새), 질문 `docs/questions/2026-11-14-segment-speed.md`(1341~1344), 줄기 `work/segment-speed`(바탕 a85a874), SIM_VERSION 39, 프로토콜 29(받는 가장 낮은 판 28), 팩 그대로

## 한 일
- 판정(`packages/sim`): 움직임에 구간마다 걸음 배율(‰) `paces`. 도착 = 출발 + ⌈Σ 길이 × 배율 ÷ 속도⌉, 지난 거리도 같은 시간 거리로(배율이 없으면 옛 식과 비트까지 같다). 칸 배율(`path/pace.ts`) = 지형 비용(숲·얕은 물·느려짐 소품·흙·바위 포함), 도로 칸 = max(1000, ⌈1000 × 기본 ÷ 도로 최고 속도⌉)([임시] 도로 최고 속도, 지금 도로 없음). `planRoute(paceSpeed)`가 방향·배율이 바뀌는 칸에 점을 남기고 배율을 돌려준다. 시야용 자른 움직임(`truncateMotion`)이 배율을 이어 받는다.
- 서버: 경로 워커 요청에 `paceSpeed`(땅 유닛의 기본 빠르기 — 운영자·2차맵 사이 배수는 곱하기 전 값), 결과에 `paces`(transfer). 배(물 길)는 배율 없음. `world_units.pace integer[]`(마이그레이션 `20261114035833_segment_pace`, 더하기만), 복구는 길이가 틀리면 배율 없이. 전송 `unit_paths`/스냅샷 항목에 `pace`. 2차맵 사이 이동 가는 중 예상 = 지금 다리의 실제 도착 + 남은 곧은 거리.
- 프로토콜 29: `unitMotionSchema.pace`(선택, 1 ~ 65,535, 메시지 배열에서 길이 확인). 받는 가장 낮은 판은 원칙대로 28(28판 기기는 배율을 버리고 같은 빠르기로 보간해 표시 위치가 어긋난다 — version.ts·ADR 5절). 처음엔 29로 올렸다가 합치기 지시로 되돌렸다.
- 기기: 엔진 `UnitMotionStore`가 점마다 누적 시간 거리를 두고 보간, `travelled`는 실제 길이. `@terra/shared/pathProgress`(표시용) — `unitMerge` 방향·`unitBlend` 새 경로 잇기가 배율을 따른다. `mapWire.toUnitPath`가 배율을 넘긴다.
- 측정 스크립트 `pnpm --filter @terra/server bench:second-map 9 4 pace`(`bench/segmentSpeed.ts`).

## 측정 (Verified, 공유 개발 기계)
### 숲 2차맵 경로 (S2 시험 행성 F9, 숲 밀도 높은 땅 2차맵 4장, 걷기 437, 같은 출발·목표 1,000개씩, 길을 찾은 3,505개)
| 2차맵 | 나무 칸 몫 | 도착 시간 평균(예전 → 지금) | p95 배 | 점 수 평균 | 항목 바이트 평균 | 최대 바이트 | 숲 건너기(가장 긴 나무 칸 가로줄) |
|---|---|---|---|---|---|---|---|
| 107934675632137 | 53.0% | 251.1 → 276.6초 (×1.116) | 1.345 | 14.1 → 16.1 | 245 → 349 | 1,154 | 107칸 250.7 → 384.6초 (×1.53) |
| 108061377167369 | 51.4% | 327.1 → 360.5초 (×1.113) | 1.277 | 16.5 → 19.6 | 277 → 417 | 1,111 | 82칸 192.1 → 329.0초 (×1.71) |
| 413736347107337 | 55.6% | 329.8 → 359.1초 (×1.102) | 1.300 | 17.7 → 19.9 | 294 → 421 | 1,101 | 83칸 194.5 → 333.9초 (×1.72) |
| 414655470108681 | 55.4% | 323.7 → 336.0초 (×1.047) | 1.153 | 16.4 → 17.9 | 277 → 377 | 1,174 | 105칸 246.0 → 330.4초 (×1.34) |
- 전체: 도착 시간 합 ×1.079, 유닛 항목 JSON 평균 277 → 397바이트(+43%). 숲 건너기 배수가 1.8보다 작은 줄은 나무 그림이 선 칸 가운데 차폐가 아닌 칸(엄폐 0·1 — 숲 배율 없이 지표 비용만)이 섞여서로 본다(Assumed: `layerCosts.ts`는 차폐 칸에만 숲 배율을 곱한다).
- 시험 2차맵 바위 띠(시험 `travel/service.test.ts`): 60칸 중 20칸 바위(1,300) → 도착 = ⌈(40 × 1000 + 20 × 1300) × 1024 ÷ 437⌉ ms = 154.7초(예전 140.6초).
- 길 고르기 시간(배율 셈 포함)은 그대로(2차맵마다 1,000길 합 325 → 263 · 987 → 978 · 897 → 877 · 568 → 550 ms, 흔들림 안).

### 서버 봇 1,000 (S1 시험 2차맵, DB 없음, 경로 워커 1)
같은 기계에서 차례로 5분씩(바탕 a85a874 → 이 줄기), `node --import tsx src/main.ts`, 1분 지표 5줄. 첫 1분(행성 굽기·봇 시작 — 바탕은 빈 캐시에서 구움)을 뺀 2~5분:
| | 이벤트 루프 p50 / p99 / 최대 | CPU | 움직이는 봇 | 길 요청/초 | 길 계산 p95 | 길 기다림 p95 |
|---|---|---|---|---|---|---|
| 바탕(구간 빠르기 없음) | 0.2 / 0.9 / 2.4 ~ 23 ms | 1.2 ~ 1.8% | 903 ~ 919 | 20.3 ~ 22.2 | 0.1 ms | 0.5 ms |
| 이 줄기 | 0.2 / 0.9 ~ 1.0 / 1.1 ~ 23.2 ms | 1.4 ~ 2.1% | 905 ~ 923 | 21.1 ~ 21.4 | 0.1 ms | 0.5 ~ 0.6 ms |
- 서버에는 따로 "틱"이 없다(이벤트 예약). 틱 p95 대신 이벤트 루프 지연 p99를 적었다. 차이는 흔들림 안(Verified: 로그 `segspeed-tick-{base,new}.log`, 임시 폴더).
- 구독자가 없는 실행이라 전송 바이트/초는 0이다. 메시지 크기는 위 경로 측정의 항목 바이트로 본다(+43%, 가장 큰 항목 1,174바이트 — 상한 64KiB).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/motion/motion.ts`, `.test.ts` | 구간 걸음 배율, 시간 거리 W, `segmentBefore`·`paceOf`·`normalizePaces` |
| `packages/sim/src/path/pace.ts` (새) | 칸 걸음 배율, [임시] 도로 최고 속도 |
| `packages/sim/src/path/waypoints.ts`, `.test.ts` | `planRoute paceSpeed`, 배율이 바뀌는 칸에 점 |
| `packages/sim/src/vision/vision.ts`, `.test.ts` | `truncateMotion`이 배율을 이어 받음 |
| `packages/sim/src/index.ts`, `version.ts` | 내보내기(`export *` 둘로 줄임), SIM_VERSION 39 |
| `packages/protocol/src/secondMap.ts`, `version.ts`, `index.ts`, `secondMap.test.ts` | `pace` 칸·길이 확인, 프로토콜 29·받는 가장 낮은 판 28 |
| `apps/server/src/world/pathMessages.ts`, `pathReplica.ts`, `pathService.ts`, `pathPool.ts`, `pathWorker.ts` | 경로 워커 `paceSpeed`·`paces` |
| `apps/server/src/world/secondMap.ts` | 길 요청에 기본 빠르기, 움직임에 배율, 복구는 `motionOfRow` |
| `apps/server/src/world/secondMapRows.ts`, `.test.ts`(새) | 행 `pace`, `motionOfRow`, `unitColumnsOf`(world.ts에서 나눔 — 1,000줄 상한) |
| `apps/server/src/world/world.ts`, `persist/tables.ts`, `persist/load.ts`, `persist.db.test.ts` | `pace` 열 쓰기·읽기, 복구 DB 시험 |
| `apps/server/src/db/schema.ts`, `drizzle/20261114035833_segment_pace/` | `world_units.pace` |
| `apps/server/src/world/relayout.ts` | 세계 다시 놓기는 배율을 지움 |
| `apps/server/src/world/wire.ts`, `.test.ts` | 전송 `pace`, 가장 큰 항목에 배율 |
| `apps/server/src/travel/service.ts`, `.test.ts` | 가는 중 예상 = 움직임 도착 + 남은 거리, 바위 띠 시험 |
| `apps/server/bench/segmentSpeed.ts`(새), `secondMapPaths.ts` | 측정 |
| `packages/engine/src/units/unitMotion.ts`, `.test.ts` | 기기 보간 |
| `packages/shared/src/pathProgress.ts`(새), `.test.ts`, `package.json` | 표시용 보간 진입점 |
| `apps/game/src/map/mapWire.ts`, `unitMerge.ts`, `unitBlend.ts`, 시험 | 배율 넘기기·방향·잇기 |
| `e2e/seamless.spec.ts` | 시험 연결이 경로를 점 하나로 바꿀 때 `pace`도 뺀다 |
| `docs/adr/2026-11-14-segment-speed.md`, `docs/questions/2026-11-14-segment-speed.md` | 결정·질문 |

## 함께 바꿔야 하는 파일
- 움직임을 새로 만드는 곳(`createMotion`)을 더하면 길 결과의 `paces`를 함께 넘긴다. 저장 행을 고쳐 쓰는 곳(`UnitRow` 펼침)이 `path`를 바꾸면 `pace: null`.
- 전송 모양을 바꾸면 기기 `mapWire.toUnitPath`·엔진 `UnitPath.paces`·`@terra/shared/pathProgress`를 같이 본다.
- 도로를 놓는 기능이 생기면 `pace.ts ROAD_MAX_SPEED`를 설정 칸으로(질문 1341), 길 고르기 도로 비용(질문 1342).

## 건드리지 말 것
- 배(domain sea, 물 길)는 배율 없이 같은 빠르기 — 배 줄기(boats-b2)와 맞춘 경계. 물 길에 배율을 넣지 않는다.
- 배율이 없으면 옛 식과 같아야 한다(`motion.test.ts` "모두 1000인 배율은 …" — 시뮬 시나리오 출력이 그대로인 근거).

## 미검증·TODO·알려진 문제
- 복구(`motionOfRow`)는 행의 `speed` = 유닛 기본 빠르기로 움직임을 다시 만든다. 운영자 빠르기(×100)로 가던 유닛은 재시작 뒤 보통 빠르기로 도착 시각이 바뀐다 — 이 줄기 전부터 있던 것(Verified: 코드 읽음), 고치지 않음.
- 짐꾼 나르기·정산 오감(경로 없는 셈)은 그대로(질문 1344). 2차맵 사이 이동 확인 단계 예상은 곧은 거리(질문 1343).
- 탈것 봇(시험 2차맵)도 지형 비용만큼 느려진다(길 밖 최고 속도는 없음, 질문 1341).

## 검사
- Verified `pnpm check`(TEST_DATABASE_URL 켬, merge/integration 합친 뒤): 시험 파일 687·시험 5,205 통과.
- Verified `pnpm build` → `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 109,281 B / 상한 131,416 B.
- Verified `db:generate` 합친 뒤 "No schema changes"(배 `boat_jobs`와 이 줄기 `segment_pace`가 같은 부모 `boat_aboard`에서 갈라진 마이그레이션 — 그대로 합침).
- Verified 화면 시험 `play-map`·`seamless`·`unit-control`·`operator-speed`·`terrain-objects`·`boats`: 64개 가운데 60 통과·2 건너뜀(측정 전용)·2 실패(`seamless` 변 가까이·옆 2차맵 땅 누르기). 실패 원인: 시험 연결이 내 사이보그 경로를 점 하나로 바꾸며 `pace`를 남겨 기기가 스냅샷을 버림(서 있는 점은 배율 0개여야 한다) → 시험이 `pace`도 빼게 고친 뒤 `seamless.spec.ts` 전체 다시: 6 통과·1 건너뜀.
- 사진: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/segment-speed-shots/unit-control-moving-390.png`(숲 속을 걷는 내 사이보그·길 표시), `…/unit-control-operator-390-{pastel,dark}.png`(임시).

## 사용자 결정 대기
- 질문 1341~1344(`docs/questions/2026-11-14-segment-speed.md`), 모두 추천안으로 구현.
