# NPC 휴먼 일터·시장·도시 처음 인구 (WP-NPC2)

- 일시: 2026-11-08 14:00 (KST)
- 작업 도구: Claude Code
- 관련: ADR `docs/adr/2026-11-07-play-flow.md` "WP-NPC2 (2026-11-08)", 질문 `docs/questions/2026-11-08-npc-humans.md`(770~775, 확인 대기), 기획 정리 D-523 포인터(질문 720~763 모두 기술 추천: 740 나·744 나 → 다·749 다), 가지 `work/npc-humans`(시작점 main `3d6ad70`), 앞 줄기 `docs/worklog/2026/11/08-1120-npc-presence.md`

## 한 일
- **처음 인구(749 다)**: NPC 사회 런타임이 켤 때 시작 도시마다 한 번, 휴먼이 floor(주거 × `npc_seed_population_pm` ÷ 1000)보다 적으면 모자란 만큼 휴먼을 세운다(구인과 같은 길로 도시 둘레 — 설 곳이 없으면 반경 8 → 24 → 48칸). 채운 시각 `world_cities.population_seeded_at_ms`(다시 채우지 않음 — D-469 출생 없음), 비율 0이면 표시하지 않음. 설정 칸 [임시] `npc_seed_population_pm` 750·`npc_seed_housing` 40(팩 core@53, `worldSeed.populationPm`·`startHousing`, 옛 상수 `START_CITY_HOUSING`은 기본값으로 남김).
- **봇은 시험 2차맵 줄에만(646을 749에 맞춰 고쳐 읽음)**: `world.ts spawnBots`가 시험 줄 2차맵에만 나눈다. 행성 값이 있는 세계(NAS)는 봇이 휴먼이 되지 않는다. 옛 세계 도시 2차맵에 있던 봇 휴먼은 그대로(지우지 않음, 처음 인구가 센다). 행성 값이 없는 세계(서버 시험)는 시작 도시가 시험 줄에 서서 옛 길(봇 → 휴먼)이 남는다.
- **일터(740 나)**: 저장 뒤마다 도시 경제의 시설별 일꾼 수를 그 도시 휴먼(유닛 ID 차례)에게 시설 ID 차례로 나눠 건물 시설 일꾼에게 일터(건물 가운데·반 폭 + 3칸)를 준다(`npc/humanPlaces.ts`). 봇 판단(`world/bots.ts` `tripArea`·`arrivalIdleMs`): 일 주기 30분 중 20분 [임시](유닛마다 흩음) 일터에서 45~135초씩 쉬며 짧게 옮기고, 나머지는 집 둘레에서 8~24초씩 쉰다(다가가는 중·시험 봇은 예전 2~6초). 산출은 그대로(보이는 움직임만).
- **시장(744 나)**: `npc/cityPeople.ts` — INT + WIS → 스탯 합 → 작은 유닛 ID [임시], 없거나 떠나거나 죽을 때만 다시 고르고 `world_cities.mayor_unit_id`에 쓴다(쓰기 표 `cityPeople`, 도시 행 쓰기와 따로). 정부 판 `world.government`의 `mayor`(`GovernmentMayor`: 유닛·레벨·1차 스탯·기본값 여부·만족도), 화면 시장 줄(`government/MayorFact.tsx`, "휴먼 #ID · Lv레벨"·만족도·스탯 묶음).
- **측정(Verified, 아래 "측정")**: 이 줄기 전·후 서버를 NAS와 같은 설정으로 새 DB에서 켜 1분 지표를 비교했다. 처음 값(일터 쉬는 시간 20~60초)으로 휴먼 하나당 경로 요청이 옛 값의 약 80%여서 쉬는 시간을 늘리고 다시 쟀다.

## 측정
새 DB(시험 클러스터 PostgreSQL 16), `node --import tsx src/main.ts`, `S1_TEST_BOTS=1000`·`S1_TEST_MAPS=6`·`NPC_SOCIETY=1`·`NPC_TEST_NATIONS=4`·`GARDENER_WAVES=0`, 캐시된 시험 행성(시작 도시 11곳). 1분 지표 `pathRequestsPerSec`의 평균(처음 1분 = 부팅 뺌). 같은 기계에서 다른 줄기 작업이 함께 돌았다(값은 수 비교용).

| 실행 | 유닛 | 휴먼 | 경로 요청/분 | 유닛당/분 | 루프 p99 최대 | 경로 대기 p95 최대 | RSS |
|---|---|---|---|---|---|---|---|
| 전(main `3d6ad70`, 봇 1,000 → 도시 2차맵 봇 646 = 휴먼) | 1,004 | 646 | 1,279 (17.2~23.9/초) | 1.27 | 6.8ms | 1.8ms | 559MB |
| 후 1차(일터 쉼 20~60초, 집 6~18초) | 1,334 | 330 | 1,683 (27.3~28.7/초) | 1.26 | 4.0ms | 1.7ms | 518MB |
| 후 1차 휴먼만(`S1_TEST_BOTS=0`) | 334 | 330 | 327 (5.0~6.4/초) | 0.98 | 4.3ms | 1.8ms | 381MB |
| 후(일터 쉼 45~135초, 집 8~24초) | 1,334 | 330 | 1,615 (26.6~27.4/초) | 1.21 | 4.8ms | 1.1ms | 514MB |
| 후 휴먼만 | 334 | 330 | 249 (3.7~4.9/초) | 0.75 | 4.1ms | 2.4ms | 381MB |

- 셈: 시험 봇 하나 = (후 − 후 휴먼만) ÷ 1,000. 옛 NPC 휴먼 하나 = (전 − 봇 354 × 봇 하나) ÷ 646. 시험 봇 하나 = (1,615 − 249) ÷ 1,000 ≈ 1.37회/분, 옛 NPC 휴먼 하나(집 둘레 2~6초 쉼) = (1,279 − 354 × 1.37) ÷ 646 ≈ 1.23회/분, 새 휴먼 하나 = 1차 327 ÷ 330 ≈ 0.99회/분(옛 값의 80%) → 지금 값 249 ÷ 330 ≈ 0.75회/분(61%). 모든 실행에서 경로 예산 넘침·실패 0, 경로 계산 p95 0.1~0.5ms, 프로세스 CPU 2.0~2.7%(전·후 같음).
- 휴먼 자리(DB 유닛 경로 끝 칸, 켠 뒤 약 6~10분): 채집 시설(농장·벌목장) 가운데 8칸 안 127~138명 / 330(38~42%, 도시마다 건물 일꾼 20명의 일하는 몫 2/3 ≈ 147명과 맞음) — 전(일터 없음)은 38명 / 646(6%). 시청 24칸 안은 227명 / 330(69%, 전 314 / 646 = 49%). 도시마다 일꾼 자리 = 농장 10 + 벌목장 10(건물) + 주방 도시 직무 10(건물 없음 → 집 둘레).
- 시장: 도시 11곳 모두 시장이 섰다(`world_cities.mayor_unit_id`, 그 도시 가장 작은 유닛 ID — 처음 인구는 스탯이 없어 모두 기본값).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 `npc_seed_population_pm`·`npc_seed_housing`(core@53) |
| `apps/server/src/npc/cityPeople.ts`(새)·`cityPeople.test.ts`(새) | 시장 고르기·처음 인구 목표·두 칸 저장 |
| `apps/server/src/npc/humanPlaces.ts`(새)·`humanPlaces.test.ts`(새) | 일꾼 수 → 휴먼 일터, 바뀐 휴먼만 2차맵에 |
| `apps/server/src/npc/runtime.ts` | 처음 인구 세우기, 저장 뒤 일터·시장 맞추기, `mayorOf` |
| `apps/server/src/npc/persist.ts` | 휴먼 집은 런타임이 맞춤(setHome 줄 뺌), 구인·처음 인구 자리 반경 넓혀 보기 |
| `apps/server/src/npc/state.ts`, `apps/server/src/db/schema.ts`, `apps/server/drizzle/20261108040002_city_mayor_population/`(새), `apps/server/src/world/persist/tables.ts` | 두 칸 읽기·표 정의·마이그레이션(더하기만)·쓰기 표 `cityPeople` |
| `apps/server/src/npc/nations.ts` | 새 시작 도시 주거 = 설정 칸(`startHousingOf`) |
| `apps/server/src/world/bots.ts`·`bots.test.ts`, `world/secondMap.ts`·`secondMap.test.ts` | 일 주기·일터 네모·쉬는 시간(`BotHome`) — secondMap은 바꾼 줄만(959 → 961줄) |
| `apps/server/src/world/world.ts` | 봇은 시험 줄에만(같은 줄 수) |
| `apps/server/src/government/reads.ts`·`reads.test.ts`, `packages/shared/src/government.ts` | 정부 판 시장 자료 |
| `apps/game/src/government/MayorFact.tsx`(새)·`mayorText.ts`(새)·`mayorText.test.ts`(새)·`mayor.css`(새)·`GovernmentDialog.tsx`(시장 줄 한 줄), `apps/game/messages/ko.json`·`en.json` | 시장 줄 화면·문구(ko·en) |
| `apps/server/src/npc/population.db.test.ts`(새), `npc/leaders.db.test.ts`, `npc/runtime.db.test.ts` | 처음 인구·시장 DB 시험, 봇은 시험 줄에만·정부 판 시장, 옛 봇 들이기 시험은 처음 인구 칸을 끔 |
| `e2e/government.spec.ts` | 시장 줄·휴먼 30명 기대값 |
| `AGENTS.md`, `ops/compose.yml` | 봇·NPC 사회 설명(봇은 시험 줄에만, 처음 인구) |
| `docs/adr/2026-11-07-play-flow.md`, `docs/questions/2026-11-08-npc-humans.md`(새), `docs/PLAN.md` | WP-NPC2 절, 질문 770~775, 14장 줄 |

## 함께 바꿔야 하는 파일
- 정부 판 시장 칸을 바꾸면 `@terra/shared/government` `GovernmentMayor`·`apps/server/src/government/reads.ts mayorView`·`apps/game/src/government/MayorFact.tsx`.
- 일 주기·쉬는 시간을 바꾸면 `world/bots.ts`의 상수와 `bots.test.ts`·`secondMap.test.ts`(일하는 몫 시험).
- 도시 경제 시설 ID 차례(`npc/economy.ts` `CITY_JOB_BASE`)를 바꾸면 일터 나누기 차례(`npc/humanPlaces.ts`)가 따라 바뀐다.

## 건드리지 말 것
- 정부 대화상자 틀·다른 칸(`apps/game/src/government/GovernmentDialog.tsx`·`government.css`·`governmentData.ts`)은 npc-leader 줄기 몫이라 시장 줄 하나만 바꿨다.
- 처음 인구 표시(`population_seeded_at_ms`)를 지워 다시 채우게 하지 않는다(출생이 된다, D-469). 세계 새로 시작(`reset-world`)은 도시 행을 지우므로 새로 채운다.

## 검사·시험 (개발 컨테이너, Node 24.22.1)
- 작업 중(고친 꾸러미만): 서버 `world/bots.test.ts`·`secondMap.test.ts`·`npc/humanPlaces.test.ts`·`npc/cityPeople.test.ts`·`government/reads.test.ts` 통과, DB `npc/population.db.test.ts`·`npc/leaders.db.test.ts`·`npc/runtime.db.test.ts` 통과(시험 DB PostgreSQL 16), 게임 `government` 시험 통과, 서버·게임·e2e 타입 검사, 고친 파일 oxlint(`--type-aware --deny-warnings`). 서버 전체(DB 포함) 두 번 — 시험 계수표 처음 인구 0으로 둔 판은 `combatCatalog.test.ts`(팩 tuning = 시험 계수표)가 실패해 시험 계수표도 팩과 같은 750‰로 두고 `runtime.db.test.ts`(봇 → 휴먼 옛 길)만 칸을 끄게 고쳤다.
- 끝 검사(Verified, `merge/integration` 7c80aa9를 합친 결과, 무거운 잠금 안, 시험 DB PostgreSQL 16): `TEST_DATABASE_URL=… pnpm check` 통과 — 포맷·린트·타입·경계·파일 크기·다국어(4,748키)·디자인 값·콘텐츠(core@53)·단위·DB 시험 **527파일 4,028개 통과**. `pnpm check:docs origin/main` 통과, `pnpm check:content origin/main` 통과(core@53, 기준 3d6ad70). 화면 시험: E2E_PENDING

## 미검증·TODO·알려진 문제
- NAS에서 돌려 보지 않았다(미실행). NAS 세계는 세계를 비우지 않고 이 판으로 켜면 된다(Assumed: 도시마다 옛 봇 휴먼 58~59 ≥ 목표 57~58 → 더하지 않음. 그사이 휴먼이 죽었으면 모자란 만큼만 더함). 시험 줄 봇은 줄마다 약 59 → 167로 채워져 띄운 유닛이 약 1,650이 된다(봇 1,000 + 옛 휴먼 646) — 경로 요청은 위 셈으로 봇 1,000 × 1.37 + 휴먼 646 × 0.75 ≈ 1,850회/분(전 1,279의 약 1.45배, 경로 계산 시간으로는 초당 10ms 안팎 — Assumed: 개발 컨테이너 값, NAS는 더 느리다, 질문 771).
- 처음 인구 휴먼은 스탯이 없어 시장은 사실상 가장 작은 유닛 ID다(질문 774). 휴먼 이름 없음(질문 773). 시장은 보이기만 한다(질문 775).
- 화면 시험 서버도 시작 도시마다 휴먼 30명이 걷는다(전에는 0명) — 도시 땅을 누르는 화면 시험이 휴먼을 누를 수 있다(겹치면 유닛 먼저, ADR `2026-11-08-map-input.md`). 이 줄기는 `government.spec.ts`·`unit-control.spec.ts`만 돌렸다.
- 휴먼이 다른 2차맵 도시로 옮겨 가면 일터를 받지 않는다(WP-NPC와 같음, 드묾).

## 사용자 결정 대기
- 질문 770~775(기획 세션 경유).
