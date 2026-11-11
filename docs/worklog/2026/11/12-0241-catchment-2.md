# 도시 크기에 따라 넓어지는 배후지·크기 간격·채집 다툼과 고갈

- 일시: 2026-11-12 02:41 ~ 04:10 (KST)
- 작업 도구: Claude Code
- 관련: 가지 `work/catchment-2`(통합 머리 `12f3cce9b1`에서), ADR `2026-11-11-city-catchment.md` "바뀜 (2026-11-12)"(상태 제안 그대로), 질문 `docs/questions/2026-11-12-catchment-2.md`(1056~1065), 앞 줄기 작업 기록 `11-2250-city-spacing.md`

## 사용자 지적(2026-11-11, 원문)
"도시가 일정한 간격으로 배치되는문제. 아까 말했을텐데? 도시는 주변 영역에서 자원을 채집하여 유지해야하는데 인구와 도시등급이 높을 수록 높은자원과 기술을 요구하여 요구 영토범위가 넓어지고, 인근 도시와 인접영토를 경쟁하면 두 도시 모두 자원고갈 문제라고."

## 한 일
1. 요구 반경 함수(`@terra/shared/catchment` `catchmentRadiusMilli`): 넓이 = 인구 × 칸/100명 × (등급 기본 + 걸음 × (등급 − 1) + 기술 × 몫), 반경 = √(넓이 ÷ π). "도시등급" = D-137 발전도 도시 등급(`cityGrade`). 설정 칸 열넷 `city_catchment_*`([임시], 팩 core@71).
2. 크기 간격 배치(`world/citySites.ts`·`worldLayout.ts` 머리 주석 5): 간격 = (두 반경 합) × 천분율. 시작 도시는 처음 기간 크기(국가 등급 주거, 계획 등급 4, 수도는 × 1250‰·등급 + 1 — `@terra/sim` `plannedCityRadiusMilli`)로 띄운다.
3. 채집 다툼과 고갈(`stepCatchmentSupply`, 시뮬 `simulator/catchmentRun.ts`): 칸 × 원자재 재고, 로지스틱 다시 자람, 겹친 칸은 함께 캐기. 받은 몫이 채집 시설 빠르기와 NPC 구인(성장 멈춤)을 정한다. 시뮬은 시나리오 `catchment` 칸(평면 배치), 서버 NPC 도시 경제는 행성 1차맵 칸(`npc/catchmentGeometry.ts`). `SIM_VERSION` 25, 출력 형식 17.
4. `/dev/world-layout` 배후지 덮개: 도시마다 지금 반경(실선)·목표 반경(가는 점선)·다툼(위험 색), 요약 겹친 쌍·다툼 칸, 고른 국가 도시 표.
5. 측정 스크립트(`apps/server/bench/citySpacing.ts`)에 요구 반경·변동 계수·등급별 거리·30일 채집 다툼, `--fixed <칸>`(앞 줄기 배치).
6. NAS 세계는 건드리지 않았다.

## 측정 (Verified: 실행)
S2 시험 행성 F9, 팩 국가 프리셋 16개 국력 등급, 도시 49(못 세운 도시 0). 옛 = `--old`(바둑판), 고정 = `--fixed 2`(앞 줄기 city-spacing), 새 = 이번.

| 지표 | 옛 | 고정 2칸 | 새 |
|---|---|---|---|
| 같은 국가 가장 가까운 도시 | 0.80~2.17칸 | 4.06~7.86칸 | 4.34~9.33칸 |
| 등급별 중앙(초강대국·강대국·중견국·소국) | 2.03·2.13·0.97·0.94칸 | 5.27·5.64·5.55·6.44칸 | 6.51·7.28·6.73·6.48칸 |
| 등급 안 변동 계수(바둑판 ≈ 0) | 0.056·0.099·0.104·0.071 | 0.126·0.154·0.170·0.165 | 0.209·0.139·0.145·0.161 |
| 같은 국가 전체 변동 계수 | 0.358 | 0.171 | 0.177 |
| 다른 국가 가장 가까운 도시 최소 | 23.17칸 | 15.18칸 | 16.93칸 |
| 요구 반경(1.82~3.06칸)으로 겹친 쌍 | 67 | 8 | 0 |
| 둘 이상 요구 배후지에 든 칸 | — | 12 | 0 |
| 30일 채집 다툼 받은 몫 평균·최저 | 327‰·70‰ | 964‰·121‰ | 982‰·121‰ |
| 성장 멈춤(< 900‰) 도시 | 47/49 | 5/49 | 1/49 |
| 계획 시간 | — | 252ms | 248ms |
- 30일 채집 다툼은 목표 크기(인구 = 주거, 계획 등급), 원자재 = 칸 비트, 가중치 = 국가 시작 채집 시설 가운데 NPC 씨앗이 그 땅에 짓는 것(광산은 높은 땅에만 — 49곳 모두 짓지 않음). 새 배치의 남은 1곳은 땅에 원자재가 모자란 도시(겹침 0).
- 시뮬 `catchment4`(새 시나리오, seed 1, 30일, 1.1초): 혼자 선 나라 둘(도시 4)은 받은 몫 1000‰·인구 79~80. 도시가 붙은 나라 둘(도시 4, 겹친 칸 12~16)은 10일째 984‰ → 12일 809~828‰ → 20일 548‰ → 30일 448~558‰, 12일째부터 4곳 모두 성장 멈춤, 인구 80 → 74·71, 하루 곡물 생산 15,360 → 9,660(목재는 일꾼 절반이라 그대로 7,680). 불변 조건 위반 0.
- 시뮬 `econ16`(seed 1, 30일, 14.5초): 도시가 작아(주거 15) 반경 1.0~1.48칸, 겹침 0, 받은 몫 1000‰, 인구 972 → 974, 위반 0.
- 시뮬 `war16`(seed 1, 30일, 170초): 경제 칸이 없어 배후지를 쓰지 않는다. 위반 0.

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/catchment.ts`·`catchmentGrowth.test.ts`(새) | 요구 반경·두 도시 간격·칸 재고·다시 자람·캐려는 양·하루 채집 다툼(정수 셈), `siteScore` 반경 인수 |
| `packages/sim/src/society/worldSeed.ts`·`tuningWorldSeed.ts`, `content/core/tuning.json`·`manifest.json` | 설정 칸 열넷, `catchmentGrowthOf`·`catchmentSupplyOf`·`plannedCityRadiusMilli`, core@71 |
| `packages/sim/src/simulator/catchmentRun.ts`(새)·`catchmentRun.test.ts`(새) | 하루 끝 배후지 다툼, 시설 빠르기, 평면 배치, 줄 모양 |
| `packages/sim/src/simulator/economy.ts`·`economyRun.ts`·`run.ts`·`world.ts`·`scenario.ts`·`serverEconomy.ts`·`index.ts`·`version.ts` | 경제에 배후지 붙이기(빠르기·하루 끝·econ 줄·요약), `SimCity.supplyPm`, 시나리오 `catchment`·`catchmentStep`, `SIM_VERSION` 25·출력 형식 17 |
| `packages/sim/src/npc/policy.ts`·`simulator/npcRun.ts` | 구인 `growthBlocked`(성장 멈춤, 경비대는 그대로) |
| `packages/sim/scenarios/econ16.json`·`catchment4.json`(새) | econ16에 배후지, 겹침 시험 시나리오 |
| `apps/server/src/world/citySites.ts`·`worldLayout.ts`(+`citySites.test.ts`) | 도시마다 반경, 간격 = 반경 합, `nationCatchmentMilli`, 시험 둘 더함 |
| `apps/server/src/world/catchmentView.ts`·`placementService.ts`, `packages/shared/src/worldPlacementApi.ts` | 덮개 응답에 지금·목표 반경·겹친 칸·인구·다툼 칸 |
| `apps/server/src/npc/catchmentGeometry.ts`(새)·`npc/economy.ts`·`npc/runtime.ts`·`market/worldInput.ts`·`world/world.ts` | 서버 NPC 도시 경제에 행성 칸 배후지 다툼 |
| `apps/game/src/editor/worldLayout/WorldCatchmentPanel.tsx`·`worldLayoutModel.ts`(+시험)·`worldLayout.css`, `apps/game/messages/{ko,en}.json` | 덮개: 목표 반경·다툼 색·도시 표, 문구 12개 더함·3개 고침(ko·en) |
| `apps/server/bench/citySpacing.ts` | 측정 지표 더함 |
| `e2e/world-layout.spec.ts` | 덮개 시험 기대값(크기 간격·다툼 칸 0·도시 표) |
| ADR·질문·PLAN 14장 | 위 관련 |

## 함께 바꿔야 하는 파일
- 요구 반경·다툼 셈은 `@terra/shared/catchment` 한 곳(배치·시뮬·서버 경제·덮개가 함께 바뀐다). 설정 칸을 더하면 `worldSeed.ts`·`tuningWorldSeed.ts`·팩 `tuning.json`·`manifest.json`.
- 덮개 응답 모양을 바꾸면 `worldPlacementApi.ts`·`catchmentView.ts`·`WorldCatchmentPanel.tsx`·e2e.

## 건드리지 말 것
- NAS 세계(통합 담당이 `city-layout`과 함께 들인 뒤 세계 새로 시작 — 질문 1065).

## 미검증·TODO·알려진 문제
- 서버 NPC 도시 경제의 배후지 다툼은 단위·시뮬 셈과 같은 함수지만 실제 서버(NPC 런타임 + 행성)에서 돌려 보지 않았다(미실행 — DB 시험은 행성 값 없이 돈다).
- 칸 재고는 서버 메모리(다시 켜면 가득 — 질문 1061). 시뮬의 마을은 다투지 않는다.
- 이 줄기를 NAS에 들이고 세계를 새로 시작하지 않으면 옛 바둑판 도시 대부분이 성장을 멈춘다(측정 옛 배치 47/49).
- 광석: 낮은 땅 도시는 광산을 짓지 않는다(질문 1064 = 1020).

## 검사(Verified: 실행)
- 단위: shared `catchment`·`catchmentGrowth` 13, sim 전체 93파일 741 + `catchmentRun` 7, 서버 `citySites` 11·`worldLayout`·`worldLayoutTiers`, 게임 `editor/worldLayout` 7 — 통과.
- DB: `worldLayout.db`·`nationPlacement.db`·`nationTiers.db`·tRPC `worldLayout` 11 통과.
- 끝 검사 `pnpm check`(TEST_DATABASE_URL): 첫 번 — oxlint 경고 1(측정 스크립트 `values` 이름 가림) → 고침. 두 번째 — 626파일 4,835개 통과.
- 빌드 + `check-pwa` 통과, `check:bundle` 첫 화면 108,782B / 상한 131,416B, `check:docs origin/main` 통과.
- 화면: `e2e/world-layout.spec.ts` 9개 통과(배후지 덮개 2개 고침, 1440 네온·390 라이트 사진). 첫 사진에서 도시 표 머리가 첫 줄을 가려(자체 감싸개 안 고정 머리) 공용 `.dev-table-wrap`으로 바꾼 뒤 배후지 시험 2개 다시 통과.

## 사용자 결정 대기
- 질문 1056~1065. 특히 1065(NAS 세계 새로 시작 시점)·1061(재고 저장).
