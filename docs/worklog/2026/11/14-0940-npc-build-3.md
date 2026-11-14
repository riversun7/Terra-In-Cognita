# NPC 증축 3: 나라 목표에 제재소·가마(1186 나), 막아 낸 웨이브의 행정 건물 피해·수리(1190 나)

- 일시: 2026-11-14 09:40 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-540(1186 나, 1190 나, 1187~1189·1191·1192 가). 앞 작업 기록 `12-2130-npc-build-2.md`, 앞 질문 `docs/questions/2026-11-12-npc-build-2.md`(답함 표시). 새 질문 `docs/questions/2026-11-13-npc-build-3.md`(1291~1294). ADR `2026-11-11-city-building-layout.md`·`2026-10-31-combat-core.md` "바뀜 (2026-11-13, D-540)". 가지 `work/npc-build-3`(바탕 main `36bc7f3` → 조율자가 `9c5035c`로 앞당김).

## 한 일
- **1186 나 — 상한에 닿기 전 나라 목표에 제재소·가마** (Verified: 시뮬 측정·시험·DB 시험)
  - `@terra/sim` `simulator/npcBuild.ts levelSupplyFacilities`: 레벨 2 짓기 재료(팩 `buildCostAt(build, 2)` — 판자·벽돌)를 첫 레시피로 내는 시설(채집 빼고) = 제재소(`saw_planks`, 통나무 → 판자)·가마(`fire_bricks`, 잡석 → 벽돌). 팩에서 뽑아 시설 ID를 박지 않는다.
  - `withLevelSupply`: 그 시설마다 도시 목표 ≥ 설정 칸 `npc_build_level_supply`(1 [임시], 0 = 끔). 입력(통나무·잡석)을 그 도시가 갖거나 세계 어느 시설이 낼 때만. `buildPolicy`(시뮬·서버 같은 함수)가 나라 성격 목표에 더한다 — 짓기는 상한 아래에서만 고르므로 "상한에 닿기 전"이다.
  - 입력·산출 길 확인: 지은 가마·제재소는 특산이 없어도 첫 레시피를 돈다(서버 `planCityFacilities`). 입력은 거래 판단의 도시 목표 재고(일꾼이 있는 시설 입력, `npcTrade.ts cityTargets`)로 사 오고, 산출은 그 도시 창고에 들어 레벨 올리기 재료(`canObtain`·`builder.has`)로 쓰인다.
  - 찾은 문제 → 고침: 시뮬 짓기 자리는 지을 때 일 없는 휴먼만 일꾼으로 넣어, 가마 59채 중 58채가 일꾼 0으로 멈췄다(Verified: 임시 기록, build16 30일). 판단마다(settle) 증축 시설 빈 자리를 일 없는 휴먼으로 채우고, 그래도 일꾼이 없으면 일꾼이 가장 많은(둘 이상) 그 도시 시설에서 한 명을 옮긴다(서버 "시설마다 한 명씩 돌려 나눔"과 같은 뜻, 질문 1292). 서버는 원래 돌려 나눈다(Verified: DB 시험 — 가마 일꾼 > 0).
  - 요약 `npc.cities[].leveled`(레벨 2 이상 시설이 있는 도시 수, 출력 형식 20).
- **1190 나 — 막아 낸 웨이브도 행정 건물을 깎는다** (Verified: 시험·DB 시험)
  - `world/battleTargets.ts`: 목표에 `defendedOnly`(공격 편이 이기지 못했을 때만 적용), `waveNexusTarget`·`waveSiegeTargets`(넥서스 = 행정 건물 + 성벽·둘레 시설). `buildingDamageOf`가 이긴 전투면 `defendedOnly` 목표를 뺀다. 시작 자료 읽기(`targetsOf`)도 칸을 받는다(다시 켜도 남음).
  - `npc/gardener.ts`: 웨이브 공성 목표 = `waveSiegeTargets`(배치가 있을 때만). 이긴 웨이브의 넥서스는 정원사 결과 규칙(D-230)만 — 두 번 깎이지 않는다(질문 1294).
  - 수리는 앞 판 그대로(상태 700‰ 아래 → NPC 수리, 1189). 성벽·둘레 시설과 같은 결과 적용 길(`service.damage` → 쓰기 대기열 → DB).
- **1187~1189·1191·1192 가 — 모두 이미 들어 있다** (Verified: 코드·팩 읽기)
  - 1187: `npc_build_cap_l1~l6` = 8·10·12·16·20·24, 끝 32 그대로. 1188: 붐빔 숙소(상한에 닿고 생필품 1000‰) 그대로. 1189: `npc_build_repair_below_pm` 700, 성벽·행정 건물 포함, 노화 포함(`chooseCityRepair`) 그대로. 1191: 마이그레이션 `20261112111806_facility_seeded` 그대로. 1192: 상한 위 도시는 허물지 않고 레벨 올리기(`countedBuildings ≥ cap` 분기) 그대로.

## 측정
### 시뮬 30일 시드 1, 앞(main 코드 + 요약 `leveled` 칸만) → 뒤(이 판) (Verified: `node cli/sim.ts <시나리오> --days 30 --seed 1`, 위반 0)
| 시나리오 | 레벨 2+ 도시 | 레벨 올리기 | 새 건물 | 레벨 합 | 휴먼 | 벽돌 생산 | 판자 생산 | 거래 | 만족도 |
|---|---|---|---|---|---|---|---|---|---|
| build16 앞 | **0 / 69** | 0 | 851 | 1,139 | 1,363 | 0 | 0 | 1,106 | 56 |
| build16 뒤 | **23 / 69** | 144 | 599 | 1,027 | 1,670 | 49,820 | 32,752 | 2,044 | 54 |
| build16u 앞 | **20 / 69** | 101 | 518 | 964 | 1,320 | 35,732 | 21,156 | 1,665 | 55 |
| build16u 뒤 | **22 / 69** | 154 | 395 | 893 | 1,442 | 48,166 | 33,648 | 1,026 | 51 |
- econ16은 build16과 같은 파일이라 결과가 같다(Verified: 앞 판 요약이 같음).
- 등급별(뒤, 도시 수 / 레벨 2+ 도시): build16 등급 2 1/1, 3 9/4, 4 32/13, 5 26/5, 6 1/0. build16u 2 1/1, 3 14/8, 4 29/11, 5 24/2, 6 1/0.
- 새 건물이 준 것(851 → 599): 제재소가 통나무(레벨 1 짓기 재료)를 판자로 바꾸고, 가마·제재소 자체도 처음 재료·일꾼을 쓴다(Assumed: 원인 — 나눠 재지 않음, 질문 1291). 중간 판(일꾼 옮기기 전)은 레벨 2+ 도시 19곳·레벨 올리기 44번·벽돌 1,042(가마 일꾼 0).
- `guards.test.ts`(NPC 10일 시나리오): 앞 15.9초 → 뒤 15.4초(Verified, 같은 기계 — 차이 없음).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/sim/src/simulator/npcBuild.ts` | 레벨 재료 가공 시설 목표, 시뮬 증축 시설 일꾼 채우기, 요약 `leveled` |
| `packages/sim/src/npc/coefficients.ts`, `tuningNpc.ts` | 계수 `buildLevelSupply`·설정 칸 `npc_build_level_supply` |
| `packages/sim/src/simulator/run.ts`, `version.ts` | 출력 형식 20, `SIM_VERSION` 35 |
| `content/core/tuning.json`·`manifest.json` | 설정 칸(단위 `count` — 새 단위 전환은 ms 칸만 바꾼다, Verified: `tuningModel.ts`), core@82 |
| `apps/server/src/world/battleTargets.ts` | `defendedOnly`·`waveNexusTarget`·`waveSiegeTargets` |
| `apps/server/src/npc/gardener.ts` | 웨이브 공성 목표에 행정 건물(막아 냈을 때만) |
| 시험: `packages/sim/src/simulator/npcLevelSupply.test.ts`(새), `apps/server/src/world/battleTargets.test.ts`, `apps/server/src/npc/cityBuildUpgrade.db.test.ts` | |
| 문서: ADR 둘 바뀜, 질문 `2026-11-13-npc-build-3.md`(새), 앞 질문 답함 표시 | |

## 함께 바꿔야 하는 파일
- 같은 묶음 다른 줄기와 겹치는 판: `SIM_VERSION` 35(walk-agi 34 다음), 팩 core@82, 출력 형식 20(다른 줄기가 형식을 올렸으면 합칠 때 하나씩 민다).
- 웨이브가 아닌 공성에 "막아 냈을 때만" 목표가 필요하면 `defendedOnly`를 단다(결과 적용은 그대로).

## 건드리지 말 것
- 이긴 웨이브의 넥서스 목표를 늘 적용으로 바꾸지 않는다(D-230 결과 규칙과 두 번 깎인다, 질문 1294).
- 시뮬 일꾼 채우기는 증축 시설만 받는다(시나리오 시설 일꾼은 시나리오가 정한다).

## 미검증·TODO·알려진 문제
- NAS 실제 행성 세계에서 가마·제재소가 며칠 동안 서고 레벨 2가 자라는지 재지 않았다(Unknown). 씨앗 건물이 상한 이상인 시작 도시는 등급이 오를 때까지 짓지 않는다(질문 1293, Assumed: 코드 읽기).
- 웨이브 넥서스 피해는 DB 시험이 결과 적용 길(만든 시작 자료·결과)로 보았다. 실제 웨이브 전투를 막아 내는 끝까지는 돌리지 않았다(정원사 DB 시험 세계는 배치가 없어 넥서스 목표가 없고, 세 웨이브 모두 이겼다 — Verified).
- 새 건물 수가 준 것(질문 1291)은 원인을 나눠 재지 않았다.

## 검사
- Verified: `pnpm check`(TEST_DATABASE_URL 있음) 통과 — 포맷·린트·타입·경계·파일 크기·다국어(7,183키)·디자인 값·콘텐츠(core@82), 시험 674파일 5,119개.
- Verified: `pnpm check:content origin/main`(호환 포함), `pnpm check:docs origin/main`, `pnpm docs:index`.
- Verified: sim 시험 103파일 826개 + 새 `npcLevelSupply.test.ts` 3개, 서버 DB 시험 `cityBuildUpgrade`(4, 새 2)·`cityBuild`·`attack`·`gardener`, `battleTargets.test.ts`(3, 새 2).
- Verified: 화면 시험 `facilities.spec.ts`·`government.spec.ts`·`city-layout.spec.ts` 17개 중 16 통과, 1개(`government.spec.ts` "경비대 표시(920 라)")는 찾은 경비대 줄이 근처 판에서 사라져 3분 제한에 걸렸다 — 그 시험만 다시 돌려 통과(22.6초). 부하 아래 움직이는 유닛 줄의 흔들림으로 본다(Assumed: 이 판은 화면·근처 판 코드를 바꾸지 않았다). 사진 `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/npc-build-3-shots/`.
- `apps/game`은 바꾸지 않아 빌드·`check-pwa`·`check:bundle`은 돌리지 않았다(화면 시험 전역 준비가 빌드 최신을 확인함).

## 사용자 결정 대기
- 질문 1291~1294(`docs/questions/2026-11-13-npc-build-3.md`).
