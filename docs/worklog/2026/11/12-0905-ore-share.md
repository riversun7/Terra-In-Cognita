# 광석 고도 몫 — 석재·구리는 어디서나 조금, 높은 티어는 산지

- 일시: 2026-11-12 08:40 ~ 10:00 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/ore-share`(main `4bfc786`에서), 기획 D-533(질문 1020·1064 → "석재·구리는 어디서나 조금(고도에 따른 몫), 높은 티어 광석은 산지", D-507 "하위 광석은 건축 재료"), 질문 1027 다, ADR `2026-11-11-city-catchment.md` "바뀜 (2026-11-12): 광석 고도 몫", 질문 `docs/questions/2026-11-12-ore-share.md`(1076~1083), 앞 줄기 `12-0241-catchment-2.md`

## 한 일
1. 광석 고도 몫(`@terra/shared/catchment` `oreSharePm`): 0m 이하 150‰ · 언덕 200m 400‰ · 산지 500m(옛 `npc_seed_mine_height_m`) 이상 1000‰, 사이는 곧게, 물에 잠긴 칸 0. 새 설정 칸 넷 [임시]: `ore_share_low_pm`·`ore_share_hill_m`·`ore_share_hill_pm`·`ore_low_tier_max`(2). `npc_seed_mine_height_m`은 이제 "산지 고도"(이름·설명 바꿈). 2차맵 생성기 판은 올리지 않았다(1064 나).
2. 칸 몫(`cellSharesPm`): supply(채집 다툼 재고 — 광석만 몫, 나머지 비트), site(자리 점수 — 목재 = 숲 밀도, 약초 = max(목재, 작물), 질문 1027 다). `sumShares`·`shareCoveragePm`, 높은 티어 칸 `highOrePm`(산지 칸 1000).
3. 채집 다툼(`stepCatchmentSupply`): 칸마다 캐는 양을 칸 재고 상한 비례로. 시뮬 `catchmentRun.ts`: 도시마다 땅 몫(`landShares` — 원자재마다 배후지 칸 몫 평균, 광석 산지 몫)을 셈해 캐려는 양 × 땅 몫, 빠르기 = 받은 몫 × 땅 몫(바닥 위), 광산 티어 막기 `oreTierCap`(T2 위는 산지 몫만큼만, 나머지 T2 — `economy/gather.ts` `tierCap`). `SIM_VERSION` 26.
4. 시뮬 시나리오: `catchment.elevationM`·세력 묶음 `catchmentElevationM`(평면 칸 고도). 없으면 옛 결과 그대로.
5. 서버: `npc/catchmentGeometry.ts`가 칸 몫·산지 몫을 준다(NPC 도시 경제 = 시뮬 경제 실행). `world/citySites.ts` 덮임을 몫으로(`createCatchmentCache`·`summarize` — 수도·지방 도시 자리 고르기). `facilities/npcSeed.ts` `landGather`: 광산은 광석 몫이 있는 마른 땅 어디나, 농장도 벌목장도 아니면 농장.
6. `/dev/world-layout` 배후지 덮개: 몫 규칙 한 줄(`data-catch-ore`), 도시 표 광석 몫‰·산지 몫‰, 범례 "산지 광석(높은 티어)". tRPC `worldLayout.catchment` 응답에 `ore`·`orePm`·`highOrePm`(ko·en 문구 함께). 설정 칸 패널은 새 칸 넷을 그대로 보인다(Assumed: 패널은 팩 칸을 모두 보인다 — 화면은 열어 보지 않음).
7. 측정 스크립트 `apps/server/bench/citySpacing.ts`: 30일 채집 다툼을 서버와 같은 칸 몫·땅 몫으로, 광석 줄(얻는 도시·높은 티어·광석 몫·산지 몫·광산 빠르기·하루 캔 양·도시 고도)과 도시 표 칸.
8. 세계는 새로 시작하지 않았다(NAS 건드리지 않음).

## 측정 (Verified: 실행)
### 시작 도시 (`node apps/server/bench/citySpacing.ts`, S2 시험 행성 F9, 국가 16개 국력 등급, 도시 49, 못 세운 도시 0)
| 지표 | 바뀌기 전(main 4bfc786) | 뒤 |
|---|---|---|
| 석재·구리를 얻는 도시(배후지 광석 몫 > 0) | 0/49 | 49/49 |
| 높은 티어(배후지에 산지 칸) | 0/49 | 0/49 |
| NPC 씨앗 땅 판정 광산 맞음 | 0/49 | 49/49 |
| 광산을 짓는 도시(국가 시작 시설 광산 ≥ 1) | 0 | 39 |
| 배후지 광석 몫 | — | 최소 151 · 중앙 254 · 평균 249 · 최대 457‰ |
| 광산 빠르기(30일째 받은 몫 × 땅 몫) | — | 최소 151 · 중앙 235 · 평균 246 · 최대 457‰ |
| 30일째 하루 광석 캔 양(배후지 재고 단위) | — | 최소 150 · 중앙 345 · 평균 371 · 최대 755 |
| 30일 채집 다툼 받은 몫 평균·최저, 성장 멈춤 | 982‰·121‰, 1곳 | 1000‰·1000‰, 0곳 |
| 덮임 평균(혼자) | 749‰(비트) | 730‰(몫) |
| 도시 칸 고도 | — | 1 ~ 234m(중앙 83m) |
| 같은 자리에 남은 도시 | — | 5/49(44곳 이동 — 새 자리는 세계 새로 시작 뒤) |
| 요구 반경으로 겹친 쌍 | 0 | 0 |
| 같은 국가 가장 가까운 거리 변동 계수 | 0.177 | 0.217 |

### 시뮬 30일 (seed 1, `pnpm --filter @terra/sim sim … --days 30`)
- econ16·catchment4: 바뀌기 전과 산출·유닛·사건 수가 같다(고도 칸 없음, hash는 판 번호 때문에 다르다: econ16 466d76d0 → ae57931c, catchment4 231e5327 → 2131bbab). catchment4 성장 멈춤 4곳·받은 몫 평균 751‰ 그대로.
- econ16의 공업 묶음(ind 8세력 × 4도시 = 32도시, 광산 2명)을 고도만 바꿔(시나리오 사본 `catchmentElevationM`, 저장소 밖) 30일 산출(하루 평균 = ÷ 30):

| 공업 도시 고도 | 600m(산지 — 바뀌기 전과 같음) | 300m(몫 600‰) | 50m(몫 212‰) |
|---|---|---|---|
| 구리 광석 | 12,136kg (404kg/일) | 11,446kg (382kg/일) | 4,292kg (143kg/일) |
| 철광석 | 6,198kg (207kg/일) | 246kg(첫날만) | 246kg(첫날만) |
| 잡석 | 85,738kg (2,858kg/일) | 54,204kg (1,807kg/일) | 21,018kg (701kg/일) |
| 석재 | 18,448kg (615kg/일) | 11,624kg (387kg/일) | 4,504kg (150kg/일) |
| 철 주괴 | 4,242 | 77 | 77 |
| 생활용품 | 2,111 | 34 | 34 |
| 끝 유닛(농업·공업) | 505·120 | 490·120 | 490·120 |

  철광석 246kg은 첫날(하루 끝 전에는 배후지 셈이 없어 막지 않는다). 철이 없으면 제련소·공방이 멈춰 생활용품이 줄고 농업 묶음 유닛이 15 준다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/catchment.ts` | 광석 고도 몫·칸 몫·몫 덮임·산지 몫, 채집 다툼 칸 상한 비례 |
| `packages/sim/src/simulator/catchmentRun.ts` | 땅 몫(`landShares`)·빠르기 × 땅 몫·광산 티어 막기(`oreTierCap`)·평면 고도 |
| `packages/sim/src/economy/gather.ts`, `simulator/economy.ts` | 추첨 티어 막기(`tierCap`)를 광산 묶음에 |
| `packages/sim/src/simulator/scenario.ts` | 시나리오 `catchment.elevationM`·`catchmentElevationM` |
| `packages/sim/src/society/worldSeed.ts`, `tuningWorldSeed.ts`, `content/core/tuning.json`, `manifest.json` | 설정 칸 넷 + 산지 고도 칸 이름, 팩 core@74 |
| `packages/sim/src/version.ts` | `SIM_VERSION` 26(서버 NPC 경제 결과가 바뀐다) |
| `apps/server/src/npc/catchmentGeometry.ts` | 서버 칸 몫·산지 몫 |
| `apps/server/src/world/citySites.ts` | 자리 점수 덮임 = 몫(1027 다) |
| `apps/server/src/facilities/npcSeed.ts` | 광산은 마른 땅 어디나, 식량 대체 |
| `apps/server/src/world/catchmentView.ts`, `packages/shared/src/worldPlacementApi.ts` | 덮개 화면 광석 몫·산지 몫·규칙 |
| `apps/game/src/editor/worldLayout/*`, `apps/game/messages/{ko,en}.json` | 덮개 화면 칸·문구 |
| `apps/server/bench/citySpacing.ts` | 측정 줄 |
| 시험: `catchment.test.ts`, `catchmentRun.test.ts`, `gather.test.ts`, `citySites.test.ts`, `npcSeed.test.ts`, `worldLayoutModel.test.ts`, `e2e/world-layout.spec.ts` | 새 셈·바뀐 값 |

## 함께 바꿔야 하는 파일
- 다른 줄기도 팩 판(core@74)·`SIM_VERSION`(26)을 올리면 통합 때 접는다.
- `catchment-db` 줄기가 칸 재고를 DB에 저장하면 재고 상한이 이제 광석 몫(0~1000)이다 — 저장 값은 그대로 쓰면 된다(상한 셈만 바뀜).
- 설정 칸 `npc_seed_mine_height_m`을 고치면 광석 몫 곡선의 산지 끝과 높은 티어 칸이 함께 바뀐다.

## 건드리지 말 것
- 2차맵 생성기 판(1064 나) — 지형 캐시를 다시 굽게 된다.
- NAS 세계: 새로 시작하지 않았다. 새 시작 도시 자리는 세계 새로 시작 뒤에만 든다.

## 미검증·TODO·알려진 문제
- 서버 NPC 경제를 실제 행성·DB로 돌려 하루 생산을 재지는 않았다(Unknown). 측정 스크립트의 광산 빠르기와 시뮬 고도 사본으로 갈음했다(Assumed: 서버 NPC 경제 = 시뮬 경제 실행 + 행성 칸 몫).
- 지금 NAS 세계는 이 줄기를 들인 첫 부팅에서 NPC 씨앗이 모자란 광산을 더한다(질문 1082, Assumed: `seedNpcFacilities`의 멱등 규칙을 읽음 — 실행하지 않음).
- 시작 도시 배후지에 산지 칸이 없어 NPC 철은 0(질문 1079).
- 낮은 땅 2차맵에는 플레이어가 캘 바위·광맥이 없다(질문 1083).
- 검사 결과는 아래 "검사"에 적는다.

## 검사
- (작업 끝에 채운다)

## 사용자 결정 대기
- 질문 1076~1083(`docs/questions/2026-11-12-ore-share.md`).
