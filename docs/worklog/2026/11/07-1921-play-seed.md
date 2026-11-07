# 플레이 흐름 WP1 세계 씨앗: 고정 NPC 국가마다 시작 도시 2~3곳을 시험 2차맵들에, 시작 도시마다 기본 시설

- 일시: 2026-11-07 19:21 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP1 세계 씨앗"(새로 만듦, 상태 제안), 질문 `docs/questions/2026-11-07-play-seed.md`(500~504), 가지 `work/play-seed`(main `cd2ceda`에서)

## 한 일
- 사용자 지시(2026-11-07 원문 "풀레이 흐름대로 가능하게 제작해라. 사이보그 생성부터 1차맵 기본도시 선택 및 2차맵 진입부터 만들어라. 기본 npc국가 및 기본 건물들 및 도시경제 돌아가게 하자")를 넷으로 나눈 것 가운데 WP1.
- 설정 칸 [임시] 6개(팩 core@47, 세력·사회 계수표 `worldSeed`): 시작 도시 수 아래·위 끝 2·3(`d6041_start_cities_min`·`_max`), 도시 하나의 농장·벌목장·광산·창고 수 각 1(`npc_seed_*`). 서버가 켤 때 읽는다(반영 범위 live). 시뮬은 읽지 않는다(SIM 16 그대로).
- 고정 국가마다 시작 도시 2~3곳(국가 차례로 2·3·2·3)을 띄운 시험 2차맵들에 고르게 나눈다(`npc/nations.ts` `planStartCities`: 자리 차례 17칸 × 2차맵 차례, 32칸 안에 도시·폐허가 있으면 찬 자리). 한 국가의 도시는 서로 다른 2차맵, 국가 1을 모든 2차맵에 두지 않는다. 켤 때마다 모자란 것만 더한다(옛 세계의 첫 장 도시는 그대로).
- 시작 도시마다 기본 시설(행정 건물 1 + 창고·농장·벌목장·광산)을 다 지은 채(레벨 1·상태 가득, 주인 = 그 국가 소유 주체)로 도시 가운데 둘레 빈 칸에 세운다(`facilities/npcSeed.ts`, 마당 ±5칸 비움, 건물 둘레 2칸 길, 건물 가운데의 가장 가까운 도시가 그 도시). 맵 건물 칸 + `world_facilities` 줄, 같은 쓰기 묶음. 멱등(도시마다 그 국가의 같은 시설 줄 수를 센다).
- 국가 1(시험 NPC 세력) 이름 하드코딩("시험 NPC 세력")을 지우고 팩 16번째 프리셋 이름으로(`nationName`, 2번부터가 프리셋 1~15번 코드를 쓰므로 남는 것). 사이보그 만들기·영토 화면이 같은 함수를 쓴다.
- 시험 2차맵 수 기본 1 → 6(`config.ts` `DEFAULT_TEST_MAPS`), NAS `ops/compose.yml` `S1_TEST_MAPS: "6"`. NPC 사회를 끈 세계(봇만 걷는 측정)는 옛 방식(시험 NPC 세력이 2차맵마다 가운데 도시 하나, 기본 시설 없음).
- 부팅 중 멈춤을 찾아 고침: 처음에 기본 시설을 세운 뒤 커밋을 기다리게(await) 했더니, 2차맵을 다시 놓은 뒤·경로 서비스를 켜기 전에 이벤트 루프가 돌아 다시 놓은 봇이 아직 모르는 2차맵에 경로를 물었고, 그 결과(`unknown_map`, 판 −1)가 `secondMap.ts` `onRoute`의 "그사이 건물이 놓였다" 다시 찾기에 걸려 마이크로태스크가 끝없이 돌았다(Verified: 검사기 `Debugger.pause` 호출 스택). 씨앗을 동기로 바꿨다. `onRoute` 고리 자체는 따로 고칠 일로 남김.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/worldSeed.ts`(새) | 세계 씨앗 계수(`WorldSeedCoefficients`·`START_WORLD_SEED`)·국가마다 도시 수(`startCitiesFor`) |
| `packages/sim/src/tuningWorldSeed.ts`(새), `tuning.ts`, `society/coefficients.ts`, `index.ts` | 설정 칸 6개 ↔ `worldSeed.*` 경로, 계수표 칸, 내보내기 |
| `content/core/tuning.json`, `manifest.json` | 설정 칸 6개(단위 count, 범위), core@47 |
| `apps/server/src/npc/nations.ts` | 시작 도시 자리 고르기(`planStartCities`)·국가마다 모자란 도시 더하기(`ensureTestNations`)·부팅 길(`ensureWorldNations`)·국가 1 이름 |
| `apps/server/src/facilities/npcSeed.ts`(새) | NPC 시작 도시 기본 시설 세우기(멱등) |
| `apps/server/src/facilities/service.ts`, `gateway.test.ts` | 다 지은 시설 줄을 넣는 `seedBuilt`(재료·작업 없이), 가짜 서비스 칸 |
| `apps/server/src/world/world.ts` | 부팅에서 세계 씨앗 두 줄로 잇기(줄 수 965 → 964) |
| `apps/server/src/world/cities.ts` | 옛 방식(`ensureTestStartCities`)은 NPC 사회를 끈 세계만 — 주석 |
| `apps/server/src/cyborg/service.ts` | 국가 1 이름 하드코딩 지움(팩 프리셋 이름) |
| `apps/server/src/tuning/scope.ts` | 설정 칸 6개를 서버가 읽는 칸(live)으로 |
| `apps/server/src/config.ts`, `world/worldStats.test.ts`, `ops/compose.yml` | 시험 2차맵 기본·NAS 6장 |
| `apps/server/src/npc/nations.test.ts`, `facilities/npcSeed.test.ts`(새), `facilities/npcSeed.db.test.ts`(새) | 도시 수·자리·옛 세계 멱등·이름, 기본 시설 자리·주인·멱등, DB 통합(빈 세계·옛 세계·NPC 끈 세계, 사이보그 만들기 목록 국가마다 2~3곳) |
| `apps/server/src/npc/runtime.db.test.ts`, `npc/gardener.db.test.ts` | 도시 하나에 휴먼을 모으는 시험이라 설정 칸으로 국가마다 시작 도시 하나 |
| `AGENTS.md` 7장 | `S1_TEST_MAPS` 기본 6, NPC 사회 행의 시작 도시·기본 시설 |
| `docs/adr/2026-11-07-play-flow.md`(새), `docs/questions/2026-11-07-play-seed.md`(새), `docs/PLAN.md` 14장, `docs/WORKLOG.md` | 결정·질문 500~504·목차 |

## 함께 바꿔야 하는 파일
- WP2(지도 흐름): 시작 도시가 첫 시험 2차맵(`S1_TEST_MAP_KEY`) 밖에 있을 수 있다. 지금 `/map`(`apps/game/src/map/SecondaryMapScreen.tsx`)은 `S1_TEST_MAP_KEY` 고정이라, 다른 2차맵 도시를 고른 사이보그는 내 2차맵에 보이지 않는다 — 고른 도시의 2차맵을 여는 것은 WP2. e2e `first-login.spec.ts`의 2차맵 단계도 그때 함께 본다(이 줄기는 e2e를 돌리지 않았다).
- 랭킹 판 세력 이름(`apps/server/src/ranking/paths.ts` `nationNamesOf`)은 프리셋 코드만 알아 국가 1이 코드(`s3_test_npc`)로 보인다 — `nationName`을 쓰게 바꿀 것.
- 설정 칸을 더 두면 `packages/sim/src/tuningWorldSeed.ts`·`society/worldSeed.ts`·팩 `tuning.json`·`apps/server/src/tuning/scope.ts`를 함께.

## 건드리지 말 것
- 시작 도시는 지우거나 옮기지 않는다(D-325·D-341). 자리 차례(`START_CITY_SLOTS`)의 앞 칸을 바꾸면 옛 세계 도시를 찬 자리로 못 알아볼 수 있다 — 끝에만 더한다.
- 시험 NPC 세력 코드 `s3_test_npc`(DB·봇 주인·시험이 쓴다).
- 부팅의 씨앗 세우기는 동기로 둔다(경로 서비스 켜기 전에 await 하지 않는다 — 위 멈춤).

## 미검증·TODO·알려진 문제
- 검사: 작업 중 서버 전체 시험(DB 포함) 131파일 940개 통과, sim 84파일 663개 통과, `pnpm check:content` 통과(core@47). 끝 `pnpm check`·`pnpm check:docs` 결과는 아래 "끝 검사".
- 빌드한 서버(새 DB, 봇 1,000, 시험 2차맵 6, NPC 사회 켬)를 두 번 띄움(Verified): 시작 도시 10곳(국가 1·3 = 2곳, 2·4 = 3곳, 2차맵마다 1~2곳), 시설 50개(도시마다 다섯, 레벨 1), 건물 50개, 봇 2차맵마다 166~167, `worldIssues` 0, 부팅 0.69초 → 두 번째 0.23초(더한 것 없음), RSS 350MB(2차맵 1장이면 325MB).
- NAS 운영 DB(국가 넷, 첫 장 도시 넷)에서 켜는 것은 DB 시험(옛 세계 흉내)으로만 봤다(미실행: 운영 DB).
- e2e 미실행(화면을 바꾸지 않았다). 시작 도시가 다른 2차맵이면 첫 접속 e2e의 2차맵 단계가 WP2 전까지 실패할 수 있다(Assumed).
- `secondMap.ts` `onRoute`: 경로 결과 `unknown_map`(판 −1)이 판 비교에 걸려 끝없이 다시 찾는다(경로 서비스를 켜기 전에 경로를 물으면). 따로 고칠 일.
- 서버 NPC 사회 런타임은 국가마다 도시가 여럿이 됐다(봇은 2차맵마다 가장 가까운 도시로). 정원사 웨이브를 켜면 시작 도시마다 굴린다(NAS 끔).

## 사용자 결정 대기
- 질문 500~504(시작 도시 자리·국가 1 이름·기본 시설이 생기는 길·종류와 자리·도시 수 규칙) — 지금 코드로 감.

## 끝 검사
- `TEST_DATABASE_URL=… pnpm check` 통과(Verified: 시험 453파일 3,655개, oxlint 경고 0 — 처음 돌렸을 때 oxlint `consistent-function-scoping` 하나·DB 시험 타입 둘을 고친 뒤). `pnpm check:docs` 통과(기준 `cd2ceda`). 빌드·check-pwa·check:bundle·e2e는 돌리지 않았다(게임 앱을 바꾸지 않음).
