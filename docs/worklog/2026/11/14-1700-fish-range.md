# 낚시터 일꾼도 그 자리 물 종류의 티어 범위로(D-542 1365 나)

- 일시: 2026-11-14 17:00 (KST)
- 작업 도구: Claude Code
- 관련: 기획 D-542(질문 1365 나 — D-541 1307 뜻 "깊은 바다일수록 큰 고기"). ADR `2026-11-11-production-six.md` "바뀜 (2026-11-14, D-542 — 질문 1365 나 …)". 질문 `docs/questions/2026-11-14-fish-range.md`(1411~1414), 앞 질문 1365에 "답" 줄. 앞 작업 기록 `14-1300-fixes-1114.md`(어군 범위). 가지 `work/fish-range`(바탕 `c62345f`). 팩 core@90, `SIM_VERSION` 42.

## 한 일
1. **물 종류 정하기** (`@terra/shared/fishWater`, Verified: 시험)
   - 칸 하나: 바다 칸은 행성 수심 등급 비트(연안 1·대륙붕 2·심해 3), 없으면 바다 바이옴 → 해안 비트 연안 → 호수·강 비트 민물 → 호수·습지 바이옴 민물 → 없음.
   - 섞인 자리(`spotFishWater`): 낚시터가 설 땅 칸(바다·호수에 잠기지 않은 칸)의 물 종류 다수결, 같으면 깊은 쪽, 땅 칸이 없으면 모든 칸(질문 1414).
   - 플레이어 낚시터(`apps/server/src/facilities/fishWater.ts`): 건물이 선 2차맵 칸 → 없으면 둘레 1.5칸 → 없으면 민물(질문 1412). 행성 값 없음 = 접지 않음.
   - NPC 도시 경제(시뮬·서버 같은 `@terra/sim` `fishTierRange`): 배후지 칸(지난 하루 끝 반경, 광산 티어 막기와 같은 때). 서버는 행성 칸 값(`npc/catchmentGeometry.ts fishWaterOf`), 시뮬 평면은 시나리오 `catchment.fishWater`·세력 `catchmentFishWater`, 없으면 연안(질문 1411).
2. **범위** = 설정 칸 `fish_tier_{fresh,coast,shelf,deep}_{min,max}` 여덟(core@90, 출발값 = 어군 범위 T0~2·0~4·2~6·4~8). 어군 팩 값을 읽지 않은 까닭은 ADR(질문 1413).
3. **접기**: `@terra/sim` `rollGatherOutputs`에 `tierRange`(더하기만 — `tierCap` 뒤, 추첨 방식만, 난수 그대로). 플레이어 채집 직무(`labor/gatherWork.ts` `GatherSite.tierRange`, 채집소 일꾼 포함 — `facilities/world.ts gatherSiteOf`), NPC 도시 경제·시뮬(`simulator/economy.ts nextBatch`). `gather/objectYield.ts`는 건드리지 않았다(줄기 `boats-b3`).
4. **화면**
   - 사이보그 판 효율 낚시터 줄: 펼치면 물 종류마다 접은 티어별 확률(`RosterGather.waters`, 서버 `roster/gatherSheet.ts`).
   - 유닛 추천: 낚시터 줄에 "물 종류마다 티어: 민물 T0~T2 · …"(`ProductionTypeView.waterTiers`, 서버 `roster/guide.ts`, 설정 칸 실효 값).
   - 생산 편집기 [예상 확률] 탭: 고른 띠 표를 쓰는 시설에 낚시터가 있으면 물 종류 고르기 → 확률을 접는다(`gatherExpect` `tierRange`, 서버 `gatherRules.fishTiers`).
   - 새 메시지 12개(ko·en).

## 측정
### 시뮬 econ16 30일 시드 1, 어류 생산(마릿수) 티어별 (Verified: `node cli/sim.ts <시나리오> --days 30 --seed 1 --summary …`, 위반 0)
| 판 | T0 | T1 | T2 | T3 | T4 | 합 |
|---|---|---|---|---|---|---|
| 앞(`c62345f`, SIM 40) | 4,874 | 1,104 | 662 | 420 | 0 | 7,060 |
| 뒤 기본(연안 T0~T4) | 4,874 | 1,104 | 662 | 420 | 0 | 7,060 |
| 뒤 민물(T0~T2) | 4,984 | 1,130 | 1,104 | 0 | 0 | 7,218 |
| 뒤 대륙붕(T2~T6) | 0 | 0 | 4,548 | 280 | 0 | 4,828 |
| 뒤 심해(T4~T8) | 0 | 0 | 0 | 0 | 3,472 | 3,472 |
- 뒤 기본은 본문 줄 782줄이 앞과 바이트까지 같다(머리·요약 줄의 `simVersion`·팩 판·해시만 다름, Verified: diff). 시나리오 낚시터 일꾼이 T3까지만 뽑아 연안 범위 안이다.
- 민물·대륙붕·심해는 `catchment.fishWater`만 바꾼 시나리오 복사본(임시, 저장소 밖)이다. 높은 티어는 필요 진행(N44)이 길어 같은 30일에 마릿수가 준다. 민물 합이 늘어난 것은 T3(필요 진행 큼)이 T2로 내려가 빨라진 몫이다(Assumed: 진행 셈으로 설명, 따로 나눠 재지 않음).
- build16 앞 판 요약의 어류 생산이 econ16과 같았다(Verified) — build16도 낚시터 일꾼 구성이 같다(Assumed). 뒤 판 build16은 재지 않았다.
- 요약 파일: `/tmp/claude-0/-home-user/cb0728c6-6627-53f8-b5b7-9c38043bcdcc/scratchpad/fish-sim/`(임시).

## 바꾼 파일과 이유
| 파일 | 이유 |
|---|---|
| `packages/shared/src/fishWater.ts`(+시험), `package.json` | 물 종류·고르기·범위·접기(새 진입점 `./fishWater`) |
| `packages/shared/src/gatherExpect.ts`(+시험), `roster.ts`, `unitGuide.ts`, `buildingEditor.ts` | 예상 확률 접기, 화면 칸 셋(선택 칸) |
| `packages/sim/src/economy/gather.ts`(+시험) | `GatherRoll.tierRange` |
| `packages/sim/src/simulator/catchmentRun.ts`(+시험), `economy.ts`, `scenario.ts`, `serverEconomy.ts`, `index.ts` | 배후지 물 종류·`fishTierRange`, 시나리오 칸, 내보내기 |
| `packages/sim/src/society/worldSeed.ts`, `tuningWorldSeed.ts`, `version.ts` | 설정 칸 여덟·`fishTierRangesOf`, SIM 42 |
| `content/core/tuning.json`, `manifest.json` | 설정 칸 여덟, core@90 |
| `apps/server/src/facilities/fishWater.ts`(+시험), `facilities/world.ts`, `labor/gatherWork.ts`(+시험) | 플레이어 낚시터 물 종류·범위 |
| `apps/server/src/npc/catchmentGeometry.ts`(+새 시험) | NPC 배후지 칸 물 종류 |
| `apps/server/src/roster/gatherSheet.ts`·`guide.ts`(+시험), `buildingEdit/services.ts`, `app.ts` | 화면 칸 싣기 |
| `apps/game/src/ui/fishWaterText.ts`, `cyborg/CombatGather.tsx`, `roster/UnitAdvice.tsx`·`unitAdvice.css`, `editor/production/ProductionExpectPanel.tsx`·`ProductionEditorScreen.tsx`, `messages/{ko,en}.json` | 화면 |
| `e2e/cyborg.spec.ts`, `e2e/gather-expect.spec.ts` | 물 종류 줄·고르기 확인 |
| ADR 바뀜, 질문 새 파일, 앞 질문 1365 답 줄 | |

## 함께 바꿔야 하는 파일
- 같은 묶음 `boats-b3`(SIM 41·core@89)와 겹치는 판: `version.ts` 설명 줄, `manifest.json`, `tuning.json`(이 줄기 칸은 `ore_low_tier_max` 다음에 넣었다). 합칠 때 둘 다 남기고 판은 큰 값(42·90).
- 배 낚시가 시설 산출(채집 직무)을 쓰게 되면 `GatherSite.tierRange`를 배가 있는 바다 칸 물 종류로 준다(지금은 건물 자리만).
- 낚시터가 아닌 어류 시설을 더하면 `@terra/shared/catchment` `MATERIAL_FACILITY`(원자재 → 시설 하나)를 먼저 넓혀야 `fishTierRange`·`gatherSiteOf`가 그 시설을 안다.

## 건드리지 말 것
- 섞인 자리를 "가장 깊은 물"로 바꾸지 않는다(질문 1414 답 전) — 바닷가 도시가 모두 심해가 된다.
- `rollGatherOutputs`의 접기가 난수를 쓰지 않는 것(기본 연안 시나리오 결과가 그대로인 까닭).

## 미검증·TODO·알려진 문제
- NAS 실제 행성에서 플레이어·NPC 낚시터가 어떤 물 종류로 나오는지 재지 않았다(Unknown). NPC 시작 도시 씨앗 낚시터 수는 0이라(`npc_seed_fishing_spots`) 지금 NPC 낚시터는 NPC 짓기로만 선다.
- 수심 등급 비트가 없는 바다 칸(옛 행성 캐시)은 바이옴으로 정한다(Assumed: 지금 생성기 출력 판 3은 비트가 있다 — `packages/planet` `surface.ts`).
- 유닛 추천의 물 종류 줄은 낚시터가 추천 위 둘에 들 때만 보인다. 화면 시험은 서버 시험(`guide.test.ts`)만 본다.

## 검사
(아래 "검사 결과"에 적는다)

## 사용자 결정 대기
- 질문 1411~1414(`docs/questions/2026-11-14-fish-range.md`).
