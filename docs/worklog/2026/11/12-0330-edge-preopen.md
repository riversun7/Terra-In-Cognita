# 옆 2차맵 미리 띄우기·경계 너머 시야(edge-preopen)

- 일시: 2026-11-12 03:30 (KST)
- 작업 도구: Claude Code
- 관련: ADR `2026-11-08-seamless-second-map.md` "바뀜 (2026-11-12)"(이번에 씀), ADR `2026-11-07-play-flow.md` "WP15"(그때 띄우기)·"WP11"(건너뛰기 593 나), 작업 기록 `12-0215-seamless-fix.md`(문제 확인), `11-1830-map-seamless-2.md`

## 한 일
- 문제(Verified: seamless-fix 기록·코드): 도시 배후지 간격 뒤로 시작 도시 옆 2차맵은 서버가 띄우지 않은 들판이라, 기기의 이웃 구독이 `unknown_map`으로 거절되고 넘는 순간까지 온통 어두웠다.
- 서버: 플레이어 유닛이 변 가까이 오면 그 변 너머 2차맵을 넘기 전에 띄운다(미리 띄우기). 2차맵이 유닛 움직임을 바꿀 때(`setMotion`·유닛 만들기)만 색인을 고친다 — 틱마다 모든 유닛을 훑지 않는다.
  - 기준: 경로 꺾이는 점의 네모가 변에서 설정 칸 `map_preopen_cells`([임시] 48칸) 안. 변으로 가는 길(2차맵 사이 이동 구간 끝 = 변 끝 칸, 더 먼 목적지 포함)과 변 가까이 서기를 함께 잡는다. 사용자 유닛만(봇·NPC 휴먼 빼고), 변 이웃 넷만.
  - 그때 띄우기 상한 32를 같이 쓴다(꽉 차고 비운 것이 없으면 안 띄우고 `mapPreopenRefused`만 센다). 1분마다·켠 뒤 5초에 다시 본다.
  - 변 가까운 플레이어 유닛이 있는 동안 붙잡는다. 들어선 적 없는 미리 띄운 2차맵은 비면 설정 칸 `map_preopen_idle_ms`([임시] 2분) 뒤 내린다(유닛이 선 것을 살피기가 보면 보통 10분).
- 서버: 경계 너머 시야. 옆 2차맵 변에서 24칸 안에 선 플레이어 유닛의 시야 원을 이 2차맵 늘인 틀로 옮겨 덮개에 더한다(`vision.ts` `source.border`). 그 몫만 보인다: 구독을 받고(canView), 탐사 칸에 남고, 그 안 남의 유닛·건물이 보인다. 시야가 안 닿으면 띄웠어도 `not_visible`(안개 규칙 그대로). 같은 나라 덮개도 품는다.
- 서버: 지형 경로가 "띄웠지만 볼 수 없는 2차맵"에 404를 주던 것을 이웃 규칙으로 고쳤다(Verified: 첫 화면 시험이 미리 띄운 이웃 지형 404로 실패 — 띄우기 전에는 이웃 지형으로 받던 것).
- 기기: 거절된(`unknown_map`·`not_visible`) 이웃 흐름을 내 유닛 시야가 그 이웃에 닿거나 기준 유닛이 그 변으로 가는 동안 5초마다 다시 구독한다(`mapSession.ts` `retryRefused`).
- 바뀐 동작(Assumed 영향 적음): 2차맵 사이 이동은 다음 2차맵이 미리 띄워져 있으면 건너뛰지 않고 걸어서 지난다(상한 안). 건너뛰기를 보는 DB 시험(`layoutTravel.db.test.ts`)은 미리 띄우기를 끈다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/edgeWatch.ts`(새) | 변 가까운 플레이어 유닛 색인, 미리 띄우기 부르기, 붙잡기, 경계 너머 시야 자리 |
| `apps/server/src/world/mapSpawn.ts` | `openEarly`(같은 상한), 미리 띄운 2차맵 짧은 내리기, 지표 `mapsPreopened`·`mapPreopens`·`mapPreopenRefused`, `afterSweep` |
| `apps/server/src/world/mapSpawnWorld.ts` | 색인을 세계에 잇기(소유 주체로 플레이어 판별, 붙잡음, 1분 다시 보기, 지표 합치기) |
| `apps/server/src/world/mapFactory.ts` | 2차맵마다 변 고리를 넘긴다(잇기 전에 만든 2차맵도) |
| `apps/server/src/world/secondMap.ts` | 봇 아닌 유닛 움직임 알림, 시야 원천에 경계 너머 시야(+6줄, 989줄) |
| `apps/server/src/world/vision.ts`, `apps/server/src/world/borderSight.ts`(새) | 경계 너머 시야 원을 내 덮개·나라 덮개·canView에 더한다(원 찍기는 borderSight.ts) |
| `apps/server/src/world/terrainRoute.ts` | 볼 수 없는 띄운 2차맵도 이웃이면 지형 |
| `apps/server/src/world/world.ts` | `owners`를 그때 띄우기에 넘김(한 낱말) |
| `apps/server/src/tuning/scope.ts`, `packages/sim/src/society/worldSeed.ts`, `packages/sim/src/tuningWorldSeed.ts`, `content/core/tuning.json`, `content/core/manifest.json`(70 → 71) | 설정 칸 `map_preopen_cells`·`map_preopen_idle_ms` |
| `apps/game/src/map/mapSession.ts` | 거절된 이웃 다시 구독 |
| `apps/server/src/world/edgeWatch.test.ts`(새), `apps/server/src/world/edgePreopen.db.test.ts`(새) | 시험 |
| `apps/server/src/travel/travel.db.test.ts`, `apps/server/src/travel/layoutTravel.db.test.ts` | 미리 띄우기·경계 너머 시야에 맞춤(정찰 출발을 시야 밖으로, 줄 기대값 = 씨앗 2차맵, 건너뛰기 시험은 미리 띄우기 끔) |
| `e2e/seamless.spec.ts` | player 걸어서 변으로 → 넘기 전 구독·vision(unknown_map 없음), 잼 시험(E2E_MEASURE) |
| `docs/adr/2026-11-08-seamless-second-map.md` | "바뀜 (2026-11-12)" |

## 함께 바꿔야 하는 파일
- 콘텐츠 팩 판(71)은 다른 줄기도 올린다 — 통합 때 접는다.
- `world.ts`는 985줄(상한 1,000), `secondMap.ts`는 989줄: 더 붙이지 않는다.

## 건드리지 말 것
- 시야 규칙(내 유닛·건물·탐사·같은 나라)은 그대로다. 경계 너머 시야는 "옆 2차맵에 선 내 유닛"을 더했을 뿐이다.

## 검사 결과
- (아래에 채운다)

## 잰 것
- (아래에 채운다)

## 미검증·TODO·알려진 문제
- 변 가까이 오래 서 있는 유닛(접속하지 않아도)은 이웃을 계속 띄워 둔다. 상한 32가 묶는다.
- 대각선 이웃은 띄우지 않는다(모서리에서는 변 이웃 둘).
- 휴대폰 실기기 확인 없음(Unknown).

## 사용자 결정 대기
- 없음.
