# 공성 전투맵 = 도시 실제 2차맵 배치, 성벽 고리(질문 1046 가·1048 가)

- 일시: 2026-11-12 09:30 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-533(질문 1046 가 "우선"), 질문 1048 가, ADR `2026-11-11-city-building-layout.md`·`2026-10-31-combat-core.md`·`2026-10-29-combat-map-instances.md` "바뀜 (2026-11-12)", 질문 `docs/questions/2026-11-12-siege-layout.md`(1066~1073), 가지 `work/siege-layout`(base main `4bfc786`)

## 한 일
- 사용자 원문(2026-11-11) "정부건물은 파괴시 함락되니 중앙에 두고 주변 건물이 시간을 벌수있게"를 판정에 넣었다.
- 1단계: 정원사 웨이브 공성과 건물·비콘 공격의 전투맵을 실제 2차맵 구역으로 만든다(넥서스 = 행정 건물·대상 건물 실제 칸, 다른 건물 = 실제 칸 장애물, 지형 복사, 공격 편은 들어오는 변 3칸째 줄). 공용 함수 sim `combat/siegeArena.ts`(서버·시뮬 `waveBattleInit`이 같은 함수).
- 2단계 측정(아래): 배치만으로는 시간을 벌지 못했다(공격 편이 돌아간다).
- 3단계(1048 가): 성벽 시설(`city_wall`, 방어 단계)과 NPC 시작 도시 성벽 고리, 공성 때 고리 빈 칸 = 성문, 판정에 성벽 뚫기(`combat/breach.ts`). 막음이 없는 전투는 옛 판정 그대로.
- 다시보기·3D 보기: 세계 전투 다시보기는 없다(개발자 다시보기 = 시범 6 대 6, `battleReplay/compute.ts`) — 건드리지 않았다. 전투맵 건물 칸은 작은 차례(다시보기 부호기 조건)로 만든다(시험).

## 측정 (Verified: `pnpm --filter @terra/server bench:siege-layout 6`, S2 시험 행성 F9, 빈 세계 등급 배치의 국가 차례 6도시 × 변 넷, 크리쳐 20(물리 8)·수비 휴먼 10·기술 2, 시험 전투 계수, 틱 100ms, 공유 개발 컨테이너)
넥서스(행정 건물)에 처음 닿은 시각 · 끝 시각(초), 24전투 평균:

| 전투맵 | 걷기(수비 없음) 닿음 | 끝 | 웨이브 닿음 | 끝 | 웨이브 승 |
|---|---|---|---|---|---|
| 열린 맵(이 줄기 전 서버) | 59.2 | 60.2 | 73.2 | 75.5 | 24/24 |
| 옛 배치(모드 0) 구역 | 58.7 | 59.8 | 77.4 | 80.0 | 24/24 |
| 전략 배치 구역 | 58.7 | 59.7 | 79.7 | 84.2 | 22/24 |
| 전략 배치 건물만(평지) | 58.7 | 59.7 | 73.5 | 75.8 | 24/24 |
| 전략 + 성벽 고리 5천 | 60.3 | 62.1 | 84.7 | 160.0 | 20/24 |
| 전략 + 성벽 고리 2만(출발값) | 69.0 | 70.8 | 100.3 | 173.0 | 20/24 |
| 전략 + 성벽 고리 6만 | 92.9 | 94.6 | 142.7 | 210.5 | 20/24 |

- 배치만: 걷기 시간이 열린 맵과 같다(−0.5초 — 8방향 걸음이라 돌아가도 거의 같다). 웨이브 +6.5초는 대부분 지형(평지 건물만 = 열린 맵과 같음).
- 성벽 고리 2만: 걷기 +10.3초, 웨이브 +20.6초(전략 배치만 대비). 웨이브 "끝"이 긴 것은 수비가 막아 낸 전투(공성 크리쳐를 모두 잃을 때까지)가 섞여서다.
- 전투 하나 CPU: 걷기 열린 약 290ms → 성벽 40~60ms(뚫기 장 캐시), 웨이브 0.5~1.0초.
- 한 도시(0:420,292 수도) 서쪽: 표 전체는 측정 출력(저장소 밖)에 있다. 다시 재려면 위 명령.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/combat/siegeArena.ts`(새)·`siegeArena.test.ts`(새), `package.json`(`./siegeArena` 진입점) | 2차맵 배치 → 공성 전투맵·시작 자리·성문, 웨이브 변. `index.ts`가 999줄이라 진입점을 따로 |
| `packages/sim/src/combat/breach.ts`(새)·`breach.test.ts`(새), `battleMap.ts`, `battle.ts` | 성벽 칸·뚫기 거리장·칠 막음(막음이 있을 때만) |
| `packages/sim/src/simulator/waveBattle.ts` | `layout`·`attackEdge` 입력(없으면 옛 열린 맵 그대로) |
| `packages/sim/src/society/worldSeed.ts`, `tuningWorldSeed.ts`, `content/core/tuning.json` | 설정 칸 `city_wall_mode`·`_ring_cells`·`_gates`·`_gate_cells` |
| `content/core/facilities.json`·`manifest.json`(core@74), `packages/content/src/schema/economy.ts`, `packages/shared/src/buildingEditor.ts` | 단계 `defense`, 시설 `city_wall` |
| `apps/game/messages/{ko,en}.json`, `editor/buildings/buildingMessages.ts`, `economy/economyText.ts` | 단계 이름 "방어"/"Defense" |
| `apps/server/src/facilities/siegeLayout.ts`(새)·`siegeLayout.test.ts`(새) | 서버 상태 → 공성 입력(행정 건물·장애물·성벽·성문·지형), 시설 내구도 점 셈 |
| `apps/server/src/facilities/cityWalls.ts`(새)·`cityWalls.test.ts`(새), `npcSeed.ts`(+시험 둘) | 성벽 고리 계획·씨앗·공성 성문 |
| `apps/server/src/facilities/attack.ts`(+DB 시험) | 건물·비콘 공격 전투맵 = 2차맵 구역, 들어오는 변 = 공격 유닛 쪽 |
| `apps/server/src/npc/gardener.ts`, `npc/runtime.ts`, `world/world.ts`(1줄) | 웨이브 공성에 도시 배치(`citySiegeLayoutOf`) |
| `apps/server/src/facilities/cityRelayout.ts` | 다시 놓기가 성벽을 옮기지 않음(고정) |
| `apps/server/bench/siegeLayout.ts`(새), `package.json`(`bench:siege-layout`), `tsconfig.json`·`bench/tsconfig.json` | 측정 |
| ADR 셋 "바뀜 (2026-11-12)", 질문 1066~1073 | 결정·측정·물을 것 |

## 함께 바꿔야 하는 파일
- 팩 판: 다른 줄기도 core@74로 올렸으면 합칠 때 하나 더 올린다.
- 성벽 시설 ID·단계(`city_wall`·`defense`)를 바꾸면 `facilities/cityWalls.ts`·`siegeLayout.ts`·`cityRelayout.ts`도.
- `combat/battleMap.ts`의 건물 칸을 더 바꾸면 `breach.ts`(막음 판정)와 다시보기 부호기(`packages/protocol` `battleReplayCodec.ts` — 지금 `wall` 칸은 싣지 않는다).

## 건드리지 말 것
- 막음이 없는 전투의 판정(옛 판정과 같아야 한다 — sim 시험 753개). 바꾸면 `SIM_VERSION`을 올린다.
- `world/world.ts`는 994줄이다(1,000 넘으면 CI 실패).

## 미검증·TODO·알려진 문제
- 실제 NAS 세계에서 웨이브 공성 실행은 하지 않았다(미실행, 시험·측정은 서버 함수·sim 판정으로). 시가지 안 시설 공격은 공성 선포가 없어 여전히 막힌다(safe_zone).
- 시뮬레이터 공성·웨이브는 열린 맵이다 → 정원사 맞추기 값과 서버가 어긋난다(질문 1068).
- 성벽 내구도 규모(1066), 웨이브 변(1067), 웨이브 넥서스 내구도(1069)는 [임시].
- 다시 놓기로 행정 건물이 옮겨지면 성벽 고리가 어긋난다(1071).
- 2차맵에 성벽 겉모습(`look`)이 없다 — 기본 상자 모양(Assumed: 엔진 기본값, 사진으로 확인 필요).
- 다시보기 부호기는 성벽 칸을 모른다(세계 전투 다시보기가 생기면 더한다).

## 사용자 결정 대기
- 질문 1066~1073(`docs/questions/2026-11-12-siege-layout.md`).
