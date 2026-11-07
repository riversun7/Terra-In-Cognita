# 플레이 흐름 WP5 나라 성격 — 프리셋 성격 칸·둘레 땅 기본 시설·NPC 도시 이름·특산·도시 매입 호가(시뮬)·굶음 먼저

- 일시: 2026-11-07 20:40 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP5 나라 성격", 질문 `docs/questions/2026-11-07-play-nations.md`(550~555), 기획 D-518(답 503 다·504 다·510 다·530 가·531 다·532 나·533 다), 가지 `work/play-nations`

## 한 일
- 504 다: 팩 국가 프리셋에 성격 칸 `personality.startCities`. 시작 도시 수 = 프리셋 수를 설정 칸 아래~위 끝 안으로(위 끝 3 → 4), 칸이 없으면 아래 끝(모든 국가 같음, 504 나). 국가 1은 16번째 프리셋(`presetOfCode`). 기본 국가 넷 2·4·3·2곳.
- 503 다: 시작 도시 기본 채집 시설을 그 2차맵 칸 행성 값(시작 도시 판과 같은 값)에 맞춤 — 숲 ≥ 5% 벌목장, 고도 ≥ 500m 광산, 5°C·250mm 이상 농장, 아무것도 아니면 농장(설정 칸 4개 [임시]). 지형 서비스 `cellValues`. 행성 값을 모르면 WP1 그대로(셋 다).
- 510 다: `world_cities.name`(마이그레이션 `20261107110833_city_names`), 켤 때 프리셋 `cityNames` 차례로 이름 없는 도시에 붙임. 사이보그 만들기 목록·1차맵 도시(`name`)·화면(이름 있으면 그 이름, 없으면 옛 "N" 이름).
- 531 다·533 다: 서버 NPC 도시 경제가 도시 주인의 프리셋 성격(반란은 부모)으로 도시 직무·처음 창고를 고름. 팩 프리셋 16개에 농업 대국·공업국·목재국·칸 없음 네 꼴 [임시].
- 530 가: 도시 매입 호가를 `@terra/sim npcTrade.ts placeCityBids`로 옮겨 시뮬 거래 판단 마지막 차례(서버 `placeBids` 지움). 오는 중인 내 화물은 뺌, 값 = 설정 칸 `d530_city_bid_pct` 90%. `SIM_VERSION` 17.
- 532 나: `@terra/sim assignCityWorkers` — 생필품 하루 몫을 채울 만큼 사슬 시설에 먼저, 남은 휴먼은 돌려 나눔. 서버 `syncCity`가 씀.
- 랭킹 `nationNamesOf`가 국가 1(`s3_test_npc`)도 이름(16번째 프리셋)으로.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/content/src/schema/economy.ts` | 국가 프리셋 `personality`(startCities·cityJobs·startStock)·`cityNames` 칸 |
| `content/core/nation_presets.json`·`tuning.json`·`manifest.json` | 프리셋 성격·도시 이름 [임시], 설정 칸 5개(`npc_seed_lumber_forest_pct`·`npc_seed_mine_height_m`·`npc_seed_farm_temp_c`·`npc_seed_farm_rain_mm`·`d530_city_bid_pct`), 시작 도시 칸 이름·위 끝 4, core@49 |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts` | `startCitiesFor(seed, 프리셋 수)` 새 규칙, 둘레 땅 문턱 계수 |
| `packages/sim/src/npc/coefficients.ts`·`policy.ts`·`policy.test.ts`·`tuningNpc.ts` | `cityBidPct`·`TradePolicy.bidPct` |
| `packages/sim/src/simulator/npcTrade.ts`·`npcTrade.test.ts`(새) | `placeCityBids`(서버에서 옮김), `onTrade`가 건 호가 수를 돌려줌 |
| `packages/sim/src/simulator/cityWorkers.ts`·`cityWorkers.test.ts`(새) | 굶음 먼저 일꾼 나누기 |
| `packages/sim/src/simulator/economyRun.ts`·`serverEconomy.ts`·`version.ts` | `bidsPlaced()`, 새 내보내기, SIM 17 |
| `apps/server/src/npc/presets.ts`·`nations.ts`·`nations.test.ts` | 프리셋 성격·이름 읽기, `presetOfCode`·`nameNationCities`, 시작 도시 수 |
| `apps/server/src/npc/economy.ts` | 나라 특산 직무·처음 창고, 굶음 먼저, 서버 매입 호가 지움(시뮬로), 지표 |
| `apps/server/src/market/worldInput.ts`·`world/world.ts`(두 줄) | 프리셋·지형 서비스를 경제·씨앗에 넘김 |
| `apps/server/src/facilities/npcSeed.ts`·`npcSeed.test.ts`·`npcSeed.db.test.ts` | 둘레 땅 기본 시설, 시험(국가 넷 2·4·3·2, 도시 이름) |
| `apps/server/src/world/terrainService.ts` | `cellValues(mapKey)`(받은 행성 값에서 칸 하나) |
| `apps/server/src/db/schema.ts`·`drizzle/20261107110833_city_names/` | `world_cities.name` |
| `apps/server/src/world/cities.ts`·`cyborg/service.ts`·`worldMap/reads.ts`·`packages/shared/src/cyborgApi.ts`·`worldMap.ts` | 도시 이름 싣기 |
| `apps/game/src/map/worldMapData.ts`·`worldMap.test.ts`·`start/placeSteps.tsx` | 도시 이름이 있으면 그 이름 |
| `apps/server/src/market/market.db.test.ts` | 나라 성격 DB 시험(직무·처음 창고·주방 일꾼) |
| `apps/server/src/ranking/paths.ts`·`paths.test.ts`(새) | 국가 1 이름 |
| `docs/adr/2026-11-07-play-flow.md`·`docs/questions/2026-11-07-play-*.md`·`docs/PLAN.md`·`AGENTS.md` | WP5 절, 질문 550~555(새 파일)·상태, 14장 줄, 명령표 |

## 함께 바꿔야 하는 파일
- 팩 국가 프리셋 형식을 바꾸면 `apps/server/src/npc/presets.ts`(서버 꼴로 옮김)와 `NationPersonality`(`npc/nations.ts`)를 함께.
- 시뮬 매입 호가 규칙(`placeCityBids`)을 바꾸면 `SIM_VERSION`을 올린다(서버도 같은 함수).
- `WorldMapCity`·`CreationCity`에 칸을 더하면 화면 시험 고정값(`apps/game/src/map/worldMap.test.ts`)도.

## 건드리지 말 것
- 이미 붙은 도시 이름은 고치지 않는다(멱등). 옛 세계의 이미 선 기본 시설은 둘레 땅과 달라도 지우지 않는다.
- 마이그레이션 `20261107110833_city_names`는 올라가면 고치지 않는다.

## 미검증·TODO·알려진 문제
- 시험(Verified): 작업 중 시뮬 꾸러미 시험 전체·서버 단위·DB `npcSeed.db.test.ts`·`market.db.test.ts`, 끝 검사는 아래.
- 빌드한 서버·NAS 실행은 미실행(행성 값 기반 시설 고르기는 지형 서비스가 있는 서버에서만 돈다 — 단위 시험·캐시된 행성 값으로만 확인).
- 화면 시험(`first-login.spec.ts`·`play-map.spec.ts`)은 미실행: 화면 변경은 이름 문자열 하나(이름이 있으면 그 이름)라 조정자가 묶음 검사 때 돌린다.
- 굶음 먼저의 하루 양은 레시피 대표 산출 어림(채집 추첨 시설은 다를 수 있다, Assumed).
- 경제 화면 도시 이름 `#<도시 ID>`는 그대로(TODO, 다음 줄기).
- 확인 대기: 질문 550~555.

## 끝 검사
- `TEST_DATABASE_URL=… pnpm check && pnpm check:docs` 한 번(Verified, 2026-11-07 KST, 커밋 `063b06be15` 위): 포맷·린트·타입·경계·파일 크기·다국어·디자인 값·콘텐츠(core@49) 통과, 단위·DB 시험 466파일 3711개 통과, 문서 규칙 통과(기준 `d5a320b`).
- 빌드·`check-pwa`·`check:bundle`·화면 시험은 돌리지 않았다(조정자가 묶음에서).

## 사용자 결정 대기
- 없음(기획 확인 대기만: 550~555)
