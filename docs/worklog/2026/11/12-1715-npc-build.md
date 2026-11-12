# NPC 도시 증축(유저와 같은 규칙)·NPC 휴먼 크기 1·걷기·기획 D-534 확인

- 일시: 2026-11-12 17:15 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-534(질문 1096~1110 모두 기술 추천), 질문 1101 나·1106 가, 새 질문 `docs/questions/2026-11-12-npc-build.md`(1141~1146), ADR `2026-11-11-city-building-layout.md` "바뀜 (2026-11-12, NPC 증축)"·`2026-11-07-play-flow.md` "바뀜 (2026-11-12, NPC 도시 휴먼 몸)". 가지 `work/npc-build`(바탕 main `9e30065`)

## 한 일
- **1106 가 — NPC 도시 휴먼 = 크기 1·걷기**(Verified: 코드·시험)
  - 휴먼 몸이 정해지는 곳은 `SecondMap.spawnBotNear`(구인·처음 인구가 `npc/persist.ts`에서 부름) → `botPlan`(시험 봇 규칙 8% 크기 2·2% 크기 3·15% 차)이었다. 새 `humanPlan`(크기 1·걷기, 자리 난수 차례는 같음)으로 바꿨다.
  - 옛 휴먼: NPC 런타임이 켤 때 거울 세계 휴먼마다 `SecondMap.setHumanBody` — 지금 자리에서 멈추고 크기 1·걷기로 바꿔 유닛 행에 저장(마이그레이션 없음), 시작 기록 `reshaped`. 시험 2차맵 시험 봇(`spawnBots`)은 옛 규칙 그대로.
  - `secondMap.ts`가 1,000줄 상한에 닿아 저장 행 모양(UnitJob·UnitRow·BuildingRow·MapPersist)을 `secondMapRows.ts`로 나누고 다시 내보냈다.
- **1101 나 — NPC 도시 증축**(Verified: 시험·시뮬 측정)
  - 판단(시뮬·서버 같은 함수): `@terra/sim` `npc/build.ts chooseCityBuild`(숙소 = 침대 모자람, 농장 = 휴먼·생필품, 채집 = 배후지 원자재 몫, 상한) + `simulator/npcBuild.ts buildPolicy`(재료 = 팩 레벨 1 `buildCostAt`, 시간 = `buildTimeAt` → 일 없는 휴먼으로 `withBuilders`, 모자란 재료는 `Economy.buildWants` → 도시 목표 재고 → 거래 판단이 국고로 산다, 세계 어느 시설도 내지 않는 재료는 사지 않는다). NPC 판단 `decide`가 구인 규칙식 다음에 부른다.
  - 시뮬 짓기 자리 `simNpcBuilder`(도시 창고에서 재료를 빼 `sink`로, 다 지으면 다음 판단에 첫 레시피 시설로), 서버 짓기 자리 `apps/server/src/npc/cityBuild.ts`(자리 = 전략 배치 `facilities/npcPlacement.ts planNpcSpots` — 세계 씨앗과 같은 함수로 나눔, 짓기 = 건물 서비스 새 `npcBuild` = 플레이어 `build`와 같은 재료 자리·건물 칸·작업 줄, 다 지으면 `ServerEconomy.refreshCity`).
  - 시뮬 목록에 시설 짓기 재료(`CatalogFacility.build`)를 싣는다(시뮬 CLI·서버 경제 목록). 시뮬 감사 규칙에 `sink` ← `facility_build`.
  - 설정 칸 넷(팩 core@76, `npc_build_max_buildings` 16·`npc_build_gather_max` 3·`npc_build_farm_humans` 12·`npc_build_builders_max` 4, 모두 [임시]). `SIM_VERSION` 27, 출력 형식 18(요약 `npc.builds`·`buildsDone`). 새 시나리오 `build16`(econ16 + 도시마다 통나무 벌목장 하나 — econ16에는 통나무를 내는 시설이 없어 증축 0, 질문 1144).
- **확인만**(Verified: 코드 읽기)
  - 1096 가: 마을 = 행정 건물 + 숙소(`npcSeed.ts villagePlan`, 설정 칸 `npc_village_lodgings` 1). 그 뒤 증축은 이번 1101 규칙으로 자란다(NPC 세력 도시면).
  - 1097 가: 가문 국고가 모자라면 가문장 지갑(`factionIdentity/houseRecruit.ts`, `npc/houseRecruit.ts` prepaid).
  - 1098 가: 가문 세력은 경비대 목표가 없어(`guardsPerCity`는 고정 국가만) 자동 구인을 끄든 켜든 경비대를 사지 않는다. NPC 국가의 경비대 다시 채우기는 구인 규칙식 안 따로 몫.
  - 1099 가: 씨앗·마을 건물은 재료·작업 없이 다 지은 채(`seedNpcFacilities` → `seedBuilt`).
  - 1100 가: 국가 땅이 버티는 도시 수는 세계 배치 화면 배후지 덮개 보이기만(`world/catchmentView.ts sustainOf` → `placementService` 읽기).
  - 1107 가(임시 모델 `apps/game/src/map/unitModels.ts`·`packages/engine/src/characters/unitBodies.ts`), 1108 가(`apps/game/src/map/unitNames.ts` NAME_MIN_PX 20·NAME_MAX 10·NAME_CROWD 40), 1110 가(`world/unitKinds.ts wireKindOf` = 서버 기본 빠르기). 1109(가 + 나, 구인 휴먼 이름 저장)는 저장 칸이 필요한 따로 줄기라 넣지 않았다(Verified: 이름 칸 없음).

## 측정 (Verified: 저장소 밖 일회성 스크립트로 `runSimulation`, 시드 1)
| 시나리오 | 날 | 증축 켬: 짓기(누적) | 도시당 | 인구 | 국고 합 |
|---|---|---|---|---|---|
| build16 | 1 | 52 | 0.75 | 972 | 449,558 |
| build16 | 3 | 283 | 4.10 | 990 | 283,713 |
| build16 | 7 | 535 | 7.75 | 993 | 238,853 |
| build16 | 14 | 639 | 9.26 | 989 | 174,640 |
| build16 | 30 | 704 | 10.20 | 960 | 133,097 |
| build16 끔 | 30 | 0 | 0 | 979 | 188,608 |
| econ16 켬·끔 | 30 | 0 | 0 | 974 | 219,115(같음) |
- 도시 69곳(살아 있는 세력 44). 도시마다 처음 약 4.5채 → 30일 뒤 약 14.7채(상한 16). 30일 짓기 704건: 약초원 180·농장 160·광산 148·숙소 128·벌목장 60·목장 28. 짓는 시간 평균 151초·최대 272초. 불변 조건 위반 0.
- 국고 합(나라마다 다른 화폐를 그냥 더한 값)은 증축 켬이 끔보다 29% 적다 — 재료 사기와 걸어 둔 매수 주문 몫(Assumed: 둘을 나눠 재지 않음). 인구는 자라지 않는다: 시뮬 주거가 고정이고 숙소가 주거를 늘리지 않는다(질문 1089 — logistics-2 줄기).
- 서버(Verified: DB 시험 `cityBuild.db.test.ts`): 도시 둘(국가 둘 × 도시 하나), 재료를 채우고 3시간 → 도시마다 농장 하나(레벨 0 + 짓기 작업, `builtBy` 없음), 3시간 더 → 레벨 1, 도시 경제 생산에 들어감, 다시 켜도 시설 줄 그대로, NPC 휴먼 모두 크기 1·걷기.

## 검사 (Verified: 실행)
- `pnpm check`(TEST_DATABASE_URL 있음): 통과 — 시험 파일 646개·시험 4,945개.
- `pnpm check:content origin/main`: 통과(core@76). `pnpm check:docs origin/main`: 통과.
- `apps/game`은 바꾸지 않아 빌드·`check-pwa`·`check:bundle`·화면 시험은 돌리지 않았다.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `apps/server/src/world/bots.ts` | `humanPlan`·`HUMAN_SIZE`(1106 가) |
| `apps/server/src/world/secondMap.ts`·`secondMapRows.ts`(새) | `spawnBotNear` = 휴먼 몸, `setHumanBody`, 저장 행 모양 나눔(1,000줄) |
| `apps/server/src/npc/runtime.ts` | 켤 때 옛 휴먼 몸 고침, 증축 칸(`ctx.build`) |
| `packages/sim/src/npc/build.ts`(새)·`coefficients.ts`·`tuningNpc.ts` | 증축 판단·설정 칸 |
| `packages/sim/src/simulator/npcBuild.ts`·`npcBuildEntry.ts`(새) | 증축 실행(시뮬·서버 공용 판단, 시뮬 짓기 자리), 묶음 내보내기 |
| `packages/sim/src/simulator/npcRun.ts`·`run.ts`·`economy.ts`·`npcTrade.ts`·`catalog.ts`·`economyRun.ts`·`version.ts`·`index.ts` | 판단에서 부름, 카운트, `buildWants` → 목표 재고, 짓기 재료 칸, 감사 규칙, SIM 27·출력 형식 18 |
| `packages/sim/cli/common.ts`·`apps/server/src/market/catalog.ts` | 시뮬 목록에 짓기 재료 |
| `packages/sim/scenarios/build16.json`(새) | 측정 시나리오 |
| `apps/server/src/facilities/service.ts` | `npcBuild`(플레이어 짓기와 같은 규칙, 동기) |
| `apps/server/src/facilities/npcPlacement.ts`(새)·`npcSeed.ts` | 전략 배치 몫 나눔(씨앗·증축 같은 함수) |
| `apps/server/src/npc/cityBuild.ts`(새)·`economy.ts`·`market/worldInput.ts` | 서버 짓기 자리, `refreshCity`, 입력 `build` 칸 |
| `content/core/tuning.json`·`manifest.json` | 설정 칸 넷, core@76 |
| 시험: `npc/build.test.ts`·`simulator/npcBuild.test.ts`·`npc/cityBuild.db.test.ts`(새), `secondMap.test.ts`, `facilities/gateway.test.ts`(가짜 서비스) | |
| 문서: 질문 `2026-11-12-npc-build.md`(새), ADR 두 곳 "바뀜", 질문 `catchment-db`·`unit-looks` 답 줄 | |

## 함께 바꿔야 하는 파일
- 다른 줄기와 겹치는 판: 팩 core@76·`SIM_VERSION` 27·출력 형식 18(합칠 때 모아 정리).
- logistics-2(1089 숙소 침대 = 인구 상한)가 합쳐지면 NPC 숙소 증축이 인구를 늘린다 — 측정을 다시 볼 것.
- `packages/sim/src/simulator/economy.ts` `Economy`에 칸을 더하면 서버 `npc/economy.ts`의 경제 리터럴(선택 칸이라 지금은 그대로)도 본다.

## 건드리지 말 것
- 시험 2차맵 시험 봇의 옛 크기·빠르기 규칙(`botPlan`) — 규모 시험(S1·S3)이 쓴다.
- 서버 `npcBuild`는 NPC 몫이다(일꾼 유닛을 묶지 않음, `builtBy` 없음). 플레이어 `build`와 섞지 않는다.

## 미검증·TODO·알려진 문제
- 서버를 다시 켜면 이번 실행에 건 짓기 기억(`started`)을 잃는다 — 다 지은 건물은 다음 하루 끝 시설 맞추기가 생산에 넣는다(그때까지 최대 하루). 짓는 중 여부는 작업 줄로 안다.
- 실제 행성 세계(NAS)의 서버 증축은 DB 시험(시험 행성 2도시)만 돌렸다. 큰 세계에서 배치 계획(`layoutGroundOf`가 격자를 통째로 복사) 비용은 재지 않았다(Unknown). 짓기 하나에 한 번이라 드물다(Assumed).
- 도시 거래 판단이 넉넉한 짓기 재료를 남는 물건으로 팔아 버릴 수 있다(목표 재고에 들지 않은 재료) — 다음 판단에서 다시 산다.
- 1109(구인 휴먼 이름) 미구현.

## 사용자 결정 대기
- 질문 1141~1146(빠르기·짓는 시설·상한·통나무·일꾼·레벨 올리기).
