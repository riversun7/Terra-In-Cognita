# 아무도 보지 않는 2차맵은 띄우지 않는다 — 좌표 유닛·좌표 이동 (map-coords)

- 일시: 2026-11-15 13:20 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-15-unloaded-second-maps.md`(제안), 기획 D-559 1619(사용자 원문), ADR `2026-11-07-play-flow.md` "바뀜 (2026-11-15)", `2026-11-08-seamless-second-map.md` "바뀜 (2026-11-15)", 질문 `docs/questions/2026-11-15-map-coords.md`(1641~1648), 가지 `work/map-coords`

## 한 일
- 사용자 결정(D-559 1619 "2차맵은 대충 계산하고 좌표로만 이동하고 1차맵에서만 보여주면 되지 않는가")대로 서버의 "닿을 때 띄우고 상한이면 `map_full`로 멈춤"을 없앴다.
  - 띄우지 않은 목적지로 가면 2차맵을 띄우지 않고 목표 칸의 **좌표 유닛**(서 있음)이 된다. 좌표 유닛을 다시 보내면 그 자리에서 좌표로 간다. 가는 중 멈추기 = 그 좌표에 선다. 배도 같은 규칙(띄우지 않은 바다는 좌표 항해).
  - 2차맵을 띄우는 까닭: 보는 사람(내 좌표 유닛이 선 2차맵을 열거나 운영자 전체 보기), 도중 습격(띄우지 않은 목적지에서 나면 띄워 싸움), 변 미리 띄우기(주인이 그 2차맵을 볼 때만).
  - 내리기: 보는 사람·건물·붙잡음이 없고 유닛이 모두 쉬는 중이면 한가함 → 10분 뒤 내리며 남은 유닛을 그 자리의 좌표 유닛으로.
  - 부팅: 건물이 선 2차맵만 함께 띄운다. 띄우지 않은 2차맵의 유닛 행은 좌표 유닛 장부로(리셋 없음).
  - 좌표 유닛도 유지비를 내고(정산), 로스터 유닛 수·2차맵 화면 "밖의 내 유닛" 수에 든다.
- 1차맵: 내 좌표 유닛(사이보그 본체 빼고)을 작은 점으로 그린다(`world.travels` 새 칸 `parked`). 사이보그 본체가 좌표 유닛이면 내 자리 표시가 그 자리다.
- 부하 모델(ADR "부하 모델" 절 — 사용자 설명용): 띄운 빈 2차맵 약 1.3~1.9MB/장, 걷는 유닛 1천 개 약 4~5MB·코어 0.8%, 좌표 유닛 1천 개 약 0.67MB(Verified: 실제 장부 모듈 10만 줄 = 힙 64MB·RSS +114MB, 저장소 밖 스크립트 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/map-coords/measure-book.ts`, `node --expose-gc`), 유저 1만·유닛 10만 어림, NAS에서 아직 맞지 않는 것(보는 2차맵이 수백 장이면 1GiB 상한, 도시 밖 건물 2차맵).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/travel/parked.ts`(새) | 좌표 유닛 장부(서 있음): 2차맵·주인 색인, 배+승객, 띄울 때 꺼내기(claim), 유닛 행 쓰기 |
| `apps/server/src/travel/unloadPark.ts`(새) | 내리기 전 쉬는 유닛 → 좌표 유닛, 띄울 때 막힌 칸 고치기, 띄우지 않은 2차맵 탐사 비트 |
| `apps/server/src/travel/planner.ts`(새) | 확인 단계 몫(유닛 찾기 — 좌표 유닛 포함, 길·거리). service.ts 1,000줄 상한 때문에 나눔 |
| `apps/server/src/travel/serviceParts.ts`(새) | 순수 도우미(걷기 빠르기·설 칸·좌표 유닛 줄·화면 한 줄·도착 예상) |
| `apps/server/src/travel/worldTravel.ts`(새) | 월드 잇기(정산에 좌표 유닛 목록, 띄우지 않은 2차맵 탐사 기록) — service.ts에서 옮김 |
| `apps/server/src/travel/route.ts` | `hopFrom`: 목적지까지 띄운 2차맵이 없으면 목표 칸까지 곧은 선(`landHop`), `adjacent` |
| `apps/server/src/travel/service.ts` | 좌표 이동(`float`·`landUnloaded`·`arriveUnloaded`·`settleAt`), 닿을 때 띄우기(`openThen`)·`map_full` 없앰, 배도 좌표 항해, 새 조회(`parkedAt`·`coordinateUnits`·`carries`·`claim`·`hasParked`·`parkable`·`parkAll`·`takeMetrics`), 부팅 `restore(orphans)` |
| `apps/server/src/travel/serviceTypes.ts` | `TravelSpawn` 줄임(`canOpen`·`open`), `CoordinateUnit`, 서비스·의존 모양 |
| `apps/server/src/world/mapSpawn.ts` | 한가함 = 유닛이 쉬면 내림(`parkable`·`park`), 상한일 때 한가한 것부터, `open(…, "view")` 지표, `bootExtraMaps` = 건물만, `viewed` |
| `apps/server/src/world/mapSpawnWorld.ts` | 띄울 때 행 = DB(이동 서비스가 든·다른 2차맵에 선 유닛 빼고) + 장부, 변 미리 띄우기 `watching`, 구독 때 바로 다시 보기, 지표 합치기, `viewPartsOf` |
| `apps/server/src/world/edgeWatch.ts` | 미리 띄우기·붙잡기는 주인이 볼 때만(`watching`), `reconcile(at, mapKey)` |
| `apps/server/src/world/vision.ts` | `watchedBy(ownerId)` |
| `apps/server/src/world/viewOpen.ts`(새) | 보는 사람이 띄우기(내 좌표 유닛·운영자 전체 보기, 상한이면 busy) |
| `apps/server/src/world/gateway.ts` | 띄우지 않은 2차맵 구독 → `openForView`, 구독 뒤 `viewed` |
| `apps/server/src/world/world.ts` | `openForView`·`viewed` 잇기, `travel.restore(units)`, `createWorldTravel` 가져오는 곳(+3줄, 991줄) |
| `apps/server/src/world/settlement.ts` | `offMapUnits`: 좌표 유닛도 유지비(직무 없음) |
| `apps/server/src/worldMap/reads.ts`·`travelReads.ts` | 내 자리 = 좌표 유닛 자리(`hidden: false`), "밖의 내 유닛" 수, `world.travels.parked` |
| `apps/server/src/roster/worldUnits.ts` | 유닛 수에 좌표 유닛 |
| `packages/shared/src/worldMap.ts` | `WorldParkedUnit`, `WorldTravelsResponse.parked`(선택) |
| `apps/game/src/map/useMyTravel.ts`·`PlanetMapScreen.tsx`·`CityOverlay.tsx`·`cityOverlay.css`, `apps/game/messages/{ko,en}.json` | 1차맵 좌표 유닛 점(`data-away-units`, `.city-away`), 메시지 `world_parked_unit`·`world_parked_boat` |
| 서버 시험: `travel/service.test.ts`·`sea.test.ts`·`parked.test.ts`(새)·`gateway.test.ts`, `world/mapSpawn.test.ts`·`edgeWatch.test.ts`·`gateway.test.ts`, DB `travel/layoutTravel.db.test.ts`·`world/edgePreopen.db.test.ts` | 새 규칙(좌표 유닛·보는 사람이 띄움·주인이 볼 때 미리 띄움·내릴 때 좌표 유닛) |
| `e2e/play-map.spec.ts` | 새 시험 "좌표 유닛": 띄우지 않은 들판으로 보낸 사이보그·휴먼 → 1차맵 표시 → 2차맵을 열면 그때 띄움 |
| `e2e/boats.spec.ts` | 바닷가·동쪽 바다 2차맵을 운영자 전체 보기로 띄운 뒤 보낸다(보지 않으면 좌표 유닛) |
| `docs/adr/2026-11-15-unloaded-second-maps.md`(새)·`2026-11-07-play-flow.md`·`2026-11-08-seamless-second-map.md` | 결정·구현 메모, 옛 ADR에 "바뀜 (2026-11-15)" |

## 함께 바꿔야 하는 파일
- 판: 프로토콜·팩·`SIM_VERSION` 그대로(배정받은 프로토콜 35·core@101·SIM 48은 쓰지 않았다 — 메시지·결과 코드·설정 칸·시뮬 바뀜 없음). 마이그레이션 없음.
- 띄운 2차맵에서만 유닛을 찾는 새 서비스를 만들면 좌표 유닛(`travel.parkedAt`·`coordinateUnits`)도 볼지 정한다.

## 건드리지 말 것
- 부팅 씨앗 2차맵(시험 줄·도시)은 그대로 늘 띄운다.
- 띄울 때 DB 행 거르기(`mapSpawnWorld.ts rows` — 이동 서비스가 든 유닛·다른 띄운 2차맵에 선 유닛 빼기)를 지우면 쓰기 대기열이 늦을 때 한 유닛이 두 곳에 선다.

## 리셋 필요 여부
- **리셋 필요 없음.** 배포 전 그때 띄운 2차맵(유닛만 선 들판)에 있던 유닛은 다시 켤 때 그 행의 자리에서 좌표 유닛이 되고(쓰지 않는다 — 이미 그 자리), 주인이 그 2차맵을 열면 그 자리에 다시 선다. 그 유닛의 저장한 길(`world_travels`)은 그 자리에서 좌표 이동으로 이어진다(Verified: DB 시험 `layoutTravel.db.test.ts`·서비스 시험 "다시 켜면 …"). 건물이 선 2차맵은 예전처럼 함께 띄운다.
- 배포 뒤 1분 지표에 `coordUnits`·`coordParked`·`mapParks`가 새로 보인다. `mapsOnDemand`는 줄어들 것이다(Assumed — NAS에서 재지 않음).

## 미검증·TODO·알려진 문제
- 서버 단위 시험을 `apps/server`에서 `pnpm vitest run`으로 돌리면 빌드 도장 시험 3개(`app.test.ts`·`trpc/system.test.ts`)가 실패한다 — 서버 `vite.config.ts`의 빌드 도장 define이 그 폴더 실행에 걸려서다(이 줄기와 무관, 루트 `pnpm test`는 별도 확인).
- 좌표 구간은 지형을 보지 않는다(질문 1643, ADR WP-4). 좌표 유닛끼리 만나지 않는다(질문 1641).
- NAS 부하는 재지 않았다(Unknown): 보는 사람이 많을 때의 `mapsOnDemand`·RSS는 배포 뒤 1분 지표로 본다.

## 사용자 결정 대기
- 질문 1641~1648(추천안으로 만듦): 좌표 유닛 조우, 탐사만 한 2차맵 보기, 좌표 구간 지형, 상한, 도시 밖 건물 2차맵, 남의 좌표 유닛 표시, 멈추기, 배 해상 전투.

## 검사 (Verified — 실행함)
- `pnpm check`(TEST_DATABASE_URL, 공유 기계): 포맷·린트·타입·경계·크기·다국어·대비·콘텐츠 통과, 시험 5,409 통과 / 1 실패 — `npc/cityBuildUpgrade.db.test.ts` "제재소·가마 … 판자·벽돌 레시피"(받은 값 undefined). 그 파일만 다시 돌리면 2번 모두 4/4 통과 → 부하 때 흔들리는 시험으로 본다(이 줄기가 건드리지 않은 NPC 건설 — Assumed: 무관).
- 이 줄기 시험: 서버 `travel/`(DB 포함) 10파일 54개 통과, `world/mapSpawn`·`edgeWatch`·`gateway` 통과, 게임 `src/map` 45파일 314개 통과.
- `pnpm build` 통과, `node scripts/check-pwa.mjs` 통과, `pnpm check:bundle` 첫 화면 JS 109,797B / 상한 131,416B.
- 화면 시험(`pnpm e2e`, 빌드한 서버): `play-map`·`seamless`·`planet-view`·`boats` 51 통과·1 건너뜀(측정 시험), 새 시험 "좌표 유닛"은 처음 시험 코드 실수(`stepCell` 두 칸)로 실패 → 고친 뒤 단독 1/1 통과(40초). 사진 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/map-coords-shots/map-coords-planet-390.png`·`map-coords-second-390.png`(파스텔). 1차맵 사진에서 휴먼 점은 4칸 옆 사이보그 표시 밑에 겹쳐 보이지 않는다(속성으로 확인).
- 부하 잰 값: 실제 장부 모듈 10만 줄 = 힙 64MB·RSS +114MB(개발 컨테이너).

